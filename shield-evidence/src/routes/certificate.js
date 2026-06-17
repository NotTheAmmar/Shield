const express = require('express');
const busboy = require('busboy');
const path = require('path');
const { PassThrough } = require('stream');
const PDFDocument = require('pdfkit');

const pool = require('../db');
const { minioInternal, BUCKET } = require('../config/minio');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// GET /api/evidence-source/:id/certificate
router.get('/:id/certificate', requireRoles(['Police Officer', 'Judicial Authority', 'Admin']), async (req, res) => {
    try {
        const sourceId = req.params.id;

        // Fetch source details
        const { rows: sourceRows } = await pool.query('SELECT * FROM evidence_source WHERE id = $1', [sourceId]);
        if (!sourceRows.length) return res.status(404).json({ error: 'Evidence source batch not found' });
        const source = sourceRows[0];

        // Fetch evidence files linked to this source
        const { rows: files } = await pool.query('SELECT * FROM evidence WHERE source_id = $1 ORDER BY uploaded_at ASC', [sourceId]);
        
        if (!files.length) return res.status(404).json({ error: 'No evidence files found for this batch' });

        // Fetch user details for parentage name
        // (Mocking it here if it's not available in the payload, but req.user should ideally have it, 
        // or we query it if we had a direct connection to auth db. Since auth is a separate service,
        // we will fetch the uploader details from the first evidence record and assume auth handles parentage).
        // Actually, we added parentage_name to users table. But shield-evidence might not have direct access to `users`.
        // Wait, `evidence.js` queries `users` directly! `const userRes = await client.query('SELECT encrypted_private_key FROM users WHERE id = $1', [userId]);`
        // So shield-evidence CAN access `users` table directly!
        
        const { rows: userRows } = await pool.query('SELECT name, employee_id, designation, station, parentage_name FROM users WHERE id = $1', [files[0].uploaded_by]);
        const uploader = userRows[0] || {};

        // Generate PDF
        const doc = new PDFDocument({ margin: 50 });
        
        res.setHeader('Content-disposition', `attachment; filename=Section63_Certificate_Batch_${sourceId}.pdf`);
        res.setHeader('Content-type', 'application/pdf');
        
        doc.pipe(res);

        // Header
        doc.fontSize(16).text('CERTIFICATE UNDER SECTION 63 OF', { align: 'center' });
        doc.text('BHARATIYA SAKSHYA ADHINIYAM, 2023', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).text('PART - A', { align: 'center', underline: true });
        doc.moveDown();

        // 1. Details of person producing
        doc.fontSize(10).text(`1. Name: ${uploader.name || files[0].uploader_name || 'N/A'}`);
        doc.text(`2. Parentage/Spouse Name: ${uploader.parentage_name || 'N/A'}`);
        doc.text(`3. Address/Station: ${uploader.station || 'N/A'} (Employee ID: ${uploader.employee_id || files[0].uploader_employee_id || 'N/A'})`);
        doc.moveDown();

        // 2. Source Device
        doc.text(`4. Source Device Type: ${source.source_type}`);
        doc.text(`5. Make & Model: ${source.make || 'N/A'} - ${source.model || 'N/A'}`);
        doc.text(`6. Serial Number: ${source.serial_number || 'N/A'}`);
        doc.text(`7. Identifiers (IMEI/MAC): ${source.identifiers || 'N/A'}`);
        doc.moveDown();

        // 3. Declarations
        doc.text(`8. Lawful Control Declared: ${source.lawful_control ? 'Yes' : 'No'}`);
        doc.text(`9. Proper Operation Declared: ${source.proper_operation ? 'Yes' : 'No'}`);
        doc.text(`10. Ownership Status: ${source.ownership_status || 'N/A'}`);
        doc.moveDown();

        // 4. Device Chain
        doc.text('11. Device Chain (Combination of Computers):');
        const chain = typeof source.device_chain === 'string' ? JSON.parse(source.device_chain) : source.device_chain;
        if (Array.isArray(chain) && chain.length > 0) {
            chain.forEach((step, idx) => {
                doc.text(`    Step ${idx + 1}: ${step.type} (${step.identifier || 'N/A'})`);
            });
        } else {
            doc.text('    N/A');
        }
        doc.moveDown();

        // 5. Hash Values Table
        doc.text('12. Hash Values of Electronic Records:');
        doc.moveDown(0.5);
        
        files.forEach((file, idx) => {
            doc.text(`${idx + 1}. Filename: ${file.filename}`);
            doc.text(`   SHA-256 Hash: ${file.sha256_hash}`);
            doc.text(`   Blockchain TX ID: ${file.ledger_tx_id || 'Pending'}`);
            doc.text(`   Timestamp: ${file.ledger_timestamp || 'Pending'}`);
            doc.moveDown(0.5);
        });
        
        doc.moveDown();
        doc.text('Date: _______________');
        doc.text('Time: _______________');
        doc.text('Place: ______________');
        doc.moveDown();
        doc.text('Signature: ___________________________');
        doc.text(`Name: ${uploader.name || files[0].uploader_name || 'N/A'}`);
        
        if (source.certificate_status === 'COMPLETED') {
             doc.addPage();
             doc.fontSize(12).text('PART - B (EXPERT VERIFICATION)', { align: 'center', underline: true });
             doc.moveDown();
             doc.fontSize(10).text('The electronic records listed above have been verified against their blockchain-anchored immutable hashes. Integrity is confirmed.');
             // In a real scenario, we'd fetch the expert's name from an audit log or similar.
             doc.moveDown(3);
             doc.text('Signature: ___________________________');
             doc.text('Expert Name / Designation');
        }

        doc.end();

    } catch (err) {
        console.error('Certificate generation error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate certificate' });
        }
    }
});

// POST /api/evidence-source/:id/upload-signed-certificate
router.post('/:id/upload-signed-certificate', requireRoles(['Police Officer', 'Forensic Expert', 'Admin']), (req, res) => {
    const sourceId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const bb = busboy({
        headers: req.headers,
        limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for PDF
    });

    let fileProcessed = false;

    bb.on('file', async (fieldname, fileStream, info) => {
        if (fileProcessed) {
            fileStream.resume();
            return;
        }
        fileProcessed = true;

        if (info.mimeType !== 'application/pdf') {
            fileStream.resume();
            return res.status(400).json({ error: 'Only PDF files are allowed.' });
        }

        try {
            // Check current status
            const { rows } = await pool.query('SELECT certificate_status FROM evidence_source WHERE id = $1', [sourceId]);
            if (!rows.length) {
                fileStream.resume();
                return res.status(404).json({ error: 'Evidence source batch not found' });
            }
            const currentStatus = rows[0].certificate_status;

            let nextStatus;
            if (currentStatus === 'PENDING_PART_A') {
                nextStatus = 'PENDING_PART_B';
            } else if (currentStatus === 'PENDING_PART_B') {
                if (userRole !== 'Forensic Expert' && userRole !== 'Admin') {
                     fileStream.resume();
                     return res.status(403).json({ error: 'Only a Forensic Expert can upload Part B.' });
                }
                nextStatus = 'COMPLETED';
            } else {
                fileStream.resume();
                return res.status(400).json({ error: 'Certificate is already completed.' });
            }

            const objectKey = `certificates/batch_${sourceId}_signed_${Date.now()}.pdf`;
            const passThrough = new PassThrough();

            const putPromise = new Promise((resolve, reject) => {
                minioInternal.putObject(BUCKET, objectKey, passThrough, null, { 'Content-Type': info.mimeType })
                    .then(resolve)
                    .catch(reject);
            });

            fileStream.on('error', (err) => passThrough.destroy(err));
            fileStream.pipe(passThrough);

            await putPromise;

            // Update database
            await pool.query(
                'UPDATE evidence_source SET certificate_status = $1, signed_cert_file_path = $2 WHERE id = $3',
                [nextStatus, objectKey, sourceId]
            );

            // Log the action
            await pool.query(
                `INSERT INTO api_audit_log (user_id, user_name, user_role, method, endpoint, ip_address, status_code)
                 VALUES ($1, $2, $3, 'UPLOAD_CERT', $4, $5, 200)`,
                [userId, req.user.name, userRole, req.originalUrl, req.ip || '0.0.0.0']
            );

            res.status(200).json({ message: 'Certificate uploaded successfully', status: nextStatus });
        } catch (err) {
            console.error('Signed cert upload error:', err);
            fileStream.resume();
            res.status(500).json({ error: 'Failed to upload signed certificate' });
        }
    });

    bb.on('close', () => {
        if (!fileProcessed) {
            res.status(400).json({ error: 'No file found in the request.' });
        }
    });

    req.pipe(bb);
});

module.exports = router;
