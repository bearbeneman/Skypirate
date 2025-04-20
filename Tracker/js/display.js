// --- START OF FILE Tracker/js/display.js --- (Using internal elements var - COMPLETE)

// js/display.js - Refactored for Integration

import { getFormattedValue } from '../../config.js'; // Adjust path if needed
import {
    formatDuration, formatDistance, formatAltitude, formatSpeed,
    formatVario, formatDurationDetailed, formatTimestamp
} from './formatters.js';

// --- Module Variables ---
let elements = {}; // Stores references to TRACKER UI elements (Set by setDisplayUIElements)
let trackDataRef = null; // Stores reference to trackData object

// --- Initialization ---
export function setDisplayUIElements(trackerElements, trackDataObjRef) {
    console.log("Tracker Display: Setting UI Elements using internal 'elements' variable.");
    console.log("Tracker Display Received Elements:", trackerElements);
    elements = trackerElements; // Store references INTERNALLY
    trackDataRef = trackDataObjRef;
    // Verify right after setting
    console.log("Internal 'elements' check - keyFlightInfoGrid:", elements?.keyFlightInfoGrid);
    console.log("Internal 'elements' check - statsContent:", elements?.statsContent);
    console.log("Internal 'elements' check - keyStatsGridContainer:", elements?.keyStatsGridContainer); // Add check for this too
}

// --- Display Functions ---

/** Updates the main real-time info display in the tracker footer */
export function updateMainInfoDisplay(data) { // REMOVED elementsRef
    if (!elements?.infoDisplay || !data) return; // USE internal elements
    if (typeof getFormattedValue !== 'function') {
        console.error("updateMainInfoDisplay: getFormattedValue was not imported correctly!");
        elements.infoDisplay.innerHTML = "Import Error"; // USE internal elements
        return;
    }
    const altUnit = elements.altitudeUnitSelect?.value || 'm'; // USE internal elements
    const speedUnit = elements.speedUnitSelect?.value || 'km/h'; // USE internal elements
    const timeStr = formatTimestamp(data.timestamp);
    const altStr = formatAltitude(data.altitude, altUnit, getFormattedValue);
    const speedStr = formatSpeed(data.speed, speedUnit, getFormattedValue);
    elements.infoDisplay.innerHTML = `Time: ${timeStr} | Alt: ${altStr} | Speed: ${speedStr}`; // USE internal elements
}

/** Updates the new Live Stats Bar */
export function updateLiveStatsDisplay(data, trackDataForTime) { // REMOVED elementsRef
    const currentTrackData = trackDataForTime || trackDataRef;
    // USE internal elements for check
    if (!elements?.liveStatsBar || !data || !currentTrackData?.trackPoints?.[0]?.epoch) {
        // USE internal elements for update
        if(elements.liveSpeed) elements.liveSpeed.textContent = '--';
        if(elements.liveAltitude) elements.liveAltitude.textContent = '--';
        if(elements.liveVario) elements.liveVario.textContent = '--';
        if(elements.liveFlightTime) elements.liveFlightTime.textContent = '--:--';
        return;
    }
    if (typeof getFormattedValue !== 'function') { /* ... error handling ... */ return; }

    // USE internal elements for units
    const altUnit = elements.altitudeUnitSelect?.value || 'm';
    const speedUnit = elements.speedUnitSelect?.value || 'km/h';
    const speed = formatSpeed(data.speed, speedUnit, getFormattedValue);
    const altitude = formatAltitude(data.altitude, altUnit, getFormattedValue);
    const vario = formatVario(data.vario, getFormattedValue); // Vario formatting in config
    let elapsedTimeStr = '--:--';
    const elapsedMillis = data.epoch - currentTrackData.trackPoints[0].epoch;
    if (elapsedMillis >= 0) {
        const totalSeconds = Math.floor(elapsedMillis / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        elapsedTimeStr = `${String(minutes).padStart(1,'0')}:${String(seconds).padStart(2,'0')}`;
    }
    // USE internal elements for update
    if (elements.liveSpeed) elements.liveSpeed.textContent = speed !== 'N/A' ? speed : '--';
    if (elements.liveAltitude) elements.liveAltitude.textContent = altitude !== 'N/A' ? altitude : '--';
    if (elements.liveVario) elements.liveVario.textContent = vario !== 'N/A' ? vario : '--';
    if (elements.liveFlightTime) elements.liveFlightTime.textContent = elapsedTimeStr;
}


/** Displays the key flight info in the tracker's header grid */
// ------------ AFTER (Replace the above with this) ------------
/** Displays the key flight info in the NEW tracker map OVERLAY */
/** Displays the key flight info in the NEW tracker map OVERLAY */
export function displayKeyFlightInfo(headers = {}, stats = {}) {
    // --->>> TARGET THE OVERLAY CONTAINER <<<---
    const overlayContainer = elements.keyInfoOverlayContainer; // Use the reference for the overlay

    if (!overlayContainer) {
        console.error("Tracker Display (displayKeyFlightInfo): Internal 'elements.keyInfoOverlayContainer' for map overlay is missing!");
        return;
    }
    if (typeof getFormattedValue !== 'function') {
         console.error("displayKeyFlightInfo: getFormattedValue function not found!");
         overlayContainer.innerHTML = '<p class="text-danger">Error</p>';
         return;
    }

    // Get unit/data (no change needed here)
    const distUnit = elements.distanceUnitSelect?.value || 'km';
    const date = headers.Date || 'N/A';
    const deviceType = headers['Logger Type'] || headers['GPS Receiver'] || headers['Glider Type'] || 'N/A';
    const distance = stats?.totalDistance !== undefined ? formatDistance(stats.totalDistance, distUnit, getFormattedValue) : 'N/A';
    const duration = stats?.duration !== undefined ? formatDuration(stats.duration) : 'N/A';

    // Log the correct target
    console.log("Tracker Display: Setting Key Flight Info into OVERLAY (#trackerMapOverlayInfo)");
    overlayContainer.innerHTML = ''; // Clear previous overlay content

    const createItem = (iconClass, value, label, title = '') => {
        const itemDiv = document.createElement('div');
        // --->>> USE SIMPLER CLASS, REMOVE col-* <<<---
        itemDiv.className = 'key-info-item'; // Class suitable for flex layout in the overlay

        const h5 = document.createElement('h5');
        if (title && title !== 'N/A') h5.title = title;
        const icon = document.createElement('i');
        icon.className = iconClass;
        h5.appendChild(icon);
        h5.appendChild(document.createTextNode(` ${value}`)); // Added space
        const span = document.createElement('span');
        span.textContent = label;
        itemDiv.appendChild(h5);
        itemDiv.appendChild(span);
        return itemDiv;
    };

    // Append items to the overlay container
    overlayContainer.appendChild(createItem('fa-regular fa-calendar-days', date, 'Date'));
    overlayContainer.appendChild(createItem('fa-solid fa-sliders', deviceType, 'Device', deviceType));
    overlayContainer.appendChild(createItem('fa-solid fa-route', distance, 'Distance'));
    overlayContainer.appendChild(createItem('fa-regular fa-clock', duration, 'Duration'));
} // <-- End of the new displayKeyFlightInfo function
// ------------ END OF REPLACEMENT ------------


/** Clears all stats display areas and shows placeholders */
export function clearStatsDisplay() {
     const placeholder = '<p class="text-muted">Load an IGC file.</p>';
     // USE internal elements
     const statsContent = elements.statsContent;
     if (statsContent) statsContent.innerHTML = placeholder;
     else console.warn("Tracker Display (clearStatsDisplay): Internal 'elements.statsContent' not found.");

     // USE internal elements
     if (elements.liveSpeed) elements.liveSpeed.textContent = '--';
     if (elements.liveAltitude) elements.liveAltitude.textContent = '--';
     if (elements.liveVario) elements.liveVario.textContent = '--';
     if (elements.liveFlightTime) elements.liveFlightTime.textContent = '--:--';
}

/** Orchestrator for displaying all stats sections */
export function displayAllStats(stats) { // REMOVED elementsRef
    // USE internal elements
    if (!stats || !elements) { clearStatsDisplay(); return; }
    if (typeof getFormattedValue !== 'function') { /* ... error handling ... */ return; }

    // USE internal elements
    const statsContainer = elements.statsContent;
    const keyStatsTarget = elements.keyStatsGridContainer; // Get the specific target for key stats

    if (!keyStatsTarget) {
        console.error("Tracker Display (displayAllStats): Internal 'elements.keyStatsGridContainer' (keyFlightInfoGrid) is missing!");
        // Decide if you want to proceed without key stats or stop
    }
    if (!statsContainer) {
        console.error("Tracker Display (displayAllStats): Internal 'elements.statsContent' element is missing!");
        return; // Cannot display main stats
    }

    console.log("Tracker Display (displayAllStats): Found internal elements.statsContent. Clearing and generating HTML.");
    let combinedHTML = ''; // Build a single HTML string

    // Generate HTML for each section, passing internal 'elements' for unit access
    // NOTE: generateKeyStatsHTML now returns HTML string, not appended directly
    const keyStatsHTML = generateKeyStatsHTML(stats, elements);
    const resultsHTML = generateResultsStatsHTML(stats, elements);
    const groundAirHTML = generateGroundAirTimeHTML(stats); // Doesn't need elements
    const performanceHTML = generatePerformanceStatsHTML(stats, elements);
    const detailedHTML = generateDetailedStatsHTML(stats, elements);

    // Populate the Key Stats Grid directly
    if (keyStatsTarget && keyStatsHTML) {
        keyStatsTarget.innerHTML = keyStatsHTML;
        // Apply classes directly if needed (though createItem might handle this)
        keyStatsTarget.className = 'stats-section-content row stats-grid'; // Ensure correct classes
        console.log("Tracker Display (displayAllStats): Populated Key Stats Grid.");
    } else if (!keyStatsTarget) {
         console.error("Tracker Display (displayAllStats): Cannot populate key stats grid - target missing.");
    }


    // Combine HTML for the main stats content area (#trackerStatsContent)
    // Add titles and separators manually here
    combinedHTML += `<div class="stats-section">
                        <h5 class="stats-section-title"><i class="fa-solid fa-square-poll-vertical"></i> Results</h5>
                        <div class="stats-section-content">${resultsHTML || '<p class="text-muted">Error generating results.</p>'}</div>
                        <hr class="stats-hr">
                     </div>`;
    combinedHTML += `<div class="stats-section">
                        <h5 class="stats-section-title"><i class="fa-solid fa-plane-departure"></i> Ground/Air Time</h5>
                        <div class="stats-section-content">${groundAirHTML || '<p class="text-muted">Error generating time stats.</p>'}</div>
                        <hr class="stats-hr">
                     </div>`;
    combinedHTML += `<div class="stats-section">
                        <h5 class="stats-section-title"><i class="fa-solid fa-jet-fighter-up"></i> Performance</h5>
                        <div class="stats-section-content">${performanceHTML || '<p class="text-muted">Error generating performance stats.</p>'}</div>
                        <hr class="stats-hr">
                     </div>`;
     combinedHTML += `<div class="stats-section">
                        <h5 class="stats-section-title"><i class="fa-solid fa-table-list"></i> Detailed Statistics</h5>
                        <div class="stats-section-content">${detailedHTML || '<p class="text-muted">Error generating detailed stats.</p>'}</div>
                        
                     </div>`;

    // Set the innerHTML of the main container ONCE
    statsContainer.innerHTML = combinedHTML;
    console.log("Tracker Display (displayAllStats): Populated Main Stats Content.");

}

// --- Helper to create a stats section ---
// **** THIS FUNCTION IS NO LONGER USED ****
// displayAllStats now builds the HTML structure directly.
// function createStatsSection(title, contentHTML, iconClass, keyStatsGridTarget = null) { ... }


// --- Individual Stats Section HTML Generators ---
// **** MODIFIED: Ensure these return HTML strings and use passed 'elements' ****
function generateResultsStatsHTML(stats, elements) { // Pass internal elements
    const altUnit = elements.altitudeUnitSelect?.value || 'm';
    const speedUnit = elements.speedUnitSelect?.value || 'km/h';
    const distUnit = elements.distanceUnitSelect?.value || 'km';
    const fmt = getFormattedValue;
    if (typeof fmt !== 'function') return '<p class="text-danger">Import Error (fmt)</p>';
    // Return only the list items as a string
    return `
        <div class="stat-item"><span>Duration:</span> <strong>${formatDuration(stats.duration)}</strong></div>
        <div class="stat-item"><span>Distance:</span> <strong>${formatDistance(stats.totalDistance, distUnit, fmt)}</strong></div>
        <div class="stat-item"><span>Min Altitude:</span> <strong>${formatAltitude(stats.minAltitude, altUnit, fmt)}</strong></div>
        <div class="stat-item"><span>Max Altitude:</span> <strong>${formatAltitude(stats.maxAltitude, altUnit, fmt)}</strong></div>
        <div class="stat-item"><span>Avg Speed:</span> <strong>${formatSpeed(stats.averageSpeed, speedUnit, fmt)}</strong></div>
        <div class="stat-item"><span>Max Speed:</span> <strong>${formatSpeed(stats.maxSpeed, speedUnit, fmt)}</strong></div>
        <div class="stat-item"><span>Altitude Gain:</span> <strong>+${formatAltitude(stats.altitudeGain, altUnit, fmt)}</strong></div>
        <div class="stat-item"><span>Altitude Loss:</span> <strong>-${formatAltitude(stats.altitudeLoss, altUnit, fmt)}</strong></div>
    `; // NO surrounding div/title here
}

function generateGroundAirTimeHTML(stats) { // No change needed in content
    const total = stats.flightTime + stats.groundTime;
    const flightPercent = total > 0 ? ((stats.flightTime / total) * 100).toFixed(1) : 0;
    const groundPercent = total > 0 ? ((stats.groundTime / total) * 100).toFixed(1) : 0;
    // Return only the list items/progress bars as a string
    return `
        <div class="stat-item progress-stat"><span><i class="fa-solid fa-plane-up text-success"></i> Flight Time:</span><strong>${formatDurationDetailed(stats.flightTime)} (${flightPercent}%)</strong></div>
        <div class="progress-bar-container"><div class="progress-bar flight" style="width: ${flightPercent}%"></div></div>
        <div class="stat-item progress-stat"><span><i class="fa-solid fa-person-hiking text-warning"></i> Ground Time:</span><strong>${formatDurationDetailed(stats.groundTime)} (${groundPercent}%)</strong></div>
        <div class="progress-bar-container"><div class="progress-bar ground" style="width: ${groundPercent}%"></div></div>
    `; // NO surrounding div/title here
}

function generatePerformanceStatsHTML(stats, elements) { // Pass internal elements
     const fmt = getFormattedValue;
     if (typeof fmt !== 'function') return '<p class="text-danger">Import Error (fmt)</p>';
     // Return only the list items as a string
     return `
        <div class="stat-item"><span>Max Climb Rate:</span> <strong>${formatVario(stats.maxClimbRate, fmt)}</strong></div>
        <div class="stat-item"><span>Max Sink Rate:</span> <strong>${formatVario(stats.maxSinkRate, fmt)}</strong></div>
        <div class="stat-item"><span>Time Circling (est.):</span> <strong>${formatDurationDetailed(stats.timeCircling)}</strong></div>
    `; // NO surrounding div/title here
}

function generateKeyStatsHTML(stats, elements) { // Pass internal elements
    const altUnit = elements.altitudeUnitSelect?.value || 'm';
    const speedUnit = elements.speedUnitSelect?.value || 'km/h';
    const distUnit = elements.distanceUnitSelect?.value || 'km';
    const fmt = getFormattedValue;
    if (typeof fmt !== 'function') return '<p class="text-danger">Import Error (fmt)</p>';
    // Return the grid items directly as a string
    return `
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-route"></i> ${formatDistance(stats.totalDistance, distUnit, fmt)}</h5><span>Distance</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-regular fa-clock"></i> ${formatDuration(stats.duration)}</h5><span>Duration</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-gauge-high"></i> ${formatSpeed(stats.averageSpeed, speedUnit, fmt)}</h5><span>Avg Speed</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-wind"></i> ${formatSpeed(stats.maxSpeed, speedUnit, fmt)}</h5><span>Max Speed</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-mountain-sun"></i> ${formatAltitude(stats.maxAltitude, altUnit, fmt)}</h5><span>Max Altitude</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-person-falling-burst"></i> ${formatAltitude(stats.minAltitude, altUnit, fmt)}</h5><span>Min Altitude</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-arrow-up-long text-success"></i> +${formatAltitude(stats.altitudeGain, altUnit, fmt)}</h5><span>Altitude Gain</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-arrow-down-long text-danger"></i> -${formatAltitude(stats.altitudeLoss, altUnit, fmt)}</h5><span>Altitude Loss</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-jet-fighter-up text-success"></i> ${formatVario(stats.maxClimbRate, fmt)}</h5><span>Max Climb</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-angles-down text-danger"></i> ${formatVario(stats.maxSinkRate, fmt)}</h5><span>Max Sink</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-plane-departure"></i> ${formatDurationDetailed(stats.flightTime)}</h5><span>Flight Time</span></div>
        <div class="col-6 col-md-4 col-lg-3 key-stat-item"><h5><i class="fa-solid fa-arrows-turn-to-dots"></i> ${formatDurationDetailed(stats.timeCircling)}</h5><span>Time Circling</span></div>
    `; // NO surrounding div/title here
}

function generateDetailedStatsHTML(stats, elements) { // Pass internal elements
    const altUnit = elements.altitudeUnitSelect?.value || 'm';
    const speedUnit = elements.speedUnitSelect?.value || 'km/h';
    const distUnit = elements.distanceUnitSelect?.value || 'km';
    const fmt = getFormattedValue;
    if (typeof fmt !== 'function') return '<p class="text-danger">Import Error (fmt)</p>';
    // Return the table directly as a string
    return `<table class="stats-table"><tbody>
                <tr><td>GPS Tracklog Length:</td><td>${formatDistance(stats.totalDistance, distUnit, fmt)}</td></tr>
                <tr><td>Point to point Distance:</td><td>${formatDistance(stats.pointToPointDistance, distUnit, fmt)}</td></tr>
                <tr><td>Open Distance (Start-Furthest):</td><td>${formatDistance(stats.distanceToFurthest, distUnit, fmt)}</td></tr>
                <tr><td>Free Distance (S-F-E approx.):</td><td>${formatDistance(stats.freeDistanceApproximation, distUnit, fmt)}</td></tr>
                <tr><td>Total Duration:</td><td>${formatDuration(stats.duration)}</td></tr>
                <tr><td>Flight Time:</td><td>${formatDurationDetailed(stats.flightTime)}</td></tr>
                <tr><td>Ground Time:</td><td>${formatDurationDetailed(stats.groundTime)}</td></tr>
                <tr><td>Min Altitude:</td><td>${formatAltitude(stats.minAltitude, altUnit, fmt)}</td></tr>
                <tr><td>Max Altitude:</td><td>${formatAltitude(stats.maxAltitude, altUnit, fmt)}</td></tr>
                <tr><td>Altitude Gain:</td><td>+${formatAltitude(stats.altitudeGain, altUnit, fmt)}</td></tr>
                <tr><td>Altitude Loss:</td><td>-${formatAltitude(stats.altitudeLoss, altUnit, fmt)}</td></tr>
                <tr><td>Avg Speed (Flight):</td><td>${formatSpeed(stats.averageSpeed, speedUnit, fmt)}</td></tr>
                <tr><td>Max Speed:</td><td>${formatSpeed(stats.maxSpeed, speedUnit, fmt)}</td></tr>
                <tr><td>Max Climb Rate:</td><td>${formatVario(stats.maxClimbRate, fmt)}</td></tr>
                <tr><td>Max Sink Rate:</td><td>${formatVario(stats.maxSinkRate, fmt)}</td></tr>
                <tr><td>Time Spent Circling (est.):</td><td>${formatDurationDetailed(stats.timeCircling)}</td></tr>
            </tbody></table>`; // NO surrounding div/title here
}

// --- END OF FILE Tracker/js/display.js ---