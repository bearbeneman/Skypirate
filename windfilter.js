// --- START OF FILE windFilter.js ---
import * as state from './state.js';

// UI Element References
let enableSpeedFilterCheckbox = null;
let minWindSpeedInput = null;
let maxWindSpeedInput = null;
let windSpeedFilterStatus = null;

// Update Callback
let _updateCallbacks = null;

/**
 * Initializes the wind speed filter controls.
 * @param {object} updateCallbacks - Callbacks for triggering updates.
 */
export function initialize(updateCallbacks) {
    console.log("Initializing Wind Filter Controls...");
    _updateCallbacks = updateCallbacks;

    enableSpeedFilterCheckbox = document.getElementById('enable-speed-filter');
    minWindSpeedInput = document.getElementById('min-wind-speed');
    maxWindSpeedInput = document.getElementById('max-wind-speed');
    windSpeedFilterStatus = document.getElementById('wind-speed-filter-status');

    if (!enableSpeedFilterCheckbox || !minWindSpeedInput || !maxWindSpeedInput || !windSpeedFilterStatus) {
        console.error("One or more wind filter UI elements not found!");
        return;
    }

    // Set initial UI state from state.js
    enableSpeedFilterCheckbox.checked = state.isSpeedFilterEnabled;
    minWindSpeedInput.value = state.minWindSpeedFilter;
    maxWindSpeedInput.value = state.maxWindSpeedFilter;
    minWindSpeedInput.disabled = !state.isSpeedFilterEnabled;
    maxWindSpeedInput.disabled = !state.isSpeedFilterEnabled;

    // Add event listeners
    enableSpeedFilterCheckbox.addEventListener('change', handleEnableChange);
    minWindSpeedInput.addEventListener('input', handleMinInputChange);
    maxWindSpeedInput.addEventListener('input', handleMaxInputChange);

    updateStatusText(); // Set initial status text
    console.log("Wind Filter Controls Initialized.");
}

/**
 * Handles the change event for the enable checkbox.
 */
function handleEnableChange(event) {
    const isEnabled = event.target.checked;
    state.setSpeedFilterEnabled(isEnabled); // Update state

    // Update UI enabled state
    minWindSpeedInput.disabled = !isEnabled;
    maxWindSpeedInput.disabled = !isEnabled;

    updateStatusText();
    triggerUpdates(); // Refresh markers etc.
}

/**
 * Handles input events for the minimum wind speed input.
 */
function handleMinInputChange(event) {
    let newMin = parseFloat(event.target.value) || 0;
    const currentMax = state.maxWindSpeedFilter;

    // Ensure min doesn't exceed max
    if (newMin > currentMax) {
        newMin = currentMax;
        event.target.value = newMin; // Correct the input value visually
    }

    state.setSpeedFilterRange(newMin, currentMax); // Update state

    updateStatusText();
    // Trigger updates only if the filter is currently enabled and a date is selected
    if (state.isSpeedFilterEnabled && state.selectedGlobalDate) {
        triggerUpdates();
    }
}

/**
 * Handles input events for the maximum wind speed input.
 */
function handleMaxInputChange(event) {
    let newMax = parseFloat(event.target.value) || 0;
    const currentMin = state.minWindSpeedFilter;

    // Ensure max doesn't go below min
    if (newMax < currentMin) {
        newMax = currentMin;
        event.target.value = newMax; // Correct the input value visually
    }

    state.setSpeedFilterRange(currentMin, newMax); // Update state

    updateStatusText();
     // Trigger updates only if the filter is currently enabled and a date is selected
    if (state.isSpeedFilterEnabled && state.selectedGlobalDate) {
        triggerUpdates();
    }
}

/**
 * Updates the status text display based on current state.
 * ***** ADD EXPORT HERE *****
 */
export function updateStatusText() {
// ***** END ADD EXPORT HERE *****
    if (!windSpeedFilterStatus) return;

    if (state.isSpeedFilterEnabled && state.selectedGlobalDate) {
        windSpeedFilterStatus.textContent = `Filtering sites with wind between ${state.minWindSpeedFilter}-${state.maxWindSpeedFilter} MPH at any hour on ${state.selectedGlobalDate}.`;
        windSpeedFilterStatus.style.fontStyle = 'italic';
        windSpeedFilterStatus.style.marginLeft = '10px';
    } else if (state.isSpeedFilterEnabled && !state.selectedGlobalDate) {
        windSpeedFilterStatus.textContent = `(Select a date to apply speed filter)`;
        windSpeedFilterStatus.style.fontStyle = 'italic';
        windSpeedFilterStatus.style.marginLeft = '10px';
    } else {
        windSpeedFilterStatus.textContent = ''; // Clear status if filter is disabled
    }
}

/**
 * Triggers necessary updates in other modules.
 */
function triggerUpdates() {
    updateStatusText(); // Update local status first
    if (_updateCallbacks && typeof _updateCallbacks.refreshAll === 'function') {
        // Filter change requires marker refresh, RASP doesn't depend on speed filter, calendar doesn't either.
        // Use refreshMarkersOnly if available for efficiency, else fall back to refreshAll
        _updateCallbacks.refreshMarkersOnly ? _updateCallbacks.refreshMarkersOnly() : _updateCallbacks.refreshAll();
    } else {
        console.warn("refresh callback not available in windFilter.");
    }
}

/**
 * Disables controls (e.g., on data load error).
 */
export function disable() {
    if(enableSpeedFilterCheckbox) enableSpeedFilterCheckbox.disabled = true;
    if(minWindSpeedInput) minWindSpeedInput.disabled = true;
    if(maxWindSpeedInput) maxWindSpeedInput.disabled = true;
    if(windSpeedFilterStatus) windSpeedFilterStatus.textContent = '(Disabled)';
}
// --- END OF FILE windFilter.js ---