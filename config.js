// --- START OF FILE config.js ---
// config.js - Comprehensive Configuration


// Add Scaling Parameters:
export const MIN_COMPASS_SIZE = 60; // Smallest size at min zoom
export const MAX_COMPASS_SIZE = 200; // Largest size at max zoom
export const MIN_ZOOM_FOR_SCALING = 8;  // Zoom level where compass starts being smallest
export const MAX_ZOOM_FOR_SCALING = 14; // Zoom level where compass reaches largest size
export const ON_MAP_COMPASS_Y_OFFSET = 5; // Pixels to offset compass above the site marker (0 for centered)

// --- Custom Precipitation Image Overlay ---
export const PRECIP_IMAGE_BASE_URL = "https://pub-12b531149cba4064bc7b820709c68157.r2.dev";
export const PRECIP_IMAGE_PREFIX = "precip_";
export const PRECIP_IMAGE_SUFFIX = "_UTC.png";
// *** IMPORTANT: Replace these bounds with the actual Lat/Lng corners of your images ***
// Format: [[North Latitude, West Longitude], [South Latitude, East Longitude]]
export const PRECIP_IMAGE_BOUNDS = [[59.72, -11.26], [47.69, 2.16]];
export const PRECIP_IMAGE_ERROR_URL = 'Images/transparent.png'; // Path to a transparent or "unavailable" placeholder image
export const DEFAULT_PRECIP_OVERLAY_VISIBLE = false; // Start hidden
export const DEFAULT_PRECIP_OVERLAY_OPACITY = 0.6; // Opacity from 0.0 to 1.0

// --- Custom Precipitation Image Processing ---
export const ENABLE_IMAGE_EFFECTS = true; // Master switch: true = enable transparency/blur, false = use original images
export const DEFAULT_IMAGE_EFFECT_THRESHOLD = 227; // Default RGB threshold (0-255) for transparency
export const DEFAULT_IMAGE_EFFECT_BLUR = '1px';   // Default CSS blur amount (e.g., '1px', '0.5px'). Use '' or '0px' to disable blur.
export const ENABLE_IMAGE_BOTTOM_TRANSPARENCY = true; // true = make bottom section transparent
export const IMAGE_BOTTOM_TRANSPARENCY_HEIGHT_PX = 80;  // Height in pixels from the bottom to make transparent

// --- Open-Meteo Settings ---
export const OPEN_METEO_CACHE_MINUTES = 30; // How long to cache Open-Meteo data
export const WIND_INDICATOR_ROTATION_OFFSET_DEGREES = 180;

// API Endpoints
export const SITES_API_URL = "https://api.theparaglider.com/v1/weather/sites";
export const WEATHER_API_BASE_URL = "https://api.theparaglider.com/v1/weather/sites/";

// --- UKMO Seamless Weather Service ---
export const UKMO_API_BASE_URL = "https://api.open-meteo.com/v1/forecast";
// Ensure parameter names exactly match the API documentation
export const UKMO_API_HOURLY_PARAMS = "weather_code,wind_speed_10m,wind_gusts_10m,precipitation,wind_direction_10m,temperature_2m,dew_point_2m";
export const UKMO_API_MODEL_PARAM = "ukmo_seamless"; // Model identifier
export const UKMO_CACHE_DURATION_HOURS = 12;       // Cache expiry in hours
// Calculate milliseconds from hours for easier use in code
export const UKMO_CACHE_DURATION_MS = UKMO_CACHE_DURATION_HOURS * 60 * 60 * 1000;
// Unique name for the Dexie object store for this bulk data
export const UKMO_DATA_STORE_NAME = "ukmoBulkWeatherStore";
// Unique key used to store the single bulk data entry in the Dexie store
export const UKMO_BULK_CACHE_KEY = "allSitesData";
// Decimal places for latitude/longitude in the API query string
export const UKMO_COORD_PRECISION = 4;
// Max number of locations per single API fetch (Open-Meteo handles many, but good practice to have a limit)
// Check Open-Meteo docs for any specific limit, otherwise choose a reasonable number. 500 is likely safe.
export const UKMO_MAX_LOCATIONS_PER_FETCH = 500;

export const DISPLAY_UKMO_PANEL = true; // Set to true to enable the panel, false to disable

// Conversion Factors
export const KNOTS_TO_MPH = 1.15078;
export const KPH_TO_MPH = 0.621371;

// --- Map Marker Default Visibility ---
export const DEFAULT_MARKER_VISIBILITY_OPEN_SUITABLE = true;   // Show 'Open - Suitable' markers by default?
export const DEFAULT_MARKER_VISIBILITY_OPEN_UNSUITABLE = true; // Show 'Open - Unsuitable' markers by default?
export const DEFAULT_MARKER_VISIBILITY_OPEN_UNKNOWN = true;  // Show 'Open - Unknown/Loading' markers by default?
export const DEFAULT_MARKER_VISIBILITY_CLOSED = false;         // Show 'Closed' markers by default?

// Map Defaults
export const DEFAULT_MAP_CENTER = [54.5, -3]; // UK Center
export const DEFAULT_MAP_ZOOM = 6;
export const GEOLOCATION_ZOOM = 10; // Zoom level when user location is found
export const SEARCH_RESULT_ZOOM_LEVEL = 13;
export const SEARCH_FLYTO_DURATION = 4;
export const SHOW_KK7_LAYERS_DEFAULT = false;

export const BASE_MAP_OPTIONS = {
    MAPTILER_VECTOR: false,      // Default: Terrain Vector (MapTiler) - Recommended Default
    OSM_STREET: true,           // Street Map (OSM)
    OPENTOPO_RASTER: true,      // Topo Raster (OpenTopo)
    CARTO_GREY: true,           // Topo Grey (Carto Voyager)
    ESRI_SATELLITE: true        // Satellite (Esri)
};

export const DEFAULT_BASE_MAP_KEY = 'CARTO_GREY'; // Example: Start with MapTiler
// Other possible values: 'OSM_STREET', 'OPENTOPO_RASTER', 'CARTO_GREY', 'ESRI_SATELLITE'

// RASP Data
export const HARDCODED_RASP_CORNERS_DATA = [
    [61.064, -16.418], // Corner 1 (TL)
    [61.098, 5.837],   // Corner 2 (TR)
    [48.243, -16.420], // Corner 3 (BL)
    [48.099, 5.869]    // Corner 4 (BR)
];
export const AVAILABLE_RASP_TIMES_LST = [
    800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900
];
export const RASP_IMAGE_BASE_URL = "https://cdn19.mrsap.org";
export const RASP_MAX_DAY_OFFSET = 6;
export const RASP_IMAGE_PATH_FORMAT = (dayOffset, timeLST) => {
    const regionAndOffset = dayOffset > 0 ? `UKI12+${dayOffset}` : 'UKI12';
    const formattedTime = String(timeLST).padStart(4, '0');
    return `${regionAndOffset}/FCST/stars.curr.${formattedTime}lst.d2.body.png`;
};
export const RASP_ATTRIBUTION = 'mrsap.org (UKI12)';






// Note: The PARTICLE_SPEED_WEIGHT_FROM_DATA setting still applies *before* this mapping multiplier.
// If weight=0 (normalized), this mapping will scale that normalized speed based on relative wind strength.
// If weight=1 (data magnitude), this mapping will scale the data-driven speed based on relative wind strength.
export const PARTICLE_SPEED_WEIGHT_FROM_DATA = 0.3; // Example: Start with normalized direction
// Base Appearance (Tune these)
export const INITIAL_PARTICLE_COUNT = 1100; // Target count at reference zoom. Performance depends on this.
export const INITIAL_PARTICLE_SPEED_FACTOR_VALUE = 60; // Base speed value linked to slider (adjusts geographic speed).
export const INITIAL_PARTICLE_COLOR = '#FFFFFF';       // Particle color.
export const INITIAL_PARTICLE_SIZE = 3;                // Particle line width in pixels.
export const INITIAL_PARTICLE_MAX_AGE = 200;            // Base max lifespan in frames (tune for desired max trail length).
export const INITIAL_PARTICLE_MIN_AGE = 50;            // Base min lifespan in frames (tune for desired min trail length).
export const INITIAL_PARTICLE_FADE_FACTOR = 0.97;      // How fast trails fade (0.90=fast fade, 0.99=slow fade).

// Zoom Scaling Behavior (Reflects desired visual consistency)
export const PARTICLE_REFERENCE_ZOOM = 10;               // Zoom level where INITIAL values apply directly.
export const PARTICLE_COUNT_ZOOM_SCALE_FACTOR = 2;    // >1: Count increases significantly on zoom out, decreases on zoom in. (Set based on user pref).
export const PARTICLE_AGE_ZOOM_SCALE_FACTOR = 1;      // 1.0: Particle age (lifespan) remains constant regardless of zoom (keeps visual trail length consistent with screen speed).
export const PARTICLE_SPEED_ZOOM_SCALE_FACTOR = 1.5;    // >1: Geographic speed decreases on zoom in / increases on zoom out. 1.0 = constant geographic speed. 2.0 = constant screen speed. 1.5 = moderate scaling (slower screen speed when zoomed out). (Set based on user pref).

// Clamps and Limits (Tune MIN_COUNT)
export const PARTICLE_MIN_COUNT = 100;                 // Minimum particle count clamp (tune higher to prevent sparsity when zoomed in).
export const PARTICLE_MAX_COUNT = 2000;                // Maximum particle count clamp (adjust higher if needed with high INITIAL count).
export const PARTICLE_MIN_AGE_THRESHOLD = 10;           // Absolute minimum lifespan in frames after scaling (prevents zero age).

// Internal / UI Related
export const PARTICLE_SPEED_SLIDER_SCALE = 100000;      // Divisor for speed slider value to get actual speedFactor.

// --- Old/Unused Particle Constants (commented out for clarity) ---
// export const INITIAL_PARTICLE_TRAIL = 300; // Replaced by INITIAL_PARTICLE_MAX_AGE
// export const PARTICLE_MIN_AGE = 40;        // Now handled by INITIAL_PARTICLE_MIN_AGE
// export const PARTICLE_AGE_ZOOM_SCALE_FACTOR = 1; // Combined above
// export const PARTICLE_COUNT_ZOOM_SCALE_FACTOR = 100; // Combined above
// export const PARTICLE_SPEED_ZOOM_SCALE_FACTOR = 5000; // Combined above

// Other Constants
export const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const SECTOR_SIZE = 360 / 16;

// Airspace & NOTAM Configuration
export const GENERAL_AIRSPACE_URL = "https://api.theparaglider.com/v1/weather/airspace/general.txt";
export const NOTAMS_URL = "https://api.theparaglider.com/v1/weather/airspace/notams";
export const DEFAULT_AIRSPACE_ALTITUDE_FT = 6000;
export const AIRSPACE_ALTITUDE_UNIT = 'ft';
export const NOTAM_CONFLICT_CHECK_ALTITUDE_FT = 6000;
export const AIRSPACE_GENERAL_COLOR = '#800080';
export const AIRSPACE_DANGER_COLOR = '#FF0000';
export const AIRSPACE_PROHIBITED_COLOR = '#FF0000';
export const AIRSPACE_RESTRICTED_COLOR = '#FFA500';
export const AIRSPACE_OTHER_COLOR = '#808080';
export const NOTAM_DEFAULT_COLOR = '#808080';
export const NOTAM_DANGER_COLOR = '#FF0000';
export const NOTAM_RESTRICTED_COLOR = '#FF0000';
export const NOTAM_WARNING_COLOR = '#FFA500';
export const NOTAM_OTHER_COLOR = '#808080';
export const NOTAM_CIRCLE_FALLBACK_RADIUS_M = 5000;

// Weather Data Caching with IndexedDB
export const WEATHER_CACHE_ENABLED = true; // Set to false to disable caching
export const WEATHER_CACHE_DURATION_MINUTES = 240; // How long cache is valid
export const WEATHER_DB_NAME = 'weatherDB';       // Name for the IndexedDB database
export const WEATHER_STORE_NAME = 'weatherStore'; // Name for the object store within the DB
// Throttling for API Fetches
export const MAX_CONCURRENT_FETCHES = 15; // Limit concurrent weather fetches

// **** START: Moved from Tracker/config.js ****

// --- Tracker Playback & Map View Options ---
export const defaultPlaybackSpeed = 1; // Used in trackerApp.js state init
export const initialZoomOffset = 1.0; // Used in ui.js updateTrackerMap
export const mapFollowZoomLevel = null; // Used in ui.js panMapTo
export const mapPanDuration = 0.3; // Used in ui.js panMapTo
export const mapPanEaseLinearity = 0.5; // Used in ui.js panMapTo

// --- Tracker Calculation Thresholds ---
export const groundSpeedThresholdKmh = 5; // Used in flightStats.js
export const minCirclingDurationSec = 15; // Used in flightStats.js
export const minCirclingTurnDegrees = 180; // Used in flightStats.js

// --- Tracker Barogram & Styling ---
export const altitudeLineColor = 'rgb(200, 0, 0)'; // Used in ui.js initTrackerBarogram
export const trackColor = 'navy'; // Used in ui.js updateTrackerMap
export const trackWeight = 2.5; // Used in ui.js updateTrackerMap

// --- Tracker Glider Icon ---
export const rotationOffset = 0; // Used in ui.js updateTrackerGliderMarker
export const gliderIconUrl = 'Tracker/images/tracker-icon.png'; // Base URL, Ensure path is correct relative to index.html
export const gliderIconSize = [32, 32];
export const gliderIconAnchor = [gliderIconSize[0] / 2, gliderIconSize[1]]; // Auto-calculate anchor

// --- Unit Conversion Factors (Internal for formatter) ---
const _internal = {
    metersToFeet: 3.28084,
    kphToMph: 0.621371,
    kphToKts: 0.539957,
    kmToMi: 0.621371,
};

// --- Formatting Function (Exported) ---
export function getFormattedValue(value, type, targetUnit) {
    if (value === null || value === undefined || isNaN(value)) return "N/A";

    let num = Number(value); // Ensure it's a number
    let unitLabel = targetUnit;

    try {
        switch (type) {
            case 'distance': // Base value is meters
                unitLabel = targetUnit;
                num = num / 1000; // Convert meters to km first
                if (targetUnit === 'mi') {
                    num *= _internal.kmToMi;
                } else { // Default to km if not 'mi'
                    unitLabel = 'km';
                }
                return `${num.toFixed(2)} ${unitLabel}`;

            case 'altitude': // Base value is meters
                 unitLabel = targetUnit;
                 if (targetUnit === 'ft') {
                    num *= _internal.metersToFeet;
                 } else {
                    unitLabel = 'm';
                 }
                 return `${num.toFixed(0)} ${unitLabel}`;

            case 'speed': // Base value is kph
                unitLabel = targetUnit;
                if (targetUnit === 'mph') {
                    num *= _internal.kphToMph;
                } else if (targetUnit === 'kts') {
                    num *= _internal.kphToKts;
                } else {
                    unitLabel = 'km/h';
                }
                return `${num.toFixed(1)} ${unitLabel}`;

            case 'vario': // Base value is m/s
                 unitLabel = 'm/s';
                 return `${num.toFixed(1)} ${unitLabel}`;

            default:
                // Ensure it's a number before calling toFixed
                return typeof num === 'number' ? num.toFixed(1) : String(value);
        }
    } catch (e) {
        console.error("Error formatting value:", value, type, targetUnit, e);
        return "Error";
    }
};

// **** END: Moved from Tracker/config.js ****


// --- END OF FILE config.js ---