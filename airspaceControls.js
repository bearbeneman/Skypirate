// --- START OF FILE airspaceControls.js ---
import * as config from './config.js';
import * as state from './state.js';
import * as airspaceService from './airspaceService.js';
import { debounce } from './utils.js'; // Assuming debounce is in utils

// --- UI Element References ---
let generalAirspaceToggle = null;
let notamToggle = null;
let altitudeFilterInput = null;
let altitudeValueDisplay = null;
let airspaceStatusDisplay = null; // Optional: For showing counts or errors

/** Initialize airspace UI controls */
export function initializeControls() {
    generalAirspaceToggle = document.getElementById('airspace-general-toggle'); // Needs to be added to HTML
    notamToggle = document.getElementById('airspace-notam-toggle');     // Needs to be added to HTML
    altitudeFilterInput = document.getElementById('airspace-altitude-filter'); // Needs to be added to HTML
    altitudeValueDisplay = document.getElementById('airspace-altitude-value'); // Needs to be added to HTML
    airspaceStatusDisplay = document.getElementById('airspace-status'); // Optional, needs adding

    if (!generalAirspaceToggle || !notamToggle || !altitudeFilterInput || !altitudeValueDisplay) {
        console.warn("Airspace UI controls not fully found. Check HTML IDs.");
        return;
    }

    // --- Set Initial State ---
    generalAirspaceToggle.checked = state.isGeneralAirspaceVisible;
    notamToggle.checked = state.isNotamsVisible;
    altitudeFilterInput.value = state.airspaceAltitudeFilter;
    altitudeValueDisplay.textContent = `${state.airspaceAltitudeFilter} ${config.AIRSPACE_ALTITUDE_UNIT}`;

    // --- Add Event Listeners ---
    generalAirspaceToggle.addEventListener('change', handleGeneralToggle);
    notamToggle.addEventListener('change', handleNotamToggle);

    // Use debounce for the altitude slider/input to avoid rapid updates
    const debouncedAltitudeUpdate = debounce(handleAltitudeChange, 300);
    altitudeFilterInput.addEventListener('input', () => {
         // Update display immediately
         altitudeValueDisplay.textContent = `${altitudeFilterInput.value} ${config.AIRSPACE_ALTITUDE_UNIT}`;
         // Debounce the actual filtering logic
         debouncedAltitudeUpdate();
    });

    console.log("Airspace Controls Initialized.");
}

function handleGeneralToggle(event) {
    const isVisible = event.target.checked;
    console.log(`General Airspace Toggle: ${isVisible}`);
    state.setGeneralAirspaceVisible(isVisible);
    airspaceService.updateGeneralAirspaceVisibility(); // Trigger update in service
    // updateStatus(); // Update status display if used
}

function handleNotamToggle(event) {
    const isVisible = event.target.checked;
    console.log(`NOTAM Toggle: ${isVisible}`);
    state.setNotamsVisible(isVisible);
    airspaceService.updateNotamVisibility(); // Trigger update in service
    // updateStatus(); // Update status display if used
}

function handleAltitudeChange() {
    const altitude = altitudeFilterInput.value;
    console.log(`Altitude Filter Changed: ${altitude}`);
    state.setAirspaceAltitudeFilter(altitude);
    // Trigger updates for both airspace types as altitude affects both
    airspaceService.updateGeneralAirspaceVisibility();
    airspaceService.updateNotamVisibility();
    // updateStatus(); // Update status display if used
}

// Optional function to update a status area
/*
function updateStatus() {
    if (!airspaceStatusDisplay) return;
    // Example: airspaceStatusDisplay.textContent = `Altitude: ${state.airspaceAltitudeFilter} ft`;
}
*/

/** Disable controls if something goes wrong */
export function disableControls() {
     if(generalAirspaceToggle) generalAirspaceToggle.disabled = true;
     if(notamToggle) notamToggle.disabled = true;
     if(altitudeFilterInput) altitudeFilterInput.disabled = true;
     // if(airspaceStatusDisplay) airspaceStatusDisplay.textContent = "Airspace unavailable";
}

// --- END OF FILE airspaceControls.js ---