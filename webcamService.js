// --- START OF FILE webcamService.js ---

/**
 * Service for loading and querying webcam data, and populating a map layer.
 */

// Ensure Leaflet (L) and L.AwesomeMarkers are available globally
// If not, you'd need to import them

let webcamData = [];
let isWebcamDataLoaded = false;
let isLoading = false;
let webcamLayerGroup = null; // Reference to the Leaflet LayerGroup

/**
 * Calculates the Haversine distance between two points on the Earth.
 * @param {object} coords1 - {lat, lon} of the first point.
 * @param {object} coords2 - {lat, lon} of the second point.
 * @returns {number} Distance in kilometers.
 */
function haversineDistance(coords1, coords2) {
    function toRad(x) {
        return x * Math.PI / 180;
    }
    const lat1 = coords1.lat;
    const lon1 = coords1.lon;
    const lat2 = coords2.lat;
    const lon2 = coords2.lon;
    if (typeof lat1 !== 'number' || typeof lon1 !== 'number' || typeof lat2 !== 'number' || typeof lon2 !== 'number') {
        console.warn("haversineDistance: Invalid coordinates provided", coords1, coords2);
        return Infinity;
    }
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Initializes the service with the Leaflet LayerGroup for webcams.
 * Called by main.js after the map service initializes.
 * @param {L.LayerGroup} layerGroup - The layer group instance created in mapService.
 */
export function initializeWebcamLayer(layerGroup) {
    if (layerGroup && typeof layerGroup.addLayer === 'function' && typeof layerGroup.clearLayers === 'function') {
        webcamLayerGroup = layerGroup;
        console.log("[Webcam Service] Webcam Layer Group initialized.");
    } else {
        console.error("[Webcam Service] Invalid layer group provided for initialization.", layerGroup);
    }
}

/**
 * Loads webcam data from the specified JSON file path.
 * Calls populateWebcamLayer upon success.
 * @param {string} jsonFilePath - Path to the webcams JSON file (e.g., 'data/webcams.json').
 * @returns {Promise<void>} A promise that resolves when loading is complete or fails.
 */
export async function loadWebcams(jsonFilePath = 'data/webcams.json') {
    console.log(`[Webcam Service] loadWebcams called. isLoaded=${isWebcamDataLoaded}, isLoading=${isLoading}, path=${jsonFilePath}`);
    if (isWebcamDataLoaded || isLoading) { return; }
    isLoading = true;
    console.log(`[Webcam Service] Starting fetch for ${jsonFilePath}...`);
    try {
        const response = await fetch(jsonFilePath);
        console.log(`[Webcam Service] Fetch response status for ${jsonFilePath}: ${response.status}`);
        if (!response.ok) { throw new Error(`HTTP error! status: ${response.status} for ${jsonFilePath}`); }
        const data = await response.json();
        console.log(`[Webcam Service] Successfully fetched and parsed JSON from ${jsonFilePath}.`);
        if (Array.isArray(data)) {
            webcamData = data.filter(cam => {
                const isValid = cam && cam.location && typeof cam.location.lat === 'number' && typeof cam.location.lon === 'number' && cam.pageUrl && cam.title;
                if (!isValid) { console.warn("[Webcam Service] Invalid webcam entry skipped during load:", cam); }
                return isValid;
            });
            isWebcamDataLoaded = true;
            console.log(`[Webcam Service] Data processed. Loaded ${webcamData.length} valid webcam entries.`);
            populateWebcamLayer(); // Populate AFTER data is ready
        } else { throw new Error("Loaded webcam data is not an array."); }
    } catch (error) {
        console.error("[Webcam Service] Failed to load or process webcam data:", error);
        webcamData = [];
        isWebcamDataLoaded = false;
    } finally {
        isLoading = false;
        console.log(`[Webcam Service] Loading process finished. isLoaded is now: ${isWebcamDataLoaded}`);
    }
}

/**
 * Creates webcam markers (main + overlay) and adds them to the webcamLayerGroup.
 */
function populateWebcamLayer() {
    if (!webcamLayerGroup) {
        console.warn("[Webcam Service] Webcam layer group not initialized yet. Cannot populate markers.");
        return;
    }
    if (!isWebcamDataLoaded || webcamData.length === 0) {
        console.warn("[Webcam Service] Webcam data not loaded or empty. Cannot populate markers.");
        return;
    }

    console.log(`[Webcam Service] Populating webcam layer group with ${webcamData.length} webcams (each gets 2 markers)...`);
    webcamLayerGroup.clearLayers(); // Clear existing markers

    // Define MAIN webcam icon (AwesomeMarker)
    let mainWebcamIcon;
    try {
        if (L.AwesomeMarkers && L.AwesomeMarkers.icon) {
            mainWebcamIcon = L.AwesomeMarkers.icon({
                icon: 'video',
                prefix: 'fas',
                markerColor: 'cadetblue',
                iconColor: 'white'
            });
        } else {
            console.warn("[Webcam Service] L.AwesomeMarkers not found. Using default Leaflet icon for webcams.");
            mainWebcamIcon = L.icon();
        }
    } catch (iconError) {
         console.error("[Webcam Service] Error creating AwesomeMarker icon:", iconError);
         mainWebcamIcon = L.icon();
    }

    // Define OVERLAY icon (DivIcon)
    const overlayIconSize = 20; // Adjust size as needed
    const overlayIcon = L.divIcon({
        html: `<i class="fas fa-camera" style="color: white; font-size: ${overlayIconSize * 0.8}px;"></i>`,
        className: 'webcam-overlay-icon', // CSS class for styling
        iconSize: [overlayIconSize, overlayIconSize],
        // *** Adjust iconAnchor for positioning ***
        // Example: [-5, 20] might place it near top-left of AwesomeMarker
        iconAnchor: [9, 35] // Adjust x, y offsets via trial & error
    });

    // Iterate through webcam data and create markers
    webcamData.forEach(webcam => {
        try {
            const latLng = [webcam.location.lat, webcam.location.lon];

            // --- 1. Create the MAIN blue marker ---
            const mainMarker = L.marker(latLng, {
                icon: mainWebcamIcon,
                interactive: true, // Ensure it's clickable for popup
                keyboard: true,
            });

            const popupContent = `
                <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 5px;">${webcam.shortTitle || webcam.title}</div>
                ${webcam.location.city ? webcam.location.city + '<br>' : ''}
                <a href="${webcam.pageUrl}" target="_blank" rel="noopener noreferrer" style="color: #0078A8; text-decoration: none;">View Webcam <i class="fas fa-external-link-alt" style="font-size: 0.8em;"></i></a>
            `;
            mainMarker.bindPopup(popupContent, { maxWidth: 250 });
            webcamLayerGroup.addLayer(mainMarker); // Add main marker to the group

            // --- 2. Create the OVERLAY icon marker ---
            const overlayMarker = L.marker(latLng, {
                icon: overlayIcon, // Use the DivIcon
                pane: 'webcamOverlayIconPane', // Place in the dedicated pane
                interactive: false, // Make non-interactive
                keyboard: false,
                zIndexOffset: 10 // Optional: ensure slightly above base marker
            });
            webcamLayerGroup.addLayer(overlayMarker); // Add overlay marker to the SAME group


        } catch (e) {
            console.error(`[Webcam Service] Error creating marker/overlay for webcam ID ${webcam.id}:`, e, webcam);
        }
    });
    console.log(`[Webcam Service] Finished populating webcam layer group. ${webcamLayerGroup.getLayers().length} total layers (markers + overlays) added.`);
}


/**
 * Finds the webcam closest to the given coordinates (used for site popups).
 * @param {number} siteLat - Latitude of the site.
 * @param {number} siteLon - Longitude of the site.
 * @param {number} [maxDistanceKm=50] - Optional maximum distance in km.
 * @returns {object|null} Closest webcam object or null.
 */
export function findClosestWebcam(siteLat, siteLon, maxDistanceKm = 50) {
    // console.log(`[Webcam Service] findClosestWebcam called for (${siteLat}, ${siteLon}). isLoaded=${isWebcamDataLoaded}`); // Less verbose
    if (!isWebcamDataLoaded || webcamData.length === 0) { return null; }
    if (typeof siteLat !== 'number' || typeof siteLon !== 'number') { return null; }

    let closestWebcam = null;
    let minDistance = Infinity;
    const siteCoords = { lat: siteLat, lon: siteLon };

    for (const webcam of webcamData) {
        const webcamCoords = { lat: webcam.location.lat, lon: webcam.location.lon };
        const distance = haversineDistance(siteCoords, webcamCoords);
        if (distance < minDistance) {
            minDistance = distance;
            closestWebcam = webcam;
        }
    }

    if (closestWebcam && minDistance <= maxDistanceKm) {
        return { ...closestWebcam, distanceKm: minDistance };
    } else {
        return null;
    }
}

/**
 * Checks if the webcam data has been successfully loaded.
 * @returns {boolean} True if loaded, false otherwise.
 */
export function isLoaded() {
    return isWebcamDataLoaded;
}

// --- END OF FILE webcamService.js ---