// --- START OF FILE Tracker/trackerApp.js --- (Modified with Speed Control Debugging Logs)

// trackerApp.js - Main Application Logic for IGC Tracker Module

// **** Corrected Config Import ****
import * as config from '../config.js'; // Import main config
// **** --------------------------- ****

import * as UI from './js/ui.js';
import { parseIGC } from './js/igcParser.js';
import { calculateFlightStats, calculateTimeBetweenPoints } from './js/flightStats.js';
// **** MODIFIED: Assuming 'getInterpolatedData' is the correct name in interpolation.js ****
import { getInterpolatedData } from './js/interpolation.js';
import * as Display from './js/display.js';
import * as Playback from './js/playback.js';
import { formatTimestamp } from './js/formatters.js';

/* global L, Chart */

// --- Module State ---
// **** Keep using 'trackData' as the main variable name as per your original code ****
let trackData = { headers: {}, trackPoints: [], stats: null, fileName: null };
// The 'state' object here holds shared state, Playback module manages its relevant parts
let state = {
    isPlaying: false,
    currentSliderIndex: 0,
    currentPlaybackTime: null,
    playbackSpeed: config.defaultPlaybackSpeed,
    isAutoPanEnabled: true, // Default auto-pan state
    // State managed by trackerApp only:
    currentVisualHeading: null,
    timeBetweenPoints: 1000,
    userInteractingWithMap: false,
    programmaticPanTimeout: null
};

let mainMapInstance = null;
let trackerUiElements = {}; // Stores the object received from main.js
let mainAppCallbacks = {};

// --- Initialization Function (Exported) ---
export function initializeTracker(mapInstance, uiElements, appCallbacks) { // uiElements is the object FROM main.js
    // LOG 1: Confirm entry
    console.log("--- TRACKER MODULE: initializeTracker() called ---");
    if (!mapInstance || !uiElements || !appCallbacks) {
        console.error("Tracker Module Init Failed: Missing required arguments (mapInstance, uiElements, appCallbacks). Aborting."); return;
    }
    mainMapInstance = mapInstance;
    trackerUiElements = uiElements; // <<< Assignment of the received object happens here
    mainAppCallbacks = appCallbacks;

    // **** ADD LOGS **** IMMEDIATE Check AFTER assignment
	    console.log("TRACKERAPP INIT (LOG A): Assigned received uiElements to internal trackerUiElements.");
    console.log("  -> (LOG B) CHECKING internal trackerUiElements.playPauseBtn:", trackerUiElements?.playPauseBtn);
    // ... other checks ...
    console.log("  -> (LOG Step3-Check) CHECKING internal trackerUiElements.speedSelect:", trackerUiElements?.speedSelect);
    // ****** ADD THIS LINE ******
    console.log("  -> CHECKING internal trackerUiElements.exitTrackerBtn:", trackerUiElements?.exitTrackerBtn);
    // ****************************
    console.log("TRACKERAPP INIT (LOG A): Assigned received uiElements to internal trackerUiElements.");
    console.log("  -> (LOG B) CHECKING internal trackerUiElements.playPauseBtn:", trackerUiElements?.playPauseBtn);
    console.log("  -> (LOG C) CHECKING internal trackerUiElements.timeSlider:", trackerUiElements?.timeSlider);
    console.log("  -> (LOG D) CHECKING internal trackerUiElements.stepBackBtn:", trackerUiElements?.stepBackBtn);
    console.log("  -> (LOG E) CHECKING internal trackerUiElements.stepFwdBtn:", trackerUiElements?.stepFwdBtn);
    // **** STEP 3 LOGGING: Verify SpeedSelect was received ****
    console.log("  -> (LOG Step3-Check) CHECKING internal trackerUiElements.speedSelect:", trackerUiElements?.speedSelect); // <<< ADDED THIS LOG
    // ***********************************************************

    // Initialize UI first
    if (UI?.initializeTrackerUI) { UI.initializeTrackerUI(mainMapInstance, trackerUiElements); console.log("Tracker Module: UI Initialized."); }
    else { console.error("Tracker Module: UI.initializeTrackerUI function not found."); return; }

    // --- Initialize Playback Module ---
    // Create the initial state object specifically for Playback using current defaults/config
    // **** Ensure speedSelect element is checked before accessing its value ****
    const initialSpeedValue = trackerUiElements?.speedSelect?.value;
    const initialSpeed = initialSpeedValue ? parseFloat(initialSpeedValue) : config.defaultPlaybackSpeed;
    const initialAutoPan = trackerUiElements?.autoPanCheckbox?.checked ?? true;

    const initialPlaybackState = {
        isPlaying: false,
        currentSliderIndex: 0,
        currentPlaybackTime: null,
        playbackSpeed: isNaN(initialSpeed) ? config.defaultPlaybackSpeed : initialSpeed, // Use default if parse fails
        isAutoPanEnabled: initialAutoPan,
    };

    // **** ADD LOG **** Check JUST BEFORE creating playbackUiElements
    console.log("TRACKERAPP INIT (LOG F): About to create playbackUiElements. Checking source values FROM internal trackerUiElements:");
    console.log("  -> (LOG G) Source trackerUiElements.playPauseBtn:", trackerUiElements?.playPauseBtn);
    console.log("  -> (LOG H) Source trackerUiElements.timeSlider:", trackerUiElements?.timeSlider);
    // ******************

    // *** Construct the object to pass ONLY the elements Playback needs ***
    const playbackUiElements = {
        // Keys here MUST match how playback.js accesses elements (e.g., elements.trackerPlayPauseBtn)
        trackerPlayPauseBtn: trackerUiElements.playPauseBtn,
        trackerTimeSlider: trackerUiElements.timeSlider
    };

    // **** ADD LOG **** Check the object JUST CREATED to be passed
    console.log("TRACKERAPP INIT (LOG I): Object created to BE PASSED to Playback.initializePlayback:", playbackUiElements);
    console.log("  -> (LOG J) Contained trackerPlayPauseBtn:", playbackUiElements?.trackerPlayPauseBtn);
    console.log("  -> (LOG K) Contained trackerTimeSlider:", playbackUiElements?.trackerTimeSlider);
    // ******************

    // Pass the correct arguments to initializePlayback
    if (Playback?.initializePlayback) {
        console.log("TRACKERAPP INIT (LOG L): Calling Playback.initializePlayback with specific playbackUiElements...");
        // Pass initialPlaybackState - playback.js should initialize its internal state from this
        Playback.initializePlayback(
            initialPlaybackState,
            playbackUiElements,
            updateTrackerDisplayUI,
            getInterpolatedDataWrapper
        );
        // Update the shared state object based on the initial state used by playback
        Object.assign(state, initialPlaybackState);
        console.log("Tracker Module: Playback Initialized. Shared state synced:", state); // LOG M (Updated)
    }
    else { console.error("Tracker Module: Playback.initializePlayback function not found."); }
    // --- End Initialize Playback Module ---


    // --- Setup Display Module (Pass necessary elements) ---
    if (Display?.setDisplayUIElements) {
        console.log("TRACKERAPP INIT (LOG N): Setting up Display module elements...");
        const displayElements = {
            infoDisplay: trackerUiElements.infoDisplay,
            keyFlightInfoGrid: trackerUiElements.keyFlightInfoGrid,
			keyInfoOverlayContainer: trackerUiElements.trackerMapOverlayInfo, // <<< ADD THIS LINE

            liveStatsBar: trackerUiElements.liveStatsBar,
            liveSpeed: trackerUiElements.liveSpeed,
            liveAltitude: trackerUiElements.liveAltitude,
            liveVario: trackerUiElements.liveVario,
            liveFlightTime: trackerUiElements.liveFlightTime,
            statsContent: trackerUiElements.statsContent,
            altitudeUnitSelect: trackerUiElements.altitudeUnitSelect,
            speedUnitSelect: trackerUiElements.speedUnitSelect,
            distanceUnitSelect: trackerUiElements.distanceUnitSelect,
            statsResultsContainer: trackerUiElements.statsResultsContainer,
            statsGroundAirContainer: trackerUiElements.statsGroundAirContainer,
            statsPerformanceContainer: trackerUiElements.statsPerformanceContainer,
            keyStatsGridContainer: trackerUiElements.keyFlightInfoGrid,
            detailedStatsTableContainer: trackerUiElements.detailedStatsTableContainer
        };
        Display.setDisplayUIElements(displayElements, trackData);
        console.log("Tracker Module: Display Elements Set."); // LOG O
    } else { console.error("Tracker Module: Display.setDisplayUIElements function not found."); }
    // --- End Setup Display Module ---

    attachTrackerListeners(); // Attach listeners AFTER ALL modules are initialized
    updateButtonStates(); // Set initial disabled state
    console.log("Tracker Module: Initialization Complete."); // LOG P
}

// --- Attach Listeners Specific to Tracker UI ---
function attachTrackerListeners() {
    // LOG Q: Attach Entry
    console.log("--- TRACKERAPP: Attaching tracker UI event listeners... ---");

    // **** ADD LOGS **** Check elements JUST BEFORE attaching listeners
    console.log("TRACKERAPP LISTENERS (LOG R): Checking internal trackerUiElements references before attaching:");
    console.log("  -> (LOG S) Element trackerUiElements.playPauseBtn:", trackerUiElements?.playPauseBtn);
    console.log("  -> (LOG T) Element trackerUiElements.timeSlider:", trackerUiElements?.timeSlider);
    console.log("  -> (LOG U) Element trackerUiElements.stepBackBtn:", trackerUiElements?.stepBackBtn);
    console.log("  -> (LOG V) Element trackerUiElements.stepFwdBtn:", trackerUiElements?.stepFwdBtn);
    // **** STEP 4 LOGGING: Verify SpeedSelect exists before attaching listener ****
    console.log("  -> (LOG Step4-Check) Element trackerUiElements.speedSelect:", trackerUiElements?.speedSelect); // <<< ADDED THIS LOG
    // **************************************************************************


    // Helper to add listener if element exists
    const addListener = (element, event, handler, elementIdentifier = 'Unknown Element') => {
        if (element) {
            try {
                element.removeEventListener(event, handler); // Remove first to prevent duplicates
                element.addEventListener(event, handler);
                // **** STEP 4 LOGGING: Confirm listener ATTACHED ****
                console.log(`TRACKERAPP LISTENERS: Listener for '${event}' ATTACHED to ${elementIdentifier}.`); // <<< MODIFIED Log for Success
            } catch (e) {
                 console.error(`TRACKERAPP LISTENERS: Error attaching listener for '${event}' to ${elementIdentifier}:`, e);
            }
        } else {
            console.warn(`TRACKERAPP LISTENERS: Listener for ${event} NOT attached, element is missing for ${elementIdentifier}.`);
        }
    };

    // Use the helper for clarity and logging
    addListener(trackerUiElements.fileInput, 'change', handleFileLoad, 'fileInput');
    addListener(trackerUiElements.timeSlider, 'input', handleSliderInput, 'timeSlider (input)');
    addListener(trackerUiElements.timeSlider, 'change', handleSliderChangeFinal, 'timeSlider (change)');
	
	// ****** ADD THIS ENTIRE FUNCTION ******
function handleExitTracker() {
    console.log("Tracker: Exit Tracker button clicked via handleExitTracker.");
    // Use the callback provided by main.js to handle exiting the mode
    if (mainAppCallbacks?.exitTrackerMode) {
        console.log("Calling mainAppCallbacks.exitTrackerMode().");
        mainAppCallbacks.exitTrackerMode(); // This should trigger resetTracker via main.js
    } else {
        // Fallback if the callback is missing (should not happen in normal flow)
        console.error("Tracker: exitTrackerMode callback is missing! Calling resetTracker directly as fallback.");
        resetTracker();
    }
}

    // Playback Controls - Use inline arrow functions to call Playback module correctly
    addListener(trackerUiElements.playPauseBtn, 'click', () => {
        console.log(">>> Play/Pause Button CLICKED (Wrapper Called)"); // LOG W
        if (!trackData?.trackPoints?.length) { console.warn("TrackerApp: Play/Pause ignored - no track data points."); return; }
        if (Playback?.togglePlayback) Playback.togglePlayback(trackData); // Pass current trackData
        else console.error("Playback.togglePlayback function not available!");
        updateButtonStates(); // Update icon immediately
    }, 'playPauseBtn');

    addListener(trackerUiElements.stepBackBtn, 'click', () => {
        console.log(">>> Step Back Button CLICKED (Wrapper Called)"); // LOG X
         if (!trackData?.trackPoints?.length) { console.warn("TrackerApp: Step Back ignored - no track data points."); return; }
         if (Playback?.stepBack) Playback.stepBack(trackData); // Pass current trackData
         else console.error("Playback.stepBack function not available!");
        updateButtonStates();
    }, 'stepBackBtn');


    addListener(trackerUiElements.stepFwdBtn, 'click', () => {
        console.log(">>> Step Forward Button CLICKED (Wrapper Called)"); // LOG Y
         if (!trackData?.trackPoints?.length) { console.warn("TrackerApp: Step Forward ignored - no track data points."); return; }
         if (Playback?.stepForward) Playback.stepForward(trackData); // Pass current trackData
         else console.error("Playback.stepForward function not available!");
        updateButtonStates();
    }, 'stepFwdBtn');


    // Other Controls
    // **** STEP 4 LOGGING: Ensure this specific call is present ****
    addListener(trackerUiElements.speedSelect, 'change', handleSpeedChange, 'speedSelect'); // <<< ENSURE THIS LINE EXISTS
    // **************************************************************
    addListener(trackerUiElements.autoPanCheckbox, 'change', handleAutoPanChange, 'autoPanCheckbox');

    // Unit Selects
    addListener(trackerUiElements.altitudeUnitSelect, 'change', handleTrackerUnitChange, 'altitudeUnitSelect');
    addListener(trackerUiElements.speedUnitSelect, 'change', handleTrackerUnitChange, 'speedUnitSelect');
    addListener(trackerUiElements.distanceUnitSelect, 'change', handleTrackerUnitChange, 'distanceUnitSelect');

      // ****** ADD THIS LISTENER ******
     addListener(trackerUiElements.exitTrackerBtn, 'click', handleExitTracker, 'exitTrackerBtn');

    console.log("--- TRACKERAPP: Finished attaching tracker UI event listeners. ---"); // LOG Z
}


// --- Map Listeners Specific to Tracker Mode ---
function attachMapListeners() {
    if (mainMapInstance) {
        console.log("Tracker Module: Attaching map interaction listeners...");
        mainMapInstance.off('dragstart', handleMapInteractionStart);
        mainMapInstance.off('zoomstart', handleMapInteractionStart);
        mainMapInstance.off('moveend', handleMapMoveEnd);
        mainMapInstance.on('dragstart', handleMapInteractionStart);
        mainMapInstance.on('zoomstart', handleMapInteractionStart);
        mainMapInstance.on('moveend', handleMapMoveEnd);
        console.log("Tracker Module: Map interaction listeners attached.");
    } else {
        console.warn("Tracker Module: Map instance not available for attaching listeners.");
    }
}
function removeMapListeners() {
     if (mainMapInstance) {
        mainMapInstance.off('dragstart', handleMapInteractionStart);
        mainMapInstance.off('zoomstart', handleMapInteractionStart);
        mainMapInstance.off('moveend', handleMapMoveEnd);
        console.log("Tracker Module: Map interaction listeners removed.");
    }
}

// --- Event Handlers ---
function handleFileLoad(event) {
    console.log("Tracker: handleFileLoad starting...");
    const file = event.target.files[0];
    if (!file) { console.log("Tracker: No file selected."); return; }
	// ****** ADD THIS BLOCK (Check/Remove Active Class) ******
    if (document.body.classList.contains('tracker-active')) {
        console.log("handleFileLoad: Removing previous tracker state before loading new file.");
        document.body.classList.remove('tracker-active');
        if (trackerUiElements.exitTrackerBtn) trackerUiElements.exitTrackerBtn.style.display = 'none';
        // We don't call full resetTracker here, just clean the class/button
        // Subsequent code will reset UI/Playback
    }
    // ******************************************************


    console.log("Tracker: Resetting UI for new file load...");
    if (UI?.resetTrackerUI) UI.resetTrackerUI();
    else console.error("UI.resetTrackerUI not found");

    console.log("Tracker: Stopping playback before loading new file...");
     if (Playback?.stopPlayback) Playback.stopPlayback();
     else console.error("Playback.stopPlayback function not available!");

    updateButtonStates(); // Will disable as trackData is likely empty/reset

    if (trackerUiElements.loadingStatus) trackerUiElements.loadingStatus.textContent = `Loading ${file.name}...`;
    console.log(`Tracker: Reading file: ${file.name}`);
    const reader = new FileReader();

    reader.onload = (e) => {
        console.log("Tracker: File read complete.");
        try {
            processIGCContent(e.target.result, file.name);
        } catch (error) {
            console.error("Tracker: Error processing IGC content:", error);
            alert(`Error processing IGC file: ${error.message}`);
            if (trackerUiElements.loadingStatus) trackerUiElements.loadingStatus.textContent = `Error: ${error.message}`;
			 // ****** ADD THIS BLOCK (Error Cleanup) ******
             document.body.classList.remove('tracker-active'); // Ensure class removed on error
             if (trackerUiElements.exitTrackerBtn) trackerUiElements.exitTrackerBtn.style.display = 'none';
             // *******************************************
             if (UI?.resetTrackerUI) UI.resetTrackerUI();
             updateButtonStates(); // Ensure buttons are disabled after error
             if(mainAppCallbacks?.exitTrackerMode) mainAppCallbacks.exitTrackerMode();
        } finally {
            if (trackerUiElements.fileInput) trackerUiElements.fileInput.value = null;
        }
    };
    reader.onerror = (e) => {
        console.error("Tracker: FileReader error:", e);
        alert("Error reading file.");
        if (trackerUiElements.loadingStatus) trackerUiElements.loadingStatus.textContent = 'Error reading file.';
		// ****** ADD THIS BLOCK (Error Cleanup) ******
         document.body.classList.remove('tracker-active'); // Ensure class removed on error
         if (trackerUiElements.exitTrackerBtn) trackerUiElements.exitTrackerBtn.style.display = 'none';
         // *******************************************
        if (UI?.resetTrackerUI) UI.resetTrackerUI();
        updateButtonStates(); // Ensure buttons are disabled after error
        if (trackerUiElements.fileInput) trackerUiElements.fileInput.value = null;
        if(mainAppCallbacks?.exitTrackerMode) mainAppCallbacks.exitTrackerMode();
    };
    reader.readAsText(file);
    console.log("Tracker: File reader started (readAsText).");
}


function handleSliderInput(event) {
     if (!trackData?.trackPoints?.length) return;
     const isUserInitiated = event?.isTrusted ?? false;

    if (Playback?.isPlaying && Playback.isPlaying() && isUserInitiated) {
        console.log("Tracker: User interaction with slider during playback, stopping."); // LOG Z-AA
        if(Playback?.stopPlayback) Playback.stopPlayback();
        else console.error("Playback.stopPlayback function not available!");
        updateButtonStates();
    }
    const slider = trackerUiElements.timeSlider;
    if (!slider) { console.warn("Slider 'input' event, but slider element not found."); return; }
    const newIndex = parseInt(slider.value, 10);

    if (isNaN(newIndex) || newIndex < 0 || newIndex >= trackData.trackPoints.length) { return; }
    const newTime = trackData.trackPoints[newIndex]?.epoch;
    if (newTime === undefined) { return; }

    // Update shared state DIRECTLY (Playback module should read this)
    state.currentSliderIndex = newIndex;
    state.currentPlaybackTime = newTime;

    const interpolatedData = getInterpolatedDataWrapper(newTime);
    if (interpolatedData) {
        updateTrackerDisplayUI(interpolatedData, false); // Don't pan while scrubbing
    }
}

function handleSliderChangeFinal(event) {
    console.log(">>> Slider CHANGE Event (Final Value - Wrapper Called)"); // LOG Z-AB
    if (!trackData?.trackPoints?.length) return;

    const slider = trackerUiElements.timeSlider;
    if (!slider) { console.warn("Slider 'change' event, but slider element not found."); return; }
    const finalIndex = parseInt(slider.value, 10);

    if (isNaN(finalIndex) || finalIndex < 0 || finalIndex >= trackData.trackPoints.length) {
        console.warn(`Slider 'change' event with invalid final index: ${finalIndex}`);
        return;
    }
    const finalTime = trackData.trackPoints[finalIndex]?.epoch;
    if (finalTime === undefined) { console.warn(`Slider 'change', epoch not found for final index ${finalIndex}`); return; }

    console.log(`Tracker: Slider final position - Index: ${finalIndex}, Time: ${finalTime}`);

    if(Playback?.stopPlayback) Playback.stopPlayback();
    else console.error("Playback.stopPlayback function not available!");
    updateButtonStates();

    // Update Playback module's internal state using its dedicated function
    if (Playback?.updateSliderPosition) {
        Playback.updateSliderPosition(finalIndex, finalTime);
        console.log("Tracker: Updated Playback module's internal slider position."); // LOG Z-AC
    } else {
         console.error("Playback.updateSliderPosition function not available! Cannot sync playback state.");
         // Backup: update shared state directly
         state.currentSliderIndex = finalIndex;
         state.currentPlaybackTime = finalTime;
    }

    const interpolatedData = getInterpolatedDataWrapper(finalTime);
    if (interpolatedData) {
        const shouldPanFinal = state.isAutoPanEnabled;
        updateTrackerDisplayUI(interpolatedData, shouldPanFinal);
    }
}

// **** STEP 4 LOGGING: Added logs inside the handler ****
function handleSpeedChange(event) {
    // LOG Z-T: Handler Entry
    console.log(">>> Speed Select CHANGE Event Handler Called (handleSpeedChange)");
    const speedSelect = trackerUiElements.speedSelect;
    if (!speedSelect) {
        console.warn("Speed change event fired, but select element (trackerUiElements.speedSelect) not found within handler."); // LOG Z-U
        return;
    }

    const newSpeedValue = speedSelect.value;
    console.log(`  -> (LOG Z-V) Raw value from select: "${newSpeedValue}" (type: ${typeof newSpeedValue})`);

    let newSpeed = parseFloat(newSpeedValue); // Use let for potential modification
    console.log(`  -> (LOG Z-W) Parsed speed value: ${newSpeed} (type: ${typeof newSpeed})`);

    if (isNaN(newSpeed) || newSpeed <= 0) {
         console.warn(`  -> (LOG Z-X) Invalid speed value after parsing: ${newSpeed}. Using default: ${config.defaultPlaybackSpeed}`);
         newSpeed = config.defaultPlaybackSpeed; // Fallback to default
    }

    console.log(`  -> (LOG Z-Y) Attempting to update playback speed to: ${newSpeed}`);

    // Update Playback module's speed state
    if (Playback?.updateSpeed) {
        Playback.updateSpeed(newSpeed);
        console.log("  -> (LOG Z-Z) Called Playback.updateSpeed successfully.");
    } else {
        console.error("  -> (LOG Z-AA) Playback.updateSpeed function not available!");
        // Fallback: Update shared state directly (less ideal if Playback manages speed)
        state.playbackSpeed = newSpeed;
        console.warn("  -> Updated shared state.playbackSpeed as fallback.");
    }
}
// *******************************************************


function handleAutoPanChange(event) {
    const checkbox = event.target;
    if (!checkbox) return;
    const isEnabled = checkbox.checked;
    console.log(`Tracker: Auto-pan toggled via checkbox. New state: ${isEnabled}`);

    // Update shared state (which Playback should read)
    state.isAutoPanEnabled = isEnabled;

    // If Playback needs explicit notification:
    // if (Playback?.setAutoPan) Playback.setAutoPan(isEnabled);

    state.userInteractingWithMap = false; // Reset user interaction flag when checkbox is used

    if (isEnabled) {
        const timeToPan = state.currentPlaybackTime ?? trackData?.trackPoints[0]?.epoch ?? null;
        if (timeToPan !== null) {
            console.log(`Tracker: Auto-pan enabled, panning to current time: ${timeToPan}`);
            const currentData = getInterpolatedDataWrapper(timeToPan);
            if (currentData && UI?.panMapTo) {
                setProgrammaticPanTimeout();
                console.log("Tracker: Programmatic pan initiated via checkbox toggle.");
                UI.panMapTo(currentData.latitude, currentData.longitude, true);
            } else {
                 if (!currentData) console.warn("Tracker: Cannot pan, failed to get current data for auto-pan toggle.");
                 if (!UI?.panMapTo) console.error("Tracker UI.panMapTo not found");
            }
        } else {
             console.warn("Tracker: Auto-pan enabled, but could not get current time from state or track data.");
        }
    }
}

function handleMapInteractionStart(e) {
    if (state.programmaticPanTimeout !== null) {
         console.log("Tracker: Map interaction detected, but likely programmatic pan - ignoring.");
         return;
    }
    const isCurrentlyPlaying = state.isPlaying;
    const isAutoPanCurrentlyEnabled = state.isAutoPanEnabled;

    if (isCurrentlyPlaying && isAutoPanCurrentlyEnabled) {
        console.log(`Tracker: User map interaction (${e.type}) detected during playback with auto-pan ON. Disabling auto-pan.`);
        state.userInteractingWithMap = true;
        state.isAutoPanEnabled = false; // Update shared state
        if(trackerUiElements.autoPanCheckbox) trackerUiElements.autoPanCheckbox.checked = false;
        // If Playback needs explicit notification:
        // if (Playback?.setAutoPan) Playback.setAutoPan(false);
    }
}

function handleMapMoveEnd() {
    if (state.programmaticPanTimeout !== null) {
         clearTimeout(state.programmaticPanTimeout);
         state.programmaticPanTimeout = null;
    }
}

function setProgrammaticPanTimeout() {
    clearTimeout(state.programmaticPanTimeout);
    const timeoutDuration = (config.mapPanDuration || 0.5) * 1000 + 150;
    state.programmaticPanTimeout = setTimeout(() => {
        state.programmaticPanTimeout = null;
    }, timeoutDuration);
}

function handleTrackerUnitChange(event) {
    const selectElement = event.target;
    if (!selectElement) return;
    const newUnit = selectElement.value;
    const unitType = selectElement.id;
    console.log(`Tracker Unit Change: Element ID '${unitType}' changed to value '${newUnit}'`);
    refreshTrackerUIDisplays();
}

function handleCloseTracker() {
     console.log("Tracker: Close button clicked.");
     if (mainAppCallbacks?.exitTrackerMode) {
         mainAppCallbacks.exitTrackerMode();
     } else {
         console.error("Tracker: exitTrackerMode callback is missing! Cannot close tracker properly.");
         resetTracker();
     }
}


// --- Refresh function for tracker UI ---
function refreshTrackerUIDisplays() {
    console.log(`--- refreshTrackerUIDisplays CALLED ---`); // LOG Z-AD
    if (!trackData?.trackPoints?.length) {
        console.warn("refreshTrackerUIDisplays called but no track data points exist. Aborting refresh.");
        if(Display?.updateMainInfoDisplay) Display.updateMainInfoDisplay(null, trackerUiElements);
        if(Display?.updateLiveStatsDisplay) Display.updateLiveStatsDisplay(null, trackerUiElements, trackData);
        return;
    }

    if (!Display?.displayAllStats || !Display?.displayKeyFlightInfo || !Display?.updateMainInfoDisplay || !Display?.updateLiveStatsDisplay) {
        console.error("refreshTrackerUIDisplays: One or more required Display module functions not found. Cannot refresh all elements.");
        return;
    }

    Display.displayAllStats(trackData.stats, trackerUiElements);
    Display.displayKeyFlightInfo(trackData.headers, trackData.stats, trackerUiElements);

    const timeToRefresh = state.currentPlaybackTime ?? trackData?.trackPoints[0]?.epoch ?? null;
    console.log(`Refreshing displays based on time: ${timeToRefresh}`); // LOG Z-AE

    if (timeToRefresh !== null) {
        const currentInterpolatedData = getInterpolatedDataWrapper(timeToRefresh);
        if (currentInterpolatedData) {
            Display.updateMainInfoDisplay(currentInterpolatedData, trackerUiElements);
            Display.updateLiveStatsDisplay(currentInterpolatedData, trackerUiElements, trackData);
            if (UI?.updateTrackerGliderMarker) {
                 UI.updateTrackerGliderMarker(currentInterpolatedData.latitude, currentInterpolatedData.longitude, currentInterpolatedData.heading);
            } else console.error("UI.updateTrackerGliderMarker not found");
        } else {
             console.warn(`refreshTrackerUIDisplays: No interpolated data found for time ${timeToRefresh}. Clearing live displays.`);
             Display.updateMainInfoDisplay(null, trackerUiElements);
             Display.updateLiveStatsDisplay(null, trackerUiElements, trackData);
        }
    } else {
         console.warn("refreshTrackerUIDisplays: Could not determine a valid time to refresh. Clearing live displays.");
         Display.updateMainInfoDisplay(null, trackerUiElements);
         Display.updateLiveStatsDisplay(null, trackerUiElements, trackData);
    }

    const indexForPlotLine = state.currentSliderIndex;
    if (UI?.updateChartPlotLine) {
         UI.updateChartPlotLine(indexForPlotLine);
    } else { console.error("UI.updateChartPlotLine not found"); }

    console.log("--- refreshTrackerUIDisplays FINISHED ---"); // LOG Z-AF
 }


// --- Process IGC Content ---
function processIGCContent(content, sourceName) {
    // NOTE: Error handling is now in reader.onload's try/catch
    console.log("Tracker: processIGCContent starting..."); // LOG Z-AG
    if (trackerUiElements.loadingStatus) trackerUiElements.loadingStatus.textContent = `Parsing ${sourceName}...`;

    if (!parseIGC || !calculateFlightStats || !calculateTimeBetweenPoints) {
        throw new Error("Core processing functions (parseIGC, calculateFlightStats, calculateTimeBetweenPoints) are not available.");
    }

    const parsedData = parseIGC(content);
    if (!parsedData?.trackPoints || parsedData.trackPoints.length < 2) {
        throw new Error("Parsed IGC has insufficient valid data points (< 2).");
    }

    console.log(`Tracker: Parsing successful. Found ${parsedData.trackPoints.length} track points. Calculating stats...`);
    if (trackerUiElements.loadingStatus) trackerUiElements.loadingStatus.textContent = `Calculating stats...`;
    const flightStats = calculateFlightStats(parsedData.trackPoints);
    console.log("Tracker: Stats calculation complete.");

    trackData = { headers: parsedData.headers, trackPoints: parsedData.trackPoints, stats: flightStats, fileName: sourceName };
    console.log("Tracker: Module-scoped 'trackData' updated successfully.");

    // --- Reset State for New Track ---
    console.log("Tracker: Resetting state for new track..."); // LOG Z-AH
    if (Playback?.stopPlayback) Playback.stopPlayback();
    else console.warn("Playback.stopPlayback not found during state reset.");

    state.timeBetweenPoints = calculateTimeBetweenPoints(trackData.trackPoints);
    state.isPlaying = false;
    state.currentSliderIndex = 0;
    state.currentPlaybackTime = trackData.trackPoints[0]?.epoch ?? null;
    state.playbackSpeed = parseFloat(trackerUiElements.speedSelect?.value) || config.defaultPlaybackSpeed;
    state.currentVisualHeading = null;
    state.isAutoPanEnabled = true;
    state.userInteractingWithMap = false;
    clearTimeout(state.programmaticPanTimeout); state.programmaticPanTimeout = null;
    if (trackerUiElements.autoPanCheckbox) trackerUiElements.autoPanCheckbox.checked = true;

    // Reset Playback module's internal state via its functions
    if (Playback?.updateSliderPosition) Playback.updateSliderPosition(state.currentSliderIndex, state.currentPlaybackTime);
    else console.warn("Playback.updateSliderPosition not found during state reset.");
    if (Playback?.updateSpeed) Playback.updateSpeed(state.playbackSpeed);
    else console.warn("Playback.updateSpeed not found during state reset.");
     if (Playback?.setAutoPan) Playback.setAutoPan(state.isAutoPanEnabled);
     else console.warn("Playback.setAutoPan not found during state reset.");

    console.log("Tracker: Shared state and Playback state reset for new file."); // LOG Z-AI
    // --- End Reset State ---

    displayTrackerDataAndStats(trackData);
    console.log("Tracker: Data displayed.");
    attachMapListeners();
    updateButtonStates(); // Enable buttons
    if (trackerUiElements.loadingStatus) trackerUiElements.loadingStatus.textContent = `Loaded: ${sourceName}`;
	  // ****** ADD THIS BLOCK (Activate Tracker UI State) ******
    document.body.classList.add('tracker-active');
    if (trackerUiElements.exitTrackerBtn) {
        trackerUiElements.exitTrackerBtn.style.display = 'inline-block'; // Show the button
		 trackerUiElements.exitTrackerBtn.disabled = false; // <<< ADD THIS LINE BACK TO ENABLE
        console.log("Tracker Mode Activated: Added 'tracker-active' class and showed Exit button.");
    } else {
        console.warn("processIGCContent: exitTrackerBtn not found in elements, cannot show it.");
    }
    // ********************************************************
    if(mainAppCallbacks?.enterTrackerMode) mainAppCallbacks.enterTrackerMode();
    else console.error("Cannot enter tracker mode - callback missing!");
    console.log("Tracker: processIGCContent finished successfully."); // LOG Z-AJ
}


// --- Display Orchestration ---
function displayTrackerDataAndStats(tData) {
    if (!tData?.trackPoints || !tData.trackPoints.length || !UI || !Display) {
        console.error("displayTrackerDataAndStats: Missing data or required modules (UI, Display).");
        return;
    }
    console.log("Tracker: displayTrackerDataAndStats starting...");
    const timestamps = tData.trackPoints.map(p => formatTimestamp(p.timestamp));
    const altitudes = tData.trackPoints.map(p => p.pressureAlt ?? p.gpsAlt ?? 0);

    // Setup UI elements
    if (UI.setupTrackerSlider) UI.setupTrackerSlider(tData.trackPoints.length);
    if (UI.initTrackerBarogram) UI.initTrackerBarogram(timestamps, altitudes);

    // Refresh static displays
    if (Display.displayKeyFlightInfo) Display.displayKeyFlightInfo(tData.headers, tData.stats, state);
    if (Display.displayAllStats) Display.displayAllStats(tData.stats, state);

    // --- Update Map & Add FlyTo ---
    if (UI.updateTrackerMap) {
        UI.updateTrackerMap(tData); // This adds track, marker, and likely calls fitBounds
        console.log("Tracker: UI.updateTrackerMap completed.");

       // ****** FLYTO ANIMATION - KEEP/ADJUST THIS ******
    const startPoint = tData.trackPoints[0];
    // Use the configured follow zoom level, OR a specific default zoom for track loading (e.g., 15)
    const targetLoadZoom = config.mapFollowZoomLevel ?? 15; // <<< ADJUST '15' AS NEEDED

    if (startPoint?.latitude !== undefined && startPoint?.longitude !== undefined && mainMapInstance) {
        console.log(`[Display] Flying map to track start: Lat ${startPoint.latitude.toFixed(5)}, Lon ${startPoint.longitude.toFixed(5)}, Zoom: ${targetLoadZoom}`);
        mainMapInstance.flyTo([startPoint.latitude, startPoint.longitude], targetLoadZoom, {
            duration: 1.5 // Animation duration (seconds)
        });
    } else {
        console.warn("[Display] Could not fly to start point: Invalid start coordinates or map instance missing.");
        // Optional Fallback: If flyTo fails, maybe just setView without animation?
        // if (mainMapInstance && startPoint?.latitude !== undefined) {
        //    mainMapInstance.setView([startPoint.latitude, startPoint.longitude], targetLoadZoom);
        // }
    }
    // ********************************************

    } else {
        console.error("UI.updateTrackerMap not found");
    }
    // --- End Map Update ---

    // Set slider value
    if(trackerUiElements.timeSlider) trackerUiElements.timeSlider.value = state.currentSliderIndex;

    // Update dynamic displays for the initial point (without panning again)
    const initialTime = state.currentPlaybackTime;
    if (initialTime !== null) {
        const initialData = getInterpolatedDataWrapper(initialTime);
         if(initialData) {
             updateTrackerDisplayUI(initialData, false); // Update display values, pan=false
             if (UI.updateChartPlotLine) UI.updateChartPlotLine(state.currentSliderIndex);
         } else if (tData.trackPoints.length > 0) {
             // Fallback...
             const firstPoint = tData.trackPoints[0];
             updateTrackerDisplayUI({ /* ... */ }, false);
             if (UI.updateChartPlotLine) UI.updateChartPlotLine(state.currentSliderIndex);
         }
    }
    console.log("Tracker: displayTrackerDataAndStats function finished.");
} // End displayTrackerDataAndStats

// --- Wrapper for Interpolation ---
 function getInterpolatedDataWrapper(targetEpochTime) {
     if (!trackData || !trackData.trackPoints || trackData.trackPoints.length === 0 || targetEpochTime === null || targetEpochTime === undefined) {
         return null;
     }
     const indexHint = state.currentSliderIndex;
     const result = getInterpolatedData(targetEpochTime, trackData.trackPoints, indexHint);
     return result;
}

// --- Update Display Callback for Playback ---
function updateTrackerDisplayUI(data, shouldPan = true) {
    if (!data || !UI || !Display) return;

    // Update shared state based on data received from playback
    if (typeof data.epoch === 'number') state.currentPlaybackTime = data.epoch;
    // Assuming Playback module updates state.currentSliderIndex directly or via updateSliderPosition call

    if (UI.updateTrackerGliderMarker) UI.updateTrackerGliderMarker(data.latitude, data.longitude, data.heading);
    else console.error("UI.updateTrackerGliderMarker not found");
    if (Display.updateMainInfoDisplay) Display.updateMainInfoDisplay(data, trackerUiElements);
    else console.error("Display.updateMainInfoDisplay not found");
    if (Display.updateLiveStatsDisplay) Display.updateLiveStatsDisplay(data, trackData); // NO trackerUiElements here
else console.error("Display.updateLiveStatsDisplay not found");
    if (UI.updateChartPlotLine) UI.updateChartPlotLine(state.currentSliderIndex); // Use current index from state
    else console.error("UI.updateChartPlotLine not found");

    state.currentVisualHeading = data.heading; // Update visual heading

    if (shouldPan && state.isAutoPanEnabled && !state.userInteractingWithMap && state.programmaticPanTimeout === null && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        setProgrammaticPanTimeout();
        if(UI?.panMapTo) UI.panMapTo(data.latitude, data.longitude, true);
        else console.error("UI.panMapTo not found")
    }
}


// **** Utility to Enable/Disable Buttons and Sync Play Icon ****
function updateButtonStates() {
    const hasData = !!trackData?.trackPoints?.length && trackData.trackPoints.length > 1;
    const isActive = document.body.classList.contains('tracker-active');
    console.log(`TrackerApp: Updating button states. Has data: ${hasData}, Is Active: ${isActive}`);

    const elementsToToggle = [
        trackerUiElements.playPauseBtn,
        trackerUiElements.stepBackBtn,
        trackerUiElements.stepFwdBtn,
        trackerUiElements.timeSlider,
        trackerUiElements.speedSelect,
        trackerUiElements.autoPanCheckbox,
        trackerUiElements.altitudeUnitSelect,
        trackerUiElements.speedUnitSelect,
        trackerUiElements.distanceUnitSelect,
    ];

    // Disable/Enable core controls based only on data presence
    elementsToToggle.forEach(el => { if (el) el.disabled = !hasData; });

    // Handle specific states based on data presence
    if (!hasData) {
        // Reset Play/Pause icon and Slider if no data
        if (trackerUiElements.playPauseBtn) trackerUiElements.playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        if (trackerUiElements.timeSlider) { trackerUiElements.timeSlider.value = 0; trackerUiElements.timeSlider.max = 100; }
    } else {
        // Update Play/Pause icon and Slider max if data exists
        const isCurrentlyPlaying = Playback?.isPlaying ? Playback.isPlaying() : false;
        if (trackerUiElements.playPauseBtn) {
             trackerUiElements.playPauseBtn.innerHTML = isCurrentlyPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
        }
        if (trackerUiElements.timeSlider) {
             const maxIndex = Math.max(0, trackData.trackPoints.length - 1);
             if (parseInt(trackerUiElements.timeSlider.max) !== maxIndex) {
                 trackerUiElements.timeSlider.max = maxIndex;
             }
        }
    }

    // File input should always be enabled
     if (trackerUiElements.fileInput) trackerUiElements.fileInput.disabled = false;

    // Removed closeTrackerButton logic

    // ****** UPDATED LOGIC for Exit Button (Always Enabled When Visible) ******
    if (trackerUiElements.exitTrackerBtn) {
        if (isActive) { // Show only if tracker mode is active
            trackerUiElements.exitTrackerBtn.style.display = 'inline-block';
            // No need to explicitly enable here, rely on default state
        } else { // Hide if not active
            trackerUiElements.exitTrackerBtn.style.display = 'none';
            // No need to explicitly disable here, rely on default state or reset
        }
    }
    // *********************************************************************
}


// --- Reset Function (Called by main.js via exitTrackerMode callback) ---
export function resetTracker() {
    console.log("--- TRACKER MODULE: Resetting... ---"); // LOG Z-AQ
    if (Playback?.stopPlayback) Playback.stopPlayback();
    else console.warn("Playback.stopPlayback not found during reset!");
	// ****** ADD THIS BLOCK (Deactivate Tracker UI State) ******
    document.body.classList.remove('tracker-active');
    if (trackerUiElements.exitTrackerBtn) {
        trackerUiElements.exitTrackerBtn.style.display = 'none';
        trackerUiElements.exitTrackerBtn.disabled = true; // Ensure disabled too
        console.log("Tracker Reset: Removed 'tracker-active' class and hid Exit button.");
    }
    // ******************************************************

    if (UI?.resetTrackerUI) UI.resetTrackerUI();
    else console.error("UI.resetTrackerUI not found");

    trackData = { headers: {}, trackPoints: [], stats: null, fileName: null };
    console.log("Tracker Reset: Cleared internal trackData object.");

    // Reset shared state properties
    state.isPlaying = false;
    state.currentSliderIndex = 0;
    state.currentPlaybackTime = null;
    state.playbackSpeed = config.defaultPlaybackSpeed;
    state.currentVisualHeading = null;
    state.isAutoPanEnabled = true;
    state.userInteractingWithMap = false;
    clearTimeout(state.programmaticPanTimeout); state.programmaticPanTimeout = null;
    console.log("Tracker Reset: Reset shared state object."); // LOG Z-AR

    // Reset Playback module's internal state via its functions
    if (Playback?.updateSliderPosition) Playback.updateSliderPosition(0, null);
    else console.warn("Playback.updateSliderPosition not found during reset.");
    if (Playback?.updateSpeed) Playback.updateSpeed(config.defaultPlaybackSpeed);
    else console.warn("Playback.updateSpeed not found during reset.");
     if (Playback?.setAutoPan) Playback.setAutoPan(true);
     else console.warn("Playback.setAutoPan not found during reset.");

    if (trackerUiElements.autoPanCheckbox) trackerUiElements.autoPanCheckbox.checked = true;
    if (trackerUiElements.trackerLoadingStatus) trackerUiElements.trackerLoadingStatus.textContent = 'Load IGC Track';

    removeMapListeners();
    updateButtonStates(); // Ensure buttons are disabled after reset
    if (UI?.clearTrackerMap) UI.clearTrackerMap();
    else console.warn("UI.clearTrackerMap not found during reset.");

    console.log("--- TRACKER MODULE: Reset complete. ---"); // LOG Z-AS
}

// --- END OF FILE Tracker/trackerApp.js ---