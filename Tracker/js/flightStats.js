// --- START OF FILE Tracker/js/flightStats.js ---

// js/flightStats.js - Refactored for Integration

// **** Import main config and ensure correct relative path ****
import * as config from '../../config.js';
// **** -------------------------------------------------- ****

// --- Calculation Helpers ---

/** Calculates distance between two lat/lon points in meters using Haversine formula. */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    if (typeof lat1 !== 'number' || typeof lon1 !== 'number' || typeof lat2 !== 'number' || typeof lon2 !== 'number' ||
        isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
        return 0;
    }
    const R = 6371e3; // meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    if (a < 0 || a > 1) return 0; // Handle invalid intermediate result

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return isNaN(distance) ? 0 : distance;
}

/** Calculates the initial bearing (heading) from point 1 to point 2 in degrees (0-360). */
export function calculateRawHeading(p1, p2) {
    if (!p1 || !p2 || (p1.latitude === p2.latitude && p1.longitude === p2.longitude)) return null;
    // Ensure coordinates are valid numbers
     if (typeof p1.latitude !== 'number' || typeof p1.longitude !== 'number' ||
         typeof p2.latitude !== 'number' || typeof p2.longitude !== 'number' ||
         isNaN(p1.latitude) || isNaN(p1.longitude) || isNaN(p2.latitude) || isNaN(p2.longitude)) {
         return null;
     }

    const lat1 = p1.latitude * Math.PI / 180;
    const lon1 = p1.longitude * Math.PI / 180;
    const lat2 = p2.latitude * Math.PI / 180;
    const lon2 = p2.longitude * Math.PI / 180;

    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    const headingRad = Math.atan2(y, x);
    const headingDeg = (headingRad * 180 / Math.PI + 360) % 360;

    return isNaN(headingDeg) ? null : headingDeg;
}

/** Calculates the shortest angle difference (-180 to +180) between two headings. */
export function getShortestAngleDiff(targetAngle, currentAngle) {
    if (targetAngle === null || currentAngle === null || isNaN(targetAngle) || isNaN(currentAngle)) return 0;
    const diff = targetAngle - currentAngle;
    // Normalize difference to the range -180 to 180
    return (diff + 540) % 360 - 180;
}


// --- Main Stats Calculation Function ---
export function calculateFlightStats(trackPoints) {
    if (!trackPoints || trackPoints.length < 2) return null;

    let totalDistance = 0;
    let maxAltitude = -Infinity, minAltitude = Infinity;
    let totalGain = 0, totalLoss = 0;
    let maxSpeed = 0, validAltCount = 0;
    let maxClimbRate = -Infinity, maxSinkRate = Infinity;
    let groundTimeSec = 0, flightTimeSec = 0, timeCirclingSec = 0;
    let distanceToFurthest = 0;

    // Ensure epoch times are valid before calculating duration
    const firstEpoch = trackPoints[0]?.epoch;
    const lastEpoch = trackPoints[trackPoints.length - 1]?.epoch;
    if (typeof firstEpoch !== 'number' || typeof lastEpoch !== 'number') {
         console.error("Invalid epoch times in track points for duration calculation.");
         return null; // Cannot calculate duration
    }
    const totalDurationSeconds = (lastEpoch - firstEpoch) / 1000;

    let lastPoint = trackPoints[0];
    let lastValidAltPoint = null; // Store point with last valid altitude
    let furthestPointData = {point: trackPoints[0], dist: 0}; // Store furthest point itself

    // Initialize altitude stats with first point
    const firstAlt = lastPoint.pressureAlt ?? lastPoint.gpsAlt;
    if (firstAlt !== null && !isNaN(firstAlt)) {
        lastValidAltPoint = lastPoint;
        minAltitude = firstAlt; maxAltitude = firstAlt; validAltCount = 1;
    }

    // --- Circling detection variables ---
    let lastHeading = null;
    let turnData = { startIdx: -1, duration: 0, totalAngle: 0, direction: 0 };


    for (let i = 1; i < trackPoints.length; i++) {
        const p1 = lastPoint;
        const p2 = trackPoints[i];

        // Ensure points and epochs are valid
        if (!p1 || !p2 || typeof p1.epoch !== 'number' || typeof p2.epoch !== 'number') {
            console.warn(`Skipping segment ${i}: Invalid point data or epoch.`);
            lastPoint = p2; // Move to next point even if invalid
            continue;
        }

        const timeDiffSeconds = (p2.epoch - p1.epoch) / 1000;

        if (timeDiffSeconds <= 0.01) { // Skip negligible or zero time diff
            lastPoint = p2;
            continue;
        }

        // --- Distance & Speed ---
        const segmentDistance = calculateDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
        let segmentSpeedKmh = 0; // Initialize speed for the segment
        if (!isNaN(segmentDistance) && segmentDistance >= 0.01) { // Require minimal distance
            totalDistance += segmentDistance;
            segmentSpeedKmh = (segmentDistance / timeDiffSeconds) * 3.6; // Calculate speed in km/h
            if (segmentSpeedKmh > maxSpeed) maxSpeed = segmentSpeedKmh;
        }

        // --- Ground/Air Time ---
        // Use the calculated segmentSpeedKmh and config threshold
        if (segmentSpeedKmh < config.groundSpeedThresholdKmh) {
            groundTimeSec += timeDiffSeconds;
        } else {
            flightTimeSec += timeDiffSeconds;
        }

        // --- Altitude & Vario ---
        const alt2 = p2.pressureAlt ?? p2.gpsAlt;
        if (alt2 !== null && !isNaN(alt2)) {
            if (validAltCount === 0) { // First valid altitude found
                 minAltitude = alt2; maxAltitude = alt2;
            } else {
                if (alt2 > maxAltitude) maxAltitude = alt2;
                if (alt2 < minAltitude) minAltitude = alt2;
            }
            validAltCount++;

            // Calculate gain/loss and vario using the *last valid* altitude point
            if (lastValidAltPoint && typeof lastValidAltPoint.epoch === 'number') {
                const alt1 = lastValidAltPoint.pressureAlt ?? lastValidAltPoint.gpsAlt;
                const timeDiffAltSec = (p2.epoch - lastValidAltPoint.epoch) / 1000;
                if (alt1 !== null && !isNaN(alt1) && timeDiffAltSec > 0.01) {
                    const altDiff = alt2 - alt1;
                    const vario = altDiff / timeDiffAltSec; // m/s
                    if (!isNaN(vario)) {
                        if (vario > maxClimbRate) maxClimbRate = vario;
                        if (vario < maxSinkRate) maxSinkRate = vario;
                        if (altDiff > 0) totalGain += altDiff;
                        else totalLoss += Math.abs(altDiff);
                    }
                }
            }
            lastValidAltPoint = p2; // Update last valid altitude point
        }

        // --- Distance to Furthest ---
        const distFromStart = calculateDistance(trackPoints[0].latitude, trackPoints[0].longitude, p2.latitude, p2.longitude);
        if (distFromStart > furthestPointData.dist) {
            furthestPointData = {point: p2, dist: distFromStart};
            distanceToFurthest = distFromStart; // Update the stat value directly
        }

        // --- Circling/Turn Detection ---
        // Use p1 and p2 for heading calculation as they represent the current segment
        const currentHeading = calculateRawHeading(p1, p2);
        if (currentHeading !== null) {
             if (lastHeading !== null && segmentSpeedKmh >= config.groundSpeedThresholdKmh) { // Only consider turns while flying
                 const headingDiff = getShortestAngleDiff(currentHeading, lastHeading);
                 const turnDirection = Math.sign(headingDiff);

                 if (turnDirection !== 0 && Math.abs(headingDiff) > 1) { // Require minimal turn angle
                     if (turnData.startIdx === -1 || turnDirection !== turnData.direction) {
                         // End previous turn if criteria met
                         if (turnData.startIdx !== -1 && turnData.duration >= config.minCirclingDurationSec && Math.abs(turnData.totalAngle) >= config.minCirclingTurnDegrees) { timeCirclingSec += turnData.duration; }
                         // Start new turn
                         turnData = { startIdx: i - 1, duration: timeDiffSeconds, totalAngle: headingDiff, direction: turnDirection };
                     } else {
                         // Continue current turn
                         turnData.duration += timeDiffSeconds;
                         turnData.totalAngle += headingDiff;
                     }
                 } else { // Straight flight or negligible turn
                     // End previous turn if criteria met
                      if (turnData.startIdx !== -1 && turnData.duration >= config.minCirclingDurationSec && Math.abs(turnData.totalAngle) >= config.minCirclingTurnDegrees) { timeCirclingSec += turnData.duration; }
                     // Reset turn data
                     turnData = { startIdx: -1, duration: 0, totalAngle: 0, direction: 0 };
                 }
             } else if (segmentSpeedKmh < config.groundSpeedThresholdKmh) { // Reset turn if on ground
                  if (turnData.startIdx !== -1 && turnData.duration >= config.minCirclingDurationSec && Math.abs(turnData.totalAngle) >= config.minCirclingTurnDegrees) { timeCirclingSec += turnData.duration; }
                  turnData = { startIdx: -1, duration: 0, totalAngle: 0, direction: 0 };
             }
             lastHeading = currentHeading; // Update heading for next iteration
         } else { // Could not calculate heading for segment
             // End previous turn if criteria met
              if (turnData.startIdx !== -1 && turnData.duration >= config.minCirclingDurationSec && Math.abs(turnData.totalAngle) >= config.minCirclingTurnDegrees) { timeCirclingSec += turnData.duration; }
             turnData = { startIdx: -1, duration: 0, totalAngle: 0, direction: 0 };
             lastHeading = null;
         }

        lastPoint = p2; // Move to the next point
    } // End loop

     // Check for turn ending at the very last point
     if (turnData.startIdx !== -1 && turnData.duration >= config.minCirclingDurationSec && Math.abs(turnData.totalAngle) >= config.minCirclingTurnDegrees) {
         timeCirclingSec += turnData.duration;
     }

    // Final Calculations
    const averageSpeed = (flightTimeSec > 0 && totalDistance > 0)
        ? (totalDistance / 1000 / (flightTimeSec / 3600)) // Use flight time for average flight speed
        : 0;
    const startPoint = trackPoints[0];
    const endPoint = trackPoints[trackPoints.length - 1];
    const pointToPointDistance = calculateDistance(startPoint.latitude, startPoint.longitude, endPoint.latitude, endPoint.longitude);
    // Free Distance: Start -> Furthest -> End
    const freeDistanceApproximation = distanceToFurthest + calculateDistance(furthestPointData.point.latitude, furthestPointData.point.longitude, endPoint.latitude, endPoint.longitude);

    return {
        duration: totalDurationSeconds > 0 ? totalDurationSeconds : 0,
        totalDistance: totalDistance,
        pointToPointDistance: pointToPointDistance,
        maxAltitude: validAltCount > 0 ? maxAltitude : null,
        minAltitude: validAltCount > 0 ? minAltitude : null,
        altitudeGain: totalGain,
        altitudeLoss: totalLoss,
        averageSpeed: averageSpeed, // Average speed during flight time
        maxSpeed: maxSpeed,
        maxClimbRate: maxClimbRate > -Infinity ? maxClimbRate : null,
        maxSinkRate: maxSinkRate < Infinity ? maxSinkRate : null,
        flightTime: flightTimeSec,
        groundTime: groundTimeSec,
        timeCircling: timeCirclingSec,
        distanceToFurthest: distanceToFurthest,
        freeDistanceApproximation: freeDistanceApproximation
    };
}

/** Calculates average time difference between consecutive points in ms */
export function calculateTimeBetweenPoints(trackPoints) {
     if (!trackPoints || trackPoints.length < 2) { return 1000; }
     let totalTimeDiff = 0, count = 0;
     for (let i = 1; i < trackPoints.length; i++) {
         if (trackPoints[i]?.epoch !== undefined && trackPoints[i-1]?.epoch !== undefined) {
             const diff = trackPoints[i].epoch - trackPoints[i - 1].epoch;
             if (diff > 0 && diff < 60000) { // Use reasonable range (ms)
                 totalTimeDiff += diff;
                 count++;
             }
         }
     }
     const avgTime = count > 0 ? (totalTimeDiff / count) : 1000; // Default to 1s if no valid diffs
     console.log(`Average time between points: ${avgTime.toFixed(0)} ms`);
     return avgTime;
 }

// --- END OF FILE Tracker/js/flightStats.js ---