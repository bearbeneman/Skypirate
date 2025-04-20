// --- START OF FILE Tracker/js/igcParser.js ---

// js/igcParser.js - Refactored for Integration

// **** Import formatters from the correct relative path ****
import { formatTimestamp, formatDateFromIGC } from './formatters.js';
// **** ----------------------------------------------- ****

function parseTimestampInternal(t) {
    // Check if input is valid string and length
    if (typeof t !== 'string' || t.length < 6) throw new Error(`Invalid time string format: ${t}`);
    const h = parseInt(t.substring(0, 2), 10);
    const m = parseInt(t.substring(2, 4), 10);
    const s = parseInt(t.substring(4, 6), 10);
    if (isNaN(h) || isNaN(m) || isNaN(s) || h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) {
        throw new Error(`Invalid time values: H=${h}, M=${m}, S=${s} from ${t}`);
    }
    return h * 3600 + m * 60 + s; // Seconds since midnight UTC
}

function parseDateToEpochUTC(d) {
    if (!d || d.length !== 6) return NaN;
    const D = parseInt(d.substring(0, 2), 10);
    const M = parseInt(d.substring(2, 4), 10) - 1; // Month is 0-indexed
    const Y = parseInt(d.substring(4, 6), 10);
    const fullYear = Y + (Y < 70 ? 2000 : 1900); // Basic 2-digit year handling
    if (isNaN(D) || isNaN(M) || isNaN(fullYear) || D < 1 || D > 31 || M < 0 || M > 11) {
        console.warn(`parseDateToEpochUTC: Invalid date components DD=${D}, MM=${M+1}, YY=${Y}`);
        return NaN;
    }
    // Use Date.UTC for consistency
    const epochMillis = Date.UTC(fullYear, M, D);
     if (isNaN(epochMillis)) {
        console.warn(`parseDateToEpochUTC: Date.UTC returned NaN for ${fullYear}-${M+1}-${D}`);
        return NaN;
    }
    return epochMillis;
}


function parseLatLng(la, lo) {
     // Check inputs
    if (typeof la !== 'string' || la.length < 8 || typeof lo !== 'string' || lo.length < 9) {
        throw new Error(`Invalid coordinate string format: Lat ${la}, Lon ${lo}`);
    }
    const latDeg = parseInt(la.substring(0, 2), 10);
    const latMin = parseInt(la.substring(2, 4), 10);
    const latMinFrac = parseInt(la.substring(4, 7), 10); // Assume 3 decimal places for minutes
    const latHem = la.substring(7, 8).toUpperCase();

    const lonDeg = parseInt(lo.substring(0, 3), 10);
    const lonMin = parseInt(lo.substring(3, 5), 10);
    const lonMinFrac = parseInt(lo.substring(5, 8), 10); // Assume 3 decimal places for minutes
    const lonHem = lo.substring(8, 9).toUpperCase();

    if (isNaN(latDeg) || isNaN(latMin) || isNaN(latMinFrac) || !['N', 'S'].includes(latHem) ||
        isNaN(lonDeg) || isNaN(lonMin) || isNaN(lonMinFrac) || !['E', 'W'].includes(lonHem)) {
        throw new Error(`Invalid coordinate numeric parts or hemisphere: Lat ${la}, Lon ${lo}`);
    }

    let lat = latDeg + (latMin + latMinFrac / 1000) / 60;
    if (latHem === 'S') lat *= -1;

    let lon = lonDeg + (lonMin + lonMinFrac / 1000) / 60;
    if (lonHem === 'W') lon *= -1;

    // Final validation of calculated values
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error(`Calculated coordinate out of bounds: Lat ${lat}, Lon ${lon}`);
    }
    return { latitude: lat, longitude: lon };
}

// **** Ensure parseIGC is exported ****
export function parseIGC(content) {
    const lines = content.split(/\r?\n/);
    const headers = {};
    const trackPoints = [];
    let dateStr = null;
    const standardHeaders = {
        'PLT': "Pilot", 'GTY': "Glider Type", 'GID': "Glider ID", 'CID': "Comp ID",
        'CCL': "Comp Class", 'SIT': "Site", 'RFW': "Firmware", 'RHW': "Hardware",
        'FTY': "Logger Type", 'GPS': "GPS Receiver", 'PRS': "Pressure Sensor", 'DTM': "GPS Datum"
    };
    let bRecordCount = 0; // Count B records processed

    for (const line of lines) {
        if (!line) continue; // Skip empty lines
        const type = line.charAt(0).toUpperCase(); // Standardize type case

        if (type === 'H') {
            if (line.length < 6) continue; // Skip malformed H records
            if (line.substring(0, 5).toUpperCase() === 'HFDTE') {
                 const potentialDate = line.substring(5).match(/\d{6}/)?.[0];
                 if (potentialDate) {
                    dateStr = potentialDate; // Store raw string for epoch calculation
                    try {
                        headers.Date = formatDateFromIGC(dateStr); // Store formatted date for display
                    } catch (e) {
                         console.warn(`Failed to format date ${dateStr} from HFDTE record: ${e.message}`);
                         headers.Date = "Invalid"; // Indicate formatting failed
                    }
                } else {
                    console.warn(`Malformed HFDTE record: ${line}`);
                }
            } else {
                const match = line.match(/^H([FOP])([A-Z0-9]{3})(?:([^:]*):)?(.*)/i); // Case-insensitive match for code
                if (match) {
                    const code = match[2].toUpperCase(); // Standardize code case
                    const value = (match[4] || '').trim(); // Use description or value
                    const key = standardHeaders[code] || code; // Use friendly name or code
                    headers[key] = value;
                }
            }
        } else if (type === 'B') {
            bRecordCount++;
            if (line.length < 35) {
                 console.warn(`Skipping short B record (line ${bRecordCount}): ${line}`);
                 continue;
            }
            const timeStrRaw = line.substring(1, 7);
            const latStr = line.substring(7, 15);
            const lonStr = line.substring(15, 24);
            const validity = line.substring(24, 25).toUpperCase(); // Standardize case
            const pressAltStr = line.substring(25, 30);
            const gpsAltStr = line.substring(30, 35);

            if (validity !== 'A') {
                 // console.log(`Skipping B record with validity '${validity}'`); // Optional: Log skipped invalid points
                 continue;
            }

            try {
                const timestamp = parseTimestampInternal(timeStrRaw); // Seconds since midnight
                const { latitude, longitude } = parseLatLng(latStr, lonStr);
                const pressureAlt = parseInt(pressAltStr, 10);
                const gpsAlt = parseInt(gpsAltStr, 10);

                trackPoints.push({
                    timestamp: timestamp, // Seconds since midnight UTC
                    latitude: latitude,
                    longitude: longitude,
                    pressureAlt: isNaN(pressureAlt) ? null : pressureAlt, // Use null if NaN
                    gpsAlt: isNaN(gpsAlt) ? null : gpsAlt,          // Use null if NaN
                    epoch: 0 // Placeholder, calculated later
                });
            } catch (e) {
                console.warn(`Skipping B record (line ${bRecordCount}) due to parsing error: "${line}" - Error: ${e.message}`);
            }
        }
    } // End line loop

    if (!dateStr) {
        throw new Error("Invalid IGC format: Missing HFDTE date record.");
    }
    if (trackPoints.length < 2) {
         throw new Error(`Invalid IGC format: Less than 2 valid B-records found (Processed: ${trackPoints.length}).`);
    }

    // Calculate Epoch Time (Milliseconds UTC) for each point
    const dateEpoch = parseDateToEpochUTC(dateStr);
    if (isNaN(dateEpoch)) {
        console.error(`Invalid HFDTE date "${dateStr}". Cannot calculate absolute epoch times accurately.`);
        // Assign relative epoch based on first point timestamp (less ideal)
        const firstTimestampSec = trackPoints[0].timestamp;
        trackPoints.forEach(p => { p.epoch = (firstTimestampSec + (p.timestamp - firstTimestampSec)) * 1000 });
        console.warn("Assigned relative epoch times due to invalid date.");
    } else {
        let lastTimestamp = -1;
        let dateOffsetMillis = 0; // For handling flights crossing UTC midnight
        trackPoints.forEach(p => {
            // Simple check for UTC midnight rollover (timestamp decreases significantly)
            if (lastTimestamp !== -1 && p.timestamp < lastTimestamp && (lastTimestamp - p.timestamp) > 43200) { // 12 hours threshold
                dateOffsetMillis += 86400000; // Add 24 hours in milliseconds
                console.log(`Detected UTC midnight rollover at timestamp ${p.timestamp}`);
            }
            // Calculate epoch: Base Date + Time of Day (seconds to ms) + Rollover Offset
            p.epoch = dateEpoch + (p.timestamp * 1000) + dateOffsetMillis;
            lastTimestamp = p.timestamp;
        });
    }

    console.log(`IGC Parsing Complete: ${trackPoints.length} track points processed.`);
    return { headers, trackPoints };
}

// --- END OF FILE Tracker/js/igcParser.js ---