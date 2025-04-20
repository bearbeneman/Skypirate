// --- START OF FILE Tracker/js/ui.js --- (Corrected Icon Path)

// js/ui.js - Refactored for Integration

// **** Import main config & specifically getFormattedValue ****
import * as config from '../../config.js'; // Ensure path is correct (../.. relative to Tracker/js/)
import { getFormattedValue } from '../../config.js'; // Import directly for chart callbacks
// **** -------------------------------------- ****

// Ensure Leaflet and Chart are globally available
/* global L, Chart */

// --- Module Variables ---
let map = null;
let elements = {}; // <<< MODULE SCOPED elements object
let barogramChart = null;
let trackLine = null;
let gliderMarker = null;
let gliderIconInstance = null;

// Plugin for vertical line on Chart.js
const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw: (chart, args, options) => {
    // Guard against cases where chart state might not be fully ready
    // Added check for dataset visibility
    if (!chart.isDatasetVisible(0) || chart.tooltip?.getActiveElements()?.length || options.x === null || typeof options.x === 'undefined' || !chart.chartArea || !chart.scales?.x) {
      return;
    }
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    const xCoord = options.x;

    if (xCoord >= x.left && xCoord <= x.right) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xCoord, top);
        ctx.lineTo(xCoord, bottom);
        ctx.lineWidth = options.width || 1;
        ctx.strokeStyle = options.color || 'rgba(0,0,0,0.3)';
        ctx.setLineDash(options.dash || [6, 6]);
        ctx.stroke();
        ctx.restore();
    }
  },
  defaults: { x: null, color: 'rgba(0,0,0,0.3)', width: 1, dash: [4, 4] }
};
// Register the plugin globally when the module loads
// Ensure Chart object is available (loaded via script tag in HTML)
if (typeof Chart !== 'undefined') {
    // Check if already registered to avoid errors on hot reload
    if (!Chart.registry.plugins.get(verticalLinePlugin.id)) {
        try {
            Chart.register(verticalLinePlugin);
            console.log("Tracker UI: VerticalLine chart plugin registered.");
        } catch (pluginError) {
            console.error("Tracker UI: Error registering verticalLine plugin:", pluginError);
        }
    }
} else {
    console.error("Tracker UI: Chart.js global object 'Chart' not found. Barogram and plugin will not work.");
}


// --- Initialization (Called by trackerApp.js) ---
export function initializeTrackerUI(mapInstance, trackerUiElements) {
    console.log("Tracker UI: Initializing with passed elements...");
    if (!mapInstance || !trackerUiElements) { console.error("Tracker UI Init Failed: Missing map or elements."); return; }
    map = mapInstance;
    // **** Storing the passed object into the module-scoped 'elements' ****
    elements = trackerUiElements;
	// Add specific checks for the new stats panel elements
console.log("  -> Checking stored elements.statsPanelToggle:", elements.statsPanelToggle); // <-- ADD THIS
    console.log("Tracker UI Received Elements (stored in module scope):", elements);

    console.log("Tracker UI: BEFORE L.icon creation");
    if (typeof L !== 'undefined' && L.icon) {
        try {
             // ===================== ICON PATH FIX =====================
             // Ensure this uses the path from the config file
             gliderIconInstance = L.icon({
                 iconUrl: config.gliderIconUrl,           // <<< CORRECT: Uses config path
                 iconSize: config.gliderIconSize,
                 iconAnchor: config.gliderIconAnchor,
                 className: 'glider-marker-icon'
             });
             // =========================================================
            // Log the path actually being used
            console.log("Tracker UI: AFTER L.icon creation using config path:", config.gliderIconUrl, gliderIconInstance);
        } catch (iconError) {
            console.error("Tracker UI: Error creating Leaflet icon:", iconError);
            gliderIconInstance = null;
        }
    } else { console.error("Tracker UI: Leaflet 'L.icon' not found."); }

    console.log("Tracker UI: BEFORE L.marker creation");
     if (typeof L !== 'undefined' && L.marker && gliderIconInstance) {
        try {
            gliderMarker = L.marker([0, 0], { icon: gliderIconInstance, zIndexOffset: 1000, interactive: false });
            gliderMarker.isTrackerLayer = true; // Flag for potential layer management
            console.log("Tracker UI: AFTER L.marker creation", gliderMarker);
        } catch (markerError) {
             console.error("Tracker UI: Error creating Leaflet marker:", markerError);
             gliderMarker = null;
        }
     } else { console.error("Tracker UI: Cannot create Leaflet marker (L.marker missing or icon invalid)."); gliderMarker = null; }
	attachTrackerUiListeners(); // Call the function to set up listeners // <-- ADD THIS
    resetTrackerUI(); // Call reset to ensure clean initial state

    console.log("Tracker UI: Initialized.");
}

// **** ADD THIS ENTIRE FUNCTION ****
function attachTrackerUiListeners() {
    console.log("Tracker UI: Attaching listeners...");

    // *** MODIFIED: Listener for the Stats Panel Toggle (the H5 title) ***
    if (elements.statsPanelToggle && elements.statsPanel) { // Check for toggle AND panel
        elements.statsPanelToggle.removeEventListener('click', handleToggleStatsPanel); // Use the new handler name
        elements.statsPanelToggle.addEventListener('click', handleToggleStatsPanel); // Use the new handler name
        console.log("  -> Listener attached to statsPanelToggle.");
    } else {
        console.warn("Tracker UI: Could not attach listener - statsPanelToggle or statsPanel missing.");
    }
    // ... (If you have other listeners like altitudeUnitSelect, keep them here) ...
     if (elements.altitudeUnitSelect) {
         elements.altitudeUnitSelect.removeEventListener('change', updateChartAxisLabels);
         elements.altitudeUnitSelect.addEventListener('change', updateChartAxisLabels);
         console.log("  -> Listener attached to altitudeUnitSelect for chart updates.");
     }
}
// **** ADD THIS ENTIRE FUNCTION ****
function handleToggleStatsPanel() { // Renamed for clarity
    console.log("Tracker UI: Stats panel toggle clicked.");
    const panel = elements.statsPanel; // Get panel from stored elements

    if (!panel) {
        console.error("handleToggleStatsPanel: Panel element reference is missing.");
        return;
    }

    // Simple toggle of the 'expanded' class on the main panel div
    panel.classList.toggle('expanded');
    console.log(`  -> Panel expanded state toggled. Has 'expanded' class now: ${panel.classList.contains('expanded')}`);
}


// --- Reset Function (Called by trackerApp.js) ---
export function resetTrackerUI() {
    console.log("Tracker UI: Resetting - START");
    disableTrackerControls(); // Disable buttons first

    // Reset UI Element Content/Values using the 'elements' object
    if (elements.timeSlider) { elements.timeSlider.value = 0; elements.timeSlider.max = 100; } // Use elements.timeSlider (assuming ID is 'timeSlider')
    if (elements.playPauseBtn) { elements.playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>'; } // Assuming ID 'playPauseBtn'
    if (elements.speedSelect) { elements.speedSelect.value = config.defaultPlaybackSpeed.toString(); } // Assuming ID 'speedSelect'
    if (elements.autoPanCheckbox) { elements.autoPanCheckbox.checked = true; } // Assuming ID 'autoPanCheckbox'
    if (elements.infoDisplay) { elements.infoDisplay.innerHTML = 'Load IGC Track'; } // Assuming ID 'infoDisplay'
    if (elements.loadingStatus) { elements.loadingStatus.textContent = 'Load IGC Track'; } // Assuming ID 'loadingStatus'
    if (elements.keyFlightInfoGrid) { elements.keyFlightInfoGrid.innerHTML = '<p class="text-muted placeholder-key-info">Load track.</p>'; } // Assuming ID 'keyFlightInfoGrid'

    // Find the main stats container in the passed elements object if it exists
    // Note: The original code had multiple stats containers (results, groundair etc.)
    // If you have one main container ID (e.g., 'statsContent'), use that.
    // If they are separate divs, they should be reset individually by the Display module.
    // This reset focuses on elements directly managed by UI module (map, chart, controls).
    // Example if you had a single container:
    // const statsContainer = elements.statsContent;
    // if (statsContainer) statsContainer.innerHTML = '<p class="text-muted">Load track for stats.</p>';

    // Reset Live Stats (assuming IDs like 'liveSpeed', 'liveAltitude' etc.)
    if (elements.liveSpeed) elements.liveSpeed.textContent = '--';
    if (elements.liveAltitude) elements.liveAltitude.textContent = '--';
    if (elements.liveVario) elements.liveVario.textContent = '--';
    if (elements.liveFlightTime) elements.liveFlightTime.textContent = '--:--';
	
	// **** ADD THIS BLOCK ****
if (elements.statsPanel) {
    // Ensure it starts collapsed by removing the 'expanded' class
    elements.statsPanel.classList.remove('expanded');
    console.log("  -> Reset: Stats panel 'expanded' class removed.");
    // Clear the inner content
    if (elements.statsContent) {
         elements.statsContent.innerHTML = '<p class="text-muted">Load track for stats.</p>';
    }
} else {
    console.warn("  -> Reset: elements.statsPanel not found.");
}
// The toggle button doesn't need specific state reset (no .active class used)
// ***********************

    // Reset Map Elements
    console.log("Tracker UI: Resetting - Before map operations. Map exists:", !!map);
    if (map) {
        console.log("Tracker UI: Resetting - Checking trackLine. Exists:", !!trackLine, "On map:", !!(trackLine && map.hasLayer(trackLine)));
        if (trackLine && map.hasLayer(trackLine)) { map.removeLayer(trackLine); console.log("Tracker UI: Resetting - Track line removed."); }

        console.log("Tracker UI: Resetting - Checking gliderMarker. Exists:", !!gliderMarker, "On map:", !!(gliderMarker && map.hasLayer(gliderMarker)));
        if (gliderMarker && map.hasLayer(gliderMarker)) { map.removeLayer(gliderMarker); console.log("Tracker UI: Resetting - Glider marker removed."); }
    }
    trackLine = null; // Clear the reference
    // Reset marker position but keep the object
    if (gliderMarker) {
        try {
            gliderMarker.setLatLng([0,0]); // Reset position
            const iconEl = gliderMarker.getElement(); // Reset rotation
            if (iconEl?.querySelector('img')) {
                 iconEl.querySelector('img').style.transform = 'rotate(0deg)';
            }
        }
        catch (markerResetError) { console.warn("Tracker UI: Error resetting marker position/style:", markerResetError); }
    }

    // Reset Chart
    if (barogramChart) {
        try {
            barogramChart.destroy();
            console.log("Tracker UI: Barogram destroyed.");
        } catch(destroyError){
            console.error("Tracker UI: Error destroying previous chart:", destroyError);
        }
        barogramChart = null;
    }

    // Clear Canvas (using the element reference)
    const canvas = elements.barogramCanvas; // Use the stored reference
    console.log("Tracker UI Reset: Checking elements.barogramCanvas for clearing:", canvas);

    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            try {
                 ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear based on internal buffer size
                 console.log("Tracker UI Reset: Canvas cleared.");
            } catch (clearError) {
                 console.warn("Tracker UI: Error clearing barogram canvas:", clearError);
            }
        } else {
             console.warn("Tracker UI: Failed to get 2D context for barogram canvas during reset.");
        }
    } else {
        console.warn("Tracker UI Reset: elements.barogramCanvas not found, cannot clear.");
    }
    console.log("Tracker UI: Resetting - END");
}

// --- Enable/Disable Controls ---
// These functions now rely on the 'elements' object populated during initialization
export function enableTrackerControls() {
    // Enable controls only if the element reference exists in the 'elements' object
    if (elements.timeSlider) elements.timeSlider.disabled = false;
    if (elements.playPauseBtn) elements.playPauseBtn.disabled = false;
    if (elements.speedSelect) elements.speedSelect.disabled = false;
    if (elements.stepBackBtn) elements.stepBackBtn.disabled = false;
    if (elements.stepFwdBtn) elements.stepFwdBtn.disabled = false;
    if (elements.autoPanCheckbox) elements.autoPanCheckbox.disabled = false;
    // Keep unit selects enabled or disable based on requirements
    if (elements.altitudeUnitSelect) elements.altitudeUnitSelect.disabled = false;
    if (elements.speedUnitSelect) elements.speedUnitSelect.disabled = false;
    if (elements.distanceUnitSelect) elements.distanceUnitSelect.disabled = false;

    console.log("Tracker UI: Controls potentially enabled (if elements exist).");
}
export function disableTrackerControls() {
    // Disable controls only if the element reference exists
    if (elements.timeSlider) elements.timeSlider.disabled = true;
    if (elements.playPauseBtn) elements.playPauseBtn.disabled = true;
    if (elements.speedSelect) elements.speedSelect.disabled = true;
    if (elements.stepBackBtn) elements.stepBackBtn.disabled = true;
    if (elements.stepFwdBtn) elements.stepFwdBtn.disabled = true;
    if (elements.autoPanCheckbox) elements.autoPanCheckbox.disabled = true;
    // Also disable unit selects when no track is loaded? Optional.
    if (elements.altitudeUnitSelect) elements.altitudeUnitSelect.disabled = true;
    if (elements.speedUnitSelect) elements.speedUnitSelect.disabled = true;
    if (elements.distanceUnitSelect) elements.distanceUnitSelect.disabled = true;

    console.log("Tracker UI: Controls potentially disabled (if elements exist).");
}

// --- Barogram ---
export function initTrackerBarogram(labels, data) {
    // Destroy previous chart instance if it exists
    if (barogramChart) {
        try {
            barogramChart.destroy();
            console.log("Tracker UI initTrackerBarogram: Destroyed previous chart instance.");
        } catch(destroyError) {
            console.error("Tracker UI initTrackerBarogram: Error destroying previous chart:", destroyError);
        }
        barogramChart = null;
    }

    // Use the stored canvas element reference
    const canvasElement = elements.barogramCanvas;
    console.log(`Tracker UI: Attempting to use elements.barogramCanvas. Value:`, canvasElement);

    if (!canvasElement || !(canvasElement instanceof HTMLCanvasElement)) {
        console.error("initTrackerBarogram ERROR: elements.barogramCanvas is invalid or not an HTMLCanvasElement. Value:", canvasElement);
        return;
    }

    // Get context and perform validation as before...
    let ctx;
    try {
        ctx = canvasElement.getContext('2d');
        if (!ctx) { console.error("Cannot get 2D context for tracker canvas."); return; }
    } catch (e) { console.error("Error getting 2D context:", e); return; }

    // Data Validation Logging... (as before)
    if (!Array.isArray(labels) || !Array.isArray(data)) { /* ... */ return; }
    // ... other validation ...

    // Use stored element references for units
    const currentAltUnit = elements.altitudeUnitSelect?.value || 'm';
    const valueFormatter = typeof getFormattedValue === 'function' ? getFormattedValue : null;

    // Schedule Chart creation using setTimeout (as before)
    setTimeout(() => {
        // Check canvas dimensions inside timeout...
        if (canvasElement.offsetWidth === 0 || canvasElement.offsetHeight === 0) {
            console.error("Tracker UI: ERROR - Canvas dimensions are still zero inside setTimeout. Chart rendering aborted.");
            return;
        }

        try {
            // Create the chart... (using ctx, labels, data, config, currentAltUnit, valueFormatter)
            barogramChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        label: 'Altitude',
                        borderColor: config.altitudeLineColor,
                        borderWidth: 1.5,
                        tension: 0.1,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        hitRadius: 5
                    }]
                },
                options: {
                     responsive: true, maintainAspectRatio: false, animation: false,
                     scales: {
                         x: { type: 'category', title: { display: false }, ticks: { maxTicksLimit: 8, autoSkip: true, font: { size: 10 } } },
                         y: {
                             title: { display: true, text: `Alt (${currentAltUnit})` },
                             ticks: {
                                 font: { size: 10 },
                                 callback: function(value) { return valueFormatter ? valueFormatter(value, 'altitude', currentAltUnit).split(' ')[0] : value; }
                             }
                         }
                     },
                     interaction: { mode: 'index', intersect: false, axis: 'x' },
                     plugins: {
                         tooltip: {
                             enabled: true, intersect: false, mode: 'index',
                             callbacks: {
                                 label: function(context) {
                                     let label = context.dataset.label || 'Alt';
                                     if (context.parsed.y !== null) {
                                         const formattedVal = valueFormatter ? valueFormatter(context.parsed.y, 'altitude', currentAltUnit) : context.parsed.y;
                                         label += ': ' + formattedVal;
                                     } return label;
                                 }
                             }
                         },
                         legend: { display: false },
                         verticalLine: { x: null } // Initialize plot line option state
                     }
                 }
            });

            if (barogramChart) {
                console.log("Tracker UI: Chart object created successfully inside setTimeout.");
                updateChartPlotLine(0); // Update plot line for start position
            } else {
                 console.error("Tracker UI: new Chart() constructor returned null/undefined inside setTimeout!");
            }

        } catch (chartError) {
            console.error("Tracker UI: Error during 'new Chart()' constructor inside setTimeout:", chartError);
            barogramChart = null;
        }
    }, 10); // Delay execution slightly

    console.log("Tracker UI: initTrackerBarogram function finished (Chart creation scheduled).");
}


// Function to update the plot line on the chart
export function updateChartPlotLine(sliderIndex) { // Accept index hint
    if (!barogramChart || !barogramChart.options || !barogramChart.scales?.x) {
        return; // Chart not ready or doesn't have necessary components
    }

    let currentSliderIndex = sliderIndex;
    // Fallback to reading slider value if index not provided
    if (typeof currentSliderIndex !== 'number' && elements.timeSlider) { // Use elements.timeSlider
        currentSliderIndex = parseInt(elements.timeSlider.value, 10);
    } else if (typeof currentSliderIndex !== 'number') {
        console.warn("updateChartPlotLine: No valid index provided or found.");
        // Hide line if index is invalid
        if (barogramChart.options.plugins?.verticalLine?.x !== null) {
            barogramChart.options.plugins.verticalLine.x = null;
            try { barogramChart.update('none'); } catch(updateErr) { /* Ignore */ }
        }
        return;
    }

    const linePluginOptions = barogramChart.options.plugins?.verticalLine;
    if (!linePluginOptions) return; // Plugin options not available

    try {
        const tickCount = barogramChart.scales.x.ticks?.length || barogramChart.data.labels?.length || 0;
        // Validate index against available ticks/labels
        if (isNaN(currentSliderIndex) || currentSliderIndex < 0 || currentSliderIndex >= tickCount) {
             linePluginOptions.x = null; // Invalid index, hide line
        } else {
            // Get pixel position for the valid index
            const xPos = barogramChart.scales.x.getPixelForTick(currentSliderIndex);
            if (typeof xPos === 'number' && !isNaN(xPos)) {
                linePluginOptions.x = xPos; // Set line position
            } else {
                 // If getPixelForTick fails, hide the line
                 console.warn(`updateChartPlotLine: getPixelForTick(${currentSliderIndex}) returned invalid position: ${xPos}. Hiding line.`);
                 linePluginOptions.x = null;
            }
        }
        // Update the chart without animation to draw the line
        barogramChart.update('none');
    } catch (e) {
        // Catch errors during position calculation or update
        console.warn("Tracker UI: Error updating chart plot line position:", e);
        if(linePluginOptions) linePluginOptions.x = null; // Ensure line is hidden on error
        try { barogramChart.update('none'); } catch(updateErr) { /* Ignore secondary error */ }
    }
}


// --- Map Update Functions ---
export function updateTrackerMap(tData) {
    if (!map || !tData || !tData.trackPoints || tData.trackPoints.length === 0) {
        console.error("Tracker UI: Cannot update map - missing map or valid track data.");
        return;
     }
    console.log("Tracker UI: updateTrackerMap - START");

    // Ensure track points are valid LatLngs before creating polyline
    const latLngs = tData.trackPoints
        .filter(p => typeof p.latitude === 'number' && typeof p.longitude === 'number')
        .map(p => [p.latitude, p.longitude]);

    if (latLngs.length < 2) {
        console.warn("Tracker UI: Not enough valid points to draw a track line.");
        // Clear existing line if it exists
        if (trackLine && map.hasLayer(trackLine)) { map.removeLayer(trackLine); trackLine = null; }
        // Potentially add marker at single point if needed
        // ... logic for single point ...
        return; // Exit if not enough points for a line
    }
    console.log("Tracker UI: updateTrackerMap - Valid LatLngs created:", latLngs.length);

    // Remove old line if exists
    if (trackLine && map.hasLayer(trackLine)) {
        console.log("Tracker UI: updateTrackerMap - Removing existing trackLine");
        map.removeLayer(trackLine);
    }
    // Create and add new line
    try {
        trackLine = L.polyline(latLngs, { color: config.trackColor, weight: config.trackWeight });
        trackLine.isTrackerLayer = true; // Flag layer
        console.log("Tracker UI: updateTrackerMap - Polyline created, attempting add.");
        trackLine.addTo(map);
        console.log("Tracker UI: updateTrackerMap - Polyline ADDED.");
    } catch (polyError) {
         console.error("Tracker UI: updateTrackerMap - Error creating/adding polyline:", polyError);
         trackLine = null; // Ensure reference is cleared on error
    }

// ****** REMOVE OR COMMENT OUT THIS BOUNDS FITTING BLOCK ******
    /*
    // Fit bounds
    try {
        if (trackLine && trackLine.getBounds) { // Check method exists
            const bounds = trackLine.getBounds();
            if (bounds && bounds.isValid && bounds.isValid()) { // Check object and method exist
                map.fitBounds(bounds.pad(0.1)); // Fit map view to the track
                 // Apply initial zoom offset if configured
                 if (config.initialZoomOffset) {
                     const targetZoom = Math.min(Math.round(map.getZoom() + config.initialZoomOffset), map.getMaxZoom());
                     if (targetZoom > map.getZoom()) {
                         map.setZoom(targetZoom);
                     }
                 }
                 console.log("Tracker UI: updateTrackerMap - Map bounds fitted.");
            } else {
                 console.warn("Tracker UI: updateTrackerMap - Trackline bounds invalid or getBounds failed.");
                 // Fallback: Center on start point if bounds fail?
                 if(latLngs.length > 0) map.setView(latLngs[0], map.getZoom()); // Keep current zoom
            }
        } else if (!trackLine) {
            console.warn("Tracker UI: updateTrackerMap - Cannot fit bounds, trackLine not created successfully.");
        }
    } catch (boundsError) { console.warn("Tracker UI: updateTrackerMap - Fit bounds failed:", boundsError); }
	   */
    // ****** END OF REMOVED BLOCK *****

    // Add/Update Glider Marker at Start Point
    const startPoint = tData.trackPoints[0]; // Assuming the first valid point is the start
     if (gliderMarker && gliderIconInstance && startPoint?.latitude !== undefined && startPoint?.longitude !== undefined) {
         gliderMarker.setLatLng([startPoint.latitude, startPoint.longitude]);
         updateTrackerGliderMarker(startPoint.latitude, startPoint.longitude, null); // Update position and reset rotation
         if (!map.hasLayer(gliderMarker)) {
             gliderMarker.addTo(map); // Add marker if not already on map
             console.log("Tracker UI: Glider marker added/updated on map.");
         }
    } else {
         // If marker cannot be placed (e.g., no valid start point), ensure it's removed if it exists
         console.warn("Tracker UI: Cannot add/update marker. Marker:", !!gliderMarker, "Icon:", !!gliderIconInstance, "StartPoint Valid:", !!(startPoint?.latitude !== undefined));
         if (gliderMarker && map.hasLayer(gliderMarker)) {
             map.removeLayer(gliderMarker);
             console.log("Tracker UI: Removed existing glider marker due to invalid start point.");
         }
    }
    console.log("Tracker UI: updateTrackerMap - END");
}

export function updateTrackerGliderMarker(lat, lon, heading) {
     if (!map || !gliderMarker) { return; } // Ensure map and marker exist
     if (!map.hasLayer(gliderMarker)) return; // Don't update if not on map

     // Update position if valid coordinates provided
     if (typeof lat === 'number' && !isNaN(lat) && typeof lon === 'number' && !isNaN(lon)) {
         try {
             gliderMarker.setLatLng([lat, lon]);
         }
         catch (e) { console.error("Error setting marker LatLng:", e); }
     } else {
         // Log only if coordinates are explicitly invalid, not just null/undefined
         if (lat !== null && lon !== null) {
             console.warn(`Tracker UI: Invalid Lat/Lon for marker update: ${lat}, ${lon}`);
         }
     }

     // Update rotation
     // Calculate angle ensuring heading is a valid number, default to 0 if not
     const finalCssAngle = (heading !== null && typeof heading === 'number' && !isNaN(heading))
                           ? heading + config.rotationOffset
                           : 0;
     try {
         const iconEl = gliderMarker.getElement(); // Get the marker's DOM element
         if (iconEl) {
             const imgElement = iconEl.querySelector('img'); // Find the image inside
             if (imgElement) {
                 imgElement.style.transform = `rotate(${finalCssAngle}deg)`; // Apply rotation
             }
         }
     } catch (e) {
         // Avoid spamming console if element access fails repeatedly (e.g., during rapid updates)
         // console.warn("Tracker UI: Error accessing marker element for rotation:", e);
     }
}

export function panMapTo(lat, lon, animate = true) {
    if (!map || typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
         console.warn(`panMapTo: Invalid coordinates or map missing. Lat: ${lat}, Lon: ${lon}`);
         return;
    }
    try {
        const targetLatLng = L.latLng(lat, lon);
        const options = {
             animate: animate,
             duration: config.mapPanDuration,
             easeLinearity: config.mapPanEaseLinearity,
             noMoveStart: true // Prevent firing 'movestart' which could interfere with auto-pan logic
        };
        const targetZoom = config.mapFollowZoomLevel;

        // Check if zoom level needs changing or just panning
        if (targetZoom !== null && map.getZoom() !== targetZoom) {
            map.setView(targetLatLng, targetZoom, options);
        } else {
            map.panTo(targetLatLng, options);
        }
    } catch (e) {
        console.error("Error during map pan/setView:", e);
    }
}

// **** Function to update chart axis labels on unit change ****
export function updateChartAxisLabels() {
    if (!barogramChart || !barogramChart.options || !elements.altitudeUnitSelect) {
        // Chart not ready or required element missing
        return;
    }

    // Get current unit and formatter function
    const currentAltUnit = elements.altitudeUnitSelect.value || 'm';
    const valueFormatter = typeof getFormattedValue === 'function' ? getFormattedValue : null;
    if (!valueFormatter) {
        console.warn("updateChartAxisLabels: getFormattedValue function not available.");
    }

    let changed = false; // Flag to track if an update is needed

    // Update Y-axis title if scales and title exist
    if (barogramChart.options.scales?.y?.title) {
        const newTitle = `Alt (${currentAltUnit})`;
        if (barogramChart.options.scales.y.title.text !== newTitle) {
            barogramChart.options.scales.y.title.text = newTitle;
            changed = true;
        }
    }

    // Update Y-axis tick formatting if scales and ticks exist
    if (barogramChart.options.scales?.y?.ticks) {
        // Define the new callback function based on current unit
        const newTickCallback = function(value) {
            // Use formatter if available, otherwise just return value
            return valueFormatter ? valueFormatter(value, 'altitude', currentAltUnit).split(' ')[0] : value;
        };
        // Assign the new callback (Chart.js might compare function references,
        // so reassigning ensures update if the unit logic changes)
        barogramChart.options.scales.y.ticks.callback = newTickCallback;
        changed = true;
    }

     // Update tooltip formatting if plugins, tooltip, and callbacks exist
     if (barogramChart.options.plugins?.tooltip?.callbacks) {
         const newTooltipCallback = function(context) {
            let label = context.dataset.label || 'Alt';
            if (context.parsed.y !== null) {
                // Use formatter if available
                const formattedVal = valueFormatter ? valueFormatter(context.parsed.y, 'altitude', currentAltUnit) : context.parsed.y;
                label += ': ' + formattedVal;
            } return label;
        };
        barogramChart.options.plugins.tooltip.callbacks.label = newTooltipCallback;
        changed = true;
    }

    // If any label/formatter changed, update the chart
    if (changed) {
        try {
            barogramChart.update(); // Update chart to reflect changes
            console.log("Tracker UI: Updated chart axis/tooltip labels for unit:", currentAltUnit);
        } catch (e) {
            console.error("Error updating chart after label change:", e);
        }
    }
}


// **** Function to handle clearing map elements on reset ****
export function clearTrackerMap() {
    console.log("Tracker UI: clearTrackerMap called.");
    if (map) {
        // Remove track line
        if (trackLine && map.hasLayer(trackLine)) {
            map.removeLayer(trackLine);
            trackLine = null; // Clear reference
            console.log("Tracker UI: Track line removed from map.");
        }
        // Remove glider marker
        if (gliderMarker && map.hasLayer(gliderMarker)) {
            map.removeLayer(gliderMarker);
            // Don't null gliderMarker reference here, resetTrackerUI handles resetting its position
            console.log("Tracker UI: Glider marker removed from map.");
        }
    } else {
        console.warn("Tracker UI: Map instance not available for clearing.");
    }
}

// **** Function to setup slider range ****
export function setupTrackerSlider(numPoints) {
    console.log(`Tracker UI: setupTrackerSlider called with ${numPoints} points.`);
    if (elements.timeSlider) {
        const maxIndex = Math.max(0, numPoints - 1); // Ensure max is at least 0
        elements.timeSlider.max = maxIndex;
        elements.timeSlider.value = 0; // Reset slider position to start
        console.log(`Tracker UI: Slider range set: min=0, max=${maxIndex}, value=0`);
    } else {
        console.warn("Tracker UI: Cannot setup slider - 'timeSlider' element not found in 'elements' object.");
    }
}

// --- END OF FILE Tracker/js/ui.js ---