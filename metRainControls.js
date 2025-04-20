// --- START OF FILE metRainControls.js ---
// metRainControls.js
// Manages the MET Rain Forecast layer, UI controls (toggle, slider, key), and related interactions.

// Assuming Leaflet (L) is globally available or imported elsewhere if using modules strictly
// If using ES modules for Leaflet: import L from 'leaflet';
import * as config from './config.js';
import * as state from './state.js';
import * as imageProcessor from './imageProcessor.js'; // Needed for update function
import * as metRainService from './metRainService.js'; // Import the service module

// --- Module-Scoped Variables ---
let precipImageOverlay = null;          // Leaflet ImageOverlay instance
let metRainKeyControlInstance = null;   // Custom Leaflet control instance for the key
let precipToggleCheckbox = null;        // DOM element: The toggle checkbox
let precipOpacityControl = null;        // DOM element: Container for opacity slider
let precipOpacitySlider = null;         // DOM element: Opacity slider input
let precipOpacityValueSpan = null;      // DOM element: Displays opacity percentage
let precipStatusSpan = null;            // DOM element: Displays status (Loading, Error, etc.)

let _map = null;                        // Stores the Leaflet map instance

// --- Leaflet Control Definition ---
const MetRainKeyControl = L.Control.extend({
    options: {
        position: 'bottomright',
        imageUrl: 'Images/met_rain_key.png', // Ensure this path is correct relative to index.html
        altText: 'MET Rain Forecast Key'
    },

    onAdd: function (map) {
        this._container = L.DomUtil.create('div', 'leaflet-control-met-rain-key leaflet-control');
        this._container.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; // Optional: Slightly transparent background
        this._container.style.padding = '5px';
        this._container.style.borderRadius = '5px';
        this._container.style.display = 'none'; // Start hidden

        const img = L.DomUtil.create('img', '', this._container);
        img.src = this.options.imageUrl;
        img.alt = this.options.altText;
        img.style.display = 'block';
        img.style.maxWidth = '450px'; // Adjust as needed
        img.style.height = 'auto';

        L.DomEvent.disableClickPropagation(this._container);
        L.DomEvent.disableScrollPropagation(this._container);

        return this._container;
    },

    onRemove: function (map) {
        // Cleanup if needed
    },

    show: function () {
        if (this._container) {
            this._container.style.display = 'block';
        }
    },

    hide: function () {
        if (this._container) {
            this._container.style.display = 'none';
        }
    }
});

// --- Initialization Function ---
/**
 * Initializes the MET Rain controls, creates the layer, and sets up event listeners.
 * @param {L.Map} mapInstance - The main Leaflet map instance.
 */
function initialize(mapInstance) {
    if (!mapInstance) {
        console.error("MetRainControls: Map instance is required for initialization.");
        return;
    }
    _map = mapInstance;

    // --- Get DOM Elements ---
    precipToggleCheckbox = document.getElementById('precip-overlay-toggle');
    precipOpacityControl = document.getElementById('precip-opacity-control');
    precipOpacitySlider = document.getElementById('precip-opacity-slider');
    precipOpacityValueSpan = document.getElementById('precip-opacity-value');
    precipStatusSpan = document.getElementById('precip-status');

    if (!precipToggleCheckbox) {
         console.error("MetRainControls Error: Precipitation overlay toggle checkbox (#precip-overlay-toggle) not found!");
         // Consider disabling the feature or throwing an error
         return;
    }
     if (!precipStatusSpan) {
          console.warn("MetRainControls Warning: Precipitation status span (#precip-status) not found.");
          // Feature can continue, but status updates won't be visible
     }

    // --- Create Layer ---
    if (config.PRECIP_IMAGE_BOUNDS) {
        precipImageOverlay = L.imageOverlay(
            config.PRECIP_IMAGE_ERROR_URL, // Start with error/placeholder
            config.PRECIP_IMAGE_BOUNDS,
            {
                opacity: state.precipOverlayOpacity / 100.0,
                errorOverlayUrl: config.PRECIP_IMAGE_ERROR_URL,
                attribution: 'MET Rain Forecast', // Set attribution here
                interactive: false // Typically non-interactive
             }
        );
        console.log("MetRainControls: Custom MET Rain Forecast ImageOverlay layer created.");
    } else {
        console.error("MetRainControls Error: Precipitation image bounds not configured (config.PRECIP_IMAGE_BOUNDS). Layer disabled.");
        return; // Stop initialization if bounds are missing
    }

    // --- Create Key Control ---
     try {
        metRainKeyControlInstance = new MetRainKeyControl().addTo(_map);
        console.log("MetRainControls: MET Rain Key Control added to map.");
    } catch (keyControlError) {
        console.error("MetRainControls Error: Failed to create or add MetRainKeyControl:", keyControlError);
        metRainKeyControlInstance = null; // Ensure it's null if creation failed
    }

    // --- Add Listeners & Set Initial UI State ---
    precipToggleCheckbox.checked = state.isPrecipOverlayVisible;
    precipToggleCheckbox.addEventListener('change', handlePrecipToggleChange);

    if (precipOpacityControl && precipOpacitySlider && precipOpacityValueSpan) {
         precipOpacityControl.style.display = state.isPrecipOverlayVisible ? 'inline-flex' : 'none'; // Use flex for better alignment
         precipOpacitySlider.value = state.precipOverlayOpacity;
         precipOpacityValueSpan.textContent = `${state.precipOverlayOpacity}%`;
         precipOpacitySlider.addEventListener('input', handlePrecipOpacityChange);
    } else {
         console.warn("MetRainControls Warning: Precipitation opacity controls not found or incomplete (optional feature).");
         if(precipOpacityControl) precipOpacityControl.style.display = 'none'; // Ensure container is hidden if parts are missing
    }

    // Set initial key visibility based on state
    if (metRainKeyControlInstance) {
        if (state.isPrecipOverlayVisible) metRainKeyControlInstance.show();
        else metRainKeyControlInstance.hide();
    }

    // Set initial status text
    updateStatusText(); // Use a helper function

    // --- Add Map Event Listeners for Layer Control Sync ---
    // These listeners ensure the toggle checkbox/state stay in sync if the user
    // adds/removes the layer via the Leaflet Layer Control.
    if (precipImageOverlay && _map) {
         _map.on('layeradd', handleMapLayerAdd);
         _map.on('layerremove', handleMapLayerRemove);
         console.log("MetRainControls: Map event listeners added for precipImageOverlay sync.");
    }

    // --- Initial Layer Update (Important!) ---
    // Trigger an update immediately on load if the layer should be visible,
    // potentially starting the index build process.
    if (state.isPrecipOverlayVisible) {
        triggerIndexBuildIfNeeded();
    }
}

// --- Event Handlers & Internal Functions ---

/**
 * Updates the status text span based on the current state.
 */
function updateStatusText() {
    if (precipStatusSpan) {
        if (state.isPrecipOverlayVisible) { // Only show status if the toggle is ON
            if (state.isPrecipIndexLoading) { precipStatusSpan.textContent = " (Loading Index...)"; }
            else if (!state.isPrecipIndexBuilt) { precipStatusSpan.textContent = " (Index pending)"; }
            // Processing status is handled within updatePrecipOverlayVisibilityAndUrl
            else { precipStatusSpan.textContent = ""; } // Clear if index built and not loading/processing
        } else {
             precipStatusSpan.textContent = ""; // Clear status if toggle is off
        }
    }
}

/**
 * Handles the Leaflet map 'layeradd' event to sync state.
 * @param {L.LayerEvent} e - Leaflet layer event object.
 */
function handleMapLayerAdd(e) {
    if (e.layer === precipImageOverlay) {
         console.log("MetRainControls Map Event: precipImageOverlay added (via Layer Control?)");
         // Sync state: If layer added but state says hidden, update state and controls
         if (!state.isPrecipOverlayVisible) {
            console.log("MetRainControls Map Event: Syncing state -> visible = true");
            state.setPrecipOverlayVisible(true);
            if (precipToggleCheckbox) precipToggleCheckbox.checked = true;
            if (precipOpacityControl) precipOpacityControl.style.display = 'inline-flex';
            updateStatusText();
            triggerIndexBuildIfNeeded(); // Start index build if needed now
         }
         // Always ensure key is visible when layer is added
         metRainKeyControlInstance?.show();
    }
}

/**
 * Handles the Leaflet map 'layerremove' event to sync state.
 * @param {L.LayerEvent} e - Leaflet layer event object.
 */
function handleMapLayerRemove(e) {
    if (e.layer === precipImageOverlay) {
         console.log("MetRainControls Map Event: precipImageOverlay removed (via Layer Control?)");
          // Sync state: If layer removed but state says visible, update state and controls
          if (state.isPrecipOverlayVisible) {
             console.log("MetRainControls Map Event: Syncing state -> visible = false");
             state.setPrecipOverlayVisible(false);
             if (precipToggleCheckbox) precipToggleCheckbox.checked = false;
             if (precipOpacityControl) precipOpacityControl.style.display = 'none';
             updateStatusText(); // Will clear the status text
          }
          // Always ensure key is hidden when layer is removed
          metRainKeyControlInstance?.hide();
    }
}

/**
 * Handles changes to the precipitation toggle checkbox.
 * @param {Event} event - The input change event.
 */
function handlePrecipToggleChange(event) {
    // Use the checkbox's current state as the source of truth for the action
    const isEnabled = event?.target?.checked ?? false; // Default to false if event/target missing

    // Update the application state only if it differs from the control's state
    if (state.isPrecipOverlayVisible !== isEnabled) {
        state.setPrecipOverlayVisible(isEnabled);
        console.log(`MetRainControls Toggle Handler: State updated to ${isEnabled}`);
    }

    // Update UI elements based on the new state (isEnabled)
    if (precipOpacityControl) {
        precipOpacityControl.style.display = isEnabled ? 'inline-flex' : 'none';
    }
    if (metRainKeyControlInstance) {
        isEnabled ? metRainKeyControlInstance.show() : metRainKeyControlInstance.hide();
    }

    updateStatusText(); // Update status text based on new visibility state

    // Trigger necessary background logic
    if (isEnabled) {
        triggerIndexBuildIfNeeded(); // Check if index needs building or just update layer
    } else {
         updatePrecipOverlayVisibilityAndUrl(); // Update layer (this will remove it if needed)
    }
}

/**
 * Handles changes to the precipitation opacity slider.
 */
function handlePrecipOpacityChange() {
    if (!precipOpacitySlider || !precipOpacityValueSpan || !precipImageOverlay) {
         console.warn("MetRainControls: Opacity change handler called but elements missing.");
         return;
    }

    const opacityValue = parseInt(precipOpacitySlider.value, 10);
    state.setPrecipOverlayOpacity(opacityValue); // Update state (0-100)
    precipOpacityValueSpan.textContent = `${opacityValue}%`; // Update label

    // Update the Leaflet layer opacity (expects 0.0 - 1.0)
    precipImageOverlay.setOpacity(opacityValue / 100.0);
}

/**
 * Checks if the index needs building and triggers it via the service.
 * Also calls layer update afterwards.
 */
async function triggerIndexBuildIfNeeded() {
    let needsUpdate = true; // Assume we always need to update the layer unless build starts

    // Only build if layer should be visible AND index isn't built AND not already loading
    if (state.isPrecipOverlayVisible && !state.isPrecipIndexBuilt && !state.isPrecipIndexLoading) {
        console.log("MetRainControls: Triggering index build via metRainService.");
        needsUpdate = false; // Don't update layer yet, wait for build
        updateStatusText(); // Show "Loading Index..."
        try {
            // Call the service function - this will update state.isPrecipIndexLoading etc.
            await metRainService.buildPrecipImageIndex();
            console.log("MetRainControls: Index build finished (via service).");
            // State (isPrecipIndexBuilt=true, isPrecipIndexLoading=false) updated by service
            updateStatusText(); // Update status text (should clear loading message)
            updatePrecipOverlayVisibilityAndUrl(); // NOW update the layer with the built index
        } catch (error) {
            console.error("MetRainControls: Error occurred during index build:", error);
            // State should reflect loading finished (handled by service)
            updateStatusText(); // Update status (might show pending/error if state reflects it)
            updatePrecipOverlayVisibilityAndUrl(); // Update layer anyway (might show error image)
        }
    }

    // If we didn't start a build, ensure the layer is updated with the current time/settings
    if (needsUpdate) {
        updatePrecipOverlayVisibilityAndUrl();
    }
}

/**
 * Updates the precipitation layer's visibility and URL based on current state,
 * time, and available indexed images. Handles image processing if enabled.
 * (This is the function moved from main.js, with corrections)
 */
async function updatePrecipOverlayVisibilityAndUrl() {
    if (!precipImageOverlay || !_map) {
        return; // Not initialized yet
    }

    // Use state.isTrackerModeActive from the state module
    const shouldBeVisibleBasedOnState = state.isPrecipOverlayVisible && !state.isTrackerModeActive;
    const isIndexReady = state.isPrecipIndexBuilt && !state.isPrecipIndexLoading;

    let finalImageUrl = null;
    let imageUrlToDisplay = config.PRECIP_IMAGE_ERROR_URL;
    let processingAttempted = false;
    let cacheHit = false;

    // Update status text (handles Loading/Pending states)
    updateStatusText();

    if (shouldBeVisibleBasedOnState && isIndexReady) {
        // 1. Get URL from Service (uses index lookup)
        const originalImageUrl = metRainService.generatePrecipImageUrl(); // CORRECTED
        console.log(`[MetRainControls UpdateLayer] Target Original URL: ${originalImageUrl}`);

        if (originalImageUrl !== config.PRECIP_IMAGE_ERROR_URL) {
            if (config.ENABLE_IMAGE_EFFECTS) {
                processingAttempted = true;
                // 3a. Check Service Cache
                if (metRainService.precipDataUrlCache.has(originalImageUrl)) { // CORRECTED
                    cacheHit = true;
                    finalImageUrl = metRainService.precipDataUrlCache.get(originalImageUrl); // CORRECTED
                    console.log(`[MetRainControls UpdateLayer] Cache HIT. Using cached Data URL.`);
                } else {
                    // 3b. Process Image
                    cacheHit = false;
                    console.log(`[MetRainControls UpdateLayer] Cache MISS. Processing needed.`);
                    if (precipStatusSpan && state.isPrecipOverlayVisible) precipStatusSpan.textContent = " (Processing Image...)"; // Show processing status

                    try {
                        const processedDataUrl = await imageProcessor.processImageForEffects(
                            originalImageUrl,
                            {
                                threshold: config.DEFAULT_IMAGE_EFFECT_THRESHOLD,
                                blurAmount: config.DEFAULT_IMAGE_EFFECT_BLUR
                            }
                        );

                        if (processedDataUrl) {
                            finalImageUrl = processedDataUrl;
                            metRainService.precipDataUrlCache.set(originalImageUrl, processedDataUrl); // CORRECTED
                            console.log(`[MetRainControls UpdateLayer] Processing SUCCESS. Caching and using Data URL.`);
                            if (precipStatusSpan && state.isPrecipOverlayVisible) updateStatusText(); // Clear processing status by resetting
                        } else {
                             console.warn(`[MetRainControls UpdateLayer] Processing FAILED (null). Falling back to original URL.`);
                             finalImageUrl = originalImageUrl;
                             if (precipStatusSpan && state.isPrecipOverlayVisible) precipStatusSpan.textContent = " (Processing Error)";
                        }
                    } catch (error) {
                        console.error(`[MetRainControls UpdateLayer] Processing EXCEPTION:`, error);
                        finalImageUrl = originalImageUrl;
                        if (precipStatusSpan && state.isPrecipOverlayVisible) precipStatusSpan.textContent = " (Processing Error)";
                    }
                }
            } else {
                // --- Effects Disabled ---
                processingAttempted = false;
                finalImageUrl = originalImageUrl;
                console.log(`[MetRainControls UpdateLayer] Effects disabled. Using original URL.`);
                 // Clean up processed cache if effects were just turned off
                 if (metRainService.precipDataUrlCache.has(originalImageUrl)) { // CORRECTED
                      metRainService.precipDataUrlCache.delete(originalImageUrl); // CORRECTED
                       console.log(`[MetRainControls UpdateLayer] Removed outdated processed URL from cache.`);
                 }
            }
        } else {
             console.log("[MetRainControls UpdateLayer] generatePrecipImageUrl returned error URL.");
        }
    } else {
        console.log(`[MetRainControls UpdateLayer] Conditions not met for update (Visible: ${shouldBeVisibleBasedOnState}, IndexReady: ${isIndexReady})`);
    }

    // --- Update Leaflet Layer ---
    imageUrlToDisplay = finalImageUrl || config.PRECIP_IMAGE_ERROR_URL;

    // **** START: Add Console Log Logic ****
    let currentLayerUrl = null;
    try {
        // Check if _url exists and is a string before accessing it
        if (precipImageOverlay._url && typeof precipImageOverlay._url === 'string') {
            currentLayerUrl = precipImageOverlay._url;
        }
    } catch (e) { console.warn("Error accessing precipImageOverlay._url", e); }

    const layerWasAdded = _map.hasLayer(precipImageOverlay);
    const urlWillChange = currentLayerUrl !== imageUrlToDisplay;
    // **** END: Add Console Log Logic ****


    if (imageUrlToDisplay !== config.PRECIP_IMAGE_ERROR_URL && shouldBeVisibleBasedOnState) {
         if (urlWillChange || !layerWasAdded) { // Use the flag here
            precipImageOverlay.setUrl(imageUrlToDisplay);
            if (!layerWasAdded) {
                _map.addLayer(precipImageOverlay);
                 console.log(`MET Rain: ADDED layer and displaying image: ${imageUrlToDisplay.startsWith('data:') ? imageUrlToDisplay.substring(0, 100) + '... (Data URL)' : imageUrlToDisplay}`); // Log on add
            } else {
                 console.log(`MET Rain: UPDATED layer to display image: ${imageUrlToDisplay.startsWith('data:') ? imageUrlToDisplay.substring(0, 100) + '... (Data URL)' : imageUrlToDisplay}`); // Log on update
            }
             // Ensure opacity is always correct after adding/updating
             precipImageOverlay.setOpacity(state.precipOverlayOpacity / 100.0);
        } else if (layerWasAdded){
            // Ensure opacity matches state even if URL is the same
             precipImageOverlay.setOpacity(state.precipOverlayOpacity / 100.0);
        }
    } else {
        // Remove layer if conditions not met or error URL is the only option
        if (layerWasAdded) {
            console.log("MET Rain: Layer removed (no image displayed)."); // Log before removing
            _map.removeLayer(precipImageOverlay);
        }
    }
}

// --- Public Functions (Called by other modules) ---

/**
 * Updates the layer; intended to be called by the main refresh callback.
 */
function updateLayer() {
     // This simply triggers the visibility/URL update based on current state/time.
     // It avoids triggering an index build directly, assuming that's handled
     // during initialization or via the toggle handler.
     updatePrecipOverlayVisibilityAndUrl();
}

/**
 * Returns the Leaflet layer instance for use in the main Layer Control.
 * @returns {L.ImageOverlay | null} The precipitation image overlay layer.
 */
function getLayer() {
    return precipImageOverlay;
}

/**
 * Disables controls and hides the layer/key in case of a major application error.
 */
function disableOnError() {
    console.warn("MetRainControls: Disabling controls due to application error.");
    if (precipToggleCheckbox) precipToggleCheckbox.disabled = true;
    if (precipOpacitySlider) precipOpacitySlider.disabled = true;
    if (precipOpacityControl) precipOpacityControl.style.display = 'none'; // Hide slider container
    if (precipStatusSpan) precipStatusSpan.textContent = " (App Error)";

    metRainKeyControlInstance?.hide();

    // Remove layer from map if present
    if (_map && precipImageOverlay && _map.hasLayer(precipImageOverlay)) {
         _map.removeLayer(precipImageOverlay);
         console.log("MetRainControls: Layer removed due to error.");
    }
     // Optional: Remove map event listeners to prevent further actions
     if (_map && precipImageOverlay) {
          _map.off('layeradd', handleMapLayerAdd);
          _map.off('layerremove', handleMapLayerRemove);
     }
}

// --- Exports ---
// Expose the functions needed by main.js/app.js
export {
    initialize,
    getLayer,
    updateLayer, // Called by refreshAll
    // triggerIndexBuildIfNeeded, // This is now mostly internal, called by initialize/toggle
    disableOnError // Called on app load error
};
// --- END OF FILE metRainControls.js ---