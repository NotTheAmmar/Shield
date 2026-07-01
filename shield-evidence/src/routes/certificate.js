const express = require('express');
const busboy = require('busboy');
const path = require('path');
const { PassThrough } = require('stream');
const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLibDocument } = require('pdf-lib');
const rateLimit = require('express-rate-limit');

const pool = require('../db');
const { minioInternal, minioPublic, BUCKET } = require('../config/minio');
const requireRoles = require('../middleware/rbac');

const router = express.Router();

// ── Rate Limiters ─────────────────────────────────────────────────────────

// Mitigates abusive database/file reads via the generation endpoint
const generateRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window`
    message: { error: 'Too many certificate generation requests from this IP, please try again after 15 minutes.' }
});

// Mitigates aggressive file uploads and processing overhead
const uploadRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 uploads per `window`
    message: { error: 'Too many upload requests from this IP, please try again after 15 minutes.' }
});

// Helper to buffer MinIO stream
const getMinioBuffer = (bucket, objectKey) => {
    return new Promise((resolve, reject) => {
        minioInternal.getObject(bucket, objectKey, (err, stream) => {
            if (err) return reject(err);
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    });
};

// GET /api/evidence-source/:id/certificate
router.get('/:id/certificate', generateRateLimiter, requireRoles(['Police Officer', 'Judicial Authority', 'Admin', 'Forensic Expert']), async (req, res) => {
    try {
        const sourceId = req.params.id;
        const userRole = req.user.role;

        // Fetch source details
        const { rows: sourceRows } = await pool.query('SELECT * FROM evidence_source WHERE id = $1', [sourceId]);
        if (!sourceRows.length) return res.status(404).json({ error: 'Evidence source batch not found' });
        const source = sourceRows[0];

        // If completed, return the signed certificate directly
        if (source.certificate_status === 'COMPLETED') {
            if (!source.signed_cert_file_path) {
                return res.status(404).json({ error: 'Signed certificate not found' });
            }
            const minioBuffer = await getMinioBuffer(BUCKET, source.signed_cert_file_path);
            res.setHeader('Content-disposition', `attachment; filename=Section63_Certificate_Batch_${sourceId}.pdf`);
            res.setHeader('Content-type', 'application/pdf');
            res.end(minioBuffer);
            return;
        }

        // Strict state enforcement: Forensic Expert cannot access Part B if Part A is not completed.
        if (userRole === 'Forensic Expert' && source.certificate_status === 'PENDING_PART_A') {
            return res.status(400).json({ error: 'Part A is not yet signed by the producing officer. You cannot access Part B.' });
        }

        // Fetch evidence files linked to this source
        const { rows: files } = await pool.query('SELECT * FROM evidence WHERE source_id = $1 ORDER BY uploaded_at ASC', [sourceId]);
        
        if (!files.length) return res.status(404).json({ error: 'No evidence files found for this batch' });

        const { rows: userRows } = await pool.query('SELECT name, employee_id, designation, station, parentage_name FROM users WHERE id = $1', [files[0].uploaded_by]);
        const uploader = userRows[0] || {};

        res.setHeader('Content-disposition', `attachment; filename=Section63_Certificate_Batch_${sourceId}.pdf`);
        res.setHeader('Content-type', 'application/pdf');

        const checkSquare = (checked) => checked ? '[ X ]' : '[   ]';

        // --- Helper for formatting Device Checkboxes ---
        const sType = source.source_type || '';
        const isComputer = sType.match(/computer/i);
        const isStorage = sType.match(/storage/i);
        const isDvr = sType.match(/dvr/i);
        const isMobile = sType.match(/mobile/i);
        const isFlash = sType.match(/flash/i);
        const isCd = sType.match(/cd/i) || sType.match(/dvd/i);
        const isServer = sType.match(/server/i);
        const isCloud = sType.match(/cloud/i);
        const isOther = (!isComputer && !isStorage && !isDvr && !isMobile && !isFlash && !isCd && !isServer && !isCloud);

        const drawDeviceSection = (doc) => {
            doc.text(`Computer / Storage Media ${checkSquare(isComputer || isStorage)}    DVR ${checkSquare(isDvr)}    Mobile ${checkSquare(isMobile)}    Flash Drive ${checkSquare(isFlash)}`);
            doc.moveDown(0.5);
            doc.text(`CD/DVD ${checkSquare(isCd)}    Server ${checkSquare(isServer)}    Cloud ${checkSquare(isCloud)}    Other ${checkSquare(isOther)}`);
            doc.moveDown(0.5);

            doc.text(`Other: ${isOther ? sType : '__________________________________________________'}`);
            doc.moveDown();

            doc.text(`Make & Model: ${source.make || '______'} - ${source.model || '______'}          Color: ______________________`);
            doc.text(`Serial Number: ${source.serial_number || '______________________'}`);
            doc.text(`IMEI/UIN/UID/MAC/Cloud ID: ${source.identifiers || '______________________'} (as applicable)`);
            let chainText = '______________________';
            try {
                if (source.device_chain) {
                    const chainArr = typeof source.device_chain === 'string' ? JSON.parse(source.device_chain) : source.device_chain;
                    if (Array.isArray(chainArr) && chainArr.length > 0) {
                        chainText = chainArr.map(c => `${c.type || ''} ${c.identifier ? `(${c.identifier})` : ''}`.trim()).join(' -> ');
                    }
                }
            } catch(e) {}
            doc.text(`and any other relevant information, if any, about the device/digital record: ${chainText}`);
            doc.moveDown();
        };

        const drawHashSection = (doc) => {
            doc.text(`I state that the HASH value/s of the electronic/digital record/s is As detailed in the enclosed Hash Report,`);
            doc.text(`obtained through the following algorithm:—`);
            doc.moveDown(0.5);
            doc.text(`[   ] SHA1:`);
            doc.text(`[ X ] SHA256: As detailed in Hash Report`);
            doc.text(`[   ] MD5:`);
            doc.text(`[   ] Other: ______________________ (Legally acceptable standard)`);
            doc.text(`(Hash report to be enclosed with the certificate)`);
            doc.moveDown();
        };

        // If PENDING_PART_A, generate just Part A as a standard stream
        if (source.certificate_status === 'PENDING_PART_A') {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            doc.pipe(res);
            
            doc.font('Helvetica-Bold').fontSize(12).text('THE SCHEDULE', { align: 'center' });
            doc.font('Helvetica').fontSize(10).text('[See section 63(4)(c)]', { align: 'center' });
            doc.font('Helvetica-Bold').fontSize(12).text('CERTIFICATE', { align: 'center' });
            doc.text('PART A', { align: 'center' });
            doc.font('Helvetica').fontSize(10).text('(To be filled by the Party)', { align: 'center' });
            doc.moveDown(1.5);

            const name = uploader.name || files[0].uploader_name || '______________';
            const parentage = uploader.parentage_name || '______________';
            const station = uploader.station || '______________';

            doc.text(`I, ${name} (Name), Son/daughter/spouse of ${parentage}`);
            doc.text(`residing/employed at ${station} do hereby solemnly affirm and`);
            doc.text('sincerely state and submit as follows:—');
            doc.moveDown();

            doc.text('I have produced electronic record/output of the digital record taken from the following');
            doc.text('device/digital record source (tick mark):—');
            doc.moveDown(0.5);

            drawDeviceSection(doc);

            const legalText = `The digital device or the digital record source was under the lawful control for regularly creating, storing or processing information for the purposes of carrying out regular activities and during this period, the computer or the communication device was working properly and the relevant information was regularly fed into the computer during the ordinary course of business. If the computer/digital device at any point of time was not working properly or out of operation, then it has not affected the electronic/digital record or its accuracy. The digital device or the source of the digital record is:—`;
            doc.text(legalText, { align: 'justify' });
            doc.moveDown(0.5);

            const oStatus = source.ownership_status || '';
            doc.text(`Owned ${checkSquare(oStatus.match(/own/i))}    Maintained ${checkSquare(oStatus.match(/maintain/i))}    Managed ${checkSquare(oStatus.match(/manage/i))}    Operated ${checkSquare(oStatus.match(/operate/i))}`);
            doc.text(`by me (select as applicable).`);
            doc.moveDown();

            drawHashSection(doc);

            doc.moveDown(2);
            doc.text(`                                                                                 (Name and signature)`);
            doc.moveDown();
            doc.text(`Date (DD/MM/YYYY): ${new Date().toLocaleDateString('en-GB')}`);
            doc.text(`Time (IST): ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} hours (In 24 hours format)`);
            doc.text(`Place: ${station}`);
            
            // Hash Report will be appended at the end of Part B in the unified document
            doc.end();
            return;
        }

        // ==========================================================
        // PENDING_PART_B or COMPLETED: Generate Part B & Merge with Signed Part A
        // ==========================================================
        
        // 1. Generate Part B and Hash Report to Memory Buffer using PDFKit
        const pdfkitBufferPromise = new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50, size: 'A4' });
                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // PART B
                doc.font('Helvetica-Bold').fontSize(12).text('PART B', { align: 'center' });
                doc.font('Helvetica').fontSize(10).text('(To be filled by the Expert)', { align: 'center' });
                doc.moveDown(1.5);
                
                const feName = req.user.name || '______________________';
                const feParentage = req.user.parentage_name || '______________________';
                const feStation = req.user.station || '______________________________________';
                
                doc.text(`I, ${feName} (Name), Son/daughter/spouse of ${feParentage}`);
                doc.text(`residing/employed at ${feStation} do hereby solemnly affirm and`);
                doc.text('sincerely state and submit as follows:—');
                doc.moveDown();

                doc.text('The produced electronic record/output of the digital record are obtained from the following');
                doc.text('device/digital record source (tick mark):—');
                doc.moveDown(0.5);

                drawDeviceSection(doc);
                drawHashSection(doc);
                
                doc.moveDown(2);
                const feDesignation = req.user.designation || 'Examiner of Electronic Evidence';
                doc.text(`${feName}`, { align: 'right' });
                doc.text(`${feDesignation}`, { align: 'right' });
                doc.text(`(Signature)`, { align: 'right' });
                doc.moveDown();
                doc.text(`Date (DD/MM/YYYY): ${new Date().toLocaleDateString('en-GB')}`);
                doc.text(`Time (IST): ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} hours (In 24 hours format)`);
                doc.text(`Place: ${feStation}`);

                // HASH REPORT
                doc.addPage();
                doc.font('Helvetica-Bold').fontSize(12).text('ENCLOSED HASH REPORT', { align: 'center' });
                doc.font('Helvetica').fontSize(10).text(`For Section 63 Certificate (Batch: ${sourceId})`, { align: 'center' });
                doc.moveDown(2);
                
                files.forEach((file, idx) => {
                    const sanitizedFilename = file.filename.replace(/[^\x20-\x7E]/g, '?');
                    doc.font('Helvetica-Bold').text(`${idx + 1}. Filename: `);
                    doc.font('Helvetica').text(`    ${sanitizedFilename}`, { width: 400 });
                    doc.moveDown(0.2);
                    doc.text(`    SHA-256 Hash: ${file.sha256_hash}`);
                    doc.text(`    Blockchain TX ID: ${file.ledger_tx_id || 'Pending Anchoring'}`);
                    if (file.ledger_timestamp) {
                        const ts = new Date(file.ledger_timestamp);
                        const dStr = ts.toLocaleDateString('en-GB');
                        const tStr = ts.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' });
                        doc.text(`    Timestamp: ${dStr} ${tStr} IST`);
                    } else {
                        doc.text(`    Timestamp: Pending`);
                    }
                    doc.moveDown(1);
                });

                doc.end();
            } catch (err) {
                reject(err);
            }
        });

        // 2. Fetch the uploaded Part A from MinIO
        let minioBuffer = null;
        let isImage = false;
        let isJpg = false;
        
        if (source.signed_cert_file_path) {
            try {
                minioBuffer = await getMinioBuffer(BUCKET, source.signed_cert_file_path);
                const ext = source.signed_cert_file_path.split('.').pop().toLowerCase();
                if (ext === 'jpg' || ext === 'jpeg') {
                    isImage = true;
                    isJpg = true;
                } else if (ext === 'png') {
                    isImage = true;
                    isJpg = false;
                }
            } catch (err) {
                console.warn(`Could not load signed Part A from MinIO (${source.signed_cert_file_path}):`, err.message);
                // We will gracefully degrade to just serving the PDFKit output if Part A is missing
            }
        }

        const pdfkitBuffer = await pdfkitBufferPromise;

        // 3. Merge Documents using pdf-lib
        let finalDoc;
        
        if (minioBuffer) {
            if (isImage) {
                // If it's an image, create a blank PDF and embed the image
                finalDoc = await PDFLibDocument.create();
                const image = isJpg ? await finalDoc.embedJpg(minioBuffer) : await finalDoc.embedPng(minioBuffer);
                const page = finalDoc.addPage();
                
                // Scale image to fit A4 (595.28 x 841.89 points)
                const { width, height } = page.getSize();
                const imgDims = image.scaleToFit(width, height);
                
                page.drawImage(image, {
                    x: width / 2 - imgDims.width / 2,
                    y: height / 2 - imgDims.height / 2,
                    width: imgDims.width,
                    height: imgDims.height,
                });
            } else {
                // It's a PDF, load it
                finalDoc = await PDFLibDocument.load(minioBuffer);
            }

            // Load the generated Part B & Hash Report
            const partBDoc = await PDFLibDocument.load(pdfkitBuffer);
            const partBPages = await finalDoc.copyPages(partBDoc, partBDoc.getPageIndices());
            partBPages.forEach(page => finalDoc.addPage(page));
        } else {
            // No MinIO buffer? Just serve the Part B document directly (fallback)
            finalDoc = await PDFLibDocument.load(pdfkitBuffer);
        }

        // 4. Stream output
        const pdfBytes = await finalDoc.save();
        res.end(Buffer.from(pdfBytes));

    } catch (err) {
        require('fs').writeFileSync('error.log', err.stack);
        console.error('Certificate generation error:', err.stack);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate certificate', details: err.message, stack: err.stack });
        }
    }
});

// POST /api/evidence-source/:id/upload-signed-certificate
router.post('/:id/upload-signed-certificate', uploadRateLimiter, requireRoles(['Police Officer', 'Forensic Expert', 'Admin']), (req, res) => {
    const sourceId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const bb = busboy({
        headers: req.headers,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max for physical scans/PDFs
    });

    let fileProcessed = false;

    bb.on('file', async (fieldname, fileStream, info) => {
        if (fileProcessed) {
            fileStream.resume();
            return;
        }
        fileProcessed = true;

        const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!allowedMimes.includes(info.mimeType)) {
            fileStream.resume();
            return res.status(400).json({ error: 'Only PDF, JPEG, and PNG files are allowed.' });
        }
        
        let ext = 'pdf';
        if (info.mimeType === 'image/jpeg') ext = 'jpg';
        if (info.mimeType === 'image/png') ext = 'png';

        try {
            // Check current status
            const { rows } = await pool.query('SELECT certificate_status, signed_cert_file_path FROM evidence_source WHERE id = $1', [sourceId]);
            if (!rows.length) {
                fileStream.resume();
                return res.status(404).json({ error: 'Evidence source batch not found' });
            }
            const currentStatus = rows[0].certificate_status;

            if (currentStatus === 'FAILED_VERIFICATION') {
                fileStream.resume();
                return res.status(403).json({ error: 'Evidence integrity compromised. Certificate locked.' });
            }

            let nextStatus;
            if (currentStatus === 'PENDING_PART_A') {
                nextStatus = 'PENDING_PART_B';
            } else if (currentStatus === 'PENDING_PART_B') {
                const normalizedRole = requireRoles.normalizeRole(userRole);
                if (normalizedRole !== 'forensic_expert' && normalizedRole !== 'admin') {
                     fileStream.resume();
                     return res.status(403).json({ error: 'Only a Forensic Expert can upload Part B.' });
                }
                nextStatus = 'COMPLETED';
            } else {
                fileStream.resume();
                return res.status(400).json({ error: 'Certificate is already completed.' });
            }

            // Buffer the incoming file stream
            const uploadedBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                let totalSize = 0;
                fileStream.on('data', (chunk) => {
                    totalSize += chunk.length;
                    if (totalSize > 5 * 1024 * 1024) {
                        fileStream.destroy(new Error('LIMIT_FILE_SIZE'));
                        return;
                    }
                    chunks.push(chunk);
                });
                fileStream.on('end', () => resolve(Buffer.concat(chunks)));
                fileStream.on('error', reject);
            });

            let finalBuffer = uploadedBuffer;
            let finalMime = info.mimeType;
            let finalKey = `certificates/batch_${sourceId}_signed_${Date.now()}.${ext}`;

            if (currentStatus === 'PENDING_PART_B' && rows[0].signed_cert_file_path) {
                try {
                    const prevPath = rows[0].signed_cert_file_path;
                    const prevBuffer = await getMinioBuffer(BUCKET, prevPath);
                    const prevExt = prevPath.split('.').pop().toLowerCase();
                    const isPrevImage = prevExt === 'jpg' || prevExt === 'jpeg' || prevExt === 'png';
                    const isPrevJpg = prevExt === 'jpg' || prevExt === 'jpeg';

                    // 1. Load Part A (previous upload)
                    let finalDoc;
                    if (isPrevImage) {
                        finalDoc = await PDFLibDocument.create();
                        const image = isPrevJpg ? await finalDoc.embedJpg(prevBuffer) : await finalDoc.embedPng(prevBuffer);
                        const page = finalDoc.addPage();
                        const { width, height } = page.getSize();
                        const imgDims = image.scaleToFit(width, height);
                        page.drawImage(image, {
                            x: width / 2 - imgDims.width / 2,
                            y: height / 2 - imgDims.height / 2,
                            width: imgDims.width,
                            height: imgDims.height,
                        });
                    } else {
                        finalDoc = await PDFLibDocument.load(prevBuffer);
                    }

                    // 2. Load Part B (new upload)
                    let partBDoc;
                    if (info.mimeType === 'image/jpeg' || info.mimeType === 'image/png') {
                        partBDoc = await PDFLibDocument.create();
                        const isJpgB = info.mimeType === 'image/jpeg';
                        const imageB = isJpgB ? await partBDoc.embedJpg(uploadedBuffer) : await partBDoc.embedPng(uploadedBuffer);
                        const pageB = partBDoc.addPage();
                        const { width, height } = pageB.getSize();
                        const imgDims = imageB.scaleToFit(width, height);
                        pageB.drawImage(imageB, {
                            x: width / 2 - imgDims.width / 2,
                            y: height / 2 - imgDims.height / 2,
                            width: imgDims.width,
                            height: imgDims.height,
                        });
                    } else {
                        partBDoc = await PDFLibDocument.load(uploadedBuffer);
                    }

                    // 3. Merge pages
                    const copiedPages = await finalDoc.copyPages(partBDoc, partBDoc.getPageIndices());
                    copiedPages.forEach(p => finalDoc.addPage(p));

                    // 4. Save merged document
                    const mergedBytes = await finalDoc.save();
                    finalBuffer = Buffer.from(mergedBytes);
                    finalMime = 'application/pdf';
                    finalKey = `certificates/batch_${sourceId}_signed_${Date.now()}.pdf`;
                } catch (mergeErr) {
                    console.warn('⚠️ Merging certificates failed, falling back to saving uploaded file directly:', mergeErr.message);
                }
            }

            const passThrough = new PassThrough();
            passThrough.end(finalBuffer);

            await minioInternal.putObject(BUCKET, finalKey, passThrough, finalBuffer.length, { 'Content-Type': finalMime });

            // Update database
            await pool.query(
                'UPDATE evidence_source SET certificate_status = $1, signed_cert_file_path = $2 WHERE id = $3',
                [nextStatus, finalKey, sourceId]
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
            if (err.message === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File too large. Maximum allowed size is 5MB.' });
            }
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to upload signed certificate' });
            }
        }
    });

    bb.on('close', () => {
        if (!fileProcessed) {
            res.status(400).json({ error: 'No file found in the request.' });
        }
    });

    req.pipe(bb);
});

// GET /api/evidence-source/:id/signed-certificate
router.get('/:id/signed-certificate', requireRoles(['Police Officer', 'Judicial Authority', 'Admin', 'Forensic Expert']), async (req, res) => {
    try {
        const sourceId = req.params.id;
        const { rows } = await pool.query('SELECT signed_cert_file_path FROM evidence_source WHERE id = $1', [sourceId]);
        
        if (!rows.length || !rows[0].signed_cert_file_path) {
            return res.status(404).json({ error: 'Signed certificate not found' });
        }

        const objectKey = rows[0].signed_cert_file_path;
        
        // Generate a pre-signed URL valid for 30 seconds
        const url = await minioPublic.presignedGetObject(BUCKET, objectKey, 30);
        res.redirect(url);
    } catch (err) {
        console.error('Failed to download signed certificate:', err);
        res.status(500).json({ error: 'Failed to generate download URL' });
    }
});

// POST /api/evidence-source/:id/sign-digital
router.post('/:id/sign-digital', uploadRateLimiter, requireRoles(['Police Officer', 'Forensic Expert', 'Admin']), async (req, res) => {
    try {
        const sourceId = req.params.id;
        const userId = req.user.id;
        const userRole = requireRoles.normalizeRole(req.user.role);
        const { signatureBase64 } = req.body;

        if (!signatureBase64) {
            return res.status(400).json({ error: 'Signature image is required' });
        }

        const { rows: sourceRows } = await pool.query('SELECT * FROM evidence_source WHERE id = $1', [sourceId]);
        if (!sourceRows.length) return res.status(404).json({ error: 'Evidence source batch not found' });
        const source = sourceRows[0];
        const currentStatus = source.certificate_status;

        if (currentStatus === 'FAILED_VERIFICATION') {
            return res.status(403).json({ error: 'Evidence integrity compromised. Certificate locked.' });
        }
        if (currentStatus === 'COMPLETED') {
            return res.status(400).json({ error: 'Certificate is already completed.' });
        }

        let nextStatus;
        if (currentStatus === 'PENDING_PART_A') {
            nextStatus = 'PENDING_PART_B';
        } else if (currentStatus === 'PENDING_PART_B') {
            if (userRole !== 'forensic_expert' && userRole !== 'admin') {
                return res.status(403).json({ error: 'Only a Forensic Expert can sign Part B.' });
            }
            nextStatus = 'COMPLETED';
        }

        // We will generate the PDF just like GET /certificate, but embed the signature.
        const { rows: files } = await pool.query('SELECT * FROM evidence WHERE source_id = $1 ORDER BY uploaded_at ASC', [sourceId]);
        if (!files.length) return res.status(404).json({ error: 'No evidence files found for this batch' });

        const { rows: userRows } = await pool.query('SELECT name, employee_id, designation, station, parentage_name FROM users WHERE id = $1', [files[0].uploaded_by]);
        const uploader = userRows[0] || {};

        const checkSquare = (checked) => checked ? '[ X ]' : '[   ]';
        const sType = source.source_type || '';
        const isComputer = sType.match(/computer/i);
        const isStorage = sType.match(/storage/i);
        const isDvr = sType.match(/dvr/i);
        const isMobile = sType.match(/mobile/i);
        const isFlash = sType.match(/flash/i);
        const isCd = sType.match(/cd/i) || sType.match(/dvd/i);
        const isServer = sType.match(/server/i);
        const isCloud = sType.match(/cloud/i);
        const isOther = (!isComputer && !isStorage && !isDvr && !isMobile && !isFlash && !isCd && !isServer && !isCloud);

        const drawDeviceSection = (doc) => {
            doc.text(`Computer / Storage Media ${checkSquare(isComputer || isStorage)}    DVR ${checkSquare(isDvr)}    Mobile ${checkSquare(isMobile)}    Flash Drive ${checkSquare(isFlash)}`);
            doc.moveDown(0.5);
            doc.text(`CD/DVD ${checkSquare(isCd)}    Server ${checkSquare(isServer)}    Cloud ${checkSquare(isCloud)}    Other ${checkSquare(isOther)}`);
            doc.moveDown(0.5);
            doc.text(`Other: ${isOther ? sType : '__________________________________________________'}`);
            doc.moveDown();
            doc.text(`Make & Model: ${source.make || '______'} - ${source.model || '______'}          Color: ______________________`);
            doc.text(`Serial Number: ${source.serial_number || '______________________'}`);
            doc.text(`IMEI/UIN/UID/MAC/Cloud ID: ${source.identifiers || '______________________'} (as applicable)`);
            let chainText = '______________________';
            try {
                if (source.device_chain) {
                    const chainArr = typeof source.device_chain === 'string' ? JSON.parse(source.device_chain) : source.device_chain;
                    if (Array.isArray(chainArr) && chainArr.length > 0) {
                        chainText = chainArr.map(c => `${c.type || ''} ${c.identifier ? `(${c.identifier})` : ''}`.trim()).join(' -> ');
                    }
                }
            } catch(e) {}
            doc.text(`and any other relevant information, if any, about the device/digital record: ${chainText}`);
            doc.moveDown();
        };

        const drawHashSection = (doc) => {
            doc.text(`I state that the HASH value/s of the electronic/digital record/s is As detailed in the enclosed Hash Report,`);
            doc.text(`obtained through the following algorithm:—`);
            doc.moveDown(0.5);
            doc.text(`[   ] SHA1:`);
            doc.text(`[ X ] SHA256: As detailed in Hash Report`);
            doc.text(`[   ] MD5:`);
            doc.text(`[   ] Other: ______________________ (Legally acceptable standard)`);
            doc.text(`(Hash report to be enclosed with the certificate)`);
            doc.moveDown();
        };

        const signatureBuffer = Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

        const pdfkitBufferPromise = new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50, size: 'A4' });
                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                if (currentStatus === 'PENDING_PART_A') {
                    doc.font('Helvetica-Bold').fontSize(12).text('THE SCHEDULE', { align: 'center' });
                    doc.font('Helvetica').fontSize(10).text('[See section 63(4)(c)]', { align: 'center' });
                    doc.font('Helvetica-Bold').fontSize(12).text('CERTIFICATE', { align: 'center' });
                    doc.text('PART A', { align: 'center' });
                    doc.font('Helvetica').fontSize(10).text('(To be filled by the Party)', { align: 'center' });
                    doc.moveDown(1.5);

                    const name = uploader.name || files[0].uploader_name || '______________';
                    const parentage = uploader.parentage_name || '______________';
                    const station = uploader.station || '______________';

                    doc.text(`I, ${name} (Name), Son/daughter/spouse of ${parentage}`);
                    doc.text(`residing/employed at ${station} do hereby solemnly affirm and`);
                    doc.text('sincerely state and submit as follows:—');
                    doc.moveDown();

                    doc.text('I have produced electronic record/output of the digital record taken from the following');
                    doc.text('device/digital record source (tick mark):—');
                    doc.moveDown(0.5);

                    drawDeviceSection(doc);

                    const legalText = `The digital device or the digital record source was under the lawful control for regularly creating, storing or processing information for the purposes of carrying out regular activities and during this period, the computer or the communication device was working properly and the relevant information was regularly fed into the computer during the ordinary course of business. If the computer/digital device at any point of time was not working properly or out of operation, then it has not affected the electronic/digital record or its accuracy. The digital device or the source of the digital record is:—`;
                    doc.text(legalText, { align: 'justify' });
                    doc.moveDown(0.5);

                    const oStatus = source.ownership_status || '';
                    doc.text(`Owned ${checkSquare(oStatus.match(/own/i))}    Maintained ${checkSquare(oStatus.match(/maintain/i))}    Managed ${checkSquare(oStatus.match(/manage/i))}    Operated ${checkSquare(oStatus.match(/operate/i))}`);
                    doc.text(`by me (select as applicable).`);
                    doc.moveDown();

                    drawHashSection(doc);

                    doc.moveDown(2);
                    const sigX = doc.page.width - 200;
                    const sigY = doc.y;
                    doc.image(signatureBuffer, sigX, sigY - 30, { width: 100 });
                    doc.text(`(Name and signature)`, sigX, sigY + 30);
                    doc.moveDown();
                    
                    doc.text(`Date (DD/MM/YYYY): ${new Date().toLocaleDateString('en-GB')}`);
                    doc.text(`Time (IST): ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} hours`);
                    doc.text(`Place: ${station}`);
                } else {
                    // PENDING_PART_B
                    doc.font('Helvetica-Bold').fontSize(12).text('PART B', { align: 'center' });
                    doc.font('Helvetica').fontSize(10).text('(To be filled by the Expert)', { align: 'center' });
                    doc.moveDown(1.5);
                    
                    const feName = req.user.name || '______________________';
                    const feParentage = req.user.parentage_name || '______________________';
                    const feStation = req.user.station || '______________________________________';
                    
                    doc.text(`I, ${feName} (Name), Son/daughter/spouse of ${feParentage}`);
                    doc.text(`residing/employed at ${feStation} do hereby solemnly affirm and`);
                    doc.text('sincerely state and submit as follows:—');
                    doc.moveDown();

                    doc.text('The produced electronic record/output of the digital record are obtained from the following');
                    doc.text('device/digital record source (tick mark):—');
                    doc.moveDown(0.5);

                    drawDeviceSection(doc);
                    drawHashSection(doc);
                    
                    doc.moveDown(2);
                    const feDesignation = req.user.designation || 'Examiner of Electronic Evidence';
                    const sigX = doc.page.width - 200;
                    const sigY = doc.y;
                    doc.image(signatureBuffer, sigX, sigY - 30, { width: 100 });
                    doc.text(`${feName}`, sigX, sigY + 30);
                    doc.text(`${feDesignation}`, sigX, sigY + 45);
                    doc.text(`(Signature)`, sigX, sigY + 60);
                    
                    doc.text(`Date (DD/MM/YYYY): ${new Date().toLocaleDateString('en-GB')}`, 50, sigY + 30);
                    doc.text(`Time (IST): ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} hours`, 50, sigY + 45);
                    doc.text(`Place: ${feStation}`, 50, sigY + 60);

                    doc.addPage();
                    doc.font('Helvetica-Bold').fontSize(12).text('ENCLOSED HASH REPORT', { align: 'center' });
                    doc.font('Helvetica').fontSize(10).text(`For Section 63 Certificate (Batch: ${sourceId})`, { align: 'center' });
                    doc.moveDown(2);
                    
                    files.forEach((file, idx) => {
                        const sanitizedFilename = file.filename.replace(/[^\x20-\x7E]/g, '?');
                        doc.font('Helvetica-Bold').text(`${idx + 1}. Filename: `);
                        doc.font('Helvetica').text(`    ${sanitizedFilename}`, { width: 400 });
                        doc.moveDown(0.2);
                        doc.text(`    SHA-256 Hash: ${file.sha256_hash}`);
                        doc.text(`    Blockchain TX ID: ${file.ledger_tx_id || 'Pending Anchoring'}`);
                        if (file.ledger_timestamp) {
                            const ts = new Date(file.ledger_timestamp);
                            doc.text(`    Timestamp: ${ts.toLocaleDateString('en-GB')} ${ts.toLocaleTimeString('en-GB')} IST`);
                        } else {
                            doc.text(`    Timestamp: Pending`);
                        }
                        doc.moveDown(1);
                    });
                }

                doc.end();
            } catch (err) {
                reject(err);
            }
        });

        const newDocBuffer = await pdfkitBufferPromise;
        let finalBuffer = newDocBuffer;
        let finalKey = `certificates/batch_${sourceId}_signed_${Date.now()}.pdf`;

        // If Part B, merge with Part A from MinIO
        if (currentStatus === 'PENDING_PART_B' && source.signed_cert_file_path) {
            try {
                const prevBuffer = await getMinioBuffer(BUCKET, source.signed_cert_file_path);
                
                const finalDoc = await PDFLibDocument.load(prevBuffer);
                const partBDoc = await PDFLibDocument.load(newDocBuffer);
                
                const copiedPages = await finalDoc.copyPages(partBDoc, partBDoc.getPageIndices());
                copiedPages.forEach(p => finalDoc.addPage(p));
                
                const mergedBytes = await finalDoc.save();
                finalBuffer = Buffer.from(mergedBytes);
            } catch (mergeErr) {
                console.warn('⚠️ Merging certificates failed in digital sign:', mergeErr.message);
            }
        }

        const passThrough = new PassThrough();
        passThrough.end(finalBuffer);
        await minioInternal.putObject(BUCKET, finalKey, passThrough, finalBuffer.length, { 'Content-Type': 'application/pdf' });

        await pool.query(
            'UPDATE evidence_source SET certificate_status = $1, signed_cert_file_path = $2 WHERE id = $3',
            [nextStatus, finalKey, sourceId]
        );

        await pool.query(
            `INSERT INTO api_audit_log (user_id, user_name, user_role, method, endpoint, ip_address, status_code)
             VALUES ($1, $2, $3, 'UPLOAD_CERT_DIGITAL', $4, $5, 200)`,
            [userId, req.user.name, req.user.role, req.originalUrl, req.ip || '0.0.0.0']
        );

        res.status(200).json({ message: 'Digital signature applied successfully', status: nextStatus });
    } catch (err) {
        console.error('Digital sign error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to process digital signature' });
        }
    }
});

module.exports = router;
