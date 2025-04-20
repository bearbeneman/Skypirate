// --- START OF FILE raspControls.js ---
// raspControls.js
import * as state from './state.js';
import * as raspService from './raspService.js'; // To update layer opacity
import * as raspCornerControls from './raspCornerControls.js'; // Still needed if ENABLE_CORNER_UI is true

// **** NEW: Flag to easily enable/disable the corner adjustment UI ****
const ENABLE_CORNER_UI = false; // Set to true to show the controls again

// UI Element References (excluding raspKeyContainer)
let enableRaspOverlayCheckbox = null;
let raspOpacityControl = null;
let raspOpacitySlider = null;
let raspOpacityValueSpan = null;
// let raspKeyContainer = null; // <-- REMOVED
export let raspOverlayStatus = null; // Export for raspService to update

// Dependencies (passed during initialization)
let _map = null;
let _raspCornersLatLng = null; // Initial corners from mapService
let _updateRaspOverlayCallback = null;

// --- NEW: Variable to hold the Leaflet RASP Key Control instance ---
let raspKeyControlInstance = null;

// --- NEW: Define the RASP Key Leaflet Control ---
const RaspKeyControl = L.Control.extend({
    options: {
        position: 'bottomleft', // Position on map
        imageUrl: 'images/stars.curr.1200lst.d2.foot.png', // Default image path
        altText: 'RASP Key'
    },

    onAdd: function (map) {
        // Create container div
        this._container = L.DomUtil.create('div', 'leaflet-control-rasp-key leaflet-control'); // Add standard Leaflet classes
        this._container.style.display = 'none'; // Start hidden

        // Create image element
        const img = L.DomUtil.create('img', '', this._container);
        img.src = this.options.imageUrl;
        img.alt = this.options.altText;

        // Prevent map clicks when interacting with the control
        L.DomEvent.disableClickPropagation(this._container);
        L.DomEvent.disableScrollPropagation(this._container);

        return this._container;
    },

    onRemove: function (map) {
        // Nothing specific needed for simple removal
    },

    show: function () {
        if (this._container) {
            this._container.style.display = 'block'; // Or 'inline-block' if needed
        }
    },

    hide: function () {
        if (this._container) {
            this._container.style.display = 'none';
        }
    }
});
// --- End RASP Key Control Definition ---


/**
 * Initializes the RASP overlay controls.
 * @param {object} mapInfo - Object containing map and raspCornersLatLng.
 * @param {function} updateRaspOverlayCallback - Function to call when RASP needs updating.
 */
export function initialize(mapInfo, updateRaspOverlayCallback) {
    console.log("Initializing RASP Controls...");
    if (!mapInfo || !mapInfo.map) {
        console.error("Map instance not provided to RASP Controls initialization.");
        return;
    }
    _map = mapInfo.map;
    _raspCornersLatLng = mapInfo.raspCornersLatLng;
    _updateRaspOverlayCallback = updateRaspOverlayCallback;

    enableRaspOverlayCheckbox = document.getElementById('enable-rasp-overlay');
    raspOpacityControl = document.getElementById('rasp-opacity-control');
    raspOpacitySlider = document.getElementById('rasp-opacity-slider');
    raspOpacityValueSpan = document.getElementById('rasp-opacity-value');
    // raspKeyContainer = document.getElementById('rasp-key-container'); // <-- REMOVED
    raspOverlayStatus = document.getElementById('rasp-overlay-status');

    // Adjusted check for missing elements
    if (!enableRaspOverlayCheckbox || !raspOpacityControl || !raspOpacitySlider ||
        !raspOpacityValueSpan || !raspOverlayStatus) { // Removed raspKeyContainer check
        console.error("One or more RASP control UI elements not found!");
        return;
    }

    // --- NEW: Create and add the RASP Key control to the map ---
    raspKeyControlInstance = new RaspKeyControl();
    raspKeyControlInstance.addTo(_map);
    // ---

    // Initialize Corner Controls (even if hidden, sets up defaults)
    const cornerControlsInitialized = raspCornerControls.initialize();
    if (!cornerControlsInitialized && ENABLE_CORNER_UI) { // Only warn if UI was intended
        console.warn("RASP Corner Controls failed to initialize. Disabling feature.");
    }

    // Set initial UI state from state.js
    enableRaspOverlayCheckbox.checked = state.isRaspOverlayEnabled;
    raspOpacityControl.style.display = state.isRaspOverlayEnabled ? 'inline-flex' : 'none';
    // raspKeyContainer.style.display = state.isRaspOverlayEnabled ? 'block' : 'none'; // <-- REMOVED
    raspOpacitySlider.value = state.raspOpacity; // Assuming state stores percentage 0-100
    raspOpacityValueSpan.textContent = `${state.raspOpacity}%`;

    // --- NEW: Set initial visibility of the key control ---
    if (raspKeyControlInstance) {
        state.isRaspOverlayEnabled ? raspKeyControlInstance.show() : raspKeyControlInstance.hide();
    }
    // ---

    // Show/Hide corner controls based on initial state *AND* the ENABLE_CORNER_UI flag
    if (ENABLE_CORNER_UI && state.isRaspOverlayEnabled && cornerControlsInitialized) {
        raspCornerControls.showControls();
    } else if (cornerControlsInitialized) {
         raspCornerControls.hideControls();
    }

    // Add event listeners
    enableRaspOverlayCheckbox.addEventListener('change', handleEnableChange);
    raspOpacitySlider.addEventListener('input', handleOpacityChange);

    // Initial call to set status text if needed
    triggerRaspUpdate();

    console.log("RASP Controls Initialized.");
}


/**
 * Handles the change event for the enable RASP checkbox.
 */
function handleEnableChange(event) {
    const isEnabled = event.target.checked;
    state.setRaspEnabled(isEnabled); // Update state

    // Update UI visibility
    raspOpacityControl.style.display = isEnabled ? 'inline-flex' : 'none';
    // raspKeyContainer.style.display = isEnabled ? 'block' : 'none'; // <-- REMOVED

    // --- NEW: Show/Hide RASP Key Control ---
    if (raspKeyControlInstance) {
        isEnabled ? raspKeyControlInstance.show() : raspKeyControlInstance.hide();
    }
    // ---

    // Show/hide corner controls *only if UI flag is enabled*
    const cornerControlsInitialized = typeof raspCornerControls.showControls === 'function'; // Check if module loaded
    if (ENABLE_CORNER_UI && isEnabled && cornerControlsInitialized) {
         raspCornerControls.showControls();
    } else if (cornerControlsInitialized) {
         // Hide controls if RASP is disabled OR if the UI flag is false
         raspCornerControls.hideControls();
    }

    // Trigger RASP layer update (will add or remove the layer)
    triggerRaspUpdate();
}

/**
 * Handles the input event for the opacity slider.
 */
function handleOpacityChange() {
    const opacityValue = parseInt(raspOpacitySlider.value, 10); // Value is 0-100
    state.setRaspOpacity(opacityValue); // Update state
    raspOpacityValueSpan.textContent = `${opacityValue}%`; // Update UI label

    // Update the layer opacity directly if the layer exists
    raspService.setRaspLayerOpacity(opacityValue / 100.0); // Convert to 0.0-1.0
}

/**
 * Calls the main RASP update function provided by main.js.
 * Passes necessary arguments like map, corners, and UI elements for status updates.
 */
function triggerRaspUpdate() {
    if (_updateRaspOverlayCallback) {
         const uiElementsForService = { raspOverlayStatus };
         // Make sure _raspCornersLatLng is passed correctly
         // If using corner controls, get current corners, otherwise use initial
         let currentCorners = _raspCornersLatLng;
         if (ENABLE_CORNER_UI && typeof raspCornerControls.getCurrentCorners === 'function') {
            currentCorners = raspCornerControls.getCurrentCorners() || _raspCornersLatLng;
         }
        _updateRaspOverlayCallback(_map, currentCorners, uiElementsForService);
    } else {
        console.warn("updateRaspOverlayCallback not available in raspControls.");
    }
}


/**
 * Disables controls (e.g., on data load error).
 */
export function disable() {
    if (enableRaspOverlayCheckbox) enableRaspOverlayCheckbox.disabled = true;
    if (raspOpacitySlider) raspOpacitySlider.disabled = true;
    if (raspOverlayStatus) raspOverlayStatus.textContent = '(Disabled)';

    // --- NEW: Hide the key control when disabling ---
    if (raspKeyControlInstance) {
        raspKeyControlInstance.hide();
    }
    // ---

    // Disable corner controls
    if (typeof raspCornerControls.disable === 'function') {
        raspCornerControls.disable();
    }
}

// Exported functions to control corner UI, now respect the flag
// These probably don't need to be exported if only used internally based on ENABLE_CORNER_UI
// export function showCornerControls() {
//     if (ENABLE_CORNER_UI && typeof raspCornerControls.showControls === 'function') {
//         raspCornerControls.showControls();
//     }
// }
// export function hideCornerControls() {
//      if (typeof raspCornerControls.hideControls === 'function') {
//         raspCornerControls.hideControls();
//     }
// }
// --- END OF FILE raspControls.js ---