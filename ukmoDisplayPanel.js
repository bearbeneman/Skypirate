// --- START OF FILE ukmoDisplayPanel.js ---

import * as config from './config.js';
import * as state from './state.js';
import * as ukmoWeatherService from './ukmoWeatherService.js';
// Import formatting function if needed, or use basic formatting here
// import { getFormattedValue } from './config.js'; // Example if reusing main config formatter

// --- Module Variables ---
let panelElement = null;
const panelId = 'ukmo-display-panel'; // ID used in HTML

/**
 * Initializes the UKMO Display Panel module.
 * Gets a reference to the panel element and checks the config flag.
 */
export function initialize() {
    panelElement = document.getElementById(panelId);

    if (!panelElement) {
        console.warn(`UKMO Display Panel: Element #${panelId} not found. Panel disabled.`);
        return;
    }

    if (!config.DISPLAY_UKMO_PANEL) {
        console.log("UKMO Display Panel: Disabled via config.DISPLAY_UKMO_PANEL flag.");
        panelElement.style.display = 'none'; // Ensure it's hidden
        // Optionally add a specific class: panelElement.classList.add('hidden-by-config');
        return;
    }

    console.log("UKMO Display Panel: Initialized.");
    // Set initial state (likely hidden until site/time selected)
    clearPanel(true); // Pass true to show the initial placeholder
}

/**
 * Clears the panel content and hides it, or shows a placeholder.
 * @param {boolean} showPlaceholder - If true, show the 'Select site...' message.
 */
export function clearPanel(showPlaceholder = false) {
    if (!panelElement || !config.DISPLAY_UKMO_PANEL) {
        return; // Do nothing if panel doesn't exist or is disabled
    }

    if (showPlaceholder) {
        panelElement.innerHTML = `<span class="ukmo-placeholder">Select a site marker to view UKMO forecast...</span>`;
        panelElement.className = ''; // Remove loading/error classes
        panelElement.style.display = 'flex'; // Ensure visible
    } else {
        panelElement.innerHTML = '';
        panelElement.style.display = 'none'; // Hide completely
    }
}

/**
 * Shows a loading message in the panel.
 */
function showLoading() {
    if (!panelElement || !config.DISPLAY_UKMO_PANEL) return;
    panelElement.innerHTML = `<span class="ukmo-placeholder">Loading UKMO data...</span>`;
    panelElement.className = 'loading'; // Add class for styling
    panelElement.style.display = 'flex';
}

/**
 * Shows an error message in the panel.
 * @param {string} message - The error message to display.
 */
function showError(message = "UKMO data unavailable") {
    if (!panelElement || !config.DISPLAY_UKMO_PANEL) return;
    panelElement.innerHTML = `<span class="ukmo-placeholder">${message}</span>`;
    panelElement.className = 'error'; // Add class for styling
    panelElement.style.display = 'flex';
}

/**
 * Fetches and updates the panel with UKMO data for the given site and time.
 * @param {string | null} siteId - The ID of the site to display data for.
 * @param {string | null} date - The selected date (YYYY-MM-DD).
 * @param {string | number | null} hour - The selected hour (HH or number).
 */
export async function updatePanel(siteId, date, hour) {
    if (!panelElement || !config.DISPLAY_UKMO_PANEL) {
        return; // Panel disabled or not found
    }

    if (!siteId || !date || hour === null || hour === undefined) {
        clearPanel(true); // Show placeholder if site/time not selected
        return;
    }

    showLoading(); // Show loading state

    try {
        const ukmoData = await ukmoWeatherService.getUkmoDataForSiteAndHour(siteId, date, hour);

        if (!ukmoData) {
            // Data not found for this specific hour/site, or service failed
            showError(`UKMO data not available for ${date} ${String(hour).padStart(2,'0')}:00`);
            return;
        }

        // Data found, format and display it
        const panelHTML = _formatUkmoDataToHTML(ukmoData);
        panelElement.innerHTML = panelHTML;
        panelElement.className = ''; // Clear loading/error classes
        panelElement.style.display = 'flex'; // Ensure visible

    } catch (error) {
        console.error("UKMO Display Panel: Error fetching or processing data:", error);
        showError("Error loading UKMO data.");
    }
}

/**
 * Formats the fetched hourly UKMO data into HTML for the panel.
 * @param {object} data - The hourly data object returned by getUkmoDataForSiteAndHour.
 * @returns {string} HTML string content for the panel.
 * @private
 */
function _formatUkmoDataToHTML(data) {
    if (!data) return '<span class="ukmo-placeholder">No data</span>';

    // --- Helper to create an item string (handles null values) ---
    const createItem = (iconClass, value, unit = '', label = '', titleOverride = null) => {
        const displayLabel = label.replace(/_/g, ' '); // Simple label formatting
        let finalTitle = titleOverride; // Use override if provided first

        // Determine display value and default title if no override
        let displayValue = '--';
        let valueForTitle = 'N/A'; // Value used in default title

        if (value !== null && value !== undefined) {
             valueForTitle = value; // Store original value for title before formatting
             if (typeof value === 'number') {
                 if (['temperature_2m', 'dew_point_2m'].includes(label)) {
                     displayValue = value.toFixed(1);
                     valueForTitle = displayValue; // Use formatted value in title too
                 } else if (['wind_speed_10m', 'wind_gusts_10m', 'precipitation'].includes(label)) {
                     displayValue = value.toFixed(1);
                     valueForTitle = displayValue;
                 // **** ADDED: Formatting for Cloud Base ****
                 } else if (label === 'cloud_base_ft') {
                     displayValue = value.toLocaleString(); // Add comma for thousands
                     valueForTitle = displayValue;
                 // **** --------------------------------- ****
                 } else {
                     displayValue = Math.round(value);
                     valueForTitle = displayValue;
                 }
             }
             // Special formatting for the time itself
             else if (label === 'time') {
                  try {
                      const datePart = value.substring(8, 10) + "/" + value.substring(5, 7); // DD/MM
                      const timePart = value.substring(11, 16); // HH:MM
                      displayValue = `${datePart} ${timePart} UTC`; // Combine
                      valueForTitle = displayValue;
                  } catch(e){ displayValue = "??/?? ??:?? UTC"; valueForTitle="Invalid Time";}
             }
             else {
                  displayValue = value; // Use value directly if not number or time
                  valueForTitle = displayValue;
             }
        }

        // Set default title if no override was given
        if (!finalTitle) {
             finalTitle = `${displayLabel}: ${valueForTitle} ${unit}`;
        }


        return `<span class="ukmo-item ${value === null || value === undefined ? 'na' : ''}" title="${finalTitle}"><i class="fas ${iconClass}"></i><span class="ukmo-value">${displayValue}</span><span class="ukmo-unit">${unit}</span></span>`;
    };

    // --- Get Weather Description & Icon ---
    const wmoCode = data.weather_code;
    const weatherDesc = _getWmoDescription(wmoCode);
    const weatherIcon = _getWmoIcon(wmoCode);

    // **** ADD: Calculate Cloud Base ****
    const cloudBaseFt = _calculateCloudBaseFt(data.temperature_2m, data.dew_point_2m);
    // **** ------------------------- ****

    // --- Build HTML ---
    let html = '';
    html += createItem('fa-regular fa-clock', data.time, '', 'time', `UKMO Forecast Time: ${data.time || 'N/A'}`);
    html += createItem(weatherIcon, weatherDesc, '', 'Weather');
    html += createItem('fa-temperature-half', data.temperature_2m, '°C', 'temperature_2m');
    html += createItem('fa-droplet', data.dew_point_2m, '°C', 'dew_point_2m');
    // **** ADD Cloud Base Display ****
    html += createItem('fa-cloud-arrow-up', cloudBaseFt, 'ft', 'cloud_base_ft', `Est. Cloud Base (AGL): ${cloudBaseFt !== null ? cloudBaseFt.toLocaleString() + ' ft' : 'N/A'}`);
    // **** ------------------------ ****
    html += createItem('fa-cloud-showers-heavy', data.precipitation, 'mm', 'precipitation');
    html += createItem('fa-wind', data.wind_speed_10m, 'km/h', 'wind_speed_10m');
    html += createItem('fa-compass', data.wind_direction_10m, '°', 'wind_direction_10m');
    html += createItem('fa-gauge-high', data.wind_gusts_10m, 'km/h', 'wind_gusts_10m');

    return html;
}

/**
 * Provides a basic text description for WMO weather codes.
 * (Based on Open-Meteo documentation - can be expanded)
 * @param {number | null} code - The WMO weather code.
 * @returns {string} A descriptive string.
 * @private
 */
function _getWmoDescription(code) {
    if (code === null || code === undefined) return 'N/A';
    const descriptions = {
        0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
        45: 'Fog', 48: 'Rime Fog',
        51: 'Lt Drizzle', 53: 'Mod Drizzle', 55: 'Dense Drizzle',
        56: 'Lt Freezing Drizzle', 57: 'Dense Freezing Drizzle',
        61: 'Lt Rain', 63: 'Mod Rain', 65: 'Heavy Rain',
        66: 'Lt Freezing Rain', 67: 'Heavy Freezing Rain',
        71: 'Lt Snow', 73: 'Mod Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
        80: 'Lt Showers', 81: 'Mod Showers', 82: 'Violent Showers',
        85: 'Lt Snow Showers', 86: 'Heavy Snow Showers',
        95: 'Thunderstorm', 96: 'Thund. w/ Lt Hail', 99: 'Thund. w/ Heavy Hail'
        // Add more codes as needed
    };
    return descriptions[code] || `Code ${code}`;
}


/**
 * Estimates the cloud base height in feet AGL using temperature and dew point.
 * @param {number | null} tempC - Temperature at 2m in Celsius.
 * @param {number | null} dewPointC - Dew point at 2m in Celsius.
 * @returns {number | null} Estimated cloud base in feet AGL, or null if inputs invalid.
 * @private
 */
function _calculateCloudBaseFt(tempC, dewPointC) {
    // Check if inputs are valid numbers
    if (tempC === null || dewPointC === null || typeof tempC !== 'number' || typeof dewPointC !== 'number' || isNaN(tempC) || isNaN(dewPointC)) {
        return null;
    }

    // If dew point is at or above temperature, cloud base is at the surface (or below)
    if (dewPointC >= tempC) {
        return 0;
    }

    const spread = tempC - dewPointC;
    // Formula: Cloud Base AGL (ft) = Spread (°C) * 400
    const cloudBaseFt = spread * 400;

    // Return rounded to nearest foot (or maybe 10/50/100ft for less false precision)
    return Math.round(cloudBaseFt);
    // Or: return Math.round(cloudBaseFt / 50) * 50; // Round to nearest 50ft
}

/**
 * Provides a Font Awesome icon class for WMO weather codes.
 * @param {number | null} code - The WMO weather code.
 * @returns {string} A Font Awesome class string (e.g., 'fa-sun').
 * @private
 */
function _getWmoIcon(code) {
    if (code === null || code === undefined) return 'fa-question-circle'; // Default icon
    if (code === 0) return 'fa-sun'; // Clear sky
    if (code === 1) return 'fa-cloud-sun'; // Mainly clear
    if (code === 2) return 'fa-cloud'; // Partly cloudy
    if (code === 3) return 'fa-cloud'; // Overcast (use same as partly cloudy for simplicity)
    if (code >= 45 && code <= 48) return 'fa-smog'; // Fog
    if (code >= 51 && code <= 57) return 'fa-cloud-rain'; // Drizzle
    if (code >= 61 && code <= 67) return 'fa-cloud-showers-heavy'; // Rain
    if (code >= 71 && code <= 77) return 'fa-snowflake'; // Snow
    if (code >= 80 && code <= 86) return 'fa-cloud-showers-heavy'; // Showers (rain/snow)
    if (code >= 95 && code <= 99) return 'fa-cloud-bolt'; // Thunderstorm
    return 'fa-question-circle'; // Default for unknown codes
}


// --- END OF FILE ukmoDisplayPanel.js ---