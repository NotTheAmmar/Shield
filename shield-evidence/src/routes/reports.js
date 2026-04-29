/**
 * SHIELD Forensic Audit Report Generator
 * 
 * GET  /api/reports/chain-of-custody/:evidenceId  → Instant JSON
 * POST /api/reports/chain-of-custody/:evidenceId/pdf → Async PDF via BullMQ
 * GET  /api/reports/status/:jobId → Poll job status
 */

const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const requireRoles = require('../middleware/rbac');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { minioInternal } = require('../config/minio');

const router = express.Router();

const redisConnection = new IORedis({
    host: process.env.REDIS_HOST || 'shield-redis',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
});
const pdfQueue = new Queue('pdf-generation', { connection: redisConnection });

// ── Chain of Custody Data Fetcher ─────────────────────────────

async function getChainOfCustody(evidenceId) {
    const { rows: [evidence] } = await pool.query(
        `SELECT e.id, e.filename as "fileName", e.sha256_hash as hash, 
                e.uploaded_at as "uploadDate", e.uploaded_by as "uploadedBy", e.fir_id as "firId"
         FROM evidence e WHERE e.id = $1`, [evidenceId]
    );
    if (!evidence) return null;

    const { rows: [fir] } = await pool.query(
        `SELECT fir_number as "firNumber", case_category as category, location,
                reporting_officer as "reportingOfficer", registered_at as "registeredAt",
                jurisdiction_id as "jurisdictionId"
         FROM fir WHERE id = $1`, [evidence.firId]
    );

    const { rows: metaRows } = await pool.query(
        `SELECT ST_Y(gps_location) as "gpsLat", ST_X(gps_location) as "gpsLng",
                camera_make as "cameraMake", camera_model as "cameraModel",
                original_date as "originalDate", file_size as "fileSize",
                mime_type as "mimeType"
         FROM evidence_metadata WHERE evidence_id = $1`, [evidenceId]
    );

    const { rows: flags } = await pool.query(
        `SELECT flags, details, actor, logged_at as "loggedAt"
         FROM evidence_forensic_log WHERE evidence_id = $1
         ORDER BY logged_at ASC`, [evidenceId]
    );

    const { rows: verifications } = await pool.query(
        `SELECT action, result, actor_id as "actorId", checked_at as "checkedAt"
         FROM audit_log WHERE evidence_id = $1
         ORDER BY checked_at ASC`, [evidenceId]
    );

    const { rows: accessLog } = await pool.query(
        `SELECT user_id as "userId", method, endpoint, ip_address as "ipAddress",
                status_code as "statusCode", accessed_at as "accessedAt"
         FROM api_audit_log WHERE endpoint LIKE $1
         ORDER BY accessed_at ASC LIMIT 50`,
        [`%${evidenceId}%`]
    );

    return {
        evidence,
        fir: fir || {},
        metadata: metaRows[0] || null,
        forensicFlags: flags,
        verificationHistory: verifications,
        accessLog,
    };
}

// ── GET /api/reports/chain-of-custody/:evidenceId ─────────────

router.get('/chain-of-custody/:evidenceId',
    requireRoles(['Police Officer', 'Super Admin', 'Judicial Authority', 'Admin']),
    async (req, res) => {
        try {
            const data = await getChainOfCustody(req.params.evidenceId);
            if (!data) return res.status(404).json({ error: 'Evidence not found' });
            res.json(data);
        } catch (err) {
            console.error('[REPORT]', err.message);
            res.status(500).json({ error: 'Failed to generate report' });
        }
    }
);

// ── GET /api/reports/metadata/:evidenceId ─────────────────────

router.get('/metadata/:evidenceId',
    requireRoles(['Police Officer', 'Super Admin', 'Judicial Authority', 'Admin']),
    async (req, res) => {
        try {
            const { rows: metaRows } = await pool.query(
                `SELECT ST_Y(gps_location) as "gpsLat", ST_X(gps_location) as "gpsLng",
                        camera_make as "cameraMake", camera_model as "cameraModel",
                        original_date as "originalDate", file_size as "fileSize",
                        mime_type as "mimeType", processed_at as "processedAt"
                 FROM evidence_metadata WHERE evidence_id = $1`,
                [req.params.evidenceId]
            );

            const { rows: flags } = await pool.query(
                `SELECT flags, details, actor, logged_at as "loggedAt"
                 FROM evidence_forensic_log WHERE evidence_id = $1
                 ORDER BY logged_at ASC`,
                [req.params.evidenceId]
            );

            res.json({
                metadata: metaRows[0] || null,
                forensicFlags: flags,
            });
        } catch (err) {
            console.error('[METADATA]', err.message);
            res.status(500).json({ error: 'Failed to fetch metadata' });
        }
    }
);

// ── POST /api/reports/chain-of-custody/:evidenceId/pdf ────────

router.post('/chain-of-custody/:evidenceId/pdf',
    requireRoles(['Police Officer', 'Super Admin', 'Judicial Authority', 'Admin']),
    async (req, res) => {
        try {
            const evidenceId = req.params.evidenceId;
            const jobId = crypto.randomUUID();

            await pool.query(
                `INSERT INTO report_jobs (id, evidence_id, status) VALUES ($1, $2, 'QUEUED')`,
                [jobId, evidenceId]
            );

            await pdfQueue.add('generate', { evidenceId, jobId });

            res.json({ jobId, status: 'QUEUED' });
        } catch (err) {
            console.error('[PDF QUEUE]', err.message);
            res.status(500).json({ error: 'Failed to queue PDF generation' });
        }
    }
);

// ── GET /api/reports/status/:jobId ────────────────────────────

router.get('/status/:jobId',
    requireRoles(['Police Officer', 'Super Admin', 'Judicial Authority', 'Admin']),
    async (req, res) => {
        try {
            const { rows: [job] } = await pool.query(
                `SELECT id, status, download_url as "downloadUrl", created_at as "createdAt", completed_at as "completedAt"
                 FROM report_jobs WHERE id = $1`,
                [req.params.jobId]
            );

            if (!job) return res.status(404).json({ error: 'Job not found' });

            // Return proxied download URL instead of internal MinIO link
            if (job.status === 'READY' && job.downloadUrl) {
                job.downloadUrl = `/api/reports/download/${job.id}`;
            }

            res.json(job);
        } catch (err) {
            console.error('[JOB STATUS]', err.message);
            res.status(500).json({ error: 'Failed to check job status' });
        }
    }
);

// ── GET /api/reports/download/:jobId ──────────────────────────
// Proxy: streams the PDF from MinIO through the evidence service
// Browser never touches the internal minio-store hostname

router.get('/download/:jobId',
    requireRoles(['Police Officer', 'Super Admin', 'Judicial Authority', 'Admin']),
    async (req, res) => {
        try {
            const { rows: [job] } = await pool.query(
                `SELECT id, status, download_url as "objectKey", evidence_id as "evidenceId"
                 FROM report_jobs WHERE id = $1`,
                [req.params.jobId]
            );

            if (!job || job.status !== 'READY' || !job.objectKey) {
                return res.status(404).json({ error: 'Report not ready or not found' });
            }

            const stream = await minioInternal.getObject('reports', job.objectKey);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="forensic-report-${job.evidenceId}.pdf"`);
            stream.pipe(res);
        } catch (err) {
            console.error('[PDF DOWNLOAD]', err.message);
            res.status(500).json({ error: 'Failed to download report' });
        }
    }
);

module.exports = router;

