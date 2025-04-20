// --- START OF FILE Tracker/js/playback.js ---

// js/playback.js - Refactored for Integration

// --- Module Variables ---
let state = {};
let elements = {};
let updateDisplayCallback = null;
let getInterpolatedDataCallback = null;
let animationFrameId = null;
let lastFrameTimestamp = null;

// --- Initialization ---
export function initializePlayback(initialState, uiElements, updateDisplayFn, getInterpolatedDataFn) {
    console.log("Tracker Playback: Initializing..."); // LOG: Start Init
    if (!initialState || !uiElements || !updateDisplayFn || !getInterpolatedDataFn) {
        console.error("Tracker Playback Init FAILED: Missing required arguments.", { initialState, uiElements, updateDisplayFn, getInterpolatedDataFn }); // LOG: Init Fail Detail
        return;
    }
    state = initialState;
    elements = uiElements;
    updateDisplayCallback = updateDisplayFn;
    getInterpolatedDataCallback = getInterpolatedDataFn;
    // Log the crucial elements received
    console.log("Tracker Playback Init: Received elements. Time Slider:", elements?.trackerTimeSlider, "Play/Pause Btn:", elements?.trackerPlayPauseBtn);
    stopPlayback(); // Ensure starting state is stopped
    console.log("Tracker Playback: Initialized successfully with state:", state); // LOG: Init Success
}

// --- Playback Control Functions ---
export function togglePlayback(trackData) {
    console.log("Tracker Playback: togglePlayback called."); // LOG: Toggle Entry
    // LOG: Check trackData received by togglePlayback
    console.log("  -> togglePlayback received trackData:", trackData ? `Object with ${trackData?.trackPoints?.length ?? 'NO'} points` : 'null/undefined');

    if (!trackData?.trackPoints || trackData.trackPoints.length < 2) {
        console.warn("Tracker Playback togglePlayback: Stopping/Preventing play - Invalid or insufficient trackData."); // LOG: Toggle Invalid Data
        stopPlayback();
        return;
    }
    if (state.isPlaying) {
        console.log("  -> togglePlayback: Was playing, calling stopPlayback."); // LOG: Toggle Stop
        stopPlayback();
    }
    else {
        console.log("  -> togglePlayback: Was stopped, calling startPlayback."); // LOG: Toggle Start
        startPlayback(trackData);
    }
}

export function startPlayback(trackData) {
     console.log("Tracker Playback: startPlayback called."); // LOG: Start Entry
     // LOG: Check trackData received by startPlayback VERY EARLY
     console.log("  -> startPlayback received trackData:", trackData ? `Object with ${trackData?.trackPoints?.length ?? 'NO'} points` : 'null/undefined');

     // Check trackData validity first
     if (!trackData?.trackPoints || trackData.trackPoints.length < 2) {
         console.warn("Tracker Playback startPlayback: Returning early - Invalid or insufficient trackData."); // LOG: Start Invalid Data
         // Ensure state remains stopped if data is bad
         stopPlayback(); // Make sure it's visually stopped if attempt failed
         return;
     }
     // Check if already playing
     if (state.isPlaying) {
         console.warn("Tracker Playback startPlayback: Returning early - Already playing."); // LOG: Start Already Playing
         return;
     }

     const lastPointEpoch = trackData.trackPoints[trackData.trackPoints.length - 1]?.epoch;
     const firstPointEpoch = trackData.trackPoints[0]?.epoch;
     if (typeof lastPointEpoch !== 'number' || typeof firstPointEpoch !== 'number') {
         console.error("Tracker Playback startPlayback: Stopping - Invalid epoch data in first/last track points."); // LOG: Start Invalid Epoch
         stopPlayback();
         return;
     }
     console.log(`  -> startPlayback: Track time range ${firstPointEpoch} to ${lastPointEpoch}.`); // LOG: Time Range

     // Reset logic
     if (state.currentPlaybackTime === null || typeof state.currentPlaybackTime !== 'number' || state.currentPlaybackTime >= lastPointEpoch) {
         console.log("Tracker Playback: Resetting to start for playback.");
         state.currentSliderIndex = 0;
         state.currentPlaybackTime = firstPointEpoch;
         if (elements.trackerTimeSlider) elements.trackerTimeSlider.value = 0;
         console.log(`  -> Reset state: currentSliderIndex=${state.currentSliderIndex}, currentPlaybackTime=${state.currentPlaybackTime}`); // LOG: Reset State
         try { // Add try-catch for external callbacks
             const initialData = getInterpolatedDataCallback(state.currentPlaybackTime, trackData.trackPoints, 0);
             console.log("  -> Got initial interpolated data for display:", initialData); // LOG: Initial Data
             if (initialData && updateDisplayCallback) {
                  updateDisplayCallback(initialData, state.isAutoPanEnabled);
                  console.log("  -> Initial display updated."); // LOG: Initial Display
             } else if (!initialData) {
                 console.warn("  -> getInterpolatedDataCallback returned null/undefined for initial position."); // LOG: Initial Data Fail
             }
         } catch (e) {
              console.error("  -> Error during initial data fetch or display:", e); // LOG: Initial Callback Error
              stopPlayback(); return; // Stop if initial display fails
         }
     } else {
         console.log(`  -> startPlayback: Resuming from time ${state.currentPlaybackTime}`); // LOG: Resume Time
     }

     // Set state and UI BEFORE requesting frame
     state.isPlaying = true;
     if (elements.trackerPlayPauseBtn) {
         elements.trackerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
         console.log("  -> Play/Pause button set to PAUSE icon."); // LOG: Button Icon
     } else {
         console.warn("  -> Play/Pause button element not found in `elements`."); // LOG: Button Missing
     }
     lastFrameTimestamp = performance.now(); // Initialize timestamp for first frame calculation
     console.log(`  -> State set to playing. lastFrameTimestamp initialized to ${lastFrameTimestamp.toFixed(0)}.`); // LOG: State Playing

     // Request animation frame
     if (animationFrameId) { // Cancel previous frame just in case
          console.log(`  -> Cancelling existing animation frame ID: ${animationFrameId}`);
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
     }
     console.log("Tracker Playback: Requesting FIRST animation frame."); // Log before first request
     animationFrameId = requestAnimationFrame((ts) => playbackLoop(ts, trackData));
     console.log(`Tracker Playback: Playback initiated. animationFrameId: ${animationFrameId}`); // LOG: Frame Requested
 }

 export function stopPlayback() {
     // Add a log here too
     if (state.isPlaying) console.log("Tracker Playback: Stopping playback."); // LOG: Stop Action
     else console.log("Tracker Playback: stopPlayback called, but was not playing."); // LOG: Stop When Stopped

     state.isPlaying = false; // Set state first
     if (elements.trackerPlayPauseBtn) {
          elements.trackerPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
     }
     if (animationFrameId) {
         console.log(`  -> Cancelling animation frame ID: ${animationFrameId}`); // LOG: Cancel Frame
         cancelAnimationFrame(animationFrameId);
         animationFrameId = null;
     } else {
         // console.log("  -> No active animation frame to cancel."); // Verbose log
     }
     lastFrameTimestamp = null; // Clear timestamp
     console.log("  -> Playback state set to stopped. animationFrameId and lastFrameTimestamp cleared."); // LOG: Stop Complete
 }

 export function stepBack(trackData) {
    console.log("Tracker Playback: stepBack called."); // LOG: StepBack Entry
    // LOG: Check trackData received by stepBack
    console.log("  -> stepBack received trackData:", trackData ? `Object with ${trackData?.trackPoints?.length ?? 'NO'} points` : 'null/undefined');
    if (!trackData?.trackPoints || trackData.trackPoints.length < 2) {
        console.warn("  -> stepBack returning early - Invalid or insufficient trackData."); // LOG: StepBack Invalid Data
        return;
    }
     if (state.isPlaying) {
         console.log("  -> stepBack: Was playing, calling stopPlayback first."); // LOG: StepBack Stop
         stopPlayback();
     }
     if (state.currentSliderIndex > 0) {
         const oldIndex = state.currentSliderIndex;
         state.currentSliderIndex--;
         if (elements.trackerTimeSlider) elements.trackerTimeSlider.value = state.currentSliderIndex;
         state.currentPlaybackTime = trackData.trackPoints[state.currentSliderIndex].epoch;
         console.log(`  -> Stepped back: Index ${oldIndex} -> ${state.currentSliderIndex}, Time -> ${state.currentPlaybackTime}`); // LOG: StepBack Action
         try { // Add try-catch for external callbacks
             const interpolatedData = getInterpolatedDataCallback(state.currentPlaybackTime, trackData.trackPoints, state.currentSliderIndex);
             if (interpolatedData && updateDisplayCallback) {
                 updateDisplayCallback(interpolatedData, state.isAutoPanEnabled); // Use current auto-pan state
                 console.log("  -> Step back display updated."); // LOG: StepBack Display
             } else if (!interpolatedData){
                  console.warn("  -> getInterpolatedDataCallback returned null/undefined for step back."); // LOG: StepBack Data Fail
             }
         } catch (e) {
              console.error("  -> Error during step back data fetch or display:", e); // LOG: StepBack Callback Error
         }
     } else {
         console.log("  -> Already at the beginning, cannot step back further."); // LOG: StepBack At Start
     }
 }

 export function stepForward(trackData) {
      console.log("Tracker Playback: stepForward called."); // LOG: StepFwd Entry
      // LOG: Check trackData received by stepForward
      console.log("  -> stepForward received trackData:", trackData ? `Object with ${trackData?.trackPoints?.length ?? 'NO'} points` : 'null/undefined');
      if (!trackData?.trackPoints || trackData.trackPoints.length < 2) {
          console.warn("  -> stepForward returning early - Invalid or insufficient trackData."); // LOG: StepFwd Invalid Data
          return;
      }
      if (state.isPlaying) {
          console.log("  -> stepForward: Was playing, calling stopPlayback first."); // LOG: StepFwd Stop
          stopPlayback();
      }
      if (state.currentSliderIndex < trackData.trackPoints.length - 1) {
          const oldIndex = state.currentSliderIndex;
          state.currentSliderIndex++;
          if (elements.trackerTimeSlider) elements.trackerTimeSlider.value = state.currentSliderIndex;
          state.currentPlaybackTime = trackData.trackPoints[state.currentSliderIndex].epoch;
          console.log(`  -> Stepped forward: Index ${oldIndex} -> ${state.currentSliderIndex}, Time -> ${state.currentPlaybackTime}`); // LOG: StepFwd Action
          try { // Add try-catch for external callbacks
              const interpolatedData = getInterpolatedDataCallback(state.currentPlaybackTime, trackData.trackPoints, state.currentSliderIndex);
              if (interpolatedData && updateDisplayCallback) {
                  updateDisplayCallback(interpolatedData, state.isAutoPanEnabled); // Use current auto-pan state
                  console.log("  -> Step forward display updated."); // LOG: StepFwd Display
              } else if (!interpolatedData) {
                  console.warn("  -> getInterpolatedDataCallback returned null/undefined for step forward."); // LOG: StepFwd Data Fail
              }
          } catch (e) {
               console.error("  -> Error during step forward data fetch or display:", e); // LOG: StepFwd Callback Error
          }
      } else {
           console.log("  -> Already at the end, cannot step forward further."); // LOG: StepFwd At End
      }
 }

 export function updateSpeed(newSpeed) {
     console.log(`Tracker Playback: updateSpeed called with newSpeed: ${newSpeed}`); // LOG: Update Speed
     if (typeof newSpeed === 'number' && newSpeed > 0) {
         state.playbackSpeed = newSpeed;
         console.log(`  -> Playback speed updated to: ${state.playbackSpeed}`); // LOG: Speed Set
     } else {
         console.warn(`  -> Invalid speed value received: ${newSpeed}. Speed not changed.`); // LOG: Invalid Speed
     }
 }
 export function updateSliderPosition(newIndex, newTime) {
     console.log(`Tracker Playback: updateSliderPosition called with Index: ${newIndex}, Time: ${newTime}`); // LOG: Update Slider Pos
     // Check if index/time are valid relative to current trackData (if available - this structure doesn't hold it internally)
     // This function assumes the caller (trackerApp) has validated the index/time against its trackData
     if (typeof newIndex === 'number' && newIndex >= 0 && typeof newTime === 'number') {
         state.currentSliderIndex = newIndex;
         state.currentPlaybackTime = newTime;
         if (elements.trackerTimeSlider) elements.trackerTimeSlider.value = state.currentSliderIndex; // Sync slider UI
         console.log(`  -> Playback state updated: currentSliderIndex=${state.currentSliderIndex}, currentPlaybackTime=${state.currentPlaybackTime}`); // LOG: Slider Pos Set
         // Note: It might be useful to also call updateDisplayCallback here if the caller doesn't do it
         // const interpolatedData = getInterpolatedDataCallback(state.currentPlaybackTime, /* Need trackData here! */ , state.currentSliderIndex);
         // if (interpolatedData && updateDisplayCallback) updateDisplayCallback(interpolatedData, state.isAutoPanEnabled);
     } else {
         console.warn(`  -> Invalid index or time received: Index=${newIndex}, Time=${newTime}. State not changed.`); // LOG: Invalid Slider Pos
     }
 }

 // --- Getters for internal state (Example) ---
 export function isPlaying() { return state.isPlaying; }
 export function getCurrentTime() { return state.currentPlaybackTime; }
 export function getCurrentSliderIndex() { return state.currentSliderIndex; }
 export function isAutoPanEnabled() { return state.isAutoPanEnabled; }
 export function setAutoPan(isEnabled) { state.isAutoPanEnabled = !!isEnabled; console.log(`Tracker Playback: AutoPan set to ${state.isAutoPanEnabled}`);}


// --- Internal Playback Loop ---
 function playbackLoop(currentFrameTimestamp, trackData) {
    // **** ADDED: Log entry into the loop ****
    // console.log(`Playback Loop Frame: timestamp=${currentFrameTimestamp.toFixed(0)}`); // Can be too verbose

    // ***** THIS IS THE CHECK THAT WAS FAILING *****
    if (!state.isPlaying || !trackData?.trackPoints || !elements?.trackerTimeSlider) {
        // **** ADDED: DETAILED LOG FOR FAILURE ****
        console.log(`Playback Loop FAILURE CHECK: isPlaying=${state.isPlaying}, trackData exists=${!!trackData}, has trackPoints=${!!trackData?.trackPoints}, trackPoints length=${trackData?.trackPoints?.length ?? 'N/A'}, timeSlider exists=${!!elements?.trackerTimeSlider}`); // LOG: Loop Fail Detail
        console.log("Playback Loop: Stopping - state invalid or elements missing."); // <<< YOUR ORIGINAL ERROR LOG
        stopPlayback(); // Calls the log you saw on line 59 (or similar)
        return; // Exit the loop
    }

    // **** ADDED: Log timestamp calculation ****
    const deltaTime = currentFrameTimestamp - (lastFrameTimestamp || currentFrameTimestamp); // Ensure lastFrameTimestamp has a value
    lastFrameTimestamp = currentFrameTimestamp; // Update for next frame
    const safeDeltaTime = Math.max(0, Math.min(deltaTime, 500)); // Prevent large jumps, ensure non-negative
    const timeAdvance = safeDeltaTime * state.playbackSpeed;
    // console.log(`  Loop: deltaTime=${deltaTime.toFixed(1)}, safeDeltaTime=${safeDeltaTime.toFixed(1)}, speed=${state.playbackSpeed}, timeAdvance=${timeAdvance.toFixed(1)}`); // Verbose

    const previousTime = state.currentPlaybackTime; // Store previous time
    state.currentPlaybackTime += timeAdvance; // Advance time
    // console.log(`  Loop: Playback Time: ${previousTime?.toFixed(0)} -> ${state.currentPlaybackTime?.toFixed(0)}`); // Verbose

    // Check trackData again just to be safe before accessing length
    if (!trackData || !trackData.trackPoints || trackData.trackPoints.length === 0) {
        console.error("Playback Loop: trackData became invalid during loop execution! Stopping."); // LOG: Loop Data Invalid Mid-Loop
        stopPlayback();
        return;
    }

    const lastPointEpoch = trackData.trackPoints[trackData.trackPoints.length - 1]?.epoch;

    // Check for end of track
    if (typeof lastPointEpoch === 'number' && state.currentPlaybackTime >= lastPointEpoch) {
        console.log("Playback Loop: Reached end of track."); // LOG: Loop End Reached
        state.currentPlaybackTime = lastPointEpoch; // Clamp time to end
        state.currentSliderIndex = trackData.trackPoints.length - 1; // Set index to end
        if (elements.trackerTimeSlider) elements.trackerTimeSlider.value = state.currentSliderIndex; // Ensure slider matches
        try {
            const finalData = getInterpolatedDataCallback(state.currentPlaybackTime, trackData.trackPoints, state.currentSliderIndex);
            if (finalData && updateDisplayCallback) updateDisplayCallback(finalData, state.isAutoPanEnabled); // Update display one last time
        } catch (e) {
             console.error("  -> Error during final data fetch or display at end of track:", e); // LOG: Final Callback Error
        }
        stopPlayback(); // Stop playback
        return; // Exit loop
    }

    // Update slider index based on new time
    const previousSliderIndex = state.currentSliderIndex; // Store previous index
    let newSliderIndex = state.currentSliderIndex;

    // **** Check trackData and points before accessing in loop ****
    if (trackData && trackData.trackPoints) {
        // Ensure indices are valid before accessing trackPoints
        while (newSliderIndex < trackData.trackPoints.length - 1 && // Check upper bound
               trackData.trackPoints[newSliderIndex + 1]?.epoch !== undefined && // Check next point exists and has epoch
               trackData.trackPoints[newSliderIndex + 1].epoch <= state.currentPlaybackTime) {
            newSliderIndex++;
        }
        if (newSliderIndex !== state.currentSliderIndex) {
            state.currentSliderIndex = newSliderIndex;
            // console.log(`  Loop: Slider Index updated: ${previousSliderIndex} -> ${state.currentSliderIndex}`); // Verbose
        }
    } else {
         console.error("Playback Loop: trackData or trackPoints became invalid before slider index update. Stopping."); // LOG: Loop Data Invalid Mid-Loop
         stopPlayback();
         return;
    }


    // Update slider visually only if it changed and user isn't interacting
    if (elements.trackerTimeSlider) { // Check element exists
        // Check :active pseudo-class to see if user is interacting
        const isUserInteracting = elements.trackerTimeSlider.matches(':active');
        if (parseInt(elements.trackerTimeSlider.value, 10) !== state.currentSliderIndex && !isUserInteracting) {
            // console.log(`  Loop: Updating slider UI value to ${state.currentSliderIndex}`); // Verbose
             elements.trackerTimeSlider.value = state.currentSliderIndex;
        }
        // if (isUserInteracting) console.log("  Loop: Skipping slider UI update - user is interacting."); // Verbose
    }


    // Get data and update UI (only if time actually advanced meaningfully)
    if (timeAdvance > 0.1) { // Avoid updates if time barely moved
        // **** ADDED: Log before getting interpolated data ****
        // console.log(`  Loop: Getting interpolated data for time: ${state.currentPlaybackTime.toFixed(0)}, index hint: ${state.currentSliderIndex}`); // Verbose
        try { // Add try-catch for external callbacks
            const interpolatedData = getInterpolatedDataCallback(state.currentPlaybackTime, trackData.trackPoints, state.currentSliderIndex);
            if (interpolatedData && updateDisplayCallback) {
                // **** ADDED: Log before updating display ****
                // console.log(`  Loop: Updating display with lat: ${interpolatedData.latitude?.toFixed(4)}`); // Verbose
                updateDisplayCallback(interpolatedData, state.isAutoPanEnabled);
            } else if (!interpolatedData) {
                // This can happen normally if time is slightly beyond last point but less than clamped value
                 console.warn(`Playback Loop: getInterpolatedData returned null for time ${state.currentPlaybackTime.toFixed(0)}`); // LOG: Interpolation Fail
            }
        } catch (e) {
             console.error("Playback Loop: Error during interpolated data fetch or display:", e); // LOG: Loop Callback Error
             stopPlayback(); // Stop playback if display update fails
             return; // Exit loop
        }
    } else {
        // console.log("  Loop: Skipping display update - minimal time advance."); // Verbose
    }

    // Request next frame ONLY if still playing
    if (state.isPlaying) {
        // console.log("  Loop: Requesting next animation frame."); // Verbose
        animationFrameId = requestAnimationFrame((ts) => playbackLoop(ts, trackData));
    } else {
        // This case should ideally not be reached if stopPlayback clears the ID, but good for safety
        console.log("Playback Loop: state.isPlaying is false at end of loop, not requesting next frame."); // LOG: Loop Stop Condition Met
        animationFrameId = null; // Ensure ID is cleared
    }
 }

// --- END OF FILE Tracker/js/playback.js ---