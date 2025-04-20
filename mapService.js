// --- START OF FILE mapService.js ---
import {
    // Map Defaults
    DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, GEOLOCATION_ZOOM, SHOW_KK7_LAYERS_DEFAULT,
    // RASP (used for corners)
    HARDCODED_RASP_CORNERS_DATA,
    // Particles - Base Values
    INITIAL_PARTICLE_COUNT,
    INITIAL_PARTICLE_SPEED_FACTOR_VALUE,
    PARTICLE_SPEED_SLIDER_SCALE,
    INITIAL_PARTICLE_COLOR,
    INITIAL_PARTICLE_SIZE,
    INITIAL_PARTICLE_MAX_AGE,
    INITIAL_PARTICLE_MIN_AGE,
    INITIAL_PARTICLE_FADE_FACTOR,
    // Particles - Scaling & Limits
    PARTICLE_REFERENCE_ZOOM,
    PARTICLE_COUNT_ZOOM_SCALE_FACTOR,
    PARTICLE_AGE_ZOOM_SCALE_FACTOR,
    PARTICLE_SPEED_ZOOM_SCALE_FACTOR,
    PARTICLE_MIN_COUNT,
    PARTICLE_MAX_COUNT,
    PARTICLE_MIN_AGE_THRESHOLD,
    // Particles - Weighting
    PARTICLE_SPEED_WEIGHT_FROM_DATA,
    // Base Map Options & Default Selection
    BASE_MAP_OPTIONS,
    DEFAULT_BASE_MAP_KEY,

    // Marker Visibility Imports
    DEFAULT_MARKER_VISIBILITY_OPEN_SUITABLE,
    DEFAULT_MARKER_VISIBILITY_OPEN_UNSUITABLE,
    DEFAULT_MARKER_VISIBILITY_OPEN_UNKNOWN,
    DEFAULT_MARKER_VISIBILITY_CLOSED

} from './config.js'; // Ensure config.js is imported using './'

// Assume Leaflet (L) is available globally via <script> tag
// Assume L.maplibreGL is loaded via script if using MapTiler Vector

export let map = null;
export let particleWindLayer = null;
// Layer groups for site markers
export const layers = {
    openSuitable: L.layerGroup(),
    openUnsuitable: L.layerGroup(),
    openUnknown: L.layerGroup(),
    closed: L.layerGroup()
};
export let baseMaps = {}; // Initialize as empty
export let kk7Layers = {};
export let HARDCODED_RASP_CORNERS_LATLNG = null; // RASP corners need to be LatLng objects
export let webcamLayer = null; // Export webcamLayer

// API Keys and URLs
// const STADIA_API_KEY = "391ac7f5-de36-47f4-82d2-de3f29724dab"; // Stadia unused
const MAPTILER_API_KEY = "acMkeN5HOfi7bPcy7v6j"; // Replace if needed
const MAPTILER_STYLE_URL = "https://api.maptiler.com/maps/0195fc94-0220-79cf-982a-60065ab87b68/style.json"; // Replace if needed

// Attribution function (defined but not used directly in init, keep if needed elsewhere)
function getStamenStadiaAttribution() {
    const stadiaLink = '<a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a>';
    const stamenLink = '<a href="https://stamen.com/" target="_blank">Stamen Design</a>';
    const openStreetMapLink = '<a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> & <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a> contrib.';
    return `© ${stadiaLink}, © ${stamenLink}, © ${openStreetMapLink}`;
}

/**
 * Initializes the Leaflet map, layers, and custom panes.
 * @param {HTMLElement} mapDiv - The HTML div element to initialize the map in.
 * @returns {object|null} An object containing map, layers, etc., or null on failure.
 */
export function initializeMap(mapDiv) {
    if (!mapDiv) {
        console.error("Map Service Error: Map container div not provided.");
        return null;
    }
    if (mapDiv._leaflet_id) {
         console.warn("Map appears to be already initialized on this div.");
         return null; // Or return existing map instance if appropriate
    }

    // --- API Key Checks ---
    if (BASE_MAP_OPTIONS.MAPTILER_VECTOR) {
        if (!MAPTILER_API_KEY || MAPTILER_API_KEY === "YOUR_MAPTILER_API_KEY") console.warn("MapTiler API Key missing/placeholder, but MapTiler layer is enabled.");
        if (!MAPTILER_STYLE_URL || MAPTILER_STYLE_URL === "YOUR_MAPTILER_STYLE_URL") console.warn("MapTiler Style URL missing/placeholder, but MapTiler layer is enabled.");
    }

    // --- Mapping from Config Keys to Display Names ---
    const baseMapConfigToName = {
        MAPTILER_VECTOR: "Terrain Vector (MapTiler)",
        OSM_STREET: "Street Map (OSM)",
        OPENTOPO_RASTER: "Topo Raster (OpenTopo)",
        CARTO_GREY: "Topo Grey (Carto)",
        ESRI_SATELLITE: "Satellite (Esri)"
    };

    // --- Base Layers (Conditional Instantiation and Population) ---
    baseMaps = {}; // Ensure it's reset

    if (BASE_MAP_OPTIONS.MAPTILER_VECTOR && L.maplibreGL) {
        try {
            baseMaps[baseMapConfigToName.MAPTILER_VECTOR] = L.maplibreGL({ style: `${MAPTILER_STYLE_URL}?key=${MAPTILER_API_KEY}` })
                .on('load', () => console.log("MapTiler vector layer style loaded."))
                .on('error', (e) => console.error("MapTiler vector layer error:", e));
            console.log("Base Map Enabled: MapTiler Vector");
        } catch (e) { console.error("Failed to initialize MapTiler vector layer:", e); }
    } else if(BASE_MAP_OPTIONS.MAPTILER_VECTOR) {
         console.warn("MapTiler Vector layer enabled in config, but L.maplibreGL plugin not found. Skipping.");
    }

    if (BASE_MAP_OPTIONS.OSM_STREET) { baseMaps[baseMapConfigToName.OSM_STREET] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors' }); console.log("Base Map Enabled: OSM Street"); }
    if (BASE_MAP_OPTIONS.OPENTOPO_RASTER) { baseMaps[baseMapConfigToName.OPENTOPO_RASTER] = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: 'Map data: © OSM contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)' }); console.log("Base Map Enabled: OpenTopo Raster"); }
    if (BASE_MAP_OPTIONS.CARTO_GREY) { baseMaps[baseMapConfigToName.CARTO_GREY] = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { attribution: '© OSM contributors & © CARTO', subdomains: 'abcd', maxZoom: 20 }); console.log("Base Map Enabled: Carto Grey"); }
    if (BASE_MAP_OPTIONS.ESRI_SATELLITE) { baseMaps[baseMapConfigToName.ESRI_SATELLITE] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri' }); console.log("Base Map Enabled: Esri Satellite"); }


    // --- Determine the Default Base Layer ---
    let defaultBaseLayer = null;
    const availableBaseMapNames = Object.keys(baseMaps);
    if (availableBaseMapNames.length === 0) {
        console.error("CONFIGURATION ERROR: No base map layers available.");
        throw new Error("Configuration Error: No base map layers available.");
    }
    const desiredDefaultName = baseMapConfigToName[DEFAULT_BASE_MAP_KEY];
    if (desiredDefaultName && baseMaps[desiredDefaultName]) {
        defaultBaseLayer = baseMaps[desiredDefaultName];
        console.log(`Default base layer set to configured value: ${desiredDefaultName}`);
    } else {
        const fallbackLayerName = availableBaseMapNames[0];
        defaultBaseLayer = baseMaps[fallbackLayerName];
        console.warn(`Configured default base map key '${DEFAULT_BASE_MAP_KEY}' invalid or layer failed. Falling back to: ${fallbackLayerName}`);
    }

    // --- KK7 Overlay Layers ---
    kk7Layers = {};
    const kk7HostnameParam = '?src=' + window.location.hostname;
    const kk7Attribution = 'thermal.kk7.ch <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC-BY-NC-SA</a>';
    kk7Layers["KK7 Skyways"] = L.tileLayer('https://thermal.kk7.ch/tiles/skyways_all_all/{z}/{x}/{y}.png' + kk7HostnameParam, { attribution: kk7Attribution, maxNativeZoom: 13, tms: true, opacity: 0.6 });
    kk7Layers["KK7 Thermals (Jul/Midday)"] = L.tileLayer('https://thermal.kk7.ch/tiles/thermals_jul_07/{z}/{x}/{y}.png' + kk7HostnameParam, { attribution: kk7Attribution, maxNativeZoom: 12, tms: true, opacity: 0.7 });


    // --- Site Layer Groups ---
    Object.values(layers).forEach(lg => lg.clearLayers());

    // --- Create Webcam Layer Group ---
    webcamLayer = L.layerGroup(); // Use the exported variable
    console.log("[Map Service] Created webcamLayer L.LayerGroup instance.");


    // --- Build Initial Layers Array (Conditional based on Config) ---
    let initialMapLayers = [ defaultBaseLayer ];
    console.log("MapService: Determining initial marker layers based on config...");
    if (DEFAULT_MARKER_VISIBILITY_OPEN_SUITABLE) { initialMapLayers.push(layers.openSuitable); console.log(" - Adding 'Open Suitable' markers by default."); } else { console.log(" - Hiding 'Open Suitable' markers by default."); }
    if (DEFAULT_MARKER_VISIBILITY_OPEN_UNSUITABLE) { initialMapLayers.push(layers.openUnsuitable); console.log(" - Adding 'Open Unsuitable' markers by default."); } else { console.log(" - Hiding 'Open Unsuitable' markers by default."); }
    if (DEFAULT_MARKER_VISIBILITY_OPEN_UNKNOWN) { initialMapLayers.push(layers.openUnknown); console.log(" - Adding 'Open Unknown' markers by default."); } else { console.log(" - Hiding 'Open Unknown' markers by default."); }
    if (DEFAULT_MARKER_VISIBILITY_CLOSED) { initialMapLayers.push(layers.closed); console.log(" - Adding 'Closed' markers by default."); } else { console.log(" - Hiding 'Closed' markers by default."); }

    // --- Conditionally add KK7 layers ---
    if (SHOW_KK7_LAYERS_DEFAULT) {
        console.log("MapService: Adding KK7 layers initially based on config.");
        if (kk7Layers["KK7 Skyways"]) initialMapLayers.push(kk7Layers["KK7 Skyways"]);
        if (kk7Layers["KK7 Thermals (Jul/Midday)"]) initialMapLayers.push(kk7Layers["KK7 Thermals (Jul/Midday)"]);
    } else {
        console.log("MapService: KK7 layers are configured to be OFF by default.");
    }

    // --- Initialize map ---
    map = L.map(mapDiv, {
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        layers: initialMapLayers, // Use the conditionally built array
        zoomControl: false,       // Zoom control added manually in main.js
        attributionControl: false // Attribution handled by layers or manual control
    });
    console.log("Leaflet map object initialized.");

    // --- Create Custom Panes ---
    // Helper function for creating panes
    const createPane = (name, zIndex, pointerEvents = 'auto') => {
        map.createPane(name);
        const pane = map.getPane(name);
        if (pane) {
            pane.style.zIndex = zIndex;
            pane.style.pointerEvents = pointerEvents;
            console.log(`Custom '${name}' created with z-index ${zIndex}.`);
        } else {
            console.error(`Failed to create '${name}'.`);
        }
    };

    createPane('windIndicatorPane', 651, 'none');     // Wind indicator (above markers)
    createPane('onMapCompassPane', 640, 'none');       // *** On-Map Compass Pane ***
    createPane('webcamOverlayIconPane', 620, 'none'); // Webcam overlay icons
    createPane('obstaclePane', 500, 'auto');           // Obstacles (clickable)


    // --- Geolocation ---
    console.log("Attempting geolocation setup...");
    if (navigator.geolocation) {
        console.log("Browser supports geolocation.");
        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (map) { map.flyTo([position.coords.latitude, position.coords.longitude], GEOLOCATION_ZOOM); }
                else { console.warn("Geolocation success, but map object not ready for flyTo.") }
            },
            (error) => console.warn(`GEOLOCATION ERROR (${error.code}): ${error.message}`),
            { timeout: 15000, maximumAge: 60000, enableHighAccuracy: false }
        );
        console.log("navigator.geolocation.getCurrentPosition call made.");
    } else { console.warn("Geolocation IS NOT SUPPORTED by this browser."); }


    // --- Convert RASP corners ---
    try {
        if (Array.isArray(HARDCODED_RASP_CORNERS_DATA) && HARDCODED_RASP_CORNERS_DATA.length > 0 && HARDCODED_RASP_CORNERS_DATA.every(c => Array.isArray(c) && c.length === 2)) {
           HARDCODED_RASP_CORNERS_LATLNG = HARDCODED_RASP_CORNERS_DATA.map(c => L.latLng(c[0], c[1]));
           console.log("RASP corner LatLng objects created.");
        } else {
           console.warn("HARDCODED_RASP_CORNERS_DATA is invalid or empty. RASP overlay might not work correctly.");
           HARDCODED_RASP_CORNERS_LATLNG = null;
        }
    } catch (e) {
        console.error("Failed to create RASP LatLng corners.", e);
        HARDCODED_RASP_CORNERS_LATLNG = null;
    }


    // --- Initialize Particle Layer ---
    try {
        if (L.canvasLayer && L.canvasLayer.particles) {
             const initialSpeedFactor = INITIAL_PARTICLE_SPEED_FACTOR_VALUE / PARTICLE_SPEED_SLIDER_SCALE;
             particleWindLayer = L.canvasLayer.particles({
                 particleCount: INITIAL_PARTICLE_COUNT,
                 speedFactor: initialSpeedFactor,
                 particleBaseColor: INITIAL_PARTICLE_COLOR,
                 particleLineWidth: INITIAL_PARTICLE_SIZE,
                 particleMaxAge: INITIAL_PARTICLE_MAX_AGE,
                 minParticleAge: INITIAL_PARTICLE_MIN_AGE,
                 fadeFactor: INITIAL_PARTICLE_FADE_FACTOR,
                 referenceZoom: PARTICLE_REFERENCE_ZOOM,
                 countZoomScaleFactor: PARTICLE_COUNT_ZOOM_SCALE_FACTOR,
                 ageZoomScaleFactor: PARTICLE_AGE_ZOOM_SCALE_FACTOR,
                 speedZoomScaleFactor: PARTICLE_SPEED_ZOOM_SCALE_FACTOR,
                 minCount: PARTICLE_MIN_COUNT,
                 maxCount: PARTICLE_MAX_COUNT,
                 minAgeThreshold: PARTICLE_MIN_AGE_THRESHOLD,
                 speedWeightFromData: PARTICLE_SPEED_WEIGHT_FROM_DATA,
                 // --- Hardcoded Physics/Rendering ---
                 idwPower: 2, maxInterpolationDist: 3.0,
                 particleLineOpacity: 0.85, velocitySmoothing: 0.95
             });
             console.log("Particle layer object created.");
         } else {
            console.error("L.canvasLayer.particles factory function not found! Particle layer cannot be initialized.");
            particleWindLayer = null;
         }
    } catch (particleError) {
        console.error("Error during particle layer initialization:", particleError);
        particleWindLayer = null;
    }
    console.log('Particle Layer instance after initialization attempt:', particleWindLayer);


    console.log("Map service initialization function finished.");
    // --- Return all necessary components ---
    return {
        map,
        layers, // Site marker layer groups
        particleWindLayer,
        baseMaps,
        kk7Layers,
        raspCornersLatLng: HARDCODED_RASP_CORNERS_LATLNG,
        webcamLayer // Webcam layer group instance
    };
}
// --- END OF FILE mapService.js ---