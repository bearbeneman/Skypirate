// --- START OF FILE obstacleService.js ---

// Assume L and osmtogeojson are loaded globally via <script> tags

// --- Configuration ---
const OVERPASS_URLS = [ // Use multiple endpoints
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter'
];
let currentOverpassUrlIndex = 0;

const MIN_ZOOM_FOR_QUERY = 11;    // Don't query if zoomed out further
const QUERY_DEBOUNCE_TIME = 500; // Wait ms after map stops moving

// --- NEW: Marker Scaling Configuration ---
const MARKER_SCALING_REFERENCE_ZOOM = 14;
const MARKER_SCALING_FACTOR = 0.25;
const MARKER_SCALING_MIN_RADIUS = 2;
const MARKER_SCALING_MAX_RADIUS = 6;

// --- Module State ---
let mapInstance = null;
let obstacleLayer = null;         // The L.geoJSON layer
let legendControl = null;         // The L.Control for the legend
let obstacleIndicatorElement = null; // <<< ADDED: Reference to the new screen indicator
let zoomMessageElement = null;    // Reference to an element to show zoom message (optional)
let debounceTimer = null;
let currentAbortController = null;
let isLayerCurrentlyEnabled = false; // Track if layer is supposed to be visible
let isLegendAdded = false;         // State variable for legend
let lastQueriedBounds = null;      // To avoid redundant queries for same area

// --- Debounce Function ---
// (debounce function remains the same)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- NEW: Marker Radius Scaling Function ---
// (calculateScaledRadius function remains the same)
function calculateScaledRadius(baseRadius, currentZoom) {
    const zoomDiff = currentZoom - MARKER_SCALING_REFERENCE_ZOOM;
    let scaledRadius = baseRadius + (zoomDiff * MARKER_SCALING_FACTOR);
    scaledRadius = Math.max(MARKER_SCALING_MIN_RADIUS, scaledRadius);
    scaledRadius = Math.min(MARKER_SCALING_MAX_RADIUS, scaledRadius);
    return Math.round(scaledRadius);
}


// --- Layer Styling and Popups (Adapted) ---
// (obstacleStyle, pointToLayer, onEachFeature functions remain the same)
function obstacleStyle(feature) {
    const props = feature.properties;
    let style = { color: "grey", weight: 1, opacity: 0.6 }; // Default

    if (feature.geometry.type.includes('LineString')) {
        if (props?.power === 'line') {
            style = { color: 'red', weight: 3, opacity: 0.8 };
        } else if (props?.power === 'minor_line') {
            style = { color: 'orange', weight: 1.5, opacity: 0.7 };
        } else if (props?.aerialway) {
            style = { color: 'blue', weight: 2, opacity: 0.7, dashArray: '5, 10' };
        }
    }
    style.pane = 'obstaclePane'; // Apply pane
    return style;
}

function pointToLayer(feature, latlng) {
    const props = feature.properties;
    let baseRadius = 5; // Default base radius
    let fillColor = "grey";

    if (props?.power === 'tower' || props?.man_made === 'mast' || (props?.power === 'generator' && props?.generator_source === 'wind')) {
        fillColor = "red"; baseRadius = 6;
    } else if (props?.power === 'pole') {
        fillColor = "orange"; baseRadius = 3;
    } else if (props?.man_made === 'tower' || props?.man_made === 'crane' || props?.man_made === 'chimney' || props?.man_made === 'storage_tank' || props?.man_made === 'water_tower') {
         fillColor = "darkgrey"; baseRadius = 5;
    }

    const initialRadius = calculateScaledRadius(baseRadius, mapInstance.getZoom());

    let markerOptions = {
        radius: initialRadius,
        fillColor: fillColor,
        color: "#000",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
        pane: 'obstaclePane',
        baseRadius: baseRadius // Store base radius
    };

    return L.circleMarker(latlng, markerOptions);
}

function onEachFeature(feature, layer) {
    const props = feature.properties;
    let popupContent = '<div style="max-height: 150px; overflow-y: auto;"><b>Obstacle Details</b><ul>';
    let relevantProps = 0;
    const tagsToShow = ['power', 'man_made', 'aerialway', 'height', 'ele', 'name', 'tower:type', 'generator:source', 'description'];

    tagsToShow.forEach(key => {
        if (props && props.hasOwnProperty(key) && props[key] != null && String(props[key]).trim() !== '') {
            const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            popupContent += `<li><strong>${displayKey}:</strong> ${props[key]}</li>`;
            relevantProps++;
        }
    });

    let osmId = feature.id;
    let osmLinkAdded = false;
    if (osmId && typeof osmId === 'string' && (osmId.startsWith('node/') || osmId.startsWith('way/') || osmId.startsWith('relation/'))) {
        const osmUrl = `https://www.openstreetmap.org/${osmId}`;
        popupContent += `<li><a href="${osmUrl}" target="_blank" rel="noopener noreferrer">View on OSM</a></li>`;
        relevantProps++;
        osmLinkAdded = true;
    } else if (!osmLinkAdded && (feature._osmNodeId || feature._osmWayId || feature._osmRelationId)) { // Fallback
        let type = feature._osmNodeId ? 'node' : (feature._osmWayId ? 'way' : 'relation');
        let id = feature._osmNodeId || feature._osmWayId || feature._osmRelationId;
         const osmUrl = `https://www.openstreetmap.org/${type}/${id}`;
         popupContent += `<li><a href="${osmUrl}" target="_blank" rel="noopener noreferrer">View on OSM</a></li>`;
         relevantProps++;
    }

    if (relevantProps === 0) { popupContent += '<li>No specific details found in tags.</li>'; }
    popupContent += '</ul></div>';
    layer.bindPopup(popupContent);
}


// --- Legend Control Definition ---
const ObstacleLegend = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function (map) {
        const div = L.DomUtil.create('div', 'info legend obstacle-legend');
        // --- REMOVED loading status div ---
        div.innerHTML = `
            <strong>Obstacles Legend</strong><br>
            <div class="legend-item"><span style="background-color: red; height: 3px; display: inline-block; width: 20px; vertical-align: middle; margin-right: 5px;"></span> Power Line (Major)</div>
            <div class="legend-item"><span style="background-color: orange; height: 2px; display: inline-block; width: 20px; vertical-align: middle; margin-right: 5px;"></span> Power Line (Minor)</div>
            <div class="legend-item"><span style="background-color: blue; height: 2px; border-top: 2px dashed blue; display: inline-block; width: 20px; vertical-align: middle; margin-right: 5px;"></span> Aerialway</div>
            <div class="legend-item"><i style="color:red; font-size: 1.2em; vertical-align: middle; margin-right: 5px;">●</i> Tower/Mast/Turbine</div>
            <div class="legend-item"><i style="color:orange; font-size: 0.9em; vertical-align: middle; margin-right: 5px;">●</i> Pole</div>
            <div class="legend-item"><i style="color:grey; font-size: 1.1em; vertical-align: middle; margin-right: 5px;">●</i> Crane/Other Tower</div>
            <div class="zoom-message" style="color: #555; font-style: italic; margin-top: 5px; display: none;">Zoom in to load obstacles.</div>
            <div class="legend-disclaimer" style="margin-top: 8px; font-weight: bold; color: #800; border-top: 1px solid #ccc; padding-top: 5px;">DISCLAIMER: OSM data. Planning assistance ONLY. Verify data. Safety is your responsibility.</div>
        `;
        zoomMessageElement = div.querySelector('.zoom-message');
        // --- REMOVED loadingStatusElement assignment ---
        return div;
    },
    onRemove: function(map) {
        zoomMessageElement = null;
        // --- REMOVED loadingStatusElement clearing ---
    }
});

// --- Overpass Query Function ---
// (getOverpassQuery function remains the same)
function getOverpassQuery(bounds) {
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    return `
        [out:json][timeout:60];
        (
          way["power"~"^(line|minor_line)$"](${bbox});
          way["aerialway"~"^(cable_car|gondola|chair_lift|drag_lift|zip_line)$"](${bbox});
          node["power"~"^(tower|pole)$"](${bbox});
          node["man_made"~"^(mast|tower|crane|chimney|storage_tank|water_tower)$"](${bbox});
          node["power"="generator"]["generator:source"="wind"](${bbox});
        );
        out body; >; out skel qt;
    `;
}

// --- REMOVED showObstacleLoading/hideObstacleLoading for legend ---

// --- <<< NEW Functions for Screen Indicator >>> ---
function showObstacleIndicator() {
    if (obstacleIndicatorElement) {
        obstacleIndicatorElement.style.display = 'block';
    } else {
        console.warn("[Obstacle Service] Obstacle loading indicator element not found.");
    }
}

function hideObstacleIndicator() {
    if (obstacleIndicatorElement) {
        obstacleIndicatorElement.style.display = 'none';
    }
}
// --- <<< END NEW Functions >>> ---

// --- Show/Hide Zoom Message in Legend ---
// (updateZoomMessageVisibility function remains the same)
function updateZoomMessageVisibility() {
     if (!mapInstance || !zoomMessageElement) return;
     if (isLegendAdded) {
        const show = mapInstance.getZoom() < MIN_ZOOM_FOR_QUERY;
        zoomMessageElement.style.display = show ? 'block' : 'none';
     } else {
         zoomMessageElement.style.display = 'none';
     }
}

// --- Update Marker Radii Function ---
// (updateMarkerRadii function remains the same)
function updateMarkerRadii() {
    if (!mapInstance || !obstacleLayer || !isLayerCurrentlyEnabled) {
        return;
    }
    const currentZoom = mapInstance.getZoom();
    obstacleLayer.eachLayer(layer => {
        if (layer instanceof L.CircleMarker && layer.options && typeof layer.options.baseRadius === 'number') {
            const baseRadius = layer.options.baseRadius;
            const newRadius = calculateScaledRadius(baseRadius, currentZoom);
            if (layer.getRadius() !== newRadius) {
                layer.setRadius(newRadius);
            }
        }
    });
}


// --- Data Loading Function ---
async function loadObstacles() {
    if (!mapInstance || !isLayerCurrentlyEnabled) {
        hideObstacleIndicator(); // <<< USE NEW screen indicator hide
        updateZoomMessageVisibility();
        return;
    }

    const currentZoom = mapInstance.getZoom();
    updateZoomMessageVisibility();

    if (currentZoom < MIN_ZOOM_FOR_QUERY) {
        console.log(`[Obstacle Service] Zoom level ${currentZoom} < ${MIN_ZOOM_FOR_QUERY}. Clearing layer.`);
        if (obstacleLayer) obstacleLayer.clearLayers();
        lastQueriedBounds = null;
        hideObstacleIndicator(); // <<< USE NEW screen indicator hide
        if (currentAbortController) { currentAbortController.abort(); console.log("[Obstacle Service] Aborted pending request due to zoom out."); }
        return;
    }

    const bounds = mapInstance.getBounds();

    if (lastQueriedBounds && lastQueriedBounds.equals(bounds, 0.001)) {
        updateMarkerRadii();
        hideObstacleIndicator(); // <<< USE NEW screen indicator hide
        return;
    }

    if (currentAbortController) {
        currentAbortController.abort();
        console.log("[Obstacle Service] Aborted previous request.");
    }
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    const query = getOverpassQuery(bounds);
    const urlToUse = OVERPASS_URLS[currentOverpassUrlIndex];
    currentOverpassUrlIndex = (currentOverpassUrlIndex + 1) % OVERPASS_URLS.length;

    showObstacleIndicator(); // <<< USE NEW screen indicator show
    console.log(`[Obstacle Service] Fetching data for bounds: ${bounds.toBBoxString()} from ${urlToUse}`);

    try {
        const response = await fetch(urlToUse, { method: 'POST', body: 'data=' + encodeURIComponent(query), signal });
        if (signal.aborted) throw new Error('Fetch aborted');
        if (!response.ok) {
             // Don't show specific error on screen indicator, just hide it
             throw new Error(`HTTP error! status: ${response.status}`);
        }

        const osmData = await response.json();
        if (signal.aborted) throw new Error('Fetch aborted');

        const geojsonData = osmtogeojson(osmData);

        if (obstacleLayer) {
            obstacleLayer.clearLayers();
            obstacleLayer.addData(geojsonData);
            console.log(`[Obstacle Service] Obstacles updated (${geojsonData.features.length} features).`);
            lastQueriedBounds = bounds;
        }
        hideObstacleIndicator(); // <<< USE NEW screen indicator hide (on success)

    } catch (error) {
         if (error.name === 'AbortError') {
             console.log('[Obstacle Service] Fetch aborted.');
        } else {
             console.error('[Obstacle Service] Error fetching or processing Overpass data:', error);
             // Optionally show an error message *elsewhere* if needed
         }
         hideObstacleIndicator(); // <<< USE NEW screen indicator hide (on error/abort)
    } finally {
        if (currentAbortController && currentAbortController.signal === signal) {
            currentAbortController = null;
        }
        // Safety hide, though try/catch should handle it
        hideObstacleIndicator(); // <<< USE NEW screen indicator hide
    }
}

// Debounced version of the loader
const debouncedLoadObstacles = debounce(loadObstacles, QUERY_DEBOUNCE_TIME);

// --- Public Functions ---

/**
 * Initializes the Obstacle Service.
 * @param {L.Map} map - The Leaflet map instance.
 */
export function initialize(map) { // <<< REMOVED loadingEl parameter
    if (!map) {
        console.error("[Obstacle Service] Map instance is required for initialization.");
        return;
    }
    mapInstance = map;

    // <<< ADDED: Get reference to the new screen indicator >>>
    obstacleIndicatorElement = document.getElementById('obstacle-loading-indicator');
    if (!obstacleIndicatorElement) {
         console.warn("[Obstacle Service] Obstacle loading indicator element (#obstacle-loading-indicator) not found in DOM.");
    }
    // <<< ----------------------------------------------- >>>

    if (!obstacleLayer) {
        obstacleLayer = L.geoJSON(null, {
            style: obstacleStyle,
            pointToLayer: pointToLayer,
            onEachFeature: onEachFeature
        });
        console.log("[Obstacle Service] L.geoJSON layer created.");
    }

    if (!legendControl && mapInstance) {
        legendControl = new ObstacleLegend();
        console.log("[Obstacle Service] Legend control created.");
        isLegendAdded = false;
    }

    mapInstance.off('moveend zoomend', debouncedLoadObstacles);
    mapInstance.off('zoomend', updateZoomMessageVisibility);
    mapInstance.off('zoomend', updateMarkerRadii);

    mapInstance.on('moveend zoomend', debouncedLoadObstacles);
    mapInstance.on('zoomend', updateZoomMessageVisibility);
    mapInstance.on('zoomend', updateMarkerRadii);

    updateZoomMessageVisibility();

    console.log("[Obstacle Service] Initialized.");
}

/**
 * Enables the obstacle layer visibility and triggers data loading.
 */
export function enableLayer() {
    // ... (logic remains the same) ...
    if (!mapInstance || !obstacleLayer) {
        console.warn("[Obstacle Service] Cannot enable layer: Map or layer not initialized.");
        return;
    }
    isLayerCurrentlyEnabled = true;

    if (!mapInstance.hasLayer(obstacleLayer)) {
        mapInstance.addLayer(obstacleLayer);
        console.log("[Obstacle Service] Obstacle layer ADDED to map.");
    }

    if (legendControl && !isLegendAdded) {
        mapInstance.addControl(legendControl);
        isLegendAdded = true;
        console.log("[Obstacle Service] Legend control ADDED to map.");
        updateZoomMessageVisibility();
    }

    console.log("[Obstacle Service] Layer enabled, triggering obstacle load check and initial radius update.");
    debouncedLoadObstacles();
    updateMarkerRadii();
}

/**
 * Disables the obstacle layer visibility and clears data.
 */
export function disableLayer() {
    // ... (logic remains the same, but using new hide function) ...
    if (!mapInstance || !obstacleLayer) {
        console.warn("[Obstacle Service] Cannot disable layer: Map or layer not initialized.");
        return;
    }
    isLayerCurrentlyEnabled = false;

    if (mapInstance.hasLayer(obstacleLayer)) {
        mapInstance.removeLayer(obstacleLayer);
        console.log("[Obstacle Service] Obstacle layer REMOVED from map.");
    }

    if (legendControl && isLegendAdded) {
        mapInstance.removeControl(legendControl);
        isLegendAdded = false;
        console.log("[Obstacle Service] Legend control REMOVED from map.");
    }

    if (currentAbortController) {
        currentAbortController.abort();
        console.log("[Obstacle Service] Aborted request due to layer disable.");
    }

    obstacleLayer.clearLayers();
    lastQueriedBounds = null;
    hideObstacleIndicator(); // <<< USE NEW screen indicator hide
    console.log("[Obstacle Service] Layer disabled, data cleared.");
}

/**
 * Returns the Leaflet Layer instance for use in layer controls.
 * @returns {L.Layer | null}
 */
export function getLayer() {
    return obstacleLayer;
}

// --- END OF FILE obstacleService.js ---