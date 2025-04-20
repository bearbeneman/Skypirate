// --- START OF FILE rainViewerControls.js ---
import * as state from './state.js';
import * as rainViewerService from './rainViewerService.js';

// UI Element References
let enableCheckbox = null;
let opacityControlContainer = null;
let opacitySlider = null;
let opacityValueSpan = null;
let statusSpan = null;

/**
 * Initializes the RainViewer UI controls.
 */
export function initialize() {
    console.log("Initializing RainViewer Controls...");

    enableCheckbox = document.getElementById('enable-rainviewer-overlay');
    opacityControlContainer = document.getElementById('rainviewer-opacity-control');
    opacitySlider = document.getElementById('rainviewer-opacity-slider');
    opacityValueSpan = document.getElementById('rainviewer-opacity-value');
    statusSpan = document.getElementById('rainviewer-overlay-status');

    if (!enableCheckbox || !opacityControlContainer || !opacitySlider || !opacityValueSpan || !statusSpan) {
        console.error("One or more RainViewer UI control elements not found!");
        disable(); // Disable if elements are missing
        return;
    }

    // Set initial UI state from global state
    enableCheckbox.checked = state.isRainViewerEnabled;
    opacitySlider.value = state.rainViewerOpacity;
    opacityValueSpan.textContent = `${state.rainViewerOpacity}%`;
    opacityControlContainer.style.display = state.isRainViewerEnabled ? 'inline-flex' : 'none';
    statusSpan.textContent = ''; // Initial status cleared

    // Add event listeners
    enableCheckbox.addEventListener('change', handleEnableChange);
    opacitySlider.addEventListener('input', handleOpacityChange);

    console.log("RainViewer Controls Initialized.");
}

/**
 * Handles the enable/disable checkbox change.
 * @param {Event} event - The change event.
 */
function handleEnableChange(event) {
    const isEnabled = event.target.checked;
    console.log(`RainViewer Toggled: ${isEnabled}`);
    state.setRainViewerEnabled(isEnabled); // Update global state

    // Show/hide opacity controls
    opacityControlContainer.style.display = isEnabled ? 'inline-flex' : 'none';

    // Trigger layer update in the service
    rainViewerService.updateRadarLayer();
}

/**
 * Handles the opacity slider change.
 * @param {Event} event - The input event.
 */
function handleOpacityChange(event) {
    const opacityValue = parseInt(event.target.value, 10);
    state.setRainViewerOpacity(opacityValue); // Update global state
    opacityValueSpan.textContent = `${opacityValue}%`;

    // Update layer opacity in the service
    rainViewerService.setOpacity(opacityValue / 100.0);
}

/**
 * Updates the status message displayed in the UI.
 * @param {string} message - The message to display.
 * @param {string} [color=''] - Optional color for the message (e.g., 'red', 'orange', 'green').
 */
export function updateStatus(message, color = '') {
    if (statusSpan) {
        statusSpan.textContent = message;
        statusSpan.style.color = color;
    }
}

/**
 * Disables the RainViewer controls.
 */
export function disable() {
    if (enableCheckbox) enableCheckbox.disabled = true;
    if (opacitySlider) opacitySlider.disabled = true;
    if (opacityControlContainer) opacityControlContainer.style.display = 'none';
    updateStatus('(Unavailable)', 'grey');
}
// --- END OF FILE rainViewerControls.js ---