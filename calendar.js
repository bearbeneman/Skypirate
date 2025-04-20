// --- START OF FILE calendar.js ---
// calendar.js
import * as state from './state.js';
// Import specific functions from utils to be explicit
import {
    formatDateGB,
    isUkDst,
    degreesToSectorIndex,
    degreesToCompass
} from './utils.js';
import { KNOTS_TO_MPH, KPH_TO_MPH } from './config.js';
import * as timeControls from './timeControls.js';
import * as webcamService from './webcamService.js'; // Import the webcam service

// UI Element References
let siteCalendarContainer = null;
let calendarHeaderSiteName = null;
let calendarHeaderDate = null;
let calendarContent = null;
let calendarCloseButton = null;
let calendarHeaderExtraInfo = null; // Reference to the extra info container

// Dependencies
let _siteDataStore = null;
let _updateCallbacks = null;

// Constants
const CALENDAR_VISIBLE_CLASS = 'calendar-visible';
const CALENDAR_TRANSITION_DURATION_MS = 300; // Should match CSS transition

/**
 * Initializes the site forecast calendar module.
 * @param {Map} siteDataStoreRef - Reference to the main site data store.
 * @param {object} updateCallbacks - Callbacks for triggering updates.
 */
export function initialize(siteDataStoreRef, updateCallbacks) {
    console.log("Initializing Site Calendar...");
    _siteDataStore = siteDataStoreRef;
    _updateCallbacks = updateCallbacks;

    // Cache DOM lookups
    siteCalendarContainer = document.getElementById('site-forecast-calendar');
    calendarHeaderSiteName = document.getElementById('calendar-site-name');
    calendarHeaderDate = document.getElementById('calendar-date');
    calendarContent = document.getElementById('calendar-content');
    calendarCloseButton = document.getElementById('calendar-close-button');
    calendarHeaderExtraInfo = document.getElementById('calendar-header-extra-info'); // Try to find it initially

    // Basic check for essential elements
    if (!siteCalendarContainer || !calendarHeaderSiteName || !calendarHeaderDate || !calendarContent || !calendarCloseButton) {
        console.error("Calendar Initialization Error: One or more required UI elements not found!");
        siteCalendarContainer = null; // Ensure it's null if setup failed
        return;
    }

    siteCalendarContainer.style.display = 'none'; // Start hidden
    calendarCloseButton.addEventListener('click', hideSiteForecastCalendar);
    console.log("Site Calendar Initialized.");
}

/**
 * Shows the forecast calendar for a specific site with slide-up animation.
 * @param {number|string} siteId - The ID of the site to show.
 */
export function showSiteForecastCalendar(siteId) {
    if (!siteCalendarContainer) {
        console.warn("showSiteForecastCalendar called before successful initialization or element missing.");
        return;
    }
    const siteIdStr = String(siteId);

    state.setSelectedCalendarSiteId(siteIdStr);
    console.log(`Showing calendar for site ${siteIdStr}`);
    updateSiteForecastCalendar(); // Update content *before* starting animation

    siteCalendarContainer.style.display = 'flex'; // Ensure display is correct for height calc

    requestAnimationFrame(() => {
        setTimeout(() => {
            if (!siteCalendarContainer || state.selectedSiteIdForCalendar !== siteIdStr) {
                return; // State changed before animation could start
            }
            // Recalculate height *after* content update and display change
            const calendarHeight = siteCalendarContainer.offsetHeight;
            const bottomOffset = calendarHeight + 5; // Add a small margin
            document.documentElement.style.setProperty('--calendar-height-with-margin', `${bottomOffset}px`);
            document.body.classList.add(CALENDAR_VISIBLE_CLASS); // Trigger animation

        }, 10); // Small delay
    });
}

/**
 * Hides the forecast calendar with slide-down animation.
 */
export function hideSiteForecastCalendar() {
    if (!siteCalendarContainer || !document.body.classList.contains(CALENDAR_VISIBLE_CLASS)) {
        return; // Already hidden or not initialized
    }

    state.setSelectedCalendarSiteId(null); // Clear state first

    document.body.classList.remove(CALENDAR_VISIBLE_CLASS); // Trigger animation
    document.documentElement.style.removeProperty('--calendar-height-with-margin');

    setTimeout(() => {
        // Check state again - only clear if it hasn't been re-opened
        if (state.selectedSiteIdForCalendar === null && siteCalendarContainer) {
            siteCalendarContainer.style.display = 'none'; // Set display none AFTER animation
            // Clear content and header elements
            if (calendarContent) calendarContent.innerHTML = '';
            if (calendarHeaderSiteName) calendarHeaderSiteName.textContent = '';
            if (calendarHeaderDate) calendarHeaderDate.textContent = '';
            // Clear the extra info container as well
            const extraInfoContainer = document.getElementById('calendar-header-extra-info'); // Find it again just in case
            if (extraInfoContainer) extraInfoContainer.innerHTML = '';
            console.log("Calendar fully hidden and content/extra info cleared via timeout.");
        }
    }, CALENDAR_TRANSITION_DURATION_MS); // Match CSS transition duration
}

/**
 * Handles clicks on an hour box within the calendar.
 * Updates global state, triggers a refresh, and updates the timeline widget.
 * @param {Event} event - The click event.
 */
function handleCalendarHourClick(event) {
    const clickedHour = event.currentTarget.dataset.hour;
    if (!clickedHour) {
        console.warn("Calendar hour click ignored: No hour data found.");
        return;
    }

    if (clickedHour !== state.selectedGlobalHour) {
        console.log(`Calendar Hour Clicked: ${clickedHour}`);
        const currentDate = state.selectedGlobalDate;
        if (!currentDate) {
            console.error("Calendar click ignored: No date selected in global state.");
            return; // Cannot proceed without a date
        }

        // 1. Update the global state
        state.setGlobalTime(currentDate, clickedHour);

        // 2. Trigger the main application refresh
        if (_updateCallbacks?.refreshAll) {
            _updateCallbacks.refreshAll();
        } else {
            console.warn("refreshAll callback not available in calendar. Only updating calendar content.");
            updateSiteForecastCalendar(); // Fallback
        }

        // 3. Explicitly tell the timeline widget to scroll
        if (typeof timeControls?.selectTimeInWidget === 'function') {
            timeControls.selectTimeInWidget(currentDate, clickedHour);
        } else {
            console.warn("Calendar cannot update timeline widget position - selectTimeInWidget function missing.");
        }

    } else {
        console.log(`Calendar Hour Clicked: ${clickedHour} (already selected)`);
    }
}


// --- Star Rating Generator Function ---
function generateStarRatingHTML(rating, maxStars = 5) {
    const numericRating = parseFloat(rating);
    if (numericRating == null || isNaN(numericRating) || numericRating < 0) {
         return '<span class="calendar-stars-nodata">-</span>';
    }
    let html = '';
    const fullStars = Math.floor(numericRating);
    let i = 0;
    for (; i < fullStars; i++) {
        html += '<i class="fas fa-star calendar-star"></i>';
    }
    for (; i < maxStars; i++) {
        html += '<i class="far fa-star calendar-star empty"></i>';
    }
    return html;
}

// --- Rain Text/Icon Generator Function ---
function generateRainIconHTML(rainAmount) {
    const numericRain = parseFloat(rainAmount);

    // Return empty string if no rain or invalid data
    if (numericRain == null || isNaN(numericRain) || numericRain <= 0) {
        return '';
    }

    let level = '';
    let iconClass = '';
    let specificClass = '';

    // Determine level and icon based on thresholds
    if (numericRain < 0.5) {
        level = 'Drizzle';
        iconClass = 'fa-cloud-rain';
        specificClass = 'drizzle-icon';
    } else if (numericRain < 2.5) {
        level = 'Light';
        iconClass = 'fa-cloud-rain';
        specificClass = 'light-rain-icon';
    } else if (numericRain < 10) {
        level = 'Moderate';
        iconClass = 'fa-cloud-showers-heavy';
        specificClass = 'moderate-rain-icon';
    } else {
        level = 'Heavy';
        iconClass = 'fa-cloud-showers-heavy';
        // iconClass = 'fa-cloud-bolt'; // Alternative for heavy
        specificClass = 'heavy-rain-icon';
    }

    // Generate the title text for hover info (remains the same)
    const titleText = `${level} Rain (${numericRain.toFixed(1)}mm/hr)`;

    // Construct the HTML string WITH the text level added
    return `<span class="calendar-rain-icon-container" title="${titleText}">` +
           `<i class="fas ${iconClass} ${specificClass} calendar-rain-icon"></i>` +
           // Add a non-breaking space for separation and the text span
           ` <span class="calendar-rain-text">${level}</span>` +
           `</span>`;
}

/**
 * Updates the content of the site forecast calendar, arranging the header into a single row.
 */
export function updateSiteForecastCalendar() {
    // Check if module is initialized
    if (!siteCalendarContainer || !_siteDataStore) {
        if (siteCalendarContainer) console.warn("updateSiteForecastCalendar called but dependencies missing (_siteDataStore?)");
        return;
    }

    const siteId = state.selectedSiteIdForCalendar;
    const currentDateStr = state.selectedGlobalDate;

    // Get site data EARLY
    const siteEntry = siteId ? _siteDataStore.get(String(siteId)) : null;
    const site = siteEntry?.site;

    // Ensure standard header elements exist
    if (!calendarHeaderSiteName || !calendarHeaderDate || !calendarContent || !calendarCloseButton) {
        console.error("Calendar update error: Standard Header/Content/Button elements missing.");
        return;
    }

    // --- Find or Create Header Structure for Single Row ---
    const headerElement = document.querySelector('.calendar-header');
    if (!headerElement) {
        console.error("Could not find .calendar-header element!");
        return;
    }

    // Ensure Left Group Exists and contains Button + Name
    let leftGroup = headerElement.querySelector('.header-left-group');
    if (!leftGroup) {
        leftGroup = document.createElement('div');
        leftGroup.className = 'header-left-group';
        // Insert the group at the beginning of the header
        headerElement.insertBefore(leftGroup, headerElement.firstChild);
        // Move Button and Name into the left group if they aren't already
        if (calendarCloseButton.parentNode !== leftGroup) leftGroup.appendChild(calendarCloseButton);
        if (calendarHeaderSiteName.parentNode !== leftGroup) leftGroup.appendChild(calendarHeaderSiteName);
    }

    // Ensure Extra Info Container Exists and is positioned correctly
    let extraInfoContainer = document.getElementById('calendar-header-extra-info');
    if (!extraInfoContainer) {
        extraInfoContainer = document.createElement('div');
        extraInfoContainer.id = 'calendar-header-extra-info';
        extraInfoContainer.className = 'header-extra-info';
        // Insert it after the left group
        leftGroup.insertAdjacentElement('afterend', extraInfoContainer);
        calendarHeaderExtraInfo = extraInfoContainer; // Cache reference
    } else {
         // Ensure it's still positioned after the left group
         if (extraInfoContainer.previousSibling !== leftGroup) {
             leftGroup.insertAdjacentElement('afterend', extraInfoContainer);
         }
    }

    // Ensure Date is positioned correctly (last element, direct child of header)
    if (calendarHeaderDate.parentNode !== headerElement) {
        headerElement.appendChild(calendarHeaderDate); // Append to move it to the end
    } else if (calendarHeaderDate !== headerElement.lastElementChild) {
         headerElement.appendChild(calendarHeaderDate); // Move to end if not already last
    }
    // --- End Structure Setup ---


    // --- Clear/Update based on site validity ---
    if (!siteId || !site) {
        // Clear header content
        calendarHeaderSiteName.textContent = ''; // Name is inside leftGroup
        calendarHeaderDate.textContent = '';
        if (extraInfoContainer) extraInfoContainer.innerHTML = ''; // Clear extra info
        // Clear main content area
        if (calendarContent) calendarContent.innerHTML = '';
        return;
    }

    // --- Update Standard Header Content (Name and Date) ---
    calendarHeaderSiteName.textContent = site.name || `Site ${siteId}`;
    calendarHeaderDate.textContent = currentDateStr ? formatDateGB(currentDateStr) : "No Date";

    // --- Generate and Inject Extra Header Info ---
    let extraInfoHtml = '';
    const siteLat = typeof site.lat === 'number' ? site.lat : null;
    const siteLon = typeof site.lng === 'number' ? site.lng : null;
    const altitude = site.alt !== null && site.alt !== undefined ? `${site.alt} m ASL` : 'N/A';

    // Altitude
    extraInfoHtml += `<span class="header-info-item altitude">Elev: ${altitude}</span>`;

    // Map Links
    if (siteLat !== null && siteLon !== null) {
        const googleMapsLogoUrl = '../images/gmaps.png';
        const what3WordsLogoUrl = '../images/w3w.png';
        const osMapsLogoUrl = '../images/osmaps.png';
        const iconStyle = "height: 20px; width: auto; vertical-align: middle; border: none; margin: 0 1px;"; // Adjusted style

        const googleMapsUrl = `https://www.google.com/maps?q=${siteLat},${siteLon}`;
        const what3WordsUrl = `https://what3words.com/${siteLat},${siteLon}`;
        const osMapsUrl = `https://explore.osmaps.com/pin?lat=${siteLat}&lon=${siteLon}&z=16`;

        extraInfoHtml += `<span class="header-info-item map-links">`;
        extraInfoHtml += `<a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" title="View on Google Maps"><img src="${googleMapsLogoUrl}" alt="G" style="${iconStyle}"></a>`;
        extraInfoHtml += `<a href="${what3WordsUrl}" target="_blank" rel="noopener noreferrer" title="View on What3Words"><img src="${what3WordsLogoUrl}" alt="W" style="${iconStyle}"></a>`;
        extraInfoHtml += `<a href="${osMapsUrl}" target="_blank" rel="noopener noreferrer" title="View on OS Maps"><img src="${osMapsLogoUrl}" alt="OS" style="${iconStyle}"></a>`;
        extraInfoHtml += `</span>`;
    }

    // Webcam Link
    if (siteLat !== null && siteLon !== null && webcamService.isLoaded()) {
        const closestWebcam = webcamService.findClosestWebcam(siteLat, siteLon, 50);
        if (closestWebcam) {
            const distanceText = closestWebcam.distanceKm !== undefined ? `(${closestWebcam.distanceKm.toFixed(1)} km)` : '';
            const linkStyle = "color: #0078A8; text-decoration: none; vertical-align: middle; font-size: 0.95em;";
            const iconStyle = "color: #6c757d; font-size: 1em; vertical-align: middle; margin-right: 2px;";
            extraInfoHtml += `<a href="${closestWebcam.pageUrl}" target="_blank" rel="noopener noreferrer" title="Nearby Webcam: ${closestWebcam.shortTitle || closestWebcam.title} ${distanceText}" class="header-info-item webcam-link" style="${linkStyle}">` +
                             `<i class="fas fa-video" style="${iconStyle}"></i>` +
                             ` Webcam ${distanceText}` +
                             `</a>`;
        }
    }

    // Update the container's content
    if (extraInfoContainer) {
        extraInfoContainer.innerHTML = extraInfoHtml;
    }
    // --- End Extra Header Info ---


    // --- Clear previous main content ---
    calendarContent.innerHTML = '';

    // --- Handle cases where main content cannot be generated ---
    if (!currentDateStr) {
        calendarContent.innerHTML = '<div class="calendar-message">Please select a date.</div>';
        return;
    }
    const weatherData = siteEntry.weatherData;
    if (!weatherData || weatherData.error || !Array.isArray(weatherData.weather) || weatherData.weather.length === 0) {
        const message = weatherData?.error
            ? `Error loading forecast: ${weatherData.error}`
            : `No forecast data available for ${siteName} on ${formatDateGB(currentDateStr)}.`;
        calendarContent.innerHTML = `<div class="calendar-message">${message}</div>`;
        return;
    }

    // --- Filter and Sort Forecasts ---
    const latestSnapshots = new Map();
    weatherData.weather
        .filter(p => p?.forecast_day === currentDateStr && p.time !== undefined && p.time !== null && p.snapshot_date)
        .forEach(p => {
            const hour = String(p.time).padStart(2, '0');
            const existingTimestamp = latestSnapshots.get(hour);
            if (!existingTimestamp || p.snapshot_date > existingTimestamp) {
                latestSnapshots.set(hour, p.snapshot_date);
            }
        });
    const forecastForDay = weatherData.weather
        .filter(p => {
            if (!(p?.forecast_day === currentDateStr && p.time !== undefined && p.time !== null && p.snapshot_date)) return false;
            const hour = String(p.time).padStart(2, '0');
            return latestSnapshots.get(hour) === p.snapshot_date;
        })
        .filter((p, index, self) => index === self.findIndex(t => String(t.time).padStart(2,'0') === String(p.time).padStart(2,'0')))
        .sort((a, b) => parseInt(String(a.time)) - parseInt(String(b.time)));

    if (forecastForDay.length === 0) {
        calendarContent.innerHTML = `<div class="calendar-message">No forecast hours found for ${formatDateGB(currentDateStr)}.</div>`;
        return;
    }

    // --- Create Hour Boxes ---
    const now = new Date();
    const isDst = isUkDst ? isUkDst(now) : false;
    const ukTimeNow = new Date(now.getTime() + (isDst ? 1 : 0) * 60 * 60 * 1000);
    const currentUkHour = ukTimeNow.getUTCHours();
    const todayStringUk = `${ukTimeNow.getUTCFullYear()}-${String(ukTimeNow.getUTCMonth() + 1).padStart(2, '0')}-${String(ukTimeNow.getUTCDate()).padStart(2, '0')}`;
    const isSelectedDateToday = currentDateStr === todayStringUk;

    const fragment = document.createDocumentFragment();

    forecastForDay.forEach(forecastPoint => {
        const hour = String(forecastPoint.time).padStart(2, '0');
        const dir = forecastPoint.wind_dir;
        const knts = forecastPoint.wind_knts;
        let mph = forecastPoint.wind_mph;
        const starRating = forecastPoint.stars;
        const rainAmount = forecastPoint.rain;

        // Calculate MPH
        if ((mph === undefined || mph === null) && knts !== undefined && knts !== null) {
            const kntsNum = parseFloat(knts); if (!isNaN(kntsNum)) mph = (kntsNum * KNOTS_TO_MPH).toFixed(1);
        }
        if ((mph === undefined || mph === null) && forecastPoint.wind_kph !== undefined && forecastPoint.wind_kph !== null) {
            const kphNum = parseFloat(forecastPoint.wind_kph); if (!isNaN(kphNum)) mph = (kphNum * KPH_TO_MPH).toFixed(1);
        }

        const hourBox = document.createElement('div');
        hourBox.className = 'calendar-hour-box';
        hourBox.dataset.hour = hour;
        hourBox.addEventListener('click', handleCalendarHourClick);

        const isPassed = isSelectedDateToday && parseInt(hour, 10) < currentUkHour;
        if (isPassed) { hourBox.classList.add('passed'); }
        if (hour === state.selectedGlobalHour) { hourBox.classList.add('highlighted'); }

        // Check wind suitability
        let isSuitable = false;
        if (site.wind_dir?.length === 16) {
            const dirNum = parseInt(dir, 10);
            if (!isNaN(dirNum)) {
                const sectorIndex = degreesToSectorIndex(dirNum);
                if (sectorIndex !== -1 && (site.wind_dir[sectorIndex] === 1 || site.wind_dir[sectorIndex] === 2)) {
                    isSuitable = true;
                }
            }
        }

        // Format display strings
        const timeStr = `${hour}:00`;
        const speedVal = mph != null ? `${mph} mph` : (knts != null ? `${knts} kts` : '');
        const compassDir = degreesToCompass(dir);
        const dirText = dir != null ? `${dir}°` : '';
        const dirVal = dir != null ? `${compassDir}${dirText ? ' ' + dirText : ''}` : '';
        const starsHTML = generateStarRatingHTML(starRating);
        const rainHTML = generateRainIconHTML(rainAmount);

        // Build inner HTML
        hourBox.innerHTML = `
            <span class="time">${timeStr}</span>
            <span class="speed">${speedVal}</span>
            <span class="direction">${dirVal}</span>
            <div class="calendar-stars-container">${starsHTML}</div>
            ${rainHTML}
            ${isSuitable ? '<div class="suitability-indicator" title="Wind direction suitable"></div>' : ''}
        `;
        fragment.appendChild(hourBox);
    });

    // Append all boxes at once
    calendarContent.appendChild(fragment);

    // --- Scroll highlighted box into view ---
    requestAnimationFrame(() => {
        const highlightedBox = calendarContent.querySelector('.highlighted');
        if (highlightedBox?.scrollIntoView) {
             if (highlightedBox.classList.contains('highlighted') && calendarContent.contains(highlightedBox)) {
                  highlightedBox.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
             }
        }
    });
}


/**
 * Disables calendar functionality.
 */
export function disable() {
     hideSiteForecastCalendar(); // Hide if currently visible
     if (calendarCloseButton) calendarCloseButton.disabled = true;
     console.log("Calendar functionality disabled.");
}

// --- END OF FILE calendar.js ---