const { exiftool } = require("exiftool-vendored");
const fs = require("fs");
const path = require("path");

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

async function extractMetadata(filePath, firLat, firLng) {
    try {
        const tags = await exiftool.read(filePath);

        // Extract GPS Coordinates
        const gps = {
            latitude: tags.GPSLatitude,
            longitude: tags.GPSLongitude
        };

        // Extract Creation Timestamp
        const creationTime = tags.CreateDate || tags.DateTimeOriginal || tags.CreationDate || tags.ModifyDate;

        console.log(`File: ${path.basename(filePath)}`);

        if (gps.latitude !== undefined && gps.longitude !== undefined) {
            console.log(`GPS Coordinates: ${gps.latitude}, ${gps.longitude}`);
            console.log(`Google Maps Link: https://www.google.com/maps?q=${gps.latitude},${gps.longitude}`);
            
            if (firLat !== undefined && firLng !== undefined && !isNaN(firLat) && !isNaN(firLng)) {
                const distance = getDistanceFromLatLonInKm(gps.latitude, gps.longitude, firLat, firLng);
                console.log(`Distance from FIR location: ${distance.toFixed(3)} km`);
                if (distance > 0.5) { // 500 meters threshold
                    console.error(`🚨 ERROR: Photo GPS metadata contradicts the FIR's stated location! (Distance: ${distance.toFixed(3)} km)`);
                } else {
                    console.log(`✅ Location validates against FIR (within 500m).`);
                }
            }
        } else {
            console.log('GPS Coordinates: Not found');
        }

        if (creationTime) {
            // Exiftool might return an ExifDateTime object which has a rawValue or we can just stringify it
            const timeStr = typeof creationTime === 'object' ? (creationTime.rawValue || creationTime.toString()) : creationTime;
            console.log(`Creation Time: ${timeStr}`);
        } else {
            // Fallback to file system creation time
            const stats = fs.statSync(filePath);
            console.log(`Creation Time (from file system): ${stats.birthtime}`);
        }

        console.log('--------------------------------------------------');
    } catch (err) {
        console.error(`Error reading ${filePath}: ${err.message}`);
    }
}

async function main() {
    const targetPath = process.argv[2];
    const firLat = process.argv[3] ? parseFloat(process.argv[3]) : undefined;
    const firLng = process.argv[4] ? parseFloat(process.argv[4]) : undefined;

    if (!targetPath) {
        console.log("Usage: node extract_metadata.js <path_to_file_or_directory> [fir_latitude] [fir_longitude]");
        process.exit(1);
    }

    try {
        const stats = fs.statSync(targetPath);

        if (stats.isDirectory()) {
            const files = fs.readdirSync(targetPath);
            for (const file of files) {
                const fullPath = path.join(targetPath, file);
                if (fs.statSync(fullPath).isFile()) {
                    const ext = path.extname(fullPath).toLowerCase();
                    // Filter for common image and video formats
                    if (['.jpg', '.jpeg', '.png', '.heic', '.mp4', '.mov', '.avi', '.mkv'].includes(ext)) {
                        await extractMetadata(fullPath, firLat, firLng);
                    }
                }
            }
        } else {
            await extractMetadata(targetPath, firLat, firLng);
        }
    } catch (err) {
        console.error(`Error processing path: ${err.message}`);
    } finally {
        // We must close the exiftool process
        await exiftool.end();
    }
}

main();
