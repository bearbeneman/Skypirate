// --- START OF FILE raspCornerControls.js ---
import * as config from './config.js';
import * as raspService from './raspService.js'; // To call update function

// UI Elements
let cornerControlsContainer = null;
let logButton = null;
let resetButton = null;
let statusSpan = null;
const sliders = {}; // { '1-lat': element, '1-lng': element, ... }
const valueSpans = {}; // { '1-lat': element, '1-lng': element, ... }

// Internal state for current corners (Leaflet LatLng objects)
let currentCornersLatLng = null;
let defaultCornersLatLng = null; // Store the initial default

const SCROLL_WHEEL_FINE_TUNE_STEP = 0.0005;

/**
 * Initializes the RASP corner adjustment controls.
 * **** CORRECTED: No mapInfo parameter needed ****
 */
export function initialize() {
    // **** CORRECTED: Log message ****
    console.log("Initializing RASP Corner Controls...");
    cornerControlsContainer = document.getElementById('rasp-corner-controls');
    logButton = document.getElementById('log-rasp-corners');
    resetButton = document.getElementById('reset-rasp-corners');
    statusSpan = document.getElementById('rasp-corner-status');

    if (!cornerControlsContainer || !logButton || !resetButton || !statusSpan) {
        console.error("RASP Corner Controls: One or more main UI elements not found!");
        return false; // Indicate failure
    }

    // Find sliders and value spans
    let foundAll = true;
    for (let i = 1; i <= 4; i++) {
        for (const coord of ['lat', 'lng']) {
            const sliderId = `corner-${i}-${coord}-slider`;
            const spanId = `corner-${i}-${coord}-value`;
            sliders[`${i}-${coord}`] = document.getElementById(sliderId);
            valueSpans[`${i}-${coord}`] = document.getElementById(spanId);
            if (!sliders[`${i}-${coord}`] || !valueSpans[`${i}-${coord}`]) {
                console.error(`RASP Corner Controls: Element not found: ${sliderId} or ${spanId}`);
                foundAll = false;
            }
        }
    }

    if (!foundAll) return false; // Stop if elements are missing

    // Convert default config corners (arrays) to LatLng objects for internal use
    try {
        if (typeof L === 'undefined' || typeof L.latLng !== 'function') {
            throw new Error('Leaflet L object not available for LatLng conversion.');
        }
        defaultCornersLatLng = config.HARDCODED_RASP_CORNERS_DATA.map(c => L.latLng(c[0], c[1]));
        currentCornersLatLng = [...defaultCornersLatLng];
        console.log("RASP Corner Controls: Default LatLng corners stored.", defaultCornersLatLng);
    } catch (e) {
        console.error("RASP Corner Controls: Failed to create default LatLng corners.", e);
        disable();
        return false;
    }

    // Set initial values and add listeners
    updateControlsFromState(currentCornersLatLng);
    addListeners();

    console.log("RASP Corner Controls Initialized.");
    return true; // Indicate success
}

// ... (rest of raspCornerControls.js remains the same) ...

/**
 * Adds event listeners to sliders and buttons.
 */
function addListeners() {
    Object.entries(sliders).forEach(([key, slider]) => {
        // Standard input listener
        slider.addEventListener('input', (event) => handleSliderInput(key, event));

        // Wheel event listener for fine-tuning
        slider.addEventListener('wheel', (event) => {
            event.preventDefault(); // Prevent page scrolling

            const currentValue = parseFloat(slider.value);
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);

            const direction = -Math.sign(event.deltaY);
            let newValue = currentValue + direction * SCROLL_WHEEL_FINE_TUNE_STEP;

            newValue = Math.max(min, Math.min(max, newValue));
            slider.value = newValue.toFixed(5);

            handleSliderInput(key, { target: slider, type: 'wheel' });

        }, { passive: false });
    });
    logButton.addEventListener('click', handleLogCornersClick);
    resetButton.addEventListener('click', handleResetCornersClick);
}

/**
 * Updates slider positions and value spans from an array of LatLng objects.
 * @param {Array<L.LatLng>} cornersLatLng - Array of 4 LatLng objects.
 */
function updateControlsFromState(cornersLatLng) {
    if (!cornersLatLng || cornersLatLng.length !== 4 || !sliders['1-lat']) {
         console.warn("RASP Corner Controls: Cannot update controls, invalid state or elements.");
         return;
    }
    cornersLatLng.forEach((corner, index) => {
        const i = index + 1;
        const lat = corner.lat;
        const lng = corner.lng;

        const precision = 5;

        if (sliders[`${i}-lat`] && valueSpans[`${i}-lat`]) {
            sliders[`${i}-lat`].value = parseFloat(lat.toFixed(precision));
            valueSpans[`${i}-lat`].textContent = lat.toFixed(precision);
        }
        if (sliders[`${i}-lng`] && valueSpans[`${i}-lng`]) {
            sliders[`${i}-lng`].value = parseFloat(lng.toFixed(precision));
            valueSpans[`${i}-lng`].textContent = lng.toFixed(precision);
        }
    });
     currentCornersLatLng = [...cornersLatLng];
     if (statusSpan) statusSpan.textContent = 'Controls updated.';
     setTimeout(() => { if (statusSpan) statusSpan.textContent = ''; }, 2000);
}


/**
 * Handles the 'input' or 'wheel' event from a slider.
 * @param {string} key - Identifier like '1-lat'.
 * @param {Event | object} event - The input/wheel event or a simulated event object { target: sliderElement }.
 */
function handleSliderInput(key, event) {
    const sliderElement = event.target;
    const newValue = parseFloat(sliderElement.value);
    const [cornerIndexStr, coordType] = key.split('-');
    const cornerIndex = parseInt(cornerIndexStr, 10) - 1;

    if (isNaN(newValue) || cornerIndex < 0 || cornerIndex > 3) return;

    const displayPrecision = 5;
    if (valueSpans[key]) {
        valueSpans[key].textContent = newValue.toFixed(displayPrecision);
    }

    if (currentCornersLatLng && currentCornersLatLng[cornerIndex]) {
        if (coordType === 'lat') {
            currentCornersLatLng[cornerIndex].lat = newValue;
        } else if (coordType === 'lng') {
            currentCornersLatLng[cornerIndex].lng = newValue;
        }

        raspService.updateRaspCorners(currentCornersLatLng);
        if (statusSpan) statusSpan.textContent = 'Updating overlay...';

    } else {
         console.warn(`RASP Corner Controls: Could not update internal state for ${key}`);
         if (statusSpan) statusSpan.textContent = 'Error updating state.';
    }
}

/**
 * Handles the click event for the "Log Corners" button.
 */
function handleLogCornersClick() {
    if (!currentCornersLatLng || currentCornersLatLng.length !== 4) {
        console.error("RASP Corner Controls: Cannot log corners, state is invalid.");
        alert("Corner state is invalid. Cannot log.");
        return;
    }

    const logPrecision = 5;
    const formattedCorners = currentCornersLatLng.map(corner =>
        [parseFloat(corner.lat.toFixed(logPrecision)), parseFloat(corner.lng.toFixed(logPrecision))]
    );

    const outputString = JSON.stringify(formattedCorners, null, 4);

    console.log("--- Current RASP Corner Coordinates ---");
    console.log(outputString);
    console.log("---------------------------------------");

    if (statusSpan) statusSpan.textContent = 'Corners logged to console!';
    setTimeout(() => { if (statusSpan) statusSpan.textContent = ''; }, 3000);
}

/**
 * Handles the click event for the "Reset Corners" button.
 */
function handleResetCornersClick() {
     if (!defaultCornersLatLng) {
         console.error("RASP Corner Controls: Default corners not available for reset.");
         if (statusSpan) statusSpan.textContent = 'Error: Defaults unavailable.';
         return;
     }
     console.log("Resetting corners to default.");
     currentCornersLatLng = [...defaultCornersLatLng];
     updateControlsFromState(currentCornersLatLng);
     raspService.updateRaspCorners(currentCornersLatLng);
     if (statusSpan) statusSpan.textContent = 'Corners reset to default.';
     setTimeout(() => { if (statusSpan) statusSpan.textContent = ''; }, 3000);
}


/**
 * Shows the corner control section.
 */
export function showControls() {
    if (cornerControlsContainer) {
        cornerControlsContainer.style.display = 'block';
         const serviceCorners = raspService.getCurrentRaspCorners();
         if (serviceCorners) {
            updateControlsFromState(serviceCorners);
         } else {
            console.warn("Could not get current corners from raspService on show.");
            updateControlsFromState(defaultCornersLatLng);
         }
    }
}

/**
 * Hides the corner control section.
 */
export function hideControls() {
    if (cornerControlsContainer) {
        cornerControlsContainer.style.display = 'none';
    }
}

/**
 * Disables all corner controls.
 */
export function disable() {
    if (cornerControlsContainer) cornerControlsContainer.style.display = 'none';
    Object.values(sliders).forEach(slider => { if (slider) slider.disabled = true; });
    if (logButton) logButton.disabled = true;
    if (resetButton) resetButton.disabled = true;
    if (statusSpan) statusSpan.textContent = '(Controls Disabled)';
}
// --- END OF FILE raspCornerControls.js ---