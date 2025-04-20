// --- START OF FILE config.js ---

// config.js - Comprehensive Configuration

const config = {
    // --- Map & Track ---
    trackColor: 'navy',
    trackWeight: 2.5,
    rotationOffset: 0,
    gliderIconUrl: 'images/tracker-icon.png',
    gliderIconSize: [32, 32],
    gliderIconAnchor: [16, 32], // Calculated below
    // --- Map View Options ---
    initialZoomOffset: 1.0,
    mapFollowZoomLevel: null,
    mapPanDuration: 0.3,
    mapPanEaseLinearity: 0.5,

    // --- Playback ---
    defaultPlaybackSpeed: 1,

    // --- Barogram ---
    altitudeLineColor: 'rgb(200, 0, 0)',

    // --- Calculation Thresholds ---
    groundSpeedThresholdKmh: 5,
    minCirclingDurationSec: 15,
    minCirclingTurnDegrees: 180,

    // --- Unit Conversion Factors (Internal) ---
    _internal: {
        metersToFeet: 3.28084,
        kphToMph: 0.621371,
        kphToKts: 0.539957,
        kmToMi: 0.621371,
        // mpsToFpm: 196.85, // No longer needed for display
    }
};

// --- Automatically Calculate Anchor ---
config.gliderIconAnchor = [config.gliderIconSize[0] / 2, config.gliderIconSize[1]];

// --- Formatting Function (Modified for Vario) ---
config.getFormattedValue = (value, type, targetUnit) => {
    if (value === null || value === undefined || isNaN(value)) return "N/A";

    let num = value;
    let unitLabel = targetUnit; // Use the passed target unit as the default label

    try {
        switch (type) {
            case 'distance': // Base value is meters
                unitLabel = targetUnit;
                num = value / 1000; // Convert meters to km first
                if (targetUnit === 'mi') {
                    num *= config._internal.kmToMi;
                } else { // Default to km if not 'mi'
                    unitLabel = 'km';
                }
                return `${num.toFixed(2)} ${unitLabel}`;

            case 'altitude': // Base value is meters
                 unitLabel = targetUnit;
                 if (targetUnit === 'ft') {
                    num *= config._internal.metersToFeet;
                 } else {
                    unitLabel = 'm';
                 }
                 return `${num.toFixed(0)} ${unitLabel}`;

            case 'speed': // Base value is kph
                unitLabel = targetUnit;
                if (targetUnit === 'mph') {
                    num *= config._internal.kphToMph;
                } else if (targetUnit === 'kts') {
                    num *= config._internal.kphToKts;
                } else {
                    unitLabel = 'km/h';
                }
                return `${num.toFixed(1)} ${unitLabel}`;

            case 'vario': // Base value is m/s
                 // --- MODIFIED: Always display as m/s ---
                 unitLabel = 'm/s';
                 // No conversion needed as base value is m/s
                 // if (altUnit === 'ft') { ... } // Removed conditional fpm conversion
                 return `${num.toFixed(1)} ${unitLabel}`;
                 // --- END MODIFICATION ---

            default:
                return typeof value === 'number' ? value.toFixed(1) : value;
        }
    } catch (e) {
        console.error("Error formatting value:", value, type, targetUnit, e);
        return "Error";
    }
};

export default config;

// --- END OF FILE config.js ---