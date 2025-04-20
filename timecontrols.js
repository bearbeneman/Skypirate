// --- START OF FILE timeControls.js ---
// timeControls.js
import * as state from './state.js';


// Store available forecast times
let forecastAvailability = null; // This will be populated by main.js after data fetch
let availableDatesSorted = []; // Store sorted dates for external access
let timelineWidgetElement = null; // Reference to the main widget container

// Store update callbacks provided by main.js
let _updateCallbacks = null;

/**
 * Initializes the new timeline time controls module.
 * @param {object} updateCallbacks - Object containing callback functions for UI updates.
 */
export function initialize(updateCallbacks) {
    console.log("Initializing New Timeline Time Controls...");
    _updateCallbacks = updateCallbacks;

    timelineWidgetElement = document.getElementById('timeline-widget');
    if (!timelineWidgetElement) {
        console.error("Timeline widget main element (#timeline-widget) not found!");
    }

    // --- Bridge for Widget -> timeControls ---
    window.timeControlsBridge = {
        handleSelection: (date, hour) => {
            if (date && hour && (state.selectedGlobalDate !== date || state.selectedGlobalHour !== hour)) {
                console.log(`State CHANGE needed: From ${state.selectedGlobalDate}/${state.selectedGlobalHour} to ${date}/${hour}`);
                state.setGlobalTime(date, hour);
                if (_updateCallbacks?.refreshAll) {
                    _updateCallbacks.refreshAll();
                } else {
                    console.warn("refreshAll callback not available in timeControls after widget selection.");
                }
            }
        },
        widgetReady: () => {
            console.log("Timeline widget internal JS reporting ready.");
        },
        getSelectedDate: () => {
            return state.selectedGlobalDate;
        }
    };

    window.timelineWidgetAPI = window.timelineWidgetAPI || {};
    console.log("New Timeline Time Controls Initialized (Bridge Ready).");
}

/**
 * Helper to determine if the UK is currently observing BST.
 * @param {Date} date The date object to check.
 * @returns {boolean} True if likely BST, false otherwise.
 */
function isUkDst(date) {
    // ... (isUkDst function remains the same) ...
     if (!(date instanceof Date) || isNaN(date.getTime())) { return false; } const year = date.getFullYear(); const marchEnd = new Date(year, 2, 31); const marchLastSunday = 31 - marchEnd.getDay(); const dstStart = new Date(Date.UTC(year, 2, marchLastSunday, 1, 0, 0, 0)); const octoberEnd = new Date(year, 9, 31); const octoberLastSunday = 31 - octoberEnd.getDay(); const dstEnd = new Date(Date.UTC(year, 9, octoberLastSunday, 1, 0, 0, 0)); return date.getTime() >= dstStart.getTime() && date.getTime() < dstEnd.getTime();
}


/**
 * Populates the timeline widget with available dates and times.
 * Determines the initial time slot and passes a callback to the widget
 * to perform the initial scroll when ready.
 * @param {Map<string, Set<string>>} availableForecasts - Map: 'YYYY-MM-DD' -> Set{'HH', ...}.
 */
export function populateDates(availableForecasts) {
    console.log("populateDates called"); // Log entry
    forecastAvailability = availableForecasts;
    availableDatesSorted = forecastAvailability ? [...forecastAvailability.keys()].sort() : [];

    if (!timelineWidgetElement) {
        console.error("populateDates: Timeline widget element not found.");
        return;
    }
    if (availableDatesSorted.length === 0 || !forecastAvailability) {
        console.warn("populateDates: No valid forecast dates found. Cannot populate.");
        if (typeof window.initializeTimelineWidget === 'function') {
             window.initializeTimelineWidget([], new Map(), () => {}); // Clear widget
        }
        state.setGlobalTime(null, null);
        return;
    }

    // --- Determine Initial Date/Hour ---
    let initialDate = null;
    let initialHour = null;
    let firstAvailableDateOverall = availableDatesSorted[0];
    let firstAvailableHourOverall = null;
    const firstDayHours = forecastAvailability.get(firstAvailableDateOverall);
    if (firstDayHours && firstDayHours.size > 0) {
         firstAvailableHourOverall = [...firstDayHours].sort((a, b) => parseInt(a) - parseInt(b))[0];
    }

    try {
        const now = new Date(); const isDst = isUkDst(now); const offsetHours = isDst ? 1 : 0;
        const currentUkTimeMs = now.getTime() + offsetHours * 60 * 60 * 1000; const ukDateObj = new Date(currentUkTimeMs);
        const currentUkHour = ukDateObj.getUTCHours(); const currentUkMinutes = ukDateObj.getUTCMinutes();
        const currentDateStrUk = `${ukDateObj.getUTCFullYear()}-${String(ukDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(ukDateObj.getUTCDate()).padStart(2, '0')}`;
        let foundInitialSlot = false;
        for (const dateStr of availableDatesSorted) {
            if (dateStr < currentDateStrUk) continue;
            const hoursSet = forecastAvailability.get(dateStr); if (!hoursSet || hoursSet.size === 0) continue;
            const sortedHours = [...hoursSet].sort((a, b) => parseInt(a) - parseInt(b));
            if (dateStr === currentDateStrUk) {
                let nearestHourToday = null; let minDiff = Infinity; const currentTimeValue = currentUkHour + currentUkMinutes / 60.0;
                for (const hour of sortedHours) { const hourInt = parseInt(hour, 10); const diff = Math.abs(hourInt - currentTimeValue); if (hourInt >= currentUkHour && diff < minDiff) { minDiff = diff; nearestHourToday = hour; } }
                if (nearestHourToday === null) { minDiff = Infinity; for (const hour of sortedHours) { const hourInt = parseInt(hour, 10); const diff = Math.abs(hourInt - currentTimeValue); if (diff < minDiff) { minDiff = diff; nearestHourToday = hour; } } }
                if (nearestHourToday !== null) { initialDate = dateStr; initialHour = nearestHourToday; foundInitialSlot = true; break; }
            } else { initialDate = dateStr; initialHour = sortedHours[0]; foundInitialSlot = true; break; }
        }
        if (!foundInitialSlot) { initialDate = firstAvailableDateOverall; initialHour = firstAvailableHourOverall; }
    } catch (e) { console.error("Error determining initial time:", e); initialDate = firstAvailableDateOverall; initialHour = firstAvailableHourOverall; }
    // --- End Initial Time Determination ---

    if (!initialDate || initialHour === null || initialHour === undefined) {
         console.warn("populateDates: Failed to determine a valid initial date/hour, using overall first available.");
         initialDate = firstAvailableDateOverall; initialHour = firstAvailableHourOverall;
         if (!initialDate || initialHour === null || initialHour === undefined) { console.error("CRITICAL: populateDates cannot find ANY valid date/hour."); return; }
    }
    const initialHourStr = String(initialHour).padStart(2, '0');


    // --- Prepare Data for the Widget (Generate EXACTLY 5 Days based on initialDate) ---
    const formattedDates = [];
    const daysToGenerate = 5;
    let baseDateForWidget;
    try {
        baseDateForWidget = new Date(initialDate + 'T00:00:00Z');
        if (isNaN(baseDateForWidget.getTime())) throw new Error("Parsed initialDate is invalid");
    } catch (e) { console.error("Error creating Date object from initialDate string for widget. Using today.", e); baseDateForWidget = new Date(); }

    console.log(`populateDates: Generating ${daysToGenerate} days starting from base date: ${baseDateForWidget.toISOString().split('T')[0]}`); // Log base date
    for (let i = 0; i < daysToGenerate; i++) { // *** THE CRITICAL LOOP ***
        const currentDate = new Date(baseDateForWidget);
        currentDate.setUTCDate(baseDateForWidget.getUTCDate() + i); // Increment day using UTC

        const dateStr = currentDate.toISOString().split('T')[0];
        const dayName = currentDate.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short' });
        const dayNum = currentDate.getUTCDate();

        // *** ADDED LOGGING HERE ***
        console.log(`   Loop ${i+1}/${daysToGenerate}: Checking availability for date '${dateStr}'`);

        // Check if data actually exists for this generated date in the forecast map
        if (forecastAvailability.has(dateStr)) {
            console.log(`      -> Data FOUND for ${dateStr}`); // Log success
            formattedDates.push({ date: dateStr, dayName: dayName, dayNum: dayNum });
        } else {
            console.log(`      -> Data NOT FOUND for ${dateStr}`); // Log failure
            // Optionally add placeholder if you always want 5 columns visually?
            // formattedDates.push({ date: dateStr, dayName: dayName, dayNum: dayNum, empty: true }); // Example placeholder
        }
    }
    // --- End Prepare Data ---


    // Define the CALLBACK function for initial scroll
    const performInitialScrollCallback = () => {
        if (initialDate && initialHourStr) {
            if (typeof window.timelineWidgetAPI?.scrollToTime === 'function') {
                window.timelineWidgetAPI.scrollToTime(initialDate, initialHourStr, 'auto');
            } else { console.error("CRITICAL: Initial scroll callback, but scrollToTime not found on widget API!"); }
        } else { console.warn("Initial scroll callback: Invalid date/hour. Cannot scroll."); }
    };

    // *** ADDED LOGGING BEFORE CALL ***
    console.log(`populateDates: Passing ${formattedDates.length} formatted days to initializeTimelineWidget:`, JSON.stringify(formattedDates.map(d => d.date)));
    console.log(`populateDates: Passing full hoursDataMap:`, forecastAvailability); // Log the map itself

    // Call the Widget's Initialization Function
    if (typeof window.initializeTimelineWidget === 'function') {
        window.initializeTimelineWidget(formattedDates, forecastAvailability, performInitialScrollCallback);
    } else {
        console.error("Timeline widget initialization function (window.initializeTimelineWidget) not found!");
        return;
    }

    // Set Global State (only if different from current)
    if (state.selectedGlobalDate !== initialDate || state.selectedGlobalHour !== initialHourStr) {
        console.log(`Timeline Init: Setting initial global state to Date=${initialDate}, Hour=${initialHourStr}`);
        state.setGlobalTime(initialDate, initialHourStr);
    } else {
         // console.log(`Timeline Init: Global state already matches initial Date=${initialDate}, Hour=${initialHourStr}.`); // Debug
    }

} // End of populateDates


/**
 * Programmatically tells the timeline widget to scroll to and select a specific time.
 */
export function selectTimeInWidget(date, hour) {
    if (!date || hour === null || hour === undefined) return;
    const hourStr = String(hour).padStart(2, '0');
    if (typeof window.timelineWidgetAPI?.scrollToTime === 'function') {
        window.timelineWidgetAPI.scrollToTime(date, hourStr, 'smooth');
    } else { console.warn("Cannot programmatically set timeline: scrollToTime function not found."); }
}

/**
 * Returns the sorted array of available forecast dates.
 */
export function getAvailableDates() {
    return availableDatesSorted;
}

/**
 * Disables the timeline controls.
 */
export function disable() {
    console.log("Disabling timeline widget.");
    if (timelineWidgetElement) {
        timelineWidgetElement.style.opacity = '0.6';
        timelineWidgetElement.style.pointerEvents = 'none';
        timelineWidgetElement.ariaDisabled = 'true';
    }
    window.timelineWidgetAPI = {}; window.timeControlsBridge = {};
}
// --- END OF FILE timeControls.js ---