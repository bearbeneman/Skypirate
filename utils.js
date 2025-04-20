// --- START OF FILE utils.js ---
// utils.js
import { KNOTS_TO_MPH, KPH_TO_MPH, COMPASS_POINTS, SECTOR_SIZE } from './config.js';

/**
 * Helper to determine if the UK is currently observing BST (British Summer Time).
 * Simplified check based on typical DST dates (Last Sunday March to Last Sunday October).
 * @param {Date} date The date object to check.
 * @returns {boolean} True if likely BST, false otherwise.
 */
export function isUkDst(date) {
    if (!(date instanceof Date)) return false; // Basic type check
    const year = date.getFullYear();
    // Find last Sunday in March
    const marchEnd = new Date(year, 2, 31); // March 31st
    const marchLastSunday = 31 - marchEnd.getDay();
    const dstStart = new Date(Date.UTC(year, 2, marchLastSunday, 1, 0, 0, 0)); // DST starts 1am UTC

    // Find last Sunday in October
    const octoberEnd = new Date(year, 9, 31); // October 31st
    const octoberLastSunday = 31 - octoberEnd.getDay();
    const dstEnd = new Date(Date.UTC(year, 9, octoberLastSunday, 1, 0, 0, 0)); // DST ends 1am UTC

    const checkTime = date.getTime(); // Get time value once
    return checkTime >= dstStart.getTime() && checkTime < dstEnd.getTime();
}

/**
 * Formats a Date object into YYYYMMDD_HHMMSS string for precipitation filenames.
 * Always uses UTC values from the Date object.
 * @param {Date} dateObj - The Date object to format.
 * @returns {string|null} Formatted string (e.g., "20250409_030000") or null if input is invalid.
 */
export function formatUtcDateForPrecipFilename(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        console.warn("formatUtcDateForPrecipFilename: Invalid Date object provided.");
        return null;
    }
    const year = dateObj.getUTCFullYear();
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    const hour = String(dateObj.getUTCHours()).padStart(2, '0');
    const minute = String(dateObj.getUTCMinutes()).padStart(2, '0');
    const second = String(dateObj.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hour}${minute}${second}`;
}


// ... (rest of utils.js: windSpeedDirToUV, getSuitableDirections, etc.) ...

/**
 * Converts wind speed (knots) and direction (degrees) to U, V components (m/s).
 * @param {number|string} speed - Speed in knots.
 * @param {number|string} directionDegrees - Direction wind is coming FROM (degrees).
 * @returns {{u: number, v: number}} Eastward (u) and Northward (v) wind components in m/s.
 */
export function windSpeedDirToUV(speed, directionDegrees) {
    const dir = parseFloat(directionDegrees);
    const spd = parseFloat(speed);
    if (isNaN(dir) || isNaN(spd)) return { u: 0, v: 0 };

    const directionRad = ((270 - dir + 360) % 360) * Math.PI / 180;
    const speedMs = spd * 0.51444; // Knots to m/s
    const u = speedMs * Math.cos(directionRad);
    const v = speedMs * Math.sin(directionRad);
    return { u, v };
}

/**
 * Returns a comma-separated string of suitable wind directions.
 * @param {Array<number>} windDirArray - 16-element array (0= unsuitable, 1=OK, 2=Good).
 * @returns {string} Comma-separated directions or "N/A" or "None specified".
 */
export function getSuitableDirections(windDirArray) {
    if (!windDirArray || windDirArray.length !== 16) {
        return "N/A";
    }
    const suitable = [];
    windDirArray.forEach((suitability, i) => {
        if (suitability === 1 || suitability === 2) {
            suitable.push(COMPASS_POINTS[i]);
        }
    });
    return suitable.length > 0 ? suitable.join(", ") : "None specified";
}

/**
 * Formats site guide information for display.
 * @param {string|object} guideData - Raw guide data (string or JSON string).
 * @returns {string} Formatted HTML string or "N/A".
 */
export function formatGuideInfo(guideData) {
    if (!guideData) { return "N/A"; }
    if (typeof guideData === 'string' && guideData.trim().startsWith('{')) {
        try {
            const guideJson = JSON.parse(guideData);
            let formattedGuide = "";
            for (const key in guideJson) {
                if (Object.prototype.hasOwnProperty.call(guideJson, key) && guideJson[key] != null && String(guideJson[key]).trim() !== '') {
                    const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
                    formattedGuide += `<b>${capitalizedKey}:</b> ${guideJson[key]}<br>`;
                }
            }
            return formattedGuide || "Guide data available but empty.";
        } catch (e) {
            console.warn("Error parsing guide JSON:", guideData, e);
            return `<b>Guide (raw):</b> ${guideData}`; // Fallback for invalid JSON
        }
    } else if (typeof guideData === 'string' && guideData.trim()) {
        return `<b>Guide:</b> ${guideData}`; // Handle plain string guide info
    }
    return "N/A";
}

/**
 * Converts wind direction degrees to a 16-point compass sector index (0-15).
 * @param {number} degrees - Wind direction (0-360).
 * @returns {number} Sector index (0=N, 1=NNE, ...) or -1 if invalid.
 */
export function degreesToSectorIndex(degrees) {
    if (typeof degrees !== 'number' || isNaN(degrees)) {
        return -1;
    }
    const normalizedDegrees = ((degrees % 360) + 360) % 360;
    const index = Math.floor(((normalizedDegrees + SECTOR_SIZE / 2) % 360) / SECTOR_SIZE);
    return index;
}

/**
 * Converts wind direction degrees to a 16-point compass direction string (N, NNE, etc.).
 * @param {number|string|null|undefined} degrees - Wind direction (0-360).
 * @returns {string} Compass direction string (e.g., "NNE", "S") or "N/A".
 */
export function degreesToCompass(degrees) {
    const degNum = parseFloat(degrees);
    if (isNaN(degNum)) {
        return "N/A";
    }
    const index = degreesToSectorIndex(degNum);
    return index !== -1 ? COMPASS_POINTS[index] : "N/A";
}

/**
 * Finds the latest forecast point for a specific date and hour from an array.
 * @param {Array<object>} forecastArray - Array of forecast points.
 * @param {string} targetDate - YYYY-MM-DD.
 * @param {string} targetHour - HH (zero-padded).
 * @returns {object|null} The latest forecast point or null.
 */
export function getLatestForecastForHour(forecastArray, targetDate, targetHour) {
    if (!forecastArray || !Array.isArray(forecastArray)) return null;

    const matchingForecasts = forecastArray
        .filter(p => p && p.forecast_day === targetDate && String(p.time).padStart(2, '0') === targetHour && p.snapshot_date)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date)); // Sort descending by snapshot date

    return matchingForecasts.length > 0 ? matchingForecasts[0] : null;
}

/**
 * Checks wind suitability over the next 24 hours from now, based on latest forecasts.
 * @param {object} site - Site object with wind_dir array.
 * @param {object} weatherData - Weather data object containing 'weather' array.
 * @returns {{suitability: string, reason: string}} Suitability ('Suitable', 'Unsuitable', 'Unknown') and reason.
 */
export function checkWindSuitabilityNext24h(site, weatherData) {
    if (!site || !site.siteID) {
        return { suitability: 'Unknown', reason: 'Invalid site data' };
    }
    if (!weatherData || weatherData.error || !weatherData.weather || !Array.isArray(weatherData.weather) || weatherData.weather.length === 0) {
        return { suitability: 'Unknown', reason: 'Weather data unavailable or invalid' };
    }
    if (!site.wind_dir || !Array.isArray(site.wind_dir) || site.wind_dir.length !== 16) {
        return { suitability: 'Unknown', reason: 'Site wind direction data missing or invalid' };
    }

    const forecastArray = weatherData.weather;
    const suitableSiteDirections = site.wind_dir;
    const now = new Date();
    const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    let isSuitablePeriodFound = false;
    const latestForecastsNext24h = new Map();

    forecastArray.forEach(p => {
        if (!p || !p.forecast_day || p.time === undefined || p.time === null || !p.snapshot_date) return;
        const hourStr = String(p.time).padStart(2, '0');
        const timeStr = `${p.forecast_day}T${hourStr}:00:00Z`;
        let forecastTime;
        try {
            forecastTime = new Date(timeStr);
            if (isNaN(forecastTime.getTime())) return;
        } catch (e) { return; }

        if (forecastTime >= now && forecastTime <= endTime) {
            const key = `${p.forecast_day}-${hourStr}`;
            const existing = latestForecastsNext24h.get(key);
            if (!existing || p.snapshot_date > existing.snapshot_date) {
                latestForecastsNext24h.set(key, p);
            }
        }
    });

    for (const forecastPoint of latestForecastsNext24h.values()) {
        try {
            const forecastWindDirStr = forecastPoint.wind_dir;
            if (forecastWindDirStr === undefined || forecastWindDirStr === null) continue;
            const forecastWindDir = parseInt(forecastWindDirStr, 10);
            if (isNaN(forecastWindDir)) continue;
            const sectorIndex = degreesToSectorIndex(forecastWindDir);
            if (sectorIndex !== -1) {
                const suitabilityCode = suitableSiteDirections[sectorIndex];
                if (suitabilityCode === 1 || suitabilityCode === 2) {
                    isSuitablePeriodFound = true;
                    break;
                }
            }
        } catch (e) {
            console.error(`Site ${site.siteID}: Error processing forecast point (Next24h - Latest):`, forecastPoint, e);
        }
    }

    const suitability = isSuitablePeriodFound ? 'Suitable' : 'Unsuitable';
    return { suitability: suitability, reason: `Forecast check (${suitability.toLowerCase()})` };
}

/**
 * Checks wind suitability at a specific time using the latest forecast.
 * @param {object} site - Site object.
 * @param {object} weatherData - Weather data object.
 * @param {string} targetDate - YYYY-MM-DD.
 * @param {string} targetHour - HH (zero-padded).
 * @returns {{suitability: string, reason: string}} Suitability and reason.
 */
export function checkWindSuitabilityAtTime(site, weatherData, targetDate, targetHour) {
    if (!site || !site.siteID) {
        return { suitability: 'Unknown', reason: 'Invalid site data' };
    }
    if (!weatherData || weatherData.error || !weatherData.weather || !Array.isArray(weatherData.weather) || weatherData.weather.length === 0) {
        return { suitability: 'Unknown', reason: `No weather data for ${targetDate}` };
    }
    if (!site.wind_dir || !Array.isArray(site.wind_dir) || site.wind_dir.length !== 16) {
        return { suitability: 'Unknown', reason: 'Site wind direction data missing or invalid' };
    }

    const forecastPoint = getLatestForecastForHour(weatherData.weather, targetDate, targetHour);
    if (!forecastPoint) {
        return { suitability: 'Unknown', reason: `No forecast for ${targetDate} ${targetHour}:00` };
    }
    const forecastWindDirStr = forecastPoint.wind_dir;
    if (forecastWindDirStr === undefined || forecastWindDirStr === null) {
        return { suitability: 'Unknown', reason: `Missing wind dir at ${targetDate} ${targetHour}:00` };
    }
    const forecastWindDir = parseInt(forecastWindDirStr, 10);
    if (isNaN(forecastWindDir)) {
        return { suitability: 'Unknown', reason: `Invalid wind dir (${forecastWindDirStr}) at ${targetDate} ${targetHour}:00` };
    }
    const sectorIndex = degreesToSectorIndex(forecastWindDir);
    if (sectorIndex === -1) {
        return { suitability: 'Unknown', reason: 'Could not determine wind sector' };
    }
    const suitabilityCode = site.wind_dir[sectorIndex];
    if (suitabilityCode === 1 || suitabilityCode === 2) {
        return { suitability: 'Suitable', reason: `Wind dir ${forecastWindDir}° suitable at ${targetHour}:00` };
    } else {
        return { suitability: 'Unsuitable', reason: `Wind dir ${forecastWindDir}° unsuitable at ${targetHour}:00` };
    }
}

/**
 * Checks if a site meets wind speed criteria (min/max MPH) at any hour on a given day.
 * @param {object} weatherData - Weather data object.
 * @param {string} targetDate - YYYY-MM-DD.
 * @param {number} minMph - Minimum wind speed in MPH.
 * @param {number} maxMph - Maximum wind speed in MPH.
 * @returns {boolean} True if criteria met at any hour, false otherwise.
 */
export function checkSiteMeetsSpeedCriteriaForDay(weatherData, targetDate, minMph, maxMph) {
    if (!weatherData || !weatherData.weather || !Array.isArray(weatherData.weather)) {
        return false;
    }
    const latestForecastsForDay = new Map();
    weatherData.weather
        .filter(p => p && p.forecast_day === targetDate && p.time !== undefined && p.time !== null && p.snapshot_date)
        .forEach(p => {
            const hour = String(p.time).padStart(2, '0');
            const existingSnapshot = latestForecastsForDay.get(hour)?.snapshot_date;
            if (!existingSnapshot || p.snapshot_date > existingSnapshot) {
                latestForecastsForDay.set(hour, p);
            }
        });
    if (latestForecastsForDay.size === 0) return false;

    for (const forecastPoint of latestForecastsForDay.values()) {
        let mph = forecastPoint.wind_mph;
        if ((mph === undefined || mph === null) && forecastPoint.wind_knts !== undefined && forecastPoint.wind_knts !== null) {
            const kntsNum = parseFloat(forecastPoint.wind_knts);
            if (!isNaN(kntsNum)) mph = kntsNum * KNOTS_TO_MPH;
        }
        if ((mph === undefined || mph === null) && forecastPoint.wind_kph !== undefined && forecastPoint.wind_kph !== null) {
            const kphNum = parseFloat(forecastPoint.wind_kph);
            if (!isNaN(kphNum)) mph = kphNum * KPH_TO_MPH;
        }
        if (mph !== undefined && mph !== null) {
            const mphNum = parseFloat(mph);
            if (!isNaN(mphNum) && mphNum >= minMph && mphNum <= maxMph) {
                return true;
            }
        }
    }
    return false;
}

// --- START: Added to utils.js ---






/**
 * Formats a date string (YYYY-MM-DD) into British format (DD-MM-YY).
 * Handles potential errors gracefully.
 * @param {string | null | undefined} dateStringYYYYMMDD - The date string in YYYY-MM-DD format.
 * @returns {string} The formatted date string (DD-MM-YY) or an error/placeholder string.
 */
export function formatDateGB(dateStringYYYYMMDD, includeWeekday = true) { // Added includeWeekday option
  if (!dateStringYYYYMMDD || typeof dateStringYYYYMMDD !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStringYYYYMMDD)) {
    return "Invalid Date";
  }
  try {
    const dateObj = new Date(dateStringYYYYMMDD + 'T12:00:00Z');
    if (isNaN(dateObj.getTime())) {
         console.warn("formatDateGB created an invalid Date object from:", dateStringYYYYMMDD);
         return "Invalid Date";
    }

    // Define options based on whether weekday is requested
    const options = {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      timeZone: 'UTC'
    };
    if (includeWeekday) {
        options.weekday = 'short'; // Add 'short' for DDD (e.g., Fri)
    }

    const formatter = new Intl.DateTimeFormat('en-GB', options);

    // Intl.formatToParts is more reliable for getting individual components
    const parts = formatter.formatToParts(dateObj);
    let day = '', month = '', year = '', weekday = '';

    parts.forEach(part => {
        switch (part.type) {
            case 'day': day = part.value; break;
            case 'month': month = part.value; break;
            case 'year': year = part.value; break;
            case 'weekday': weekday = part.value; break;
        }
    });

    // Construct the desired output format
    const datePart = `${day}-${month}-${year}`; // DD-MM-YY

    if (includeWeekday && weekday) {
        // Remove potential comma from weekday if present (some locales add it)
        weekday = weekday.replace(',', '');
        return `${weekday}, ${datePart}`; // Format as "DDD, DD-MM-YY"
    } else {
        return datePart; // Return only DD-MM-YY if weekday not requested or found
    }

  } catch (e) {
    console.error("Error formatting date:", dateStringYYYYMMDD, e);
    return "Date Error";
  }
}
// --- END: Added to utils.js ---

/**
 * Debounce function
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @param {boolean} [immediate=false] If true, trigger the function on the leading edge.
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction() {
        const context = this;
        const args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};
// --- END OF FILE utils.js ---

window.formatDateGBUtils = formatDateGB; // Expose helper for non-module scripts