
// raspService.js
import * as state from './state.js';
import * as config from './config.js';
import * as raspUi from './raspControls.js'; // To update UI status

// --- NEW: Manage two layers for cross-fading ---
let currentRaspLayer = null;        // The currently fully visible layer
let loadingRaspLayer = null;        // The layer being loaded/faded in
let activeFadeAnimationId = null;   // ID for cancelling animation frame
let currentActiveCornersLatLng = null; // Store current corners

const FADE_DURATION_MS = 500; // 0.5 seconds fade

/**
 * Initializes the service, setting initial corners.
 */
export function initializeService() {
     try {
        if (typeof L === 'undefined' || typeof L.latLng !== 'function') {
             throw new Error('Leaflet L object not available for LatLng conversion.');
        }
         currentActiveCornersLatLng = config.HARDCODED_RASP_CORNERS_DATA.map(c => L.latLng(c[0], c[1]));
         console.log("RASP Service: Initialized with default corners:", currentActiveCornersLatLng);
     } catch(e) {
         console.error("RASP Service: Failed to initialize default corners.", e);
         currentActiveCornersLatLng = null;
     }
}


/**
 * Cleans up and removes a RASP layer safely.
 * @param {L.Layer} layer - The layer to remove.
 * @param {L.Map} map - The map instance.
 */
function removeLayerSafely(layer, map) {
    if (layer) {
        // Remove event listeners to prevent memory leaks or future errors
        layer.off('load');
        layer.off('error');
        if (map && map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    }
}

/**
 * Cancels any ongoing fade animation.
 */
function cancelActiveFade() {
    if (activeFadeAnimationId !== null) {
        cancelAnimationFrame(activeFadeAnimationId);
        activeFadeAnimationId = null;
        // console.log("RASP: Cancelled active fade."); // Debug logging
    }
}

/**
 * Updates or creates the RASP overlay layer based on current state, with cross-fade.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {Array<L.LatLng>} _raspCornersLatLng - Initial corners (ignored, uses currentActiveCornersLatLng).
 * @param {object} uiElements - References to UI elements (status span).
 * @param {string | null} [forcedRaspTime=null] - A specific RASP time (e.g., '1200') to force.
 * @param {string | null} [dateSourceForOffset=null] - A specific date (YYYY-MM-DD) for day offset.
 */
export function updateRaspOverlay(map, _raspCornersLatLng, uiElements, forcedRaspTime = null, dateSourceForOffset = null) {
    const statusSpan = uiElements.raspOverlayStatus;

    // --- Initialize service on first run if needed ---
    if (currentActiveCornersLatLng === null && config.HARDCODED_RASP_CORNERS_DATA) {
        initializeService();
        if (currentActiveCornersLatLng === null) {
            console.error("RASP Service cannot proceed without initial corners.");
             if (statusSpan) {
                 statusSpan.textContent = 'Error: RASP Corners not initialized.';
                 statusSpan.style.color = 'red';
             }
            return; // Critical error
        }
    }

    const isEnabled = state.isRaspOverlayEnabled;
    let referenceDate = dateSourceForOffset || state.selectedGlobalDate;

    // --- 1. Handle Disabled State ---
    if (!isEnabled || !referenceDate) {
        cancelActiveFade(); // Stop any ongoing fade
        // Remove both layers cleanly
        removeLayerSafely(currentRaspLayer, map);
        removeLayerSafely(loadingRaspLayer, map);
        currentRaspLayer = null;
        loadingRaspLayer = null;

        if (statusSpan) {
            statusSpan.textContent = isEnabled ? '(Select date)' : '';
            statusSpan.style.color = 'orange';
        }
         if (forcedRaspTime && statusSpan && isEnabled) statusSpan.textContent = `(Forcing ${forcedRaspTime}, select date)`;
         else if (forcedRaspTime && statusSpan) statusSpan.textContent = '';

        if (!isEnabled && typeof raspUi.hideCornerControls === 'function') {
             raspUi.hideCornerControls();
        }
        console.log("RASP: Disabled or no date selected, layers removed.");
        return;
    }

    // --- 2. Determine Target RASP Time and Image URL ---
    let targetRaspTime;
    let statusTimeSourceMessage = '';

     if (forcedRaspTime && config.AVAILABLE_RASP_TIMES_LST.includes(parseInt(forcedRaspTime, 10))) {
        targetRaspTime = String(forcedRaspTime);
        statusTimeSourceMessage = ` (from site popup for ${referenceDate})`;
        // console.log(`RASP: Forcing time to ${targetRaspTime} based on popup request.`);
    } else {
        targetRaspTime = String(config.AVAILABLE_RASP_TIMES_LST[0]);
        const currentGlobalHourUTC = state.selectedGlobalHour ? parseInt(state.selectedGlobalHour, 10) : NaN;
        if (!isNaN(currentGlobalHourUTC)) {
            let minDiff = Infinity;
            config.AVAILABLE_RASP_TIMES_LST.forEach(raspTimeNum => {
                const diff = Math.abs(currentGlobalHourUTC - (raspTimeNum / 100));
                if (diff < minDiff) { minDiff = diff; targetRaspTime = String(raspTimeNum); }
            });
            // console.log(`RASP: Selecting time ${targetRaspTime} based on global hour ${currentGlobalHourUTC}.`);
        } else { /* console.log(`RASP: No global hour selected, defaulting to ${targetRaspTime}.`); */ }
        statusTimeSourceMessage = ` (for ${referenceDate})`;
    }

    let imageUrl;
    let dayOffset;
    try {
        const today = new Date(); today.setUTCHours(0, 0, 0, 0);
        let selectedDayDate;
        try {
            selectedDayDate = new Date(referenceDate + 'T00:00:00Z');
            if (isNaN(selectedDayDate.getTime())) throw new Error(`Invalid date format: ${referenceDate}`);
            selectedDayDate.setUTCHours(0, 0, 0, 0);
        } catch (dateError) { throw dateError; }

        const diffTime = selectedDayDate.getTime() - today.getTime();
        dayOffset = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (dayOffset >= 0 && dayOffset <= config.RASP_MAX_DAY_OFFSET) {
            const imageUrlPath = config.RASP_IMAGE_PATH_FORMAT(dayOffset, targetRaspTime);
            imageUrl = `${config.RASP_IMAGE_BASE_URL}/${imageUrlPath}`;
        } else {
            throw new Error(`Date offset ${dayOffset} out of range [0, ${config.RASP_MAX_DAY_OFFSET}].`);
        }

    } catch (e) {
        console.error("RASP: Error calculating image URL:", e);
        if (statusSpan) {
            statusSpan.textContent = e.message.includes('range') ? `RASP only available up to +${config.RASP_MAX_DAY_OFFSET} days.` : 'Error: Invalid date for RASP.';
            statusSpan.style.color = e.message.includes('range') ? 'orange' : 'red';
        }
        // Keep the current layer visible if there is one, remove any pending load
        cancelActiveFade();
        removeLayerSafely(loadingRaspLayer, map);
        loadingRaspLayer = null;
        if (typeof raspUi.hideCornerControls === 'function') { // Hide controls if date out of range
           raspUi.hideCornerControls();
        }
        return;
    }

    // --- 3. Check if Image URL is the Same ---
    // Avoid reload/fade if the image URL hasn't actually changed
    if (currentRaspLayer && currentRaspLayer.getUrl && currentRaspLayer.getUrl() === imageUrl) {
        // console.log("RASP: Image URL unchanged, no update needed.");
        // Ensure opacity is correct if user changed slider while same image was displayed
        const targetOpacity = state.raspOpacity / 100.0;
        if (currentRaspLayer.options.opacity !== targetOpacity) {
            currentRaspLayer.setOpacity(targetOpacity);
        }
        if (statusSpan) { // Update status message even if no fade
             statusSpan.textContent = `Showing RASP ${targetRaspTime} LST${statusTimeSourceMessage}`;
             statusSpan.style.color = 'green';
        }
        // Ensure corners are correct too
        // updateRaspCorners(currentActiveCornersLatLng); // Handled by corner controls/state management now
        if (typeof raspUi.showCornerControls === 'function') {
           raspUi.showCornerControls();
        }
        return;
    }

    // --- 4. Prepare for New Layer Load and Fade ---
    console.log(`RASP: Loading new image: ${imageUrl}`);
    if (statusSpan) {
         statusSpan.textContent = `Loading RASP ${targetRaspTime} LST${statusTimeSourceMessage}...`;
         statusSpan.style.color = 'orange';
    }

    cancelActiveFade(); // Cancel any previous fade

    // If there's an *old* loading layer that didn't finish (e.g., user changed time again quickly), remove it.
    removeLayerSafely(loadingRaspLayer, map);
    loadingRaspLayer = null;


    // --- 5. Create New Layer ---
    if (typeof L.distortableImageOverlay !== 'function') {
        console.error('L.distortableImageOverlay plugin is not loaded or available.');
        if (statusSpan) { statusSpan.textContent = 'Error: RASP Plugin not loaded.'; statusSpan.style.color = 'red'; }
        return;
    }
    if (!currentActiveCornersLatLng || currentActiveCornersLatLng.length !== 4) {
        console.error('RASP corners invalid or not initialized.');
         if (statusSpan) { statusSpan.textContent = 'Error: RASP Corners missing.'; statusSpan.style.color = 'red'; }
        return;
    }

    const newLayer = L.distortableImageOverlay(imageUrl, {
        corners: currentActiveCornersLatLng,
        opacity: 0, // Start fully transparent
        editable: false,
        interactive: false,
        attribution: config.RASP_ATTRIBUTION,
        actions: [],
        suppressToolbar: true
    });

    loadingRaspLayer = newLayer; // Assign to the loading slot

    newLayer.once('load', () => {
        console.log("RASP: New image loaded:", imageUrl);
        if (!loadingRaspLayer || loadingRaspLayer !== newLayer) {
            // This layer load is no longer relevant (another update was triggered)
            console.log("RASP: Load event for an obsolete layer, removing.");
            removeLayerSafely(newLayer, map);
            return;
        }
        if (!map.hasLayer(newLayer)) { // Ensure it's still meant to be on the map
             console.warn("RASP: Loaded layer is not on map, adding before fade.");
             newLayer.addTo(map); // Should already be added, but safety check
        }

        // --- Start Fade Animation ---
        const startTime = performance.now();
        const targetOpacity = state.raspOpacity / 100.0;
        const oldLayerToFade = currentRaspLayer; // Capture the layer that needs to fade out
        const startOpacityOld = oldLayerToFade ? oldLayerToFade.options.opacity : 0;

        currentRaspLayer = newLayer; // The new layer is now the "current" one
        loadingRaspLayer = null;    // Clear the loading slot

        function fadeStep(timestamp) {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / FADE_DURATION_MS, 1);

            const fadeInOpacity = progress * targetOpacity;
            const fadeOutOpacity = startOpacityOld * (1 - progress);

            if (currentRaspLayer === newLayer) { // Check if still the active layer
                currentRaspLayer.setOpacity(fadeInOpacity);
            }

            if (oldLayerToFade && map.hasLayer(oldLayerToFade)) {
                oldLayerToFade.setOpacity(fadeOutOpacity);
            }

            if (progress < 1) {
                 activeFadeAnimationId = requestAnimationFrame(fadeStep);
            } else {
                // --- Fade Complete ---
                activeFadeAnimationId = null;
                if (currentRaspLayer === newLayer) { // Final opacity set
                    currentRaspLayer.setOpacity(targetOpacity);
                }
                if (oldLayerToFade) {
                    removeLayerSafely(oldLayerToFade, map); // Remove the fully faded out layer
                }
                console.log("RASP: Fade complete.");
                 if (statusSpan && state.isRaspOverlayEnabled) { // Check state again in case it changed during fade
                     statusSpan.textContent = `Showing RASP ${targetRaspTime} LST${statusTimeSourceMessage}`;
                     statusSpan.style.color = 'green';
                 }
                 // Show corner controls now that layer is fully visible
                 if (typeof raspUi.showCornerControls === 'function' && state.isRaspOverlayEnabled) {
                    raspUi.showCornerControls();
                 }
            }
        }

        activeFadeAnimationId = requestAnimationFrame(fadeStep);

    }); // End of 'load' handler

    newLayer.once('error', (e) => {
        console.error('Error loading RASP overlay image:', imageUrl, e);
        if (statusSpan) {
             statusSpan.textContent = `RASP image not found for ${referenceDate} ${targetRaspTime} LST`;
             statusSpan.style.color = 'red';
        }
        // Clean up the layer that failed
        removeLayerSafely(newLayer, map);
        if (loadingRaspLayer === newLayer) {
             loadingRaspLayer = null;
        }
         // Don't touch currentRaspLayer - leave the old image visible
         if (typeof raspUi.hideCornerControls === 'function') {
            raspUi.hideCornerControls();
         }
    }); // End of 'error' handler

    // Add the new layer to the map (initially transparent) so 'load' event fires
    newLayer.addTo(map);

} // End of updateRaspOverlay


/**
 * Sets the opacity of the *current* active RASP layer.
 * If a fade is in progress, this might only affect the final target opacity.
 * @param {number} opacity - Opacity value between 0 and 1.
 */
export function setRaspLayerOpacity(opacity) {
     // Only directly set opacity if no fade is active
     if (currentRaspLayer && activeFadeAnimationId === null) {
         if (typeof currentRaspLayer.setOpacity === 'function') {
             currentRaspLayer.setOpacity(opacity);
         }
     } else if (currentRaspLayer && activeFadeAnimationId !== null) {
         // If fading, the animation loop will pick up the new target opacity
         // from state.js on its next steps or completion.
         // console.log("RASP: Opacity changed during fade, will apply at end/next update.");
     }
     // If loadingRaspLayer exists, it starts at 0 and fades *to* the target state opacity.
}

/**
 * Updates the corners of the active RASP layer or prepares for the next update.
 * @param {Array<L.LatLng>} newCornersLatLng - Array of 4 LatLng objects.
 */
export function updateRaspCorners(newCornersLatLng) {
    if (!newCornersLatLng || newCornersLatLng.length !== 4) {
        console.warn("RASP Service: Invalid arguments for updateRaspCorners.");
        return;
    }

    // Always update the internal state
    currentActiveCornersLatLng = newCornersLatLng;
    // console.log("RASP Service: Internal corners updated.", currentActiveCornersLatLng.map(c => [c.lat, c.lng]));

    // Only try to update the layer directly if no fade is happening
    if (currentRaspLayer && activeFadeAnimationId === null) {
        if (typeof currentRaspLayer.setCorners === 'function') {
             try {
                 currentRaspLayer.setCorners(newCornersLatLng);
                 // console.log("RASP Service: Live overlay corners updated.");
             } catch (e) {
                 console.error("RASP Service: Error calling setCorners:", e);
             }
        }
    } else if (activeFadeAnimationId !== null) {
        // If fading, the *next* layer created by updateRaspOverlay will use the new corners.
        // console.log("RASP Service: Corners changed during fade, will apply on next update.");
    }
     // The loading layer (if present) is created with the latest corners anyway.
}

/**
 * Gets the current corners being used by the service.
 * @returns {Array<L.LatLng> | null}
 */
export function getCurrentRaspCorners() {
    return currentActiveCornersLatLng ? [...currentActiveCornersLatLng] : null; // Return a copy
}
