// --- START OF FILE state.js ---
// state.js
import * as config from './config.js'; // Import config for defaults

// Global Time Control State
export let selectedGlobalDate = null;
export let selectedGlobalHour = null;

// Wind Speed Filter State
export let isSpeedFilterEnabled = false;
export let minWindSpeedFilter = 5;
export let maxWindSpeedFilter = 15;

// Star Rating Filter State
export let selectedMinStars = 0; // 0 means 'Any'

// RASP Overlay State
export let isRaspOverlayEnabled = false;
export let raspOpacity = 25; // Initial percentage

// --- Custom Precipitation Overlay State ---
export let isPrecipOverlayVisible = config.DEFAULT_PRECIP_OVERLAY_VISIBLE;
export let precipOverlayOpacity = Math.round(config.DEFAULT_PRECIP_OVERLAY_OPACITY * 100); // Store as percentage 0-100
export let precipImageIndex = new Map(); // Map<UtcTimestampString, ImageUrl>
export let isPrecipIndexLoading = false;
export let isPrecipIndexBuilt = false;

// Site Calendar State
export let selectedSiteIdForCalendar = null;
export let currentlyOpenPopupSiteId = null; // *** RESTORED Variable ***
// export let selectedMarkerSiteId = null;    // *** REMOVED/Commented Out ***

// Map State (can be expanded if needed)
export let isWindLayerVisible = false; // Tracks if the layer is CURRENTLY on the map
export let userPrefersParticlesVisible = true; // Tracks the user's setting via Layer Control

// Airspace & NOTAM State
export let isGeneralAirspaceVisible = false;
export let isNotamsVisible = false;
export let airspaceAltitudeFilter = config.DEFAULT_AIRSPACE_ALTITUDE_FT; // In feet

// Open Meteo Wind Indicator State
export let isOpenMeteoIndicatorEnabled = false;

// Tracker Mode State
export let isTrackerModeActive = false;


// --- Simple State Updaters ---

export function setGlobalTime(date, hour) {
    selectedGlobalDate = date;
    selectedGlobalHour = hour;
}

export function setOpenMeteoIndicatorEnabled(enabled) {
    if (typeof enabled === 'boolean') {
        isOpenMeteoIndicatorEnabled = enabled;
        console.log(`Global state updated: OpenMeteo Indicator Enabled = ${isOpenMeteoIndicatorEnabled}`);
    }
}

export function setSpeedFilterEnabled(enabled) {
    if (typeof enabled === 'boolean') {
        isSpeedFilterEnabled = enabled;
    }
}

export function setSpeedFilterRange(min, max) {
    const minNum = parseFloat(min);
    const maxNum = parseFloat(max);
    if (!isNaN(minNum)) minWindSpeedFilter = minNum;
    if (!isNaN(maxNum)) maxWindSpeedFilter = maxNum;
}

export function setSelectedMinStars(value) {
    const parsedValue = parseInt(value, 10);
    selectedMinStars = !isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= 5 ? parsedValue : 0;
    console.log(`Global state updated: Min Stars=${selectedMinStars}`);
}

export function getSelectedMinStars() {
    return selectedMinStars;
}

export function setRaspEnabled(enabled) {
    if (typeof enabled === 'boolean') {
        isRaspOverlayEnabled = enabled;
    }
}
export function setRaspOpacity(value) {
    const opacity = parseInt(value, 10);
     if (!isNaN(opacity) && opacity >= 0 && opacity <= 100) {
        raspOpacity = opacity;
    }
}

// --- Precipitation Overlay Setters ---
export function setPrecipOverlayVisible(visible) {
    if (typeof visible === 'boolean') {
        isPrecipOverlayVisible = visible;
        console.log(`Global state updated: Precip Overlay Visible = ${isPrecipOverlayVisible}`);
    }
}
export function setPrecipOverlayOpacity(value) {
    const opacity = parseInt(value, 10);
    if (!isNaN(opacity) && opacity >= 0 && opacity <= 100) {
        precipOverlayOpacity = opacity;
        console.log(`Global state updated: Precip Overlay Opacity = ${precipOverlayOpacity}%`);
    }
}
export function setPrecipIndexLoading(isLoading) { if (typeof isLoading === 'boolean') isPrecipIndexLoading = isLoading; }
export function setPrecipIndexBuilt(isBuilt) { if (typeof isBuilt === 'boolean') isPrecipIndexBuilt = isBuilt; }
export function addPrecipImageToIndex(utcTimestampString, imageUrl) { if (typeof utcTimestampString === 'string' && typeof imageUrl === 'string') precipImageIndex.set(utcTimestampString, imageUrl); }
export function getPrecipImageIndex() { return precipImageIndex; }
export function clearPrecipImageIndex() { precipImageIndex.clear(); isPrecipIndexBuilt = false; console.log("Global state: Precip Image Index cleared."); }


// --- Site Interaction State Setters ---

// *** RESTORED Setter for popup state ***
export function setOpenPopupSiteId(siteId) {
     // Allow setting to null to clear
    if (siteId === null || typeof siteId === 'string' || typeof siteId === 'number') {
         currentlyOpenPopupSiteId = siteId !== null ? String(siteId) : null; // Ensure string or null
         // console.log(`Global state updated: Open Popup ID = ${currentlyOpenPopupSiteId}`); // Optional log
    } else {
        console.warn(`setOpenPopupSiteId: Invalid siteId type provided: ${typeof siteId}`);
    }
}

// *** REMOVED or Comment Out the marker selection setter ***
/*
export function setSelectedMarkerSiteId(siteId) {
    if (siteId === null || typeof siteId === 'string' || typeof siteId === 'number') {
         selectedMarkerSiteId = siteId !== null ? String(siteId) : null;
         console.log(`Global state updated: Selected Marker ID = ${selectedMarkerSiteId}`);
    } else {
        console.warn(`setSelectedMarkerSiteId: Invalid siteId type provided: ${typeof siteId}`);
    }
}
*/

export function setSelectedCalendarSiteId(siteId) {
    if (siteId === null || typeof siteId === 'string' || typeof siteId === 'number') {
         selectedSiteIdForCalendar = siteId !== null ? String(siteId) : null;
    } else {
         console.warn(`setSelectedCalendarSiteId: Invalid siteId type provided: ${typeof siteId}`);
    }
}


// --- Map Layer Visibility State ---
export function setWindLayerVisible(visible) { if (typeof visible === 'boolean') isWindLayerVisible = visible; }
export function setUserPrefersParticlesVisible(visible) { if (typeof visible === 'boolean') { userPrefersParticlesVisible = visible; console.log(`Global state updated: User Prefers Particles Visible = ${userPrefersParticlesVisible}`); } }

// --- Airspace & NOTAM Updaters ---
export function setGeneralAirspaceVisible(visible) { if (typeof visible === 'boolean') isGeneralAirspaceVisible = visible; }
export function setNotamsVisible(visible) { if (typeof visible === 'boolean') isNotamsVisible = visible; }
export function setAirspaceAltitudeFilter(altitude) { const altFt = parseInt(altitude, 10); airspaceAltitudeFilter = (isNaN(altFt) || altFt < 0) ? config.DEFAULT_AIRSPACE_ALTITUDE_FT : altFt; console.log(`Global state updated: Airspace Altitude Filter = ${airspaceAltitudeFilter} ${config.AIRSPACE_ALTITUDE_UNIT}`); }

// --- Tracker Mode State ---
export function setTrackerModeActive(active) { if (typeof active === 'boolean') isTrackerModeActive = active; }

// --- END OF FILE state.js ---