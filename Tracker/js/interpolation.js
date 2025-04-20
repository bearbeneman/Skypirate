// --- START OF FILE Tracker/js/interpolation.js ---

// js/interpolation.js - Refactored for Integration

// **** Import helpers from the correct relative path ****
import { calculateRawHeading, calculateDistance } from './flightStats.js';
// **** --------------------------------------------- ****

/** Linear interpolation between two numbers. */
function lerp(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    // Check if inputs are valid numbers
    if (typeof a !== 'number' || isNaN(a)) {
        // If a is invalid, check if b is valid
        if (typeof b === 'number' && !isNaN(b)) return b;
        // If both are invalid, return null or a default value (e.g., 0 or null)
        return null; // Indicate failure
    }
    if (typeof b !== 'number' || isNaN(b)) {
        // If b is invalid but a was valid, return a
        return a;
    }
    // Both a and b are valid numbers
    return a + (b - a) * t;
}


/** Linear interpolation between two lat/lon points. */
function lerpLatLng(p1, p2, t) {
    // Validate input points and their coordinates
    if (!p1 || !p2 || typeof p1.latitude !== 'number' || typeof p1.longitude !== 'number' ||
        typeof p2.latitude !== 'number' || typeof p2.longitude !== 'number' ||
        isNaN(p1.latitude) || isNaN(p1.longitude) || isNaN(p2.latitude) || isNaN(p2.longitude)) {
            console.warn("Invalid input to lerpLatLng", {p1_lat: p1?.latitude, p1_lon: p1?.longitude, p2_lat: p2?.latitude, p2_lon: p2?.longitude, t});
            // Try to return the valid point if only one is valid and t indicates its boundary
            if (t === 0 && p1 && typeof p1.latitude === 'number' && typeof p1.longitude === 'number') return { latitude: p1.latitude, longitude: p1.longitude };
            if (t === 1 && p2 && typeof p2.latitude === 'number' && typeof p2.longitude === 'number') return { latitude: p2.latitude, longitude: p2.longitude };
            return null; // Cannot interpolate
    }
    // Ensure t is valid
    if (typeof t !== 'number' || isNaN(t)) t = 0; // Default t to 0 if invalid
    t = Math.max(0, Math.min(1, t)); // Clamp t

    const lat = lerp(p1.latitude, p2.latitude, t);
    const lon = lerp(p1.longitude, p2.longitude, t);

    // Check result of lerp (it returns null if interpolation failed)
    if (lat === null || lon === null) {
         console.warn("lerp returned invalid value in lerpLatLng", {lat, lon, p1, p2, t});
         // Return the closer valid boundary point based on t
         if (t < 0.5) return { latitude: p1.latitude, longitude: p1.longitude };
         else return { latitude: p2.latitude, longitude: p2.longitude };
    }
    return { latitude: lat, longitude: lon };
}

// **** MODIFIED: Altitude/Position helpers now accept trackPoints directly ****
/** Helper to get interpolated altitude at a specific time */
function getInterpolatedAltitude(targetEpochTime, trackPoints) { // Accept trackPoints
     if (!trackPoints || trackPoints.length < 2) return null;
     const lastIdx = trackPoints.length - 1;
     const firstEpoch = trackPoints[0]?.epoch;
     const lastEpoch = trackPoints[lastIdx]?.epoch;

     if (typeof targetEpochTime !== 'number' || isNaN(targetEpochTime) || typeof firstEpoch !== 'number' || typeof lastEpoch !== 'number') {
         console.warn("getInterpolatedAltitude: Invalid time or epoch data.");
         return null;
     }

     targetEpochTime = Math.max(firstEpoch, Math.min(lastEpoch, targetEpochTime));

     // Find segment more robustly
     let index1 = -1;
     for(let i = 0; i < lastIdx; i++) {
         // Ensure both points in the segment have valid epochs
         if (trackPoints[i]?.epoch !== undefined && trackPoints[i+1]?.epoch !== undefined &&
             trackPoints[i].epoch <= targetEpochTime && trackPoints[i+1].epoch >= targetEpochTime) {
             index1 = i;
             break;
         }
     }
     // Handle edge cases where time is exactly first/last point or outside known range after clamping
     if (index1 === -1) {
          if (targetEpochTime <= firstEpoch) index1 = 0;
          else index1 = lastIdx - 1; // Should be equal to lastEpoch here
     }

     const index2 = Math.min(index1 + 1, lastIdx);
     const p1 = trackPoints[index1];
     const p2 = trackPoints[index2];

     if(!p1 || !p2 || typeof p1.epoch !== 'number' || typeof p2.epoch !== 'number') {
         console.warn(`getInterpolatedAltitude: Invalid points for interpolation at indices ${index1}, ${index2}`);
         return p1?.pressureAlt ?? p1?.gpsAlt ?? p2?.pressureAlt ?? p2?.gpsAlt ?? null; // Return first available valid alt
     }

     // Calculate interpolation factor 't'
     let t = 0;
     const epochDiff = p2.epoch - p1.epoch;
     if (epochDiff > 0) t = Math.max(0, Math.min(1, (targetEpochTime - p1.epoch) / epochDiff));
     else if (targetEpochTime >= p2.epoch) t = 1; // If points have same time, use p2 value (or p1 if t stays 0)

     // Get altitude, preferring pressure, then GPS
     const alt1 = p1.pressureAlt ?? p1.gpsAlt;
     const alt2 = p2.pressureAlt ?? p2.gpsAlt;

     // Use the lerp function which handles invalid inputs
     const interpolatedAlt = lerp(alt1, alt2, t);

     // Return the interpolated value, or null if lerp failed
     return (typeof interpolatedAlt === 'number' && !isNaN(interpolatedAlt)) ? interpolatedAlt : null;
}

/** Helper to get interpolated position at a specific time */
export function getInterpolatedPosition(targetEpochTime, trackPoints) { // Accept trackPoints
     if (!trackPoints || trackPoints.length < 2) return null;
     const lastIdx = trackPoints.length - 1;
     const firstEpoch = trackPoints[0]?.epoch;
     const lastEpoch = trackPoints[lastIdx]?.epoch;

     if (typeof targetEpochTime !== 'number' || isNaN(targetEpochTime) || typeof firstEpoch !== 'number' || typeof lastEpoch !== 'number') {
          console.warn("getInterpolatedPosition: Invalid time or epoch data.");
         return null;
     }

     targetEpochTime = Math.max(firstEpoch, Math.min(lastEpoch, targetEpochTime));

     let index1 = -1;
     for(let i = 0; i < lastIdx; i++) {
         if (trackPoints[i]?.epoch !== undefined && trackPoints[i+1]?.epoch !== undefined &&
             trackPoints[i].epoch <= targetEpochTime && trackPoints[i+1].epoch >= targetEpochTime) {
             index1 = i;
             break;
         }
     }
     if (index1 === -1) {
          if (targetEpochTime <= firstEpoch) index1 = 0;
          else index1 = lastIdx - 1;
     }

     const index2 = Math.min(index1 + 1, lastIdx);
     const p1 = trackPoints[index1];
     const p2 = trackPoints[index2];

     if(!p1 || !p2 || typeof p1.epoch !== 'number' || typeof p2.epoch !== 'number') {
        console.warn(`getInterpolatedPosition: Invalid points for interpolation at indices ${index1}, ${index2}`);
        // Return first valid position found
        if (p1 && typeof p1.latitude === 'number' && typeof p1.longitude === 'number') return { latitude: p1.latitude, longitude: p1.longitude };
        if (p2 && typeof p2.latitude === 'number' && typeof p2.longitude === 'number') return { latitude: p2.latitude, longitude: p2.longitude };
        return null;
     }

     let t = 0;
     const epochDiff = p2.epoch - p1.epoch;
     if (epochDiff > 0) t = Math.max(0, Math.min(1, (targetEpochTime - p1.epoch) / epochDiff));
     else if (targetEpochTime >= p2.epoch) t = 1;

     return lerpLatLng(p1, p2, t); // lerpLatLng handles internal validation
}


/** Gets interpolated data (pos, alt, speed, heading, vario) for a specific time. */
// **** MODIFIED: Accept trackPoints directly ****
export function getInterpolatedData(targetEpochTime, trackPoints, currentSliderIndex = 0) {
    // **** MODIFIED: Use passed trackPoints ****
    if (!trackPoints || trackPoints.length < 2 || targetEpochTime === null || typeof targetEpochTime !== 'number' || isNaN(targetEpochTime)) {
        console.warn("getInterpolatedData: Invalid input", {targetEpochTime, trackPointsLength: trackPoints?.length});
        return null;
    }

    // **** MODIFIED: Use passed trackPoints ****
    const lastIdx = trackPoints.length - 1;
    const firstEpoch = trackPoints[0]?.epoch;
    const lastEpoch = trackPoints[lastIdx]?.epoch;

    if (typeof firstEpoch !== 'number' || typeof lastEpoch !== 'number') {
         console.warn("getInterpolatedData: Track points missing valid epoch times.");
         return null; // Cannot proceed without epochs
    }


    targetEpochTime = Math.max(firstEpoch, Math.min(lastEpoch, targetEpochTime));

    // --- Find segment efficiently starting near currentSliderIndex ---
    let index1 = currentSliderIndex;
    // Adjust index to be within valid bounds first
    index1 = Math.max(0, Math.min(index1, lastIdx - 1));

    // Adjust forward: Ensure index1+1 is valid before checking epoch
    while (index1 < lastIdx -1 && trackPoints[index1 + 1]?.epoch !== undefined && trackPoints[index1 + 1].epoch <= targetEpochTime) {
         index1++;
    }
    // Adjust backward: Ensure index1 is valid before checking epoch
    while (index1 > 0 && trackPoints[index1]?.epoch !== undefined && trackPoints[index1].epoch > targetEpochTime) {
         index1--;
    }
    // Final clamp just in case
    index1 = Math.max(0, Math.min(index1, lastIdx - 1));
    const index2 = index1 + 1;
    // --- End Find Segment ---

    // **** MODIFIED: Use passed trackPoints ****
    const p1 = trackPoints[index1];
    const p2 = trackPoints[index2];

    if (!p1 || !p2 || typeof p1.epoch !== 'number' || typeof p2.epoch !== 'number') {
        console.warn("getInterpolatedData: Invalid points p1/p2 for interpolation after segment search", {index1, index2, p1_epoch: p1?.epoch, p2_epoch: p2?.epoch});
        return null;
    }

    // Calculate interpolation factor 't'
    let t = 0;
    const epochDiff = p2.epoch - p1.epoch;
    if (epochDiff > 0) t = Math.max(0, Math.min(1, (targetEpochTime - p1.epoch) / epochDiff));
    else if (targetEpochTime >= p2.epoch && p1.epoch === p2.epoch) t = 1; // Handle identical timestamps, prefer p2

    // **** MODIFIED: Pass trackPoints to helpers ****
    const pos = getInterpolatedPosition(targetEpochTime, trackPoints);
    if (!pos) {
        console.warn("getInterpolatedData: Failed to interpolate position.");
        return null; // Early exit if position interpolation fails
    }
    const alt = getInterpolatedAltitude(targetEpochTime, trackPoints);

    // --- Calculate Instantaneous Heading ---
    let heading = null;
    const headingTimeDelta = 200; // milliseconds +-
    const timeHBefore = Math.max(firstEpoch, targetEpochTime - headingTimeDelta);
    const timeHAfter = Math.min(lastEpoch, targetEpochTime + headingTimeDelta);
    if (timeHAfter > timeHBefore + 10) { // Ensure minimal delta
        // **** MODIFIED: Pass trackPoints to helpers ****
        const posHBefore = getInterpolatedPosition(timeHBefore, trackPoints);
        const posHAfter = getInterpolatedPosition(timeHAfter, trackPoints);
        if (posHBefore && posHAfter && (posHBefore.latitude !== posHAfter.latitude || posHBefore.longitude !== posHAfter.longitude)) {
             heading = calculateRawHeading(posHBefore, posHAfter);
        }
    }
    // Fallback to segment heading if offset method failed or points were too close
    if (heading === null && (p1.latitude !== p2.latitude || p1.longitude !== p2.longitude)) {
         heading = calculateRawHeading(p1, p2);
    }

    // --- Calculate Instantaneous Speed & Vario ---
    let speed = null; // kph
    let vario = null; // m/s
    const sampleTimeDelta = 500; // ms offset
    const timeSBefore = Math.max(firstEpoch, targetEpochTime - sampleTimeDelta);
    const timeSAfter = Math.min(lastEpoch, targetEpochTime + sampleTimeDelta);
    const actualTimeDiffSec = (timeSAfter - timeSBefore) / 1000;

    if (actualTimeDiffSec > 0.05) { // Ensure sufficient time difference
        // **** MODIFIED: Pass trackPoints to helpers ****
        const posBefore = getInterpolatedPosition(timeSBefore, trackPoints);
        const posAfter = getInterpolatedPosition(timeSAfter, trackPoints);
        const altBefore = getInterpolatedAltitude(timeSBefore, trackPoints);
        const altAfter = getInterpolatedAltitude(timeSAfter, trackPoints);

        // Speed Calculation
        if (posBefore && posAfter) {
            const dist = calculateDistance(posBefore.latitude, posBefore.longitude, posAfter.latitude, posAfter.longitude);
            if (!isNaN(dist)) speed = (dist / actualTimeDiffSec) * 3.6; // kph
        }

        // Vario Calculation
        if (altBefore !== null && altAfter !== null) { // Ensure both are numbers
            const altDiff = altAfter - altBefore;
            vario = altDiff / actualTimeDiffSec; // m/s
        }
    }

    // Fallbacks if offset method failed (less smooth)
     if (speed === null && epochDiff > 100) { // Only if segment duration is reasonable
         const dist = calculateDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
         if (!isNaN(dist)) speed = (dist / (epochDiff/1000)) * 3.6; // kph
     }
     if (vario === null && epochDiff > 100) {
         const alt1Fallback = p1.pressureAlt ?? p1.gpsAlt;
         const alt2Fallback = p2.pressureAlt ?? p2.gpsAlt;
          if (alt1Fallback !== null && alt2Fallback !== null && !isNaN(alt1Fallback) && !isNaN(alt2Fallback)) {
                vario = (alt2Fallback - alt1Fallback) / (epochDiff / 1000); // m/s
          }
     }

    // Interpolate timestamp (seconds since midnight) - Check validity
    const interpolatedTimestamp = lerp(p1.timestamp, p2.timestamp, t);


    return {
        timestamp: (typeof interpolatedTimestamp === 'number' && !isNaN(interpolatedTimestamp)) ? interpolatedTimestamp : null, // Seconds since midnight
        epoch: targetEpochTime, // Milliseconds UTC
        latitude: pos.latitude,
        longitude: pos.longitude,
        altitude: alt, // meters (can be null)
        heading: heading, // degrees (0-360) (can be null)
        speed: (speed !== null && !isNaN(speed)) ? speed : null, // kph (can be null)
        vario: (vario !== null && !isNaN(vario)) ? vario : null   // m/s (can be null)
    };
}

// --- END OF FILE Tracker/js/interpolation.js ---