const fs = require("fs");
const exifParser = require("exif-parser");
const ffmpeg = require("fluent-ffmpeg");
const pdfParse = require("pdf-parse");


async function extractForensicMetadata(filePath) {
    const buffer = fs.readFileSync(filePath);
    const { fileTypeFromBuffer } = await import("file-type");
    const type = await fileTypeFromBuffer(buffer);

    let metadata = {
        gps: {
            latitude: null,
            longitude: null
        },
        device: {
            camera_model: null,
            make: null,
            software: null,
            lens: null,
            encoder: null
        },
        time: {
            original_creation: null
        },
        file: {
            type: type?.mime || "unknown",
            size: fs.statSync(filePath).size
        }
    };

    if (!type) return metadata;

    // IMAGE METADATA
    if (type.mime.startsWith("image")) {

        const parser = exifParser.create(buffer);
        const result = parser.parse();

        metadata.gps.latitude = result.tags.GPSLatitude || null;
        metadata.gps.longitude = result.tags.GPSLongitude || null;

        metadata.device.camera_model = result.tags.Model || null;
        metadata.device.make = result.tags.Make || null;
        metadata.device.software = result.tags.Software || null;
        metadata.device.lens = result.tags.LensModel || null;

        metadata.time.original_creation = result.tags.DateTimeOriginal || null;

        return metadata;
    }

    // VIDEO METADATA
    if (type.mime.startsWith("video")) {

        return new Promise((resolve, reject) => {

            ffmpeg.ffprobe(filePath, (err, data) => {

                if (err) return reject(err);

                metadata.device.encoder = data.format.tags?.encoder || null;
                metadata.time.original_creation = data.format.tags?.creation_time || null;

                resolve(metadata);

            });

        });
    }

    // PDF METADATA
    if (type.mime === "application/pdf") {

        const pdfData = await pdfParse(buffer);

        metadata.device.software = pdfData.info.Producer || null;
        metadata.time.original_creation = pdfData.info.CreationDate || null;

        return metadata;
    }

    return metadata;
}

module.exports = extractForensicMetadata;


/* ------------------ TEST ------------------ */

async function test() {

    const file = "C:\\Users\\ishch\\OneDrive\\Pictures\\anime img\\match.jpeg"; // changed file path escapes

    try {
        const result = await extractForensicMetadata(file);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Error:", error);
    }

}

test();