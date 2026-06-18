const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const pool = new Pool({
    host: '127.0.0.1',
    port: 5432, // The user's pg is probably exposed or I need to run this inside the container.
    user: 'your_postgres_user',
    password: 'your_secure_postgres_password',
    database: 'shield_db_name'
});

async function run() {
    try {
        const { rows: sourceRows } = await pool.query('SELECT es.* FROM evidence_source es JOIN evidence e ON e.source_id = es.id LIMIT 1');
        if (!sourceRows.length) {
            console.log('No sources with evidence');
            process.exit(0);
        }
        const source = sourceRows[0];
        const sourceId = source.id;

        const { rows: files } = await pool.query('SELECT * FROM evidence WHERE source_id = $1 ORDER BY uploaded_at ASC', [sourceId]);
        const { rows: userRows } = await pool.query('SELECT name, employee_id, designation, station, parentage_name FROM users WHERE id = $1', [files[0].uploaded_by]);
        const uploader = userRows[0] || {};

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        
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
            doc.text(`and any other relevant information, if any, about the device/digital record: ______________________ (specify).`);
            doc.moveDown();
        };

        const drawHashSection = (doc) => {
            doc.text(`I state that the HASH value/s of the electronic/digital record/s is As detailed in the enclosed Hash Report (See Page 2),`);
            doc.text(`obtained through the following algorithm:—`);
            doc.moveDown(0.5);
            doc.text(`[   ] SHA1:`);
            doc.text(`[ X ] SHA256: As detailed in Hash Report`);
            doc.text(`[   ] MD5:`);
            doc.text(`[   ] Other: ______________________ (Legally acceptable standard)`);
            doc.text(`(Hash report to be enclosed with the certificate)`);
            doc.moveDown();
        };

        doc.font('Helvetica-Bold').fontSize(12).text('THE SCHEDULE', { align: 'center' });
        doc.font('Helvetica').fontSize(10).text('[See section 63(4)(c)]', { align: 'center' });
        doc.font('Helvetica-Bold').fontSize(12).text('CERTIFICATE', { align: 'center' });
        doc.text('PART A', { align: 'center' });
        doc.font('Helvetica').fontSize(10).text('(To be filled by the Party)', { align: 'center' });
        doc.moveDown(1.5);

        const name = 'uploader_name';
        const parentage = 'uploader.parentage_name';
        const station = 'uploader.station';

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
        doc.text(`Place: __________________`);

        if (source.certificate_status === 'PENDING_PART_B' || source.certificate_status === 'COMPLETED') {
             doc.addPage();
             doc.font('Helvetica-Bold').fontSize(12).text('PART B', { align: 'center' });
             doc.font('Helvetica').fontSize(10).text('(To be filled by the Expert)', { align: 'center' });
             doc.moveDown(1.5);
             
             doc.text(`I, ______________________ (Name), Son/daughter/spouse of ______________________`);
             doc.text(`residing/employed at ______________________________________ do hereby solemnly affirm and`);
             doc.text('sincerely state and submit as follows:—');
             doc.moveDown();

             doc.text('The produced electronic record/output of the digital record are obtained from the following');
             doc.text('device/digital record source (tick mark):—');
             doc.moveDown(0.5);

             drawDeviceSection(doc);
             drawHashSection(doc);
             
             doc.moveDown(2);
             doc.text(`                                                                                 (Name, designation and signature)`);
             doc.moveDown();
             doc.text(`Date (DD/MM/YYYY): ______`);
             doc.text(`Time (IST): ________hours (In 24 hours format)`);
             doc.text(`Place: ___________`);
        }

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
            doc.text(`    Timestamp: ${file.ledger_timestamp ? new Date(file.ledger_timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Pending'}`);
            doc.moveDown(1);
        });

        doc.end();
        console.log('PDF generated successfully');
    } catch (err) {
        console.error('Error generating PDF:', err);
    } finally {
        pool.end();
    }
}
run();
