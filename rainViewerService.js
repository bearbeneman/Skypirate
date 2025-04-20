// --- START OF FILE rainViewerService.js ---
import * as state from './state.js';
import * as uiControls from './rainViewerControls.js'; // To update status

const RAINVIEWER_API_URL = 'https://api.rainviewer.com/public/weather-maps.json';

let radarLayer = null;
let apiData = null; // Stores { generated, host, radar: { past: [{time, path}, ...], nowcast: [{time, path}, ...] } }
let lastFetchedTimestamp = 0;
const FETCH_INTERVAL = 10 * 60 * 1000; // Fetch new timestamps every 10 minutes
let currentDisplayedFrame = null; // Store the whole frame object {time, path}
let _map = null;

// Define how close the *found* radar frame must be to the *current actual time* to be considered valid
const MAX_AGE_SECONDS = 3 * 60 * 60;   // e.g., Allow frames up to 3 hours in the past
const MAX_FUTURE_SECONDS = 1 * 60 * 60; // e.g., Allow frames (nowcast) up to 1 hour in the future

/**
 * Initializes the RainViewer service.
 * @param {L.Map} mapInstance - The Leaflet map instance.
 */
export function initialize(mapInstance) { // <<<--- MAKE SURE 'export' IS HERE
    console.log("Initializing RainViewer Service...");
    _map = mapInstance;
    if (!_map) {
        console.error("RainViewer Service: Map instance is required for initialization.");
        return;
    }
    fetchTimestamps(); // Initial fetch
    setInterval(fetchTimestamps, FETCH_INTERVAL);
}

/**
 * Fetches available radar timestamps from the RainViewer API.
 */
async function fetchTimestamps() {
    if (Date.now() - lastFetchedTimestamp < 60 * 1000) { // Minimum 1 min between fetches
        return;
    }
    console.log("RainViewer: Fetching available timestamps...");
    lastFetchedTimestamp = Date.now();
    try {
        const response = await fetch(RAINVIEWER_API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const newData = await response.json();
        // Basic validation
        if (!newData || !newData.host || !newData.radar || (!newData.radar.past && !newData.radar.nowcast)) {
             throw new Error("Invalid API response structure received from RainViewer.");
        }
        apiData = newData; // Store validated data

        console.log("RainViewer: API Data Received. Host:", apiData.host, "Past count:", apiData.radar.past?.length, "Nowcast count:", apiData.radar.nowcast?.length);

        if (state.isRainViewerEnabled && _map) { // Ensure map exists before triggering update
            updateRadarLayer();
        }
    } catch (error) {
        console.error('RainViewer: Failed to fetch timestamps or invalid data:', error);
        apiData = null; // Clear data on error
        if (state.isRainViewerEnabled && _map) { // Ensure map exists before triggering update
             updateRadarLayer(); // Update layer state (will likely show error)
        }
    }
}

/**
 * Converts the application's global date/hour state to a Unix timestamp (seconds).
 * @returns {number | null} Unix timestamp in seconds or null if date/hour invalid.
 */
function getTargetTimestampFromState() {
    if (!state.selectedGlobalDate || state.selectedGlobalHour === null) {
        // console.log("RainViewer getTargetTimestampFromState: Date or Hour not selected in state."); // Keep logs minimal unless debugging
        return null;
    }
    try {
        const dateString = `${state.selectedGlobalDate}T${String(state.selectedGlobalHour).padStart(2, '0')}:00:00Z`;
        const dateObj = new Date(dateString);
        if (isNaN(dateObj.getTime())) {
             console.error("RainViewer: Invalid date/time for timestamp conversion:", dateString);
             return null;
        }
        const timestamp = Math.floor(dateObj.getTime() / 1000);
        // console.log(`RainViewer getTargetTimestampFromState: Converted ${dateString} to target timestamp ${timestamp}`); // Keep logs minimal
        return timestamp;
    } catch (e) {
        console.error("RainViewer: Error converting state to timestamp:", e);
        return null;
    }
}


/**
 * Finds the available RainViewer Frame Object {time, path} whose 'time' is closest
 * to the targetTimestamp, AND ALSO checks if that found frame's time is
 * reasonably close to the current actual time.
 * @param {number} targetTimestamp - The desired timestamp (from UI controls) in seconds.
 * @returns {object | null} The closest valid Frame Object, or null if none found or valid.
 */
function findClosestReasonableFrame(targetTimestamp) {
    if (!apiData || !apiData.radar) {
        // console.log("RainViewer findClosestReasonableFrame: No apiData or radar object found.");
        return null;
    }

    const pastFrames = apiData.radar.past || [];
    const nowcastFrames = apiData.radar.nowcast || [];
    const allFrames = [...pastFrames, ...nowcastFrames]
        .filter(frame => frame && typeof frame.time === 'number' && !isNaN(frame.time) && frame.path); // Ensure basic validity

    if (allFrames.length === 0) {
         // console.log("RainViewer findClosestReasonableFrame: No valid frames found in API data.");
         return null;
    }

    let closestFrame = null;
    let minDiff = Infinity;

    // Find frame closest to the *target* time
    allFrames.forEach(frame => {
        const diff = Math.abs(targetTimestamp - frame.time);
        if (diff < minDiff) {
            minDiff = diff;
            closestFrame = frame;
        }
    });

    if (!closestFrame) {
         // console.log(`RainViewer findClosestReasonableFrame: No frame found closest to target ${targetTimestamp}.`);
         return null; // Should not happen if allFrames wasn't empty, but safety check
    }

    const closestTime = closestFrame.time;
    // const targetDateStr = new Date(targetTimestamp * 1000).toISOString(); // Minimal logging
    // const closestDateStr = new Date(closestTime * 1000).toISOString();
    // console.log(`RainViewer findClosestReasonableFrame: Target=${targetTimestamp}. Closest frame found: Time=${closestTime}. Diff from target=${minDiff}s.`);

    // --- NOW, perform the SANITY CHECK against the CURRENT time ---
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ageDiff = nowSeconds - closestTime; // positive if frame is in the past, negative if in future

    if (ageDiff > MAX_AGE_SECONDS) {
        console.warn(`RainViewer: Closest frame found (${new Date(closestTime * 1000).toISOString()}) is too old (>${MAX_AGE_SECONDS}s ago). Discarding.`);
        return null;
    }
    if (-ageDiff > MAX_FUTURE_SECONDS) { // Check if too far in the future
         console.warn(`RainViewer: Closest frame found (${new Date(closestTime * 1000).toISOString()}) is too far in the future (>${MAX_FUTURE_SECONDS}s ahead). Discarding.`);
         return null;
    }

    // console.log(`RainViewer findClosestReasonableFrame: Closest frame is reasonably current (Age difference: ${-ageDiff}s). Using this frame.`);
    return closestFrame;
}


/**
 * Updates or creates the RainViewer radar overlay layer based on current state.
 * Finds the frame closest to the selected app time, but only displays it if
 * that frame itself is reasonably close to the current actual time.
 */
export function updateRadarLayer() {
    if (!_map) {
        // console.error("RainViewer: Map instance not available for updateRadarLayer."); // May be called before map ready initially
        return;
    }
    // console.log("RainViewer: updateRadarLayer called. Enabled:", state.isRainViewerEnabled); // Minimal logging

    if (!state.isRainViewerEnabled) {
        removeLayer();
        uiControls.updateStatus('');
        return;
    }

    if (!apiData || !apiData.host) {
        removeLayer();
        // console.log("RainViewer updateRadarLayer: apiData or apiData.host is missing.");
        uiControls.updateStatus(lastFetchedTimestamp === 0 ? '(Fetching radar API...)' : '(Radar API data missing/invalid)');
        // Don't re-trigger fetch here, rely on interval or initial fetch
        return;
    }

    // 1. Get target time from app state
    const targetTimestamp = getTargetTimestampFromState();
    if (targetTimestamp === null) {
        removeLayer();
        uiControls.updateStatus('(Select date/time)');
        return;
    }

    // 2. Find the closest *reasonable* frame object {time, path}
    const displayFrame = findClosestReasonableFrame(targetTimestamp);

    if (displayFrame === null || !displayFrame.path) {
        removeLayer();
        const targetDate = new Date(targetTimestamp * 1000);
        const timeStr = targetDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
        // console.log(`RainViewer updateRadarLayer: No reasonably current frame found closest to target ${targetTimestamp}.`);
        uiControls.updateStatus(`(No recent radar data near ${timeStr} UTC)`);
        return;
    }

    // 3. Construct Tile URL using host and path from the chosen frame
    const tileSize = 256;
    const colorScheme = 2;
    const smooth = 1;
    const snow = 1;
    const extension = 'png';
    const tileUrl = `${apiData.host}${displayFrame.path}/${tileSize}/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.${extension}`;

    const displayTimestamp = displayFrame.time;
    const displayDate = new Date(displayTimestamp * 1000);
    const displayTimeStr = displayDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    const targetTimeStr = new Date(targetTimestamp * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC'});
    const statusMessage = `Radar @ ${displayTimeStr} UTC (for ${targetTimeStr})`;


    // --- Create or Update Layer ---
    if (!radarLayer) {
        // Create new layer
        console.log(`RainViewer: Creating layer. Path: ${displayFrame.path}, Time: ${displayTimestamp} (${displayTimeStr} UTC)`);
        // console.log(`RainViewer: Using Tile URL: ${tileUrl.replace('{z}/{x}/{y}', 'z/x/y')}`);
        radarLayer = L.tileLayer(tileUrl, {
            attribution: '<a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>',
            opacity: state.rainViewerOpacity / 100.0,
            tileSize: tileSize,
            zIndex: 5
        });
        // Add error handling to the layer itself
        radarLayer.on('tileerror', function(e) {
             console.error("RainViewer tile error:", e.coords, e.error, `URL: ${e.tile.src}`);
             // Optionally update UI status on tile error
             // uiControls.updateStatus(`Error loading radar tile @ ${displayTimeStr} UTC`, 'red');
        });
        radarLayer.on('load', function() {
             // Optionally update status when loading finishes, only if still relevant
             if (currentDisplayedFrame && currentDisplayedFrame.time === displayTimestamp) {
                uiControls.updateStatus(statusMessage); // Reset status on successful load
             }
        });
        radarLayer.on('loading', function() {
            // Optionally update status while loading
             // uiControls.updateStatus(`Loading radar @ ${displayTimeStr} UTC...`, 'orange');
        });

        radarLayer.addTo(_map);
        currentDisplayedFrame = displayFrame;
        // Update status after adding layer
        uiControls.updateStatus(statusMessage);


    } else {
        // Layer exists, check if it needs updates
        const currentOpacity = state.rainViewerOpacity / 100.0;
        let needsUpdate = false;

        // Ensure layer is on map if it should be
        if (!_map.hasLayer(radarLayer)) {
             radarLayer.addTo(_map);
             console.log("RainViewer: Re-added existing layer to map.");
             needsUpdate = true; // Counts as an update needing status refresh
        }

        // Check if the PATH of the closest reasonable frame changed
        if (!currentDisplayedFrame || currentDisplayedFrame.path !== displayFrame.path) {
            console.log(`RainViewer: Updating layer URL. Path: ${displayFrame.path}, Time: ${displayTimestamp} (${displayTimeStr} UTC)`);
            // console.log(`RainViewer: Using Tile URL: ${tileUrl.replace('{z}/{x}/{y}', 'z/x/y')}`);
            radarLayer.setUrl(tileUrl); // Update URL based on the new path
            currentDisplayedFrame = displayFrame; // Store the new frame
            needsUpdate = true;
        }

        // Always ensure opacity matches state
        if (radarLayer.options.opacity !== currentOpacity) {
             // console.log(`RainViewer: Updating opacity to ${currentOpacity}`); // Reduce logging
             setOpacity(currentOpacity);
             // Opacity change doesn't necessarily need full status update if timestamp is same
        }

        // Update status text if path changed or layer was re-added
        if (needsUpdate) {
            uiControls.updateStatus(statusMessage);
        }
    }
}

/**
 * Removes the radar layer from the map.
 */
function removeLayer() {
    if (radarLayer && _map) { // Check map exists
         if (_map.hasLayer(radarLayer)) {
             _map.removeLayer(radarLayer);
             console.log("RainViewer: Layer removed.");
         }
         radarLayer.off(); // Remove event listeners
         radarLayer = null;
    }
    currentDisplayedFrame = null; // Clear frame reference
}

/**
 * Sets the opacity of the radar layer.
 * @param {number} opacity - Opacity value between 0 and 1.
 */
function setOpacity(opacity) { // Make internal helper
     if (radarLayer && typeof radarLayer.setOpacity === 'function') {
        radarLayer.setOpacity(opacity);
    }
}
// --- END OF FILE rainViewerService.js ---