// --- timelineWidget.js ---

// Ensure the API object exists on the window immediately
window.timelineWidgetAPI = window.timelineWidgetAPI || {};

// Scope variables
let timelineContainer = null;
let timelineScroll = null;
let dayElements = [];
let slotElements = [];
let snapPoints = [];
let previouslyActiveSlot = null;
let previouslySelectedDayColumn = null;
let startSpacer = null;
let endSpacer = null;

// Interaction state
let isDragging = false;
let wasDragging = false;
let startX;
let scrollLeftStart;
let scrollTimeout;
let resizeTimeout;
let isProgrammaticScroll = false;

// --- Core Widget Functions ---

/**
 * Generates the day columns and time slots based on provided data.
 * RELIES ON CALLER to provide the correct 5 days in datesData.
 * @param {Array<{date: string, dayName: string, dayNum: number}>} datesData - Array of 5 day objects.
 * @param {Map<string, Set<string>>} hoursDataMap - Map of date string -> Set of hour strings.
 */
function generateTimeline(datesData, hoursDataMap) {
    // Restore original validation
    if (!timelineScroll || !datesData || datesData.length === 0 || !hoursDataMap) {
        console.error("generateTimeline: Missing container, datesData, or hoursDataMap.");
        return;
    }
    if (datesData.length !== 5) {
         console.warn(`generateTimeline: Expected 5 days in datesData, received ${datesData.length}. Displaying provided days.`);
    }

    timelineScroll.innerHTML = ''; // Clear previous content
    dayElements = []; slotElements = []; snapPoints = []; // Reset arrays
    previouslyActiveSlot = null; previouslySelectedDayColumn = null;

    const fragment = document.createDocumentFragment();

    // Create and add start spacer
    startSpacer = document.createElement('div');
    startSpacer.classList.add('timeline-spacer');
    startSpacer.id = 'timeline-start-spacer';
    fragment.appendChild(startSpacer);

    // --- Generate days based *directly* on datesData provided ---
    datesData.forEach(dayInfo => {
        const dateStr = dayInfo.date;
        const dayName = dayInfo.dayName;
        const dayOfMonth = dayInfo.dayNum;

        if (!dateStr) {
            console.warn("generateTimeline: Skipping day - missing date string in datesData item.", dayInfo);
            return; // Skip this iteration if date is missing
        }

        const dayColumn = document.createElement('div');
        dayColumn.classList.add('day-column');
        dayColumn.dataset.date = dateStr;

        // --- Highlight Selected Day ---
        // Get selected date via bridge ONLY for highlighting comparison
        let selectedDateStr = null;
        if (window.timeControlsBridge && typeof window.timeControlsBridge.getSelectedDate === 'function') {
            selectedDateStr = window.timeControlsBridge.getSelectedDate();
        }
        if (dateStr === selectedDateStr) {
            dayColumn.classList.add('selected-day');
            previouslySelectedDayColumn = dayColumn;
        }
        // --- End Highlight ---

        const dayHeader = document.createElement('div');
        dayHeader.classList.add('day-header');
        // Use provided names/nums, fallback to formatting
        if (dayName && dayOfMonth !== undefined && dayOfMonth !== null) {
            dayHeader.textContent = `${dayName} ${dayOfMonth}`;
        } else {
            dayHeader.textContent = typeof window.formatDateGBUtils === 'function'
                                     ? window.formatDateGBUtils(dateStr, false)
                                     : dateStr;
        }
        dayHeader.addEventListener('click', handleDayHeaderClick);
        dayColumn.appendChild(dayHeader);

        const timeSlotsContainer = document.createElement('div');
        timeSlotsContainer.classList.add('time-slots');

        // Get hours for this specific date from the provided map
        const hoursSet = hoursDataMap.get(dateStr);
        if (hoursSet && hoursSet.size > 0) {
            const sortedHours = [...hoursSet].sort((a, b) => parseInt(a) - parseInt(b));
            sortedHours.forEach(hour => {
                const timeSlot = document.createElement('div');
                timeSlot.classList.add('time-slot');
                timeSlot.textContent = hour;
                timeSlot.dataset.time = hour + ":00";
                timeSlot.addEventListener('click', handleTimeSlotClick);
                timeSlotsContainer.appendChild(timeSlot);
                slotElements.push(timeSlot);
            });
        }
        dayColumn.appendChild(timeSlotsContainer);
        fragment.appendChild(dayColumn);
        dayElements.push(dayColumn);
    });
     // --- End Date Loop ---

    // Create and add end spacer
    endSpacer = document.createElement('div');
    endSpacer.classList.add('timeline-spacer');
    endSpacer.id = 'timeline-end-spacer';
    fragment.appendChild(endSpacer);

    timelineScroll.appendChild(fragment);
    // console.log(`Timeline generated with ${dayElements.length} days and ${slotElements.length} total slots.`);

    // Recalculate layout AFTER generating content
    requestAnimationFrame(calculateLayout);
}


/**
 * Calculates spacer widths and snap points based on current layout.
 */
function calculateLayout() {
    if (slotElements.length === 0 || !timelineContainer || !startSpacer || !endSpacer) {
        return;
    }
    const containerWidth = timelineContainer.offsetWidth;
    let sampleSlotWidth = slotElements[0].offsetWidth;
    if (!sampleSlotWidth || sampleSlotWidth <= 0) {
        console.warn("calculateLayout: sampleSlotWidth is 0. Retrying calculation shortly.");
         setTimeout(calculateLayout, 50);
         return;
    }
    const spacerWidth = Math.max(0, (containerWidth / 2) - (sampleSlotWidth / 2));
    startSpacer.style.width = `${spacerWidth}px`;
    endSpacer.style.width = `${spacerWidth}px`;
    requestAnimationFrame(() => {
        snapPoints = [];
        let calculationOk = true;
        slotElements.forEach(slot => {
            if (slot.offsetWidth > 0) {
                snapPoints.push(slot.offsetLeft + (slot.offsetWidth / 2));
            } else {
                console.warn("calculateLayout: Slot has zero width during snap point calculation.", slot);
                snapPoints.push(null);
                calculationOk = false;
            }
        });
        snapPoints = snapPoints.filter(p => typeof p === 'number');
        if (!calculationOk) {
            console.warn("calculateLayout: Some snap points invalid due to zero-width slots.");
        }
        updateVisualState();
    });
}

/**
 * Updates visual highlights and reports selection changes via bridge.
 */
function updateVisualState() {
    if (!timelineContainer || slotElements.length === 0) return;
    const validSnapPoints = snapPoints.filter(p => typeof p === 'number');
    if (validSnapPoints.length === 0) { return; }

    const containerWidth = timelineContainer.offsetWidth;
    const scrollCenterAbsolute = timelineContainer.scrollLeft + (containerWidth / 2);
    let closestIndex = -1; let minDiff = Infinity;

    slotElements.forEach((slot, index) => {
        if (typeof snapPoints[index] === 'number') {
            const diff = Math.abs(scrollCenterAbsolute - snapPoints[index]);
            if (diff < minDiff) { minDiff = diff; closestIndex = index; }
        }
    });

    if (closestIndex < 0) return;
    const targetSlot = slotElements[closestIndex];

    // Highlight Slot
    if (previouslyActiveSlot && previouslyActiveSlot !== targetSlot) { previouslyActiveSlot.classList.remove('active'); }
    if (targetSlot && !targetSlot.classList.contains('active')) { targetSlot.classList.add('active'); previouslyActiveSlot = targetSlot; }
    else if (!targetSlot && previouslyActiveSlot) { previouslyActiveSlot.classList.remove('active'); previouslyActiveSlot = null; }

    // Highlight Day & Report Selection
    let currentDayColumn = targetSlot ? targetSlot.closest('.day-column') : null;
    if (previouslySelectedDayColumn && previouslySelectedDayColumn !== currentDayColumn) { previouslySelectedDayColumn.classList.remove('selected-day'); }
    if (currentDayColumn && !currentDayColumn.classList.contains('selected-day')) {
        currentDayColumn.classList.add('selected-day'); previouslySelectedDayColumn = currentDayColumn;
    } else if (!currentDayColumn && previouslySelectedDayColumn) { previouslySelectedDayColumn.classList.remove('selected-day'); previouslySelectedDayColumn = null; }

    // Report selection via bridge
    if (targetSlot && currentDayColumn) {
        const dateStr = currentDayColumn.dataset.date;
        const timeData = targetSlot.dataset.time;
        const hourStr = timeData ? timeData.split(':')[0] : null;
        if (dateStr && hourStr) {
            // Check if bridge and function exist before calling
            if (window.timeControlsBridge?.handleSelection) {
                window.timeControlsBridge.handleSelection(dateStr, hourStr);
            } else {
                console.warn("updateVisualState: timeControlsBridge.handleSelection not available for reporting.");
            }
        }
    }
} // End of updateVisualState


/**
 * Smoothly scrolls the container to the nearest snap point.
 */
function snapToNearest() {
    if (isDragging || isProgrammaticScroll || !timelineContainer || snapPoints.length === 0) return;
    const validSnapPoints = snapPoints.filter(p => typeof p === 'number');
    if (validSnapPoints.length === 0) return;
    const containerWidth = timelineContainer.offsetWidth; const currentScroll = timelineContainer.scrollLeft;
    const scrollCenterTarget = currentScroll + containerWidth / 2; let closestSnapPoint = validSnapPoints[0];
    let minDiff = Math.abs(scrollCenterTarget - closestSnapPoint);
    for (let i = 1; i < validSnapPoints.length; i++) {
        const diff = Math.abs(scrollCenterTarget - validSnapPoints[i]);
        if (diff < minDiff) { minDiff = diff; closestSnapPoint = validSnapPoints[i]; }
    }
    const targetScrollLeft = closestSnapPoint - containerWidth / 2;
    if (Math.abs(currentScroll - targetScrollLeft) > 1) {
        isProgrammaticScroll = true;
        timelineContainer.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
        handleScrollEnd(() => { isProgrammaticScroll = false; updateVisualState(); });
    } else {
        updateVisualState();
    }
}


/**
 * Helper to reliably detect the end of scrolling (for smooth scroll).
 */
function handleScrollEnd(callback) {
    let scrollEndTimer;
    if (!timelineContainer) return;
    const scrollEndListener = () => { clearTimeout(scrollEndTimer); if (callback) callback(); };
    clearTimeout(scrollEndTimer);
    if ('onscrollend' in timelineContainer) {
        timelineContainer.removeEventListener('scrollend', scrollEndListener);
        timelineContainer.addEventListener('scrollend', scrollEndListener, { once: true });
    } else { scrollEndTimer = setTimeout(() => { if (callback) callback(); }, 300); }
}


/**
 * Triggers haptic feedback if supported.
 */
function triggerHapticFeedback() { if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) { /* ignore */ } } }


// --- Event Handlers ---
function handleTimeSlotClick(event) {
    const clickedSlot = event.currentTarget;
    if (clickedSlot.classList.contains('active') || isProgrammaticScroll || isDragging || wasDragging) return;
    const clickedIndex = slotElements.indexOf(clickedSlot);
    if (clickedIndex === -1 || typeof snapPoints[clickedIndex] !== 'number') return;
    const containerWidth = timelineContainer.offsetWidth; const targetSnapPoint = snapPoints[clickedIndex];
    const targetScrollLeft = targetSnapPoint - containerWidth / 2;
    isProgrammaticScroll = true; clearTimeout(scrollTimeout);
    triggerHapticFeedback();
    timelineContainer.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    handleScrollEnd(() => { isProgrammaticScroll = false; updateVisualState(); });
}

function handleDayHeaderClick(event) {
    const header = event.currentTarget; const dayColumn = header.closest('.day-column');
    if (!dayColumn || dayColumn.classList.contains('selected-day') || isProgrammaticScroll || !timelineContainer) return;
    const containerWidth = timelineContainer.offsetWidth; const dayColumnCenter = dayColumn.offsetLeft + dayColumn.offsetWidth / 2;
    const targetScrollLeft = dayColumnCenter - containerWidth / 2;
    isProgrammaticScroll = true; clearTimeout(scrollTimeout);
    triggerHapticFeedback();
    timelineContainer.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    handleScrollEnd(() => { isProgrammaticScroll = false; snapToNearest(); });
}


// --- Drag/Touch Scrolling Handlers ---
const startDrag = (e) => {
    if (!timelineContainer) return; // Safety check
    // Stop programmatic scroll if user intervenes
    if (isProgrammaticScroll) {
         timelineContainer.scrollTo({ left: timelineContainer.scrollLeft, behavior: 'auto' });
         isProgrammaticScroll = false;
    }
    isDragging = true; wasDragging = false;
    startX = (e.touches ? e.touches[0].pageX : e.pageX) - timelineContainer.offsetLeft;
    scrollLeftStart = timelineContainer.scrollLeft;
    timelineContainer.style.cursor = 'grabbing'; timelineContainer.style.userSelect = 'none';
};

const stopDrag = (e) => {
    if (!isDragging || !timelineContainer) return;
    const needsSnap = wasDragging;
    isDragging = false; wasDragging = false; // Reset flags
    timelineContainer.style.cursor = 'grab';
    timelineContainer.style.userSelect = '';
    if (needsSnap) {
        setTimeout(snapToNearest, 50); // Snap after drag
    }
};

const dragMove = (e) => {
    if (!isDragging || isProgrammaticScroll || !timelineContainer) return;
    wasDragging = true;
    if (e.touches) e.preventDefault();
    const x = (e.touches ? e.touches[0].pageX : e.pageX) - timelineContainer.offsetLeft;
    const walk = (x - startX);
    timelineContainer.scrollLeft = scrollLeftStart - walk; // Simple linear drag
    updateVisualState();
};


// --- Event Listener Setup ---
function attachListeners() {
    if (!timelineContainer) return;
    timelineContainer.removeEventListener('mousedown', startDrag);
    timelineContainer.removeEventListener('touchstart', startDrag);
    window.removeEventListener('mouseup', stopDrag);
    window.removeEventListener('touchend', stopDrag);
    window.removeEventListener('touchcancel', stopDrag);
    timelineContainer.removeEventListener('mouseleave', stopDrag);
    timelineContainer.removeEventListener('mousemove', dragMove);
    timelineContainer.removeEventListener('touchmove', dragMove);
    timelineContainer.removeEventListener('scroll', handleScrollEvent);
    window.removeEventListener('resize', handleResizeEvent);
    timelineContainer.addEventListener('mousedown', startDrag);
    timelineContainer.addEventListener('touchstart', startDrag, { passive: true });
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);
    timelineContainer.addEventListener('mouseleave', stopDrag);
    timelineContainer.addEventListener('mousemove', dragMove);
    timelineContainer.addEventListener('touchmove', dragMove, { passive: false });
    timelineContainer.addEventListener('scroll', handleScrollEvent);
    window.addEventListener('resize', handleResizeEvent);
}

function handleScrollEvent() {
    if (!isProgrammaticScroll) {
        clearTimeout(scrollTimeout);
        updateVisualState();
        scrollTimeout = setTimeout(() => {
            if (!isDragging && !isProgrammaticScroll) { snapToNearest(); }
        }, 150);
    } else {
        updateVisualState();
    }
}

function handleResizeEvent() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        calculateLayout();
        // Don't force snap, just update layout/highlights
    }, 250);
}


// --- Public API Functions (Attached to Window) ---
window.timelineWidgetAPI = window.timelineWidgetAPI || {};

window.timelineWidgetAPI.scrollToTime = function(targetDate, targetHour, behavior = 'smooth') {
    if (!timelineContainer || !timelineScroll || slotElements.length === 0) { return; }
    let targetSlot = null; const targetTimeStr = String(targetHour).padStart(2, '0') + ":00";
    const dayColumn = timelineScroll.querySelector(`.day-column[data-date="${targetDate}"]`);
    if (!dayColumn) { return; }
    targetSlot = dayColumn.querySelector(`.time-slot[data-time="${targetTimeStr}"]`);
    if (!targetSlot) { return; }
    const targetIndex = slotElements.indexOf(targetSlot);
    if (targetIndex === -1) { return; }

    if (snapPoints.length <= targetIndex || typeof snapPoints[targetIndex] !== 'number') {
         console.warn(`scrollToTime: Snap points not ready for index ${targetIndex}. Recalculating...`);
         calculateLayout();
         setTimeout(() => {
             if(snapPoints.length > targetIndex && typeof snapPoints[targetIndex] === 'number') {
                 window.timelineWidgetAPI.scrollToTime(targetDate, targetHour, behavior);
             } else { console.error(`scrollToTime: Snap points still invalid after retry.`); }
         }, 200);
         return;
    }

    const containerWidth = timelineContainer.offsetWidth;
    const targetSnapPoint = snapPoints[targetIndex];
    const targetScrollLeft = targetSnapPoint - containerWidth / 2;

    isProgrammaticScroll = true;
    clearTimeout(scrollTimeout);
    timelineContainer.scrollTo({ left: targetScrollLeft, behavior: behavior });
    handleScrollEnd(() => { isProgrammaticScroll = false; updateVisualState(); });
};

/**
 * Initializes the timeline widget.
 * EXPECTS datesData to be an array of 5 day info objects.
 * EXPECTS hoursDataMap to be a Map<string, Set<string>>.
 * @param {Array<{date: string, dayName: string, dayNum: number}>} datesData - Array of 5 day objects.
 * @param {Map<string, Set<string>>} hoursDataMap - Map: 'YYYY-MM-DD' -> Set{'HH', 'HH', ...}.
 * @param {Function} readyCallback - Callback function when ready.
 */
window.initializeTimelineWidget = function(datesData, hoursDataMap, readyCallback) {
    console.log("TimelineWidget: Initializing...");
    timelineContainer = document.getElementById('timeline-container');
    timelineScroll = document.getElementById('timeline-scroll');
    if (!timelineContainer || !timelineScroll) {
        console.error("TimelineWidget: Cannot initialize - Core elements not found.");
        return;
    }

    // Generate timeline using the provided data
    generateTimeline(datesData, hoursDataMap);

    // Initial layout calculation is now called within generateTimeline via requestAnimationFrame

    attachListeners(); // Ensure listeners are attached

    if (window.timeControlsBridge?.widgetReady) {
        window.timeControlsBridge.widgetReady();
    }
    console.log("TimelineWidget: Internal setup complete.");

    if (typeof readyCallback === 'function') {
        console.log("TimelineWidget: Executing readyCallback.");
        setTimeout(readyCallback, 100); // Delay ready callback slightly
    } else {
         console.warn("TimelineWidget: No valid readyCallback provided.");
         setTimeout(snapToNearest, 100); // Fallback initial snap
    }
};

// --- END timelineWidget.js ---