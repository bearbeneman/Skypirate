// --- START OF FILE markerManager.js ---
import * as state from './state.js';
import * as utils from './utils.js';
import * as config from './config.js'; // Import the whole config
// Import specific config values needed directly
import {
    COMPASS_POINTS,
    // --- Dynamic Compass Config ---
    MIN_COMPASS_SIZE,
    MAX_COMPASS_SIZE,
    MIN_ZOOM_FOR_SCALING,
    MAX_ZOOM_FOR_SCALING,
    ON_MAP_COMPASS_Y_OFFSET // This should be in your config.js
} from './config.js';
import * as dataService from './dataService.js';
import * as calendarUi from './calendar.js';
import * as openMeteoService from './openMeteoService.js';
import * as windIndicator from './windIndicator.js';
import * as webcamService from './webcamService.js';

// --- Icon Cache ---
const iconCache = {};

// --- Module-Level Variables for On-Map Compass ---
let onMapCompassLayerGroup = null;
let currentOnMapCompassMarker = null;

// --- Other Module-Level Variables ---
let _updateCallbacks = null;
let _mapInstance = null; // Store the map instance

// --- Constants ---
const CSS_ANIMATION_DURATION = 500;
const ANIMATION_END_BUFFER = 100;
const MARKER_ICON_HEIGHT_ESTIMATE = 42;
const GAP_BELOW_MARKER = 5; // Potentially used if offsetting based on marker, though ON_MAP_COMPASS_Y_OFFSET is now main offset control

/**
 * Gets a cached Leaflet AwesomeMarker icon instance or creates a new one.
 */
function getMarkerIcon(color, iconName, useSvg) {
    const cacheKey = `${color}-${iconName}-${useSvg}`; if (!iconCache[cacheKey]) { try { if (useSvg && color === 'green' && L.AwesomeMarkers?.icon?.customSvg) { iconCache[cacheKey] = L.AwesomeMarkers.icon.customSvg({ icon: iconName, prefix: 'fa', markerColor: color, customSvgUrl: 'Images/Para-icon.svg', customSvgClass: 'awesome-marker-custom-svg' }); } else if (L.AwesomeMarkers?.icon) { iconCache[cacheKey] = L.AwesomeMarkers.icon({ icon: iconName, prefix: 'fa', markerColor: color, iconColor: 'white' }); } else { throw new Error("L.AwesomeMarkers.icon not available."); } } catch (iconError) { console.error(`[IconCache] Error creating icon for key ${cacheKey}:`, iconError); iconCache[cacheKey] = L.icon({ iconUrl: L.Icon.Default.imagePath ? `${L.Icon.Default.imagePath}marker-icon.png` : 'path/to/your/default-marker.png', iconRetinaUrl: L.Icon.Default.imagePath ? `${L.Icon.Default.imagePath}marker-icon-2x.png` : null, shadowUrl: L.Icon.Default.imagePath ? `${L.Icon.Default.imagePath}marker-shadow.png` : null, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28], shadowSize: [41, 41] }); } } return iconCache[cacheKey];
}

// --- AwesomeMarkers Icon Extension code ---
if (typeof L !== 'undefined' && L.AwesomeMarkers && L.AwesomeMarkers.Icon) {
    L.AwesomeMarkers.Icon.CustomSvg = L.AwesomeMarkers.Icon.extend({ options: { customSvgUrl: null, customSvgClass: 'awesome-marker-custom-svg' }, createIcon: function (oldIcon) { const div = L.AwesomeMarkers.Icon.prototype.createIcon.call(this, oldIcon); if (this.options.markerColor === 'green' && this.options.customSvgUrl) { const iconTag = div.querySelector('i'); if (iconTag) { iconTag.className = ''; iconTag.innerHTML = ''; const img = document.createElement('img'); img.src = this.options.customSvgUrl; img.alt = ""; img.className = this.options.customSvgClass; iconTag.appendChild(img); } } return div; } }); L.AwesomeMarkers.icon.customSvg = function (options) { return new L.AwesomeMarkers.Icon.CustomSvg(options); };
} else { console.warn("L.AwesomeMarkers or L.AwesomeMarkers.Icon not found."); }

// --- Helper function to shuffle an array ---
function shuffleArray(array) {
     for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; }
}

/**
 * Initializes markers with staggered animation. Binds popups and event listeners.
 * Also initializes the dynamic compass resizing listener.
 */
export function initializeMarkers(map, layers, siteDataStore, updateCallbacks) {
    console.log("Initializing markers (with popups)...");
    _updateCallbacks = updateCallbacks;
    _mapInstance = map; // Store the map instance

    windIndicator.initializeWindIndicatorLayer(map);

    // Initialize the layer group for the on-map compass
    if (!onMapCompassLayerGroup) {
        // Ensure the pane exists BEFORE adding the layer group to it
        if (!_mapInstance.getPane('onMapCompassPane')) {
             console.error("FATAL: Cannot add onMapCompassLayerGroup, 'onMapCompassPane' does not exist!");
             return Promise.reject("Missing 'onMapCompassPane'"); // Stop initialization
        }
        onMapCompassLayerGroup = L.layerGroup([], { pane: 'onMapCompassPane' }).addTo(map); // Add to specific pane
        console.log("On-Map Compass Layer Group created in 'onMapCompassPane'.");
    } else {
        onMapCompassLayerGroup.clearLayers();
    }
    currentOnMapCompassMarker = null;

    // --- Initialize Dynamic Compass Resizing ---
    initializeDynamicCompassResizing(_mapInstance); // Call AFTER _mapInstance is set


    let resolveAnimationCompleted;
    const animationCompletedPromise = new Promise(resolve => { resolveAnimationCompleted = resolve; });
    const markersToAnimate = [];

    // --- Create marker objects ---
    siteDataStore.forEach((storeEntry, siteId) => {
        const site = storeEntry.site;
        if (!site || typeof site.lat !== 'number' || typeof site.lng !== 'number') { return; }
        try {
            const isSiteClosed = site.closed === "true";
            let initialMarkerColor = 'blue', initialIconAwesome = 'question-circle';
            let initialTargetLayer = layers.openUnknown, initialStatusTextForTooltip = 'Loading weather...';
            if (isSiteClosed) { initialMarkerColor = 'red'; initialIconAwesome = 'ban'; initialTargetLayer = layers.closed; initialStatusTextForTooltip = 'Closed'; }
            else { initialStatusTextForTooltip = 'Open (Weather loading...)'; }

            const initialIconInstance = getMarkerIcon(initialMarkerColor, initialIconAwesome, false);
            const marker = L.marker([site.lat, site.lng], { icon: initialIconInstance });
            marker.siteId = siteId; // Store siteId on marker
            marker.bindTooltip(`${site.name || 'N/A'}`);

            // --- Bind Popup ---
            marker.bindPopup(() => generatePopupHtml(siteId, siteDataStore), {
                maxWidth: 450,
                autoPanPadding: L.point(50, 50),
                keepInView: false
            });

            // --- Event Handlers ---
            marker.on('popupopen', async (e) => {
                const siteId = e.target.siteId;
                const markerInstance = e.target;
                const siteEntryLocal = dataService.getSiteData(siteId);

                console.log(`Popup opened for site ${siteId}`);
                state.setOpenPopupSiteId(siteId); // Update state

                if (_updateCallbacks?.showCalendar) _updateCallbacks.showCalendar(siteId);

                // Handle OpenMeteo Indicator
                windIndicator.removeWindIndicator(markerInstance);
                if (state.isOpenMeteoIndicatorEnabled && siteEntryLocal?.site?.lat && siteEntryLocal?.site?.lng) {
                    await openMeteoService.fetchOpenMeteoData(siteId, siteEntryLocal.site.lat, siteEntryLocal.site.lng);
                    updateIndicatorForCurrentTime(markerInstance);
                }

                // *** Show/Update On-Map Compass ***
                createOrUpdateOnMapCompass(siteId); // This will now use dynamic size
            });

            marker.on('popupclose', (e) => {
                 const siteId = e.target.siteId;
                 const markerInstance = e.target;
                 console.log(`Popup closed for site ${siteId}`);

                 windIndicator.removeWindIndicator(markerInstance);

                 // *** Remove On-Map Compass ***
                 removeOnMapCompass(); // Call removal function

                 if (state.currentlyOpenPopupSiteId === siteId) {
                     state.setOpenPopupSiteId(null); // Update state
                     if (_updateCallbacks?.refreshMarkersOnly) {
                        setTimeout(() => { const d = dataService.getSiteData(siteId); if(d?.weatherData) _updateCallbacks.refreshMarkersOnly()}, 50);
                     }
                 }
                 //if (state.selectedSiteIdForCalendar === siteId && _updateCallbacks?.hideCalendar) {
                 //   _updateCallbacks.hideCalendar();
                 //}
            });

            storeEntry.marker = marker;

            // Prepare for animation
            const layerKey = Object.keys(layers).find(key => layers[key] === initialTargetLayer);
            if (initialTargetLayer && layerKey) { markersToAnimate.push({ marker, targetLayer: initialTargetLayer }); }
            else { console.warn(`No valid target layer for site ${siteId}. Adding directly.`); marker.addTo(map); }
        } catch (siteError) { console.error(`Failed marker creation for site ${site?.siteID || siteId || 'UNKNOWN'}:`, siteError); if (storeEntry) storeEntry.marker = null; }
    });

    // --- Shuffle and Animate ---
    if (markersToAnimate.length === 0) { resolveAnimationCompleted(); return animationCompletedPromise; }
    shuffleArray(markersToAnimate);
    const totalSchedulingDurationMs = 2000; const numMarkers = markersToAnimate.length;
    markersToAnimate.forEach(({ marker, targetLayer }, index) => {
        const scheduleDelay = (index / numMarkers) * totalSchedulingDurationMs; setTimeout(() => { if (!marker?.getElement || !targetLayer || !map.hasLayer(targetLayer)) return; marker.addTo(targetLayer); const markerElement = marker.getElement(); if (markerElement) { markerElement.classList.add('marker-loading-animation'); requestAnimationFrame(() => { if (markerElement?.parentNode) markerElement.classList.remove('marker-loading-animation'); }); } if (index === numMarkers - 1) { const finalDelay = CSS_ANIMATION_DURATION + ANIMATION_END_BUFFER; setTimeout(resolveAnimationCompleted, finalDelay); } }, scheduleDelay);
     });
    console.log(`Scheduled ${numMarkers} markers for animated addition.`);
    return animationCompletedPromise;
}


/**
 * Updates map markers based on filters/time. Updates open popup content and potentially the on-map compass.
 */
export function updateMapMarkers(map, layers, siteDataStore) {
    // Ensure map instance is available
    if (!_mapInstance) _mapInstance = map;

    const isSpecificTimeSelected = state.selectedGlobalDate && state.selectedGlobalHour !== null && state.selectedGlobalHour !== "";
    const openPopupSiteId = state.currentlyOpenPopupSiteId; // Use popup state
    const selectedDate = state.selectedGlobalDate;
    const currentMinStars = state.getSelectedMinStars();

    // --- Update the on-map compass IF a popup is currently open ---
    // Ensures compass reflects current data/time, size is handled by zoom listener
    if (openPopupSiteId) {
        createOrUpdateOnMapCompass(openPopupSiteId);
    }
    // --- Removal is handled by popupclose event ---

    // --- Update all site markers ---
    siteDataStore.forEach((siteEntry, siteId) => {
        const site = siteEntry.site;
        const marker = siteEntry.marker;
        const weatherData = siteEntry.weatherData;
        const weatherError = siteEntry.weatherError;

        if (!site || !marker) return;

        const isPopupOpenForThisMarker = (String(marker.siteId) === String(openPopupSiteId));

        // Filter Checks
        let meetsSpeedCriteria = !state.isSpeedFilterEnabled || !selectedDate || (weatherData && utils.checkSiteMeetsSpeedCriteriaForDay(weatherData, selectedDate, state.minWindSpeedFilter, state.maxWindSpeedFilter));
        let meetsStarCriteria = currentMinStars <= 0 || !selectedDate || (weatherData && siteReachesMinStarsOnDay(siteEntry, selectedDate, currentMinStars));
        if (weatherError || !weatherData) { if (state.isSpeedFilterEnabled && selectedDate) meetsSpeedCriteria = false; if (currentMinStars > 0 && selectedDate) meetsStarCriteria = false; }
        const shouldBeVisible = meetsSpeedCriteria && meetsStarCriteria;

        // Update Marker
        try {
            const isSiteClosed = site.closed === "true";
            let suitabilityResult = { suitability: 'Unknown', reason: 'N/A' }, statusText = 'Unknown';
            if (isSiteClosed) { suitabilityResult = { suitability: 'Closed', reason: 'Site closed' }; statusText = 'Closed'; } else if (weatherError) { suitabilityResult = { suitability: 'Error', reason: `Weather Error` }; statusText = `Open (Weather Error)`; } else if (!weatherData) { suitabilityResult = { suitability: 'Unknown', reason: 'Loading...' }; statusText = 'Open (Weather loading...)'; } else { if (isSpecificTimeSelected) suitabilityResult = utils.checkWindSuitabilityAtTime(site, weatherData, selectedDate, state.selectedGlobalHour); else suitabilityResult = utils.checkWindSuitabilityNext24h(site, weatherData); if (suitabilityResult.suitability === 'Suitable') statusText = `Open (Wind Suitable)`; else if (suitabilityResult.suitability === 'Unsuitable') statusText = `Open (Wind Unsuitable)`; else statusText = `Open (${suitabilityResult.reason || 'Weather Unknown'})`; }
            let markerColor = 'gray', iconAwesome = 'question-circle', targetLayer = layers.openUnknown, useAwesomeSvgFactory = false; if (isSiteClosed) { markerColor = 'red'; iconAwesome = 'ban'; targetLayer = layers.closed; } else if (suitabilityResult.suitability === 'Error') { markerColor = 'purple'; iconAwesome = 'exclamation-triangle'; targetLayer = layers.openUnknown; } else if (suitabilityResult.suitability === 'Suitable') { markerColor = 'green'; iconAwesome = 'plane'; targetLayer = layers.openSuitable; useAwesomeSvgFactory = true; } else if (suitabilityResult.suitability === 'Unsuitable') { markerColor = 'orange'; iconAwesome = 'times-circle'; targetLayer = layers.openUnsuitable; } else { markerColor = 'blue'; iconAwesome = 'question-circle'; targetLayer = layers.openUnknown; }

            // Update Icon & Tooltip
            const newIconInstance = getMarkerIcon(markerColor, iconAwesome, useAwesomeSvgFactory);
            if (marker.options.icon !== newIconInstance) marker.setIcon(newIconInstance);
            const tooltipText = `${site.name || 'N/A'}`;
            if (marker.getTooltip()) { if(marker.getTooltip().getContent() !== tooltipText) marker.setTooltipContent(tooltipText); } else { marker.bindTooltip(tooltipText); }

            // Update Layer Membership & Visibility
            let currentLayer = null;
            Object.values(layers).forEach(layer => { if (layer.hasLayer(marker)) currentLayer = layer; });

            if (!shouldBeVisible && !isPopupOpenForThisMarker) {
                 if (currentLayer) currentLayer.removeLayer(marker);
            } else {
                 const targetLayerValid = !!Object.keys(layers).find(key => layers[key] === targetLayer);
                 if (!targetLayerValid) { console.warn(`Invalid target layer for site ${siteId}.`); if (currentLayer && !isPopupOpenForThisMarker) currentLayer.removeLayer(marker); return; }

                 if (isPopupOpenForThisMarker) {
                     if (currentLayer !== targetLayer) { if (currentLayer) currentLayer.removeLayer(marker); targetLayer.addLayer(marker); }
                     else if (!currentLayer) { targetLayer.addLayer(marker); }
                 } else {
                     if (currentLayer !== targetLayer) { if (currentLayer) currentLayer.removeLayer(marker); targetLayer.addLayer(marker); }
                     else if (!currentLayer) { targetLayer.addLayer(marker); }
                 }
            }
        } catch (updateError) { console.error(`[UpdateMarkers] Error updating marker ${siteId}:`, updateError); Object.values(layers).forEach(layer => { if (layer.hasLayer(marker)) layer.removeLayer(marker); }); }
    }); // End siteDataStore.forEach

    // Update content of the currently open popup
    if (openPopupSiteId) {
        const entry = dataService.getSiteData(openPopupSiteId);
        if (entry?.marker?.isPopupOpen()) {
            entry.marker.setPopupContent(generatePopupHtml(openPopupSiteId, siteDataStore));
        } else if (openPopupSiteId) {
            console.warn(`[UpdateMarkers] Mismatch: State has openPopupSiteId=${openPopupSiteId}, but marker popup is not open. Clearing state.`);
            state.setOpenPopupSiteId(null);
            removeOnMapCompass(); // Also remove compass if state was wrong
        }
    }
}


/**
 * Checks if a site reaches the minimum star rating on a given day.
 */
function siteReachesMinStarsOnDay(siteEntry, selectedDate, minStars) {
    if (minStars <= 0) return true; if (!selectedDate) return true; if (!siteEntry?.weatherData?.weather?.length) return false; const latestSnapshots = new Map(); siteEntry.weatherData.weather.filter(p => p?.forecast_day === selectedDate && p.time !== undefined && p.time !== null && p.snapshot_date).forEach(p => { const hour = String(p.time).padStart(2, '0'); const existingSnapshot = latestSnapshots.get(hour); if (!existingSnapshot || p.snapshot_date > existingSnapshot) latestSnapshots.set(hour, p.snapshot_date); }); const latestWeatherForDay = siteEntry.weatherData.weather.filter(p => { if (!p || p.forecast_day !== selectedDate || p.time === undefined || p.time === null || !p.snapshot_date) return false; const hour = String(p.time).padStart(2, '0'); return latestSnapshots.get(hour) === p.snapshot_date; }).filter((p, index, self) => index === self.findIndex((t) => (String(t.time).padStart(2,'0') === String(p.time).padStart(2,'0')))); if (latestWeatherForDay.length === 0) return false; for (const forecastPoint of latestWeatherForDay) { if (forecastPoint?.stars !== undefined && forecastPoint.stars !== null) { const numericRating = parseFloat(forecastPoint.stars); if (!isNaN(numericRating) && numericRating >= minStars) return true; } } return false;
}


/**
 * Generates the FULL HTML content for a site's popup.
 */
function generatePopupHtml(siteId, siteDataStore) {
    const siteEntry = dataService.getSiteData(String(siteId)); if (!siteEntry || !siteEntry.site) { console.error(`[Popup Gen ERROR] Site data/entry missing for ID ${siteId}.`); return `<div class="leaflet-popup-content-custom-wrapper">Error: Site data invalid/missing.</div>`; } const currentSite = siteEntry.site, currentWeatherData = siteEntry.weatherData, currentError = siteEntry.weatherError, marker = siteEntry.marker; const name = currentSite.name || 'N/A'; const siteLat = typeof currentSite.lat === 'number' ? currentSite.lat : null; const siteLon = typeof currentSite.lng === 'number' ? currentSite.lng : null; const altitude = currentSite.alt !== null && currentSite.alt !== undefined ? `${currentSite.alt} m ASL` : 'N/A'; const clubName = currentSite.clubName || 'N/A'; const suitableWinds = utils.getSuitableDirections(currentSite.wind_dir); const formattedGuide = utils.formatGuideInfo(currentSite.guide); let mapLinksHtml = ''; if (siteLat !== null && siteLon !== null) { const googleMapsLogoUrl = './images/gmaps.png'; const what3WordsLogoUrl = './images/w3w.png'; const osMapsLogoUrl = './images/osmaps.png'; const iconStyle = "height: 24px; width: auto; vertical-align: middle; border: none; margin: 0 3px;"; const googleMapsUrl = `https://www.google.com/maps?q=${siteLat},${siteLon}`; const what3WordsUrl = `https://what3words.com/${siteLat},${siteLon}`; const osMapsUrl = `https://explore.osmaps.com/pin?lat=${siteLat}&lon=${siteLon}&z=16`; mapLinksHtml += `<a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" title="View on Google Maps"><img src="${googleMapsLogoUrl}" alt="G" style="${iconStyle}"></a>`; mapLinksHtml += `<a href="${what3WordsUrl}" target="_blank" rel="noopener noreferrer" title="View on What3Words"><img src="${what3WordsLogoUrl}" alt="W" style="${iconStyle}"></a>`; mapLinksHtml += `<a href="${osMapsUrl}" target="_blank" rel="noopener noreferrer" title="View on OS Maps"><img src="${osMapsLogoUrl}" alt="OS" style="${iconStyle}"></a>`; } let webcamLinkHtml = ''; if (siteLat !== null && siteLon !== null && webcamService.isLoaded()) { const closestWebcam = webcamService.findClosestWebcam(siteLat, siteLon, 50); if (closestWebcam) { const distanceText = closestWebcam.distanceKm !== undefined ? `(${closestWebcam.distanceKm.toFixed(1)} km)` : ''; const linkStyle = "color: #0078A8; text-decoration: none; vertical-align: middle; font-size: 0.9em;"; const iconStyle = "color: #6c757d; font-size: 1em; vertical-align: middle; margin-right: 2px;"; webcamLinkHtml = `<a href="${closestWebcam.pageUrl}" target="_blank" rel="noopener noreferrer" title="Nearby Webcam: ${closestWebcam.shortTitle || closestWebcam.title} ${distanceText}" class="popup-webcam-link" style="${linkStyle}">` + `<i class="fas fa-video" style="${iconStyle}"></i>` + ` Nearest Webcam ${distanceText}` + `</a>`; } } let displayStatus = 'Calculating...'; if (marker?.getTooltip()?.getContent()) { const tooltipContent = marker.getTooltip().getContent(); const statusMatch = tooltipContent.match(/\(([^)]+)\)/); if (statusMatch?.[1]) { displayStatus = statusMatch[1]; } else if (tooltipContent.includes('Closed')) { displayStatus = 'Closed'; } else if (tooltipContent.includes('Error')) { displayStatus = `Open (Weather Error)`; } else if (tooltipContent.includes('loading')) { displayStatus = 'Open (Weather loading...)'; } else if (tooltipContent.includes('Suitable')) { displayStatus = 'Open (Wind Suitable)'; } else if (tooltipContent.includes('Unsuitable')) { displayStatus = 'Open (Wind Unsuitable)'; } else { displayStatus = 'Open (Update Pending)'; } } else { if (currentSite.closed === "true") { displayStatus = 'Closed'; } else if (currentError) { displayStatus = `Open (Weather Error)`; } else if (!currentWeatherData) { displayStatus = 'Open (Weather loading...)'; } else { displayStatus = 'Open (Update Pending)'; } }
    let forecastSectionHtml = ''; const isSpecificTimeSelected = state.selectedGlobalDate && state.selectedGlobalHour !== null && state.selectedGlobalHour !== ""; if (isSpecificTimeSelected) { if (currentError) { forecastSectionHtml = `<div class='popup-controls' style='color: #cc0000; font-weight: bold; text-align: center;'>Weather Error: ${currentError}</div>`; } else if (!currentWeatherData) { forecastSectionHtml = `<div class='popup-controls' style='color: #888; font-style: italic; text-align: center;'>Loading forecast for ${state.selectedGlobalHour}:00...</div>`; } else { const forecastPoint = utils.getLatestForecastForHour(currentWeatherData.weather, state.selectedGlobalDate, state.selectedGlobalHour); let compassRotation = 0, windInfoText = 'No data', compassBackground = 'background-color: #f0f0f0;', compassDirectionString = "N/A", compassDirColor = 'red', rainHtml = '<div class="popup-rain-info">Rain: N/A</div>'; let needleClass = 'popup-compass-needle'; if (forecastPoint) { const dirStr = forecastPoint.wind_dir, knts = forecastPoint.wind_knts; let mph = forecastPoint.wind_mph; if ((!mph && mph !== 0) && (knts || knts === 0)) mph = parseFloat(knts) * config.KNOTS_TO_MPH; if ((!mph && mph !== 0) && forecastPoint.wind_kph) mph = parseFloat(forecastPoint.wind_kph) * config.KPH_TO_MPH; const dir = parseInt(dirStr, 10); if (!isNaN(dir)) { compassRotation = dir; needleClass += ' animate-needle'; compassDirectionString = utils.degreesToCompass(dir); const sectorIndex = utils.degreesToSectorIndex(dir); if (sectorIndex !== -1 && currentSite.wind_dir?.length === 16) { const suitabilityCode = currentSite.wind_dir[sectorIndex]; if (suitabilityCode === 1 || suitabilityCode === 2) compassDirColor = 'green'; } let speedText = (knts || knts === 0) ? `${knts} kts` : 'N/A'; if ((mph || mph === 0) && !isNaN(mph)) speedText += ` (${mph.toFixed(1)} mph)`; windInfoText = `@ ${speedText}`; } else { windInfoText = 'Dir N/A'; if (knts || knts === 0) windInfoText += ` @ ${knts} kts`; compassDirectionString = utils.degreesToCompass(dirStr); } const numericRain = parseFloat(forecastPoint.rain); if (isNaN(numericRain)) rainHtml = '<div class="popup-rain-info">Rain: N/A</div>'; else if (numericRain <= 0) rainHtml = '<div class="popup-rain-info">No Rain</div>'; else { let icon = (numericRain < 2) ? 'drizzle' : 'showers-heavy'; let text = (numericRain < 2) ? 'Light' : 'Heavy'; rainHtml = `<div class="popup-rain-info"><i class="fas fa-cloud-${icon} ${text.toLowerCase()}-rain-icon popup-rain-icon"></i> ${text} Rain (${numericRain.toFixed(2)}mm)</div>`; } if (currentSite.wind_dir && Array.isArray(currentSite.wind_dir) && currentSite.wind_dir.length === 16) { try { const goodColor = '#00FF00', okColor = '#009900', unsuitableColor = 'transparent'; const sectorAngle = 22.5; let gradientStops = []; const getColor = (code) => (code === 2 ? goodColor : (code === 1 ? okColor : unsuitableColor)); gradientStops.push(`${getColor(currentSite.wind_dir[0])} 0deg`); for (let i = 0; i < 16; i++) { const boundaryAngle = (i + 1) * sectorAngle; const colorBeforeBoundary = getColor(currentSite.wind_dir[i]); const colorAfterBoundary = getColor(currentSite.wind_dir[(i + 1) % 16]); gradientStops.push(`${colorBeforeBoundary} ${boundaryAngle}deg`); gradientStops.push(`${colorAfterBoundary} ${boundaryAngle}deg`); } let cleanedStops = gradientStops.length > 0 ? [gradientStops[0]] : []; for (let i = 1; i < gradientStops.length; i++) { if (gradientStops[i] !== cleanedStops[cleanedStops.length - 1]) cleanedStops.push(gradientStops[i]); } if (cleanedStops.length > 1 && cleanedStops[0].startsWith(cleanedStops[cleanedStops.length-1].split(' ')[0]) && cleanedStops[cleanedStops.length-1].endsWith(' 360deg')) cleanedStops.pop(); compassBackground = `background: conic-gradient(${cleanedStops.join(', ')});`; } catch (error) { /* Default background */ } } } else { windInfoText = 'Forecast unavailable'; rainHtml = '<div class="popup-rain-info">Rain data unavailable</div>'; } forecastSectionHtml = `<div class="popup-controls"><div class="popup-column popup-column-text"><span class="popup-wind-compass-direction" style="color: ${compassDirColor};">${compassDirectionString}</span></div><div class="popup-column popup-column-compass"><div class="popup-compass-container"><div class="popup-compass" style="${compassBackground}"><div class="${needleClass}" style="--target-rotation: ${compassRotation}deg;"></div></div><div class="popup-wind-info">${!isNaN(compassRotation) ? compassRotation+'°' : ''} ${windInfoText}</div>${rainHtml}</div></div></div>`; } } else { forecastSectionHtml = `<div class="popup-controls" style="text-align: center; font-style: italic; color: #666; padding-top: 5px;">Select a date/hour to see forecast details.</div>`; }
    let popupHtml = `<div class="leaflet-popup-content-custom-wrapper"><span style="font-size: 1.6em; text-transform: uppercase; font-weight: 800;">${name}</span><span style="font-size: 0.9em; color: #555; display: block; margin-bottom: 5px;">Status: ${displayStatus}</span><div style="font-size: 0.9em; color: #333; margin-bottom: 8px;"><b>Above sea level:</b> ${altitude}<br><b>Club:</b> ${clubName}<br><b>Suitable Wind Dir:</b> ${suitableWinds}<br><b>Coords:</b> (${siteLat !== null ? siteLat.toFixed(4) : 'N/A'}, ${siteLon !== null ? siteLon.toFixed(4) : 'N/A'})<div style="margin-top: 5px;">${mapLinksHtml} ${webcamLinkHtml}</div></div>${forecastSectionHtml}${formattedGuide && formattedGuide !== 'N/A' ? `<div style='margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; font-size: 0.85em;'>${formattedGuide}</div>` : ''}</div>`; return popupHtml;
}

/**
 * Helper Function to Update OpenMeteo Indicator
 */
function updateIndicatorForCurrentTime(markerInstance) {
    if (!markerInstance?.siteId || !_mapInstance) return; const siteId = markerInstance.siteId; if (!state.isOpenMeteoIndicatorEnabled) { windIndicator.removeWindIndicator(markerInstance); return; } const date = state.selectedGlobalDate, hour = state.selectedGlobalHour; if (!date || hour === null || hour === "") { windIndicator.removeWindIndicator(markerInstance); return; } const windData = openMeteoService.getOpenMeteoDataForHour(siteId, date, hour); if (windData) { let indicator = markerInstance._windIndicatorLayer; if (!indicator) indicator = windIndicator.createWindIndicator(_mapInstance, markerInstance, windData.direction); if (indicator) windIndicator.updateWindIndicator(markerInstance, windData.direction, windData.speed); } else { windIndicator.removeWindIndicator(markerInstance); }
}

// --- **** START: On-Map Compass Helper Functions (Modified for Dynamic Sizing & Text) **** ---

/**
 * Removes the currently displayed on-map compass marker.
 * Exported for use by main.js map click handler and internal logic.
 */
export function removeOnMapCompass() {
    if (currentOnMapCompassMarker && onMapCompassLayerGroup) {
        if (onMapCompassLayerGroup.hasLayer(currentOnMapCompassMarker)) {
            onMapCompassLayerGroup.removeLayer(currentOnMapCompassMarker);
        }
    }
    currentOnMapCompassMarker = null;
}

/**
 * Calculates the desired compass size based on the current map zoom level.
 * Uses linear interpolation between min and max sizes within the specified zoom range.
 * @param {number} zoom - The current map zoom level.
 * @returns {number} The calculated size in pixels.
 */
function calculateSizeForZoom(zoom) {
    // Ensure config values are numbers, provide defaults if missing
    const minZoom = typeof MIN_ZOOM_FOR_SCALING === 'number' ? MIN_ZOOM_FOR_SCALING : 8;
    const maxZoom = typeof MAX_ZOOM_FOR_SCALING === 'number' ? MAX_ZOOM_FOR_SCALING : 14;
    const minSize = typeof MIN_COMPASS_SIZE === 'number' ? MIN_COMPASS_SIZE : 40;
    const maxSize = typeof MAX_COMPASS_SIZE === 'number' ? MAX_COMPASS_SIZE : 100;

    const clampedZoom = Math.max(minZoom, Math.min(zoom, maxZoom));
    const zoomRange = maxZoom - minZoom;
    const sizeRange = maxSize - minSize;

    if (zoomRange <= 0 || sizeRange <= 0) {
        // Handle edge cases: invalid range or min/max are the same
        return minSize;
    }

    // Linear interpolation
    const scale = (clampedZoom - minZoom) / zoomRange;
    const calculatedSize = minSize + (sizeRange * scale);

    // Clamp final size and ensure it's an integer for pixel values
    return Math.round(Math.max(minSize, Math.min(calculatedSize, maxSize)));
}

/**
 * Creates an L.divIcon object for the on-map compass with dynamic properties.
 * Includes wind direction text below the visual compass.
 * @param {string} siteId - The ID of the site for which to create the compass.
 * @param {number} size - The desired size (width/height) for the compass visual part.
 * @param {number} offsetY - The vertical offset (positive moves compass UP relative to site coords).
 * @returns {L.DivIcon | null} The configured L.DivIcon or null if data is missing or time not selected.
 */
function _createCompassIcon(siteId, size, offsetY = 0) {
    const siteEntry = dataService.getSiteData(siteId);
    if (!siteEntry?.site) {
        // console.warn(`_createCompassIcon: Missing site data for ${siteId}`);
        return null;
    }

    const isSpecificTimeSelected = state.selectedGlobalDate && state.selectedGlobalHour !== null && state.selectedGlobalHour !== "";
    const forecastPoint = isSpecificTimeSelected
        ? utils.getLatestForecastForHour(siteEntry.weatherData?.weather, state.selectedGlobalDate, state.selectedGlobalHour)
        : null;

    if (!forecastPoint) {
        // Don't show compass if no specific time/forecast selected
        // console.log(`_createCompassIcon: No forecast point for ${siteId} at selected time.`);
        return null;
    }

    // --- Calculate Compass Visuals ---
    let compassRotation = 0;
    let compassBackground = 'background-color: #ccc;'; // Fallback
    let needleClass = 'popup-compass-needle';
    const dirStr = forecastPoint.wind_dir;
    const dir = parseInt(dirStr, 10);

    // **** Calculate Direction Text and Color ****
    let compassDirectionString = "N/A";
    let dirText = "";
    let compassDirColor = '#555'; // Default neutral/error color

    if (!isNaN(dir)) {
        compassRotation = dir;
        needleClass += ' animate-needle';
        compassDirectionString = utils.degreesToCompass(dir); // e.g., "NW"
        dirText = `${dir}°`; // e.g., "315°"

        // Determine suitability color
        if (siteEntry.site.wind_dir?.length === 16) {
            const sectorIndex = utils.degreesToSectorIndex(dir);
            if (sectorIndex !== -1) {
                const suitabilityCode = siteEntry.site.wind_dir[sectorIndex];
                if (suitabilityCode === 1 || suitabilityCode === 2) {
                    compassDirColor = 'green'; // Suitable color
                } else {
                    compassDirColor = '#d70b0b'; // Unsuitable color (e.g., dark orange)
                }
            }
        }
    } else {
         compassDirectionString = utils.degreesToCompass(dirStr) || "N/A"; // Handle non-numeric like VRB
         dirText = ""; // No degrees if not numeric
    }
    // **** ----------------------------- ****

    // --- Calculate Background Gradient ---
    if (siteEntry.site.wind_dir && Array.isArray(siteEntry.site.wind_dir) && siteEntry.site.wind_dir.length === 16) {
        try {
            const goodColor = '#00FF00', okColor = '#009900', unsuitableColor = 'transparent';
            const sectorAngle = 22.5; let gradientStops = [];
            const getColor = (code) => (code === 2 ? goodColor : (code === 1 ? okColor : unsuitableColor));
            gradientStops.push(`${getColor(siteEntry.site.wind_dir[0])} 0deg`);
             for (let i = 0; i < 16; i++) { const boundaryAngle = (i + 1) * sectorAngle; const colorBeforeBoundary = getColor(siteEntry.site.wind_dir[i]); const colorAfterBoundary = getColor(siteEntry.site.wind_dir[(i + 1) % 16]); gradientStops.push(`${colorBeforeBoundary} ${boundaryAngle}deg`); gradientStops.push(`${colorAfterBoundary} ${boundaryAngle}deg`); }
             let cleanedStops = gradientStops.length > 0 ? [gradientStops[0]] : []; for (let i = 1; i < gradientStops.length; i++) { if (gradientStops[i] !== cleanedStops[cleanedStops.length - 1]) cleanedStops.push(gradientStops[i]); } if (cleanedStops.length > 1 && cleanedStops[0].startsWith(cleanedStops[cleanedStops.length-1].split(' ')[0]) && cleanedStops[cleanedStops.length-1].endsWith(' 360deg')) cleanedStops.pop();
            compassBackground = `background: conic-gradient(${cleanedStops.join(', ')});`;
        } catch (error) { console.error(`_createCompassIcon: Error generating gradient for site ${siteId}:`, error); compassBackground = 'background-color: #f00;'; }
    }
    // --- ----------------------------- ---

    // **** MODIFIED compassHtml to include the text element ****
    const compassHtml = `
        <div class="popup-compass-container">
            <div class="popup-compass" style="${compassBackground}">
                <div class="${needleClass}" style="--target-rotation: ${compassRotation}deg;"></div>
            </div>
        </div>
        <div class="on-map-compass-text" style="color: ${compassDirColor};">
            ${compassDirectionString} ${dirText}
        </div>
    `;
    // **** ------------------------------------------------- ****

    // Calculate anchor based on size and offset
    // Positive offsetY moves the compass visually UP (anchor point is lower)
    const iconAnchor = [size / 2, size / 2 + offsetY];

    // Note: iconSize refers to the container div. The text might visually overflow.
    // CSS is needed to position the text correctly relative to the compass visual.
    return L.divIcon({
        html: compassHtml,
        className: 'on-map-compass-div-icon', // Main container class
        iconSize: [size, size], // Size of the main container div
        iconAnchor: iconAnchor
    });
}


/**
 * Creates or updates the single on-map compass marker.
 * Now uses dynamic sizing based on current zoom.
 * @param {string} siteId - The ID of the site to display the compass for.
 */
function createOrUpdateOnMapCompass(siteId) {
    // --- Initial Checks ---
    if (!_mapInstance || !onMapCompassLayerGroup) { console.warn("OnMapCompass: Map or LayerGroup not ready."); return; }
    const siteEntry = dataService.getSiteData(siteId);
    if (!siteEntry?.site?.lat || !siteEntry?.site?.lng) { console.warn(`OnMapCompass: Invalid site data for ${siteId}.`); removeOnMapCompass(); return; }
    const latLng = [siteEntry.site.lat, siteEntry.site.lng];

    // --- Calculate current size and icon ---
    const currentZoom = _mapInstance.getZoom();
    const currentSize = calculateSizeForZoom(currentZoom);
    // Use offset from config, default to 0 if not defined
    const currentOffsetY = typeof ON_MAP_COMPASS_Y_OFFSET === 'number' ? ON_MAP_COMPASS_Y_OFFSET : 0;
    const compassIcon = _createCompassIcon(siteId, currentSize, currentOffsetY); // Generate icon with current size/data

    // --- Handle Marker Logic ---
    if (compassIcon) {
        // Icon could be created (data was available)
        if (currentOnMapCompassMarker) {
            // --- Update Existing Marker ---
            // Always update icon to reflect potential data/size/offset/text changes
            currentOnMapCompassMarker.setIcon(compassIcon);
            // Update position if needed
            if (!currentOnMapCompassMarker.getLatLng().equals(L.latLng(latLng))) {
                currentOnMapCompassMarker.setLatLng(latLng);
            }
            // Update stored siteId if it changed
            if (currentOnMapCompassMarker.options.siteId !== siteId) {
                 currentOnMapCompassMarker.options.siteId = siteId;
                 console.log(`OnMapCompass: Updated stored siteId on marker to ${siteId}`);
            }
        } else {
            // --- Create New Marker ---
            // console.log(`OnMapCompass: Creating NEW marker for ${siteId} at zoom ${currentZoom} size ${currentSize}`);
            removeOnMapCompass(); // Ensure any previous one is gone
            currentOnMapCompassMarker = L.marker(latLng, {
                icon: compassIcon, // Use the generated icon
                pane: 'onMapCompassPane', // Ensure it's added to the correct pane
                interactive: false, keyboard: false, // zIndexOffset might not be needed as pane controls order
                siteId: siteId // *** Store siteId on marker options ***
            });
            onMapCompassLayerGroup.addLayer(currentOnMapCompassMarker);
        }
    } else {
        // Icon creation failed (likely no specific time selected or no forecast data)
        // Remove the marker if it exists
        // console.log(`OnMapCompass: No valid icon created for ${siteId}, removing marker.`);
        removeOnMapCompass();
    }
}

/**
 * Sets up the map event listener for dynamic compass resizing.
 * Needs the map instance. Should be called once during initialization.
 * @param {L.Map} mapInstance - The Leaflet map instance.
 */
function initializeDynamicCompassResizing(mapInstance) {
     if (!mapInstance) {
        console.error("Cannot initialize dynamic compass resizing: Map instance not provided.");
        return;
    }
    // _mapInstance = mapInstance; // _mapInstance should already be set globally if initializeMarkers was called

     mapInstance.on('zoomend', () => {
        if (currentOnMapCompassMarker && _mapInstance) { // Check _mapInstance too
            // Ensure siteId exists on the marker options
            const currentSiteId = currentOnMapCompassMarker.options?.siteId;
            if (currentSiteId) {
                const zoom = _mapInstance.getZoom();
                const newSize = calculateSizeForZoom(zoom);
                 // Use offset from config, default to 0 if not defined
                const offsetY = typeof ON_MAP_COMPASS_Y_OFFSET === 'number' ? ON_MAP_COMPASS_Y_OFFSET : 0;

                // console.log(`Zoom end: Recalculating icon for ${currentSiteId} at zoom ${zoom}, size ${newSize}`); // DEBUG

                // Recreate the icon using the current siteId and NEW size/offset
                const newIcon = _createCompassIcon(currentSiteId, newSize, offsetY);

                if (newIcon) {
                    // Update the marker with the new icon
                    currentOnMapCompassMarker.setIcon(newIcon);
                } else {
                    // If icon can't be created at new zoom (e.g., time deselected), remove marker
                    removeOnMapCompass();
                }
            } else {
                console.warn("Zoom end: Cannot update compass icon, siteId missing from marker options.");
                // Optionally remove the marker if state is inconsistent
                // removeOnMapCompass();
            }
        }
    });
     console.log("Dynamic compass resizing listener initialized.");
}
// --- **** END: On-Map Compass Helper Functions **** ---


// --- END OF FILE markerManager.js ---