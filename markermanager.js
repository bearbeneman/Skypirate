// --- START OF FILE markerManager.js ---
import * as state from './state.js';
import * as utils from './utils.js';
import * as config from './config.js';
import { COMPASS_POINTS } from './config.js';
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
let _mapInstance = null;

// --- Constants ---
const CSS_ANIMATION_DURATION = 500;
const ANIMATION_END_BUFFER = 100;
const ON_MAP_COMPASS_SIZE = 80; // Size (width & height) of the on-map compass
const MARKER_ICON_HEIGHT_ESTIMATE = 42; // Approx height of AwesomeMarker
const GAP_BELOW_MARKER = 5; // Gap between marker bottom and compass top

/**
 * Gets a cached Leaflet AwesomeMarker icon instance or creates a new one.
 */
function getMarkerIcon(color, iconName, useSvg) { /* ... function code remains the same ... */
    const cacheKey = `${color}-${iconName}-${useSvg}`; if (!iconCache[cacheKey]) { try { if (useSvg && color === 'green' && L.AwesomeMarkers?.icon?.customSvg) { iconCache[cacheKey] = L.AwesomeMarkers.icon.customSvg({ icon: iconName, prefix: 'fa', markerColor: color, customSvgUrl: 'Images/Para-icon.svg', customSvgClass: 'awesome-marker-custom-svg' }); } else if (L.AwesomeMarkers?.icon) { iconCache[cacheKey] = L.AwesomeMarkers.icon({ icon: iconName, prefix: 'fa', markerColor: color, iconColor: 'white' }); } else { throw new Error("L.AwesomeMarkers.icon not available."); } } catch (iconError) { console.error(`[IconCache] Error creating icon for key ${cacheKey}:`, iconError); iconCache[cacheKey] = L.icon({ iconUrl: L.Icon.Default.imagePath ? `${L.Icon.Default.imagePath}marker-icon.png` : 'path/to/your/default-marker.png', iconRetinaUrl: L.Icon.Default.imagePath ? `${L.Icon.Default.imagePath}marker-icon-2x.png` : null, shadowUrl: L.Icon.Default.imagePath ? `${L.Icon.Default.imagePath}marker-shadow.png` : null, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28], shadowSize: [41, 41] }); } } return iconCache[cacheKey];
 }

// --- AwesomeMarkers Icon Extension code ---
if (typeof L !== 'undefined' && L.AwesomeMarkers && L.AwesomeMarkers.Icon) { /* ... Extension code ... */
    L.AwesomeMarkers.Icon.CustomSvg = L.AwesomeMarkers.Icon.extend({ options: { customSvgUrl: null, customSvgClass: 'awesome-marker-custom-svg' }, createIcon: function (oldIcon) { const div = L.AwesomeMarkers.Icon.prototype.createIcon.call(this, oldIcon); if (this.options.markerColor === 'green' && this.options.customSvgUrl) { const iconTag = div.querySelector('i'); if (iconTag) { iconTag.className = ''; iconTag.innerHTML = ''; const img = document.createElement('img'); img.src = this.options.customSvgUrl; img.alt = ""; img.className = this.options.customSvgClass; iconTag.appendChild(img); } } return div; } }); L.AwesomeMarkers.icon.customSvg = function (options) { return new L.AwesomeMarkers.Icon.CustomSvg(options); };
} else { console.warn("L.AwesomeMarkers or L.AwesomeMarkers.Icon not found."); }

// --- Helper function to shuffle an array ---
function shuffleArray(array) { /* ... Fisher-Yates shuffle ... */
     for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; }
}

/**
 * Initializes markers with staggered animation. Binds popups and event listeners.
 */
export function initializeMarkers(map, layers, siteDataStore, updateCallbacks) {
    console.log("Initializing markers (with popups)...");
    _updateCallbacks = updateCallbacks;
    _mapInstance = map;

    windIndicator.initializeWindIndicatorLayer(map);

    // Initialize the layer group for the on-map compass
    if (!onMapCompassLayerGroup) {
        onMapCompassLayerGroup = L.layerGroup().addTo(map);
        console.log("On-Map Compass Layer Group created.");
    } else {
        onMapCompassLayerGroup.clearLayers();
    }
    currentOnMapCompassMarker = null;

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
            marker.siteId = siteId;
            marker.bindTooltip(`${site.name || 'N/A'} (${initialStatusTextForTooltip})`);

            // *** RESTORED marker.bindPopup ***
            marker.bindPopup(() => generatePopupHtml(siteId, siteDataStore), {
                maxWidth: 450,
                autoPanPadding: L.point(50, 50),
                keepInView: false
            });

            // --- RESTORED Event Handlers ---
            marker.on('popupopen', async (e) => {
                const siteId = e.target.siteId;
                const markerInstance = e.target;
                const siteEntryLocal = dataService.getSiteData(siteId);

                console.log(`Popup opened for site ${siteId}`);
                // *** Use the correct state variable ***
                state.setOpenPopupSiteId(siteId);

                if (_updateCallbacks?.showCalendar) _updateCallbacks.showCalendar(siteId);

                // Handle OpenMeteo Indicator
                windIndicator.removeWindIndicator(markerInstance);
                if (state.isOpenMeteoIndicatorEnabled && siteEntryLocal?.site?.lat && siteEntryLocal?.site?.lng) {
                    await openMeteoService.fetchOpenMeteoData(siteId, siteEntryLocal.site.lat, siteEntryLocal.site.lng);
                    updateIndicatorForCurrentTime(markerInstance);
                }

                // *** Show On-Map Compass ***
                createOrUpdateOnMapCompass(siteId);
            });

            marker.on('popupclose', (e) => {
                 const siteId = e.target.siteId;
                 const markerInstance = e.target;
                 console.log(`Popup closed for site ${siteId}`);

                 windIndicator.removeWindIndicator(markerInstance);

                 // *** Remove On-Map Compass ***
                 removeOnMapCompass();

                 // *** Use the correct state variable ***
                 if (state.currentlyOpenPopupSiteId === siteId) {
                     state.setOpenPopupSiteId(null);
                     if (_updateCallbacks?.refreshMarkersOnly) {
                        setTimeout(() => { const d = dataService.getSiteData(siteId); if(d?.weatherData) _updateCallbacks.refreshMarkersOnly()}, 50);
                     }
                 }
                 if (state.selectedSiteIdForCalendar === siteId && _updateCallbacks?.hideCalendar) {
                    _updateCallbacks.hideCalendar();
                 }
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
    markersToAnimate.forEach(({ marker, targetLayer }, index) => { /* ... animation setTimeout logic ... */
        const scheduleDelay = (index / numMarkers) * totalSchedulingDurationMs; setTimeout(() => { if (!marker?.getElement || !targetLayer || !map.hasLayer(targetLayer)) return; marker.addTo(targetLayer); const markerElement = marker.getElement(); if (markerElement) { markerElement.classList.add('marker-loading-animation'); requestAnimationFrame(() => { if (markerElement?.parentNode) markerElement.classList.remove('marker-loading-animation'); }); } if (index === numMarkers - 1) { const finalDelay = CSS_ANIMATION_DURATION + ANIMATION_END_BUFFER; setTimeout(resolveAnimationCompleted, finalDelay); } }, scheduleDelay);
     });
    console.log(`Scheduled ${numMarkers} markers for animated addition.`);
    return animationCompletedPromise;
}


/**
 * Updates map markers based on filters/time. Updates open popup content and on-map compass.
 */
export function updateMapMarkers(map, layers, siteDataStore) {
    const isSpecificTimeSelected = state.selectedGlobalDate && state.selectedGlobalHour !== null && state.selectedGlobalHour !== "";
    const openPopupSiteId = state.currentlyOpenPopupSiteId; // Use popup state
    const selectedDate = state.selectedGlobalDate;
    const currentMinStars = state.getSelectedMinStars();

    // --- Update the on-map compass IF a popup is currently open ---
    if (openPopupSiteId) {
        // If a popup is open, ensure the compass reflects the current time
        createOrUpdateOnMapCompass(openPopupSiteId);
    }
    // --- *** REMOVED the 'else { removeOnMapCompass(); }' part *** ---
    // Removal is now handled *only* by the popupclose event listener


    // --- Update all site markers (logic remains the same) ---
    siteDataStore.forEach((siteEntry, siteId) => {
        const site = siteEntry.site;
        const marker = siteEntry.marker;
        const weatherData = siteEntry.weatherData;
        const weatherError = siteEntry.weatherError;

        if (!site || !marker) return;

        // Check if this marker's popup is the one open
        const isPopupOpenForThisMarker = (String(marker.siteId) === String(openPopupSiteId));

        // --- Filter Checks ---
        let meetsSpeedCriteria = !state.isSpeedFilterEnabled || !selectedDate || (weatherData && utils.checkSiteMeetsSpeedCriteriaForDay(weatherData, selectedDate, state.minWindSpeedFilter, state.maxWindSpeedFilter));
        let meetsStarCriteria = currentMinStars <= 0 || !selectedDate || (weatherData && siteReachesMinStarsOnDay(siteEntry, selectedDate, currentMinStars));
        if (weatherError || !weatherData) { if (state.isSpeedFilterEnabled && selectedDate) meetsSpeedCriteria = false; if (currentMinStars > 0 && selectedDate) meetsStarCriteria = false; }
        const shouldBeVisible = meetsSpeedCriteria && meetsStarCriteria;

        // --- Update Marker ---
        try {
            const isSiteClosed = site.closed === "true";
            let suitabilityResult = { suitability: 'Unknown', reason: 'N/A' }, statusText = 'Unknown';
            // Determine Suitability
            if (isSiteClosed) { suitabilityResult = { suitability: 'Closed', reason: 'Site closed' }; statusText = 'Closed'; } else if (weatherError) { suitabilityResult = { suitability: 'Error', reason: `Weather Error` }; statusText = `Open (Weather Error)`; } else if (!weatherData) { suitabilityResult = { suitability: 'Unknown', reason: 'Loading...' }; statusText = 'Open (Weather loading...)'; } else { if (isSpecificTimeSelected) suitabilityResult = utils.checkWindSuitabilityAtTime(site, weatherData, selectedDate, state.selectedGlobalHour); else suitabilityResult = utils.checkWindSuitabilityNext24h(site, weatherData); if (suitabilityResult.suitability === 'Suitable') statusText = `Open (Wind Suitable)`; else if (suitabilityResult.suitability === 'Unsuitable') statusText = `Open (Wind Unsuitable)`; else statusText = `Open (${suitabilityResult.reason || 'Weather Unknown'})`; }
            // Determine Icon/Color/Layer
            let markerColor = 'gray', iconAwesome = 'question-circle', targetLayer = layers.openUnknown, useAwesomeSvgFactory = false; if (isSiteClosed) { markerColor = 'red'; iconAwesome = 'ban'; targetLayer = layers.closed; } else if (suitabilityResult.suitability === 'Error') { markerColor = 'purple'; iconAwesome = 'exclamation-triangle'; targetLayer = layers.openUnknown; } else if (suitabilityResult.suitability === 'Suitable') { markerColor = 'green'; iconAwesome = 'plane'; targetLayer = layers.openSuitable; useAwesomeSvgFactory = true; } else if (suitabilityResult.suitability === 'Unsuitable') { markerColor = 'orange'; iconAwesome = 'times-circle'; targetLayer = layers.openUnsuitable; } else { markerColor = 'blue'; iconAwesome = 'question-circle'; targetLayer = layers.openUnknown; }

            // --- Update Icon & Tooltip ---
            const newIconInstance = getMarkerIcon(markerColor, iconAwesome, useAwesomeSvgFactory);
            if (marker.options.icon !== newIconInstance) marker.setIcon(newIconInstance);
            const tooltipText = `${site.name || 'N/A'} (${statusText})`;
            if (marker.getTooltip()) { if(marker.getTooltip().getContent() !== tooltipText) marker.setTooltipContent(tooltipText); } else { marker.bindTooltip(tooltipText); }

            // --- Update Layer Membership & Visibility ---
            let currentLayer = null;
            Object.values(layers).forEach(layer => { if (layer.hasLayer(marker)) currentLayer = layer; });

            if (!shouldBeVisible && !isPopupOpenForThisMarker) {
                 if (currentLayer) currentLayer.removeLayer(marker);
            } else {
                 const targetLayerValid = !!Object.keys(layers).find(key => layers[key] === targetLayer);
                 if (!targetLayerValid) { console.warn(`Invalid target layer for site ${siteId}.`); if (currentLayer && !isPopupOpenForThisMarker) currentLayer.removeLayer(marker); return; }

                 if (isPopupOpenForThisMarker) { // Keep marker if popup open
                     if (currentLayer !== targetLayer) { if (currentLayer) currentLayer.removeLayer(marker); targetLayer.addLayer(marker); }
                     else if (!currentLayer) { targetLayer.addLayer(marker); }
                 } else { // Standard layer update
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
            // Update popup content - this is important so the compass *inside* the popup updates too
            entry.marker.setPopupContent(generatePopupHtml(openPopupSiteId, siteDataStore));
        } else if (openPopupSiteId) {
            // If state says popup is open, but marker/popup isn't found/open, clear state
            // This case should ideally be handled primarily by the popupclose event,
            // but this is a safety check.
            console.warn(`[UpdateMarkers] Mismatch: State has openPopupSiteId=${openPopupSiteId}, but marker popup is not open. Clearing state.`);
            state.setOpenPopupSiteId(null);
            removeOnMapCompass(); // Also remove compass if state was wrong
        }
    }
}


/**
 * Checks if a site reaches the minimum star rating on a given day.
 */
function siteReachesMinStarsOnDay(siteEntry, selectedDate, minStars) { /* ... logic remains the same ... */
    if (minStars <= 0) return true; if (!selectedDate) return true; if (!siteEntry?.weatherData?.weather?.length) return false; const latestSnapshots = new Map(); siteEntry.weatherData.weather.filter(p => p?.forecast_day === selectedDate && p.time !== undefined && p.time !== null && p.snapshot_date).forEach(p => { const hour = String(p.time).padStart(2, '0'); const existingSnapshot = latestSnapshots.get(hour); if (!existingSnapshot || p.snapshot_date > existingSnapshot) latestSnapshots.set(hour, p.snapshot_date); }); const latestWeatherForDay = siteEntry.weatherData.weather.filter(p => { if (!p || p.forecast_day !== selectedDate || p.time === undefined || p.time === null || !p.snapshot_date) return false; const hour = String(p.time).padStart(2, '0'); return latestSnapshots.get(hour) === p.snapshot_date; }).filter((p, index, self) => index === self.findIndex((t) => (String(t.time).padStart(2,'0') === String(p.time).padStart(2,'0')))); if (latestWeatherForDay.length === 0) return false; for (const forecastPoint of latestWeatherForDay) { if (forecastPoint?.stars !== undefined && forecastPoint.stars !== null) { const numericRating = parseFloat(forecastPoint.stars); if (!isNaN(numericRating) && numericRating >= minStars) return true; } } return false;
}


/**
 * Generates the FULL HTML content for a site's popup.
 */
function generatePopupHtml(siteId, siteDataStore) { /* ... Full popup generation logic remains the same ... */
    const siteEntry = dataService.getSiteData(String(siteId)); if (!siteEntry || !siteEntry.site) { console.error(`[Popup Gen ERROR] Site data/entry missing for ID ${siteId}.`); return `<div class="leaflet-popup-content-custom-wrapper">Error: Site data invalid/missing.</div>`; } const currentSite = siteEntry.site, currentWeatherData = siteEntry.weatherData, currentError = siteEntry.weatherError, marker = siteEntry.marker; const name = currentSite.name || 'N/A'; const siteLat = typeof currentSite.lat === 'number' ? currentSite.lat : null; const siteLon = typeof currentSite.lng === 'number' ? currentSite.lng : null; const altitude = currentSite.alt !== null && currentSite.alt !== undefined ? `${currentSite.alt} m ASL` : 'N/A'; const clubName = currentSite.clubName || 'N/A'; const suitableWinds = utils.getSuitableDirections(currentSite.wind_dir); const formattedGuide = utils.formatGuideInfo(currentSite.guide); let mapLinksHtml = ''; if (siteLat !== null && siteLon !== null) { const googleMapsLogoUrl = '../images/gmaps.png'; const what3WordsLogoUrl = '../images/w3w.png'; const osMapsLogoUrl = '../images/osmaps.png'; const iconStyle = "height: 24px; width: auto; vertical-align: middle; border: none; margin: 0 3px;"; const googleMapsUrl = `https://www.google.com/maps?q=${siteLat},${siteLon}`; const what3WordsUrl = `https://what3words.com/${siteLat},${siteLon}`; const osMapsUrl = `https://explore.osmaps.com/pin?lat=${siteLat}&lon=${siteLon}&z=16`; mapLinksHtml += `<a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" title="View on Google Maps"><img src="${googleMapsLogoUrl}" alt="G" style="${iconStyle}"></a>`; mapLinksHtml += `<a href="${what3WordsUrl}" target="_blank" rel="noopener noreferrer" title="View on What3Words"><img src="${what3WordsLogoUrl}" alt="W" style="${iconStyle}"></a>`; mapLinksHtml += `<a href="${osMapsUrl}" target="_blank" rel="noopener noreferrer" title="View on OS Maps"><img src="${osMapsLogoUrl}" alt="OS" style="${iconStyle}"></a>`; } let webcamLinkHtml = ''; if (siteLat !== null && siteLon !== null && webcamService.isLoaded()) { const closestWebcam = webcamService.findClosestWebcam(siteLat, siteLon, 50); if (closestWebcam) { const distanceText = closestWebcam.distanceKm !== undefined ? `(${closestWebcam.distanceKm.toFixed(1)} km)` : ''; const linkStyle = "color: #0078A8; text-decoration: none; vertical-align: middle; font-size: 0.9em;"; const iconStyle = "color: #6c757d; font-size: 1em; vertical-align: middle; margin-right: 2px;"; webcamLinkHtml = `<a href="${closestWebcam.pageUrl}" target="_blank" rel="noopener noreferrer" title="Nearby Webcam: ${closestWebcam.shortTitle || closestWebcam.title} ${distanceText}" class="popup-webcam-link" style="${linkStyle}">` + `<i class="fas fa-video" style="${iconStyle}"></i>` + ` Nearest Webcam ${distanceText}` + `</a>`; } } let displayStatus = 'Calculating...'; if (marker?.getTooltip()?.getContent()) { const tooltipContent = marker.getTooltip().getContent(); const statusMatch = tooltipContent.match(/\(([^)]+)\)/); if (statusMatch?.[1]) { displayStatus = statusMatch[1]; } else if (tooltipContent.includes('Closed')) { displayStatus = 'Closed'; } else if (tooltipContent.includes('Error')) { displayStatus = `Open (Weather Error)`; } else if (tooltipContent.includes('loading')) { displayStatus = 'Open (Weather loading...)'; } else if (tooltipContent.includes('Suitable')) { displayStatus = 'Open (Wind Suitable)'; } else if (tooltipContent.includes('Unsuitable')) { displayStatus = 'Open (Wind Unsuitable)'; } else { displayStatus = 'Open (Update Pending)'; } } else { if (currentSite.closed === "true") { displayStatus = 'Closed'; } else if (currentError) { displayStatus = `Open (Weather Error)`; } else if (!currentWeatherData) { displayStatus = 'Open (Weather loading...)'; } else { displayStatus = 'Open (Update Pending)'; } }
    let forecastSectionHtml = ''; const isSpecificTimeSelected = state.selectedGlobalDate && state.selectedGlobalHour !== null && state.selectedGlobalHour !== ""; if (isSpecificTimeSelected) { if (currentError) { forecastSectionHtml = `<div class='popup-controls' style='color: #cc0000; font-weight: bold; text-align: center;'>Weather Error: ${currentError}</div>`; } else if (!currentWeatherData) { forecastSectionHtml = `<div class='popup-controls' style='color: #888; font-style: italic; text-align: center;'>Loading forecast for ${state.selectedGlobalHour}:00...</div>`; } else { const forecastPoint = utils.getLatestForecastForHour(currentWeatherData.weather, state.selectedGlobalDate, state.selectedGlobalHour); let compassRotation = 0, windInfoText = 'No data', compassBackground = 'background-color: #f0f0f0;', compassDirectionString = "N/A", compassDirColor = 'red', rainHtml = '<div class="popup-rain-info">Rain: N/A</div>'; let needleClass = 'popup-compass-needle'; if (forecastPoint) { const dirStr = forecastPoint.wind_dir, knts = forecastPoint.wind_knts; let mph = forecastPoint.wind_mph; if ((!mph && mph !== 0) && (knts || knts === 0)) mph = parseFloat(knts) * config.KNOTS_TO_MPH; if ((!mph && mph !== 0) && forecastPoint.wind_kph) mph = parseFloat(forecastPoint.wind_kph) * config.KPH_TO_MPH; const dir = parseInt(dirStr, 10); if (!isNaN(dir)) { compassRotation = dir; needleClass += ' animate-needle'; compassDirectionString = utils.degreesToCompass(dir); const sectorIndex = utils.degreesToSectorIndex(dir); if (sectorIndex !== -1 && currentSite.wind_dir?.length === 16) { const suitabilityCode = currentSite.wind_dir[sectorIndex]; if (suitabilityCode === 1 || suitabilityCode === 2) compassDirColor = 'green'; } let speedText = (knts || knts === 0) ? `${knts} kts` : 'N/A'; if ((mph || mph === 0) && !isNaN(mph)) speedText += ` (${mph.toFixed(1)} mph)`; windInfoText = `@ ${speedText}`; } else { windInfoText = 'Dir N/A'; if (knts || knts === 0) windInfoText += ` @ ${knts} kts`; compassDirectionString = utils.degreesToCompass(dirStr); } const numericRain = parseFloat(forecastPoint.rain); if (isNaN(numericRain)) rainHtml = '<div class="popup-rain-info">Rain: N/A</div>'; else if (numericRain <= 0) rainHtml = '<div class="popup-rain-info">No Rain</div>'; else { let icon = (numericRain < 2) ? 'drizzle' : 'showers-heavy'; let text = (numericRain < 2) ? 'Light' : 'Heavy'; rainHtml = `<div class="popup-rain-info"><i class="fas fa-cloud-${icon} ${text.toLowerCase()}-rain-icon popup-rain-icon"></i> ${text} Rain (${numericRain.toFixed(2)}mm)</div>`; } if (currentSite.wind_dir && Array.isArray(currentSite.wind_dir) && currentSite.wind_dir.length === 16) { try { const goodColor = '#00FF00', okColor = '#009900', unsuitableColor = 'transparent'; const sectorAngle = 22.5; let gradientStops = []; const getColor = (code) => (code === 2 ? goodColor : (code === 1 ? okColor : unsuitableColor)); gradientStops.push(`${getColor(currentSite.wind_dir[0])} 0deg`); for (let i = 0; i < 16; i++) { const boundaryAngle = (i + 1) * sectorAngle; const colorBeforeBoundary = getColor(currentSite.wind_dir[i]); const colorAfterBoundary = getColor(currentSite.wind_dir[(i + 1) % 16]); gradientStops.push(`${colorBeforeBoundary} ${boundaryAngle}deg`); gradientStops.push(`${colorAfterBoundary} ${boundaryAngle}deg`); } let cleanedStops = gradientStops.length > 0 ? [gradientStops[0]] : []; for (let i = 1; i < gradientStops.length; i++) { if (gradientStops[i] !== cleanedStops[cleanedStops.length - 1]) cleanedStops.push(gradientStops[i]); } if (cleanedStops.length > 1 && cleanedStops[0].startsWith(cleanedStops[cleanedStops.length-1].split(' ')[0]) && cleanedStops[cleanedStops.length-1].endsWith(' 360deg')) cleanedStops.pop(); compassBackground = `background: conic-gradient(${cleanedStops.join(', ')});`; } catch (error) { /* Default background */ } } } else { windInfoText = 'Forecast unavailable'; rainHtml = '<div class="popup-rain-info">Rain data unavailable</div>'; } forecastSectionHtml = `<div class="popup-controls"><div class="popup-column popup-column-text"><span class="popup-wind-compass-direction" style="color: ${compassDirColor};">${compassDirectionString}</span></div><div class="popup-column popup-column-compass"><div class="popup-compass-container"><div class="popup-compass" style="${compassBackground}"><div class="${needleClass}" style="--target-rotation: ${compassRotation}deg;"></div></div><div class="popup-wind-info">${!isNaN(compassRotation) ? compassRotation+'°' : ''} ${windInfoText}</div>${rainHtml}</div></div></div>`; } } else { forecastSectionHtml = `<div class="popup-controls" style="text-align: center; font-style: italic; color: #666; padding-top: 5px;">Select a date/hour to see forecast details.</div>`; }
    let popupHtml = `<div class="leaflet-popup-content-custom-wrapper"><span style="font-size: 1.6em; text-transform: uppercase; font-weight: 800;">${name}</span><span style="font-size: 0.9em; color: #555; display: block; margin-bottom: 5px;">Status: ${displayStatus}</span><div style="font-size: 0.9em; color: #333; margin-bottom: 8px;"><b>Above sea level:</b> ${altitude}<br><b>Club:</b> ${clubName}<br><b>Suitable Wind Dir:</b> ${suitableWinds}<br><b>Coords:</b> (${siteLat !== null ? siteLat.toFixed(4) : 'N/A'}, ${siteLon !== null ? siteLon.toFixed(4) : 'N/A'})<div style="margin-top: 5px;">${mapLinksHtml} ${webcamLinkHtml}</div></div>${forecastSectionHtml}${formattedGuide && formattedGuide !== 'N/A' ? `<div style='margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; font-size: 0.85em;'>${formattedGuide}</div>` : ''}</div>`; return popupHtml;
}

/**
 * Helper Function to Update OpenMeteo Indicator
 */
function updateIndicatorForCurrentTime(markerInstance) { /* ... logic remains the same ... */
    if (!markerInstance?.siteId || !_mapInstance) return; const siteId = markerInstance.siteId; if (!state.isOpenMeteoIndicatorEnabled) { windIndicator.removeWindIndicator(markerInstance); return; } const date = state.selectedGlobalDate, hour = state.selectedGlobalHour; if (!date || hour === null || hour === "") { windIndicator.removeWindIndicator(markerInstance); return; } const windData = openMeteoService.getOpenMeteoDataForHour(siteId, date, hour); if (windData) { let indicator = markerInstance._windIndicatorLayer; if (!indicator) indicator = windIndicator.createWindIndicator(_mapInstance, markerInstance, windData.direction); if (indicator) windIndicator.updateWindIndicator(markerInstance, windData.direction, windData.speed); } else { windIndicator.removeWindIndicator(markerInstance); }
}

// --- **** START: On-Map Compass Helper Functions **** ---

/**
 * Removes the currently displayed on-map compass marker.
 * Exported for use by main.js map click handler.
 */
export function removeOnMapCompass() { // **** Ensure EXPORTED ****
    if (currentOnMapCompassMarker && onMapCompassLayerGroup) {
        onMapCompassLayerGroup.removeLayer(currentOnMapCompassMarker);
    }
    currentOnMapCompassMarker = null;
}

/**
 * Creates or updates the on-map compass display for a given site ID,
 * replicating the visual structure and styling of the original popup compass.
 */
function createOrUpdateOnMapCompass(siteId) {
    // --- Initial Checks ---
    if (!_mapInstance || !onMapCompassLayerGroup) { console.warn("OnMapCompass: Map or LayerGroup not ready."); return; }
    const siteEntry = dataService.getSiteData(siteId);
    if (!siteEntry?.site?.lat || !siteEntry?.site?.lng) { console.warn(`OnMapCompass: Invalid site data for ${siteId}.`); removeOnMapCompass(); return; }
    const latLng = [siteEntry.site.lat, siteEntry.site.lng];
    const site = siteEntry.site;
    const weatherData = siteEntry.weatherData;
    const isSpecificTimeSelected = state.selectedGlobalDate && state.selectedGlobalHour !== null && state.selectedGlobalHour !== "";
    if (!isSpecificTimeSelected) { /* console.log("OnMapCompass: No specific time selected."); */ removeOnMapCompass(); return; }
    const forecastPoint = utils.getLatestForecastForHour(weatherData?.weather, state.selectedGlobalDate, state.selectedGlobalHour);
    if (!forecastPoint) { /* console.log(`OnMapCompass: No forecast for time.`);*/ removeOnMapCompass(); return; }

    // --- Calculate Compass Visuals (Identical to generatePopupHtml logic) ---
    let compassRotation = 0;
    let compassBackground = 'background-color: #f0f0f0;'; // Default popup fallback
    let needleClass = 'popup-compass-needle'; // Use popup class name
    const dirStr = forecastPoint.wind_dir;
    const dir = parseInt(dirStr, 10);

    if (!isNaN(dir)) {
        compassRotation = dir;
        needleClass += ' animate-needle'; // Add animation class if rotation is valid

        // Background Gradient Calculation (Identical to popup)
        if (site.wind_dir && Array.isArray(site.wind_dir) && site.wind_dir.length === 16) {
            try {
                const goodColor = '#00FF00', okColor = '#009900', unsuitableColor = 'transparent'; // Use transparent for unsuitable like popup
                const sectorAngle = 22.5; let gradientStops = [];
                const getColor = (code) => (code === 2 ? goodColor : (code === 1 ? okColor : unsuitableColor));
                gradientStops.push(`${getColor(site.wind_dir[0])} 0deg`);
                for (let i = 0; i < 16; i++) { const boundaryAngle = (i + 1) * sectorAngle; const colorBeforeBoundary = getColor(site.wind_dir[i]); const colorAfterBoundary = getColor(site.wind_dir[(i + 1) % 16]); gradientStops.push(`${colorBeforeBoundary} ${boundaryAngle}deg`); gradientStops.push(`${colorAfterBoundary} ${boundaryAngle}deg`); }
                let cleanedStops = gradientStops.length > 0 ? [gradientStops[0]] : []; for (let i = 1; i < gradientStops.length; i++) { if (gradientStops[i] !== cleanedStops[cleanedStops.length - 1]) cleanedStops.push(gradientStops[i]); } if (cleanedStops.length > 1 && cleanedStops[0].startsWith(cleanedStops[cleanedStops.length-1].split(' ')[0]) && cleanedStops[cleanedStops.length-1].endsWith(' 360deg')) cleanedStops.pop();
                compassBackground = `background: conic-gradient(${cleanedStops.join(', ')});`;
            } catch (error) { console.error(`OnMapCompass: Error generating gradient for site ${siteId}:`, error); compassBackground = 'background-color: #f00;'; }
        } else { compassBackground = 'background-color: #ccc;'; } // Fallback if no site wind_dir
    } else {
        console.warn(`OnMapCompass: Invalid wind direction (${dirStr}) for time.`);
        needleClass = 'popup-compass-needle'; // No animation if direction invalid
    }
    // --- End Calculate Compass Visuals ---

    // --- Define Compass Icon ---
    const compassSize = ON_MAP_COMPASS_SIZE; // Use constant
    // --- Corrected iconAnchor to align CENTER with marker lat/lng ---
    const iconAnchor = [compassSize / 2, compassSize / 2];

    // *** Use the exact relevant HTML structure from generatePopupHtml ***
    // Inject calculated background and rotation CSS variable
    const compassHtml = `
        <div class="popup-compass-container"> <!-- Use original class -->
            <div class="popup-compass" style="${compassBackground}"> <!-- Use original class -->
                <div class="${needleClass}" style="--target-rotation: ${compassRotation}deg;"></div> <!-- Use original class and CSS variable -->
            </div>
        </div>
    `;

    const compassIcon = L.divIcon({
        html: compassHtml,
        className: 'on-map-compass-div-icon', // Use the new container class for positioning offset
        iconSize: [compassSize, compassSize],
        iconAnchor: iconAnchor // Center anchor
    });
    // --- End Define Compass Icon ---

    // --- Create or Update Marker ---
    if (currentOnMapCompassMarker) {
        // --- Update Existing Marker ---
        if (!currentOnMapCompassMarker.getLatLng().equals(L.latLng(latLng))) {
            currentOnMapCompassMarker.setLatLng(latLng);
        }
        const element = currentOnMapCompassMarker.getElement();
        if (element) {
            // Find elements using POPUP class names
            const compassDiv = element.querySelector('.popup-compass');
            const needleDiv = element.querySelector('.popup-compass-needle');

            if (compassDiv) {
                if (compassDiv.style.background !== compassBackground) {
                    // console.log(`OnMapCompass Update ${siteId}: Applying NEW background:`, compassBackground); // DEBUG
                    compassDiv.style.background = compassBackground;
                }
            } else { console.warn(`OnMapCompass Update ${siteId}: Could not find compassDiv.`); }

            if (needleDiv) {
    // Update rotation using CSS variable
    const newRotationStyle = `${compassRotation}deg`;
    if (needleDiv.style.getPropertyValue('--target-rotation') !== newRotationStyle) {
         needleDiv.style.setProperty('--target-rotation', newRotationStyle);
    }
    // Update animation class
    const hasAnimationClass = needleDiv.classList.contains('animate-needle');
    const shouldHaveAnimation = !isNaN(dir);
    if (shouldHaveAnimation && !hasAnimationClass) {
        needleDiv.classList.add('animate-needle');
    } else if (!shouldHaveAnimation && hasAnimationClass) {
        needleDiv.classList.remove('animate-needle');
    }
} else { console.warn(`OnMapCompass Update ${siteId}: Could not find needleDiv.`); }
        } else {
             // Fallback if element missing - recreate icon
             console.warn(`OnMapCompass Update ${siteId}: Could not find marker element, using setIcon fallback.`);
             const currentCompassIcon = L.divIcon({ /* ... recreate icon options with current values ... */
                 html: `
                    <div class="popup-compass-container">
                        <div class="popup-compass" style="${compassBackground}">
                             <div class="${needleClass}" style="--target-rotation: ${compassRotation}deg;"></div>
                        </div>
                    </div>`,
                 className: 'on-map-compass-div-icon',
                 iconSize: [compassSize, compassSize],
                 iconAnchor: iconAnchor
             });
             currentOnMapCompassMarker.setIcon(currentCompassIcon);
        }
    } else {
        // --- Create New Marker ---
        // console.log(`OnMapCompass: Creating NEW marker for ${siteId}`); // DEBUG
        removeOnMapCompass(); // Ensure any previous one is gone
        currentOnMapCompassMarker = L.marker(latLng, {
            icon: compassIcon, // Use the initially generated icon
            pane: 'onMapCompassPane',
            interactive: false, keyboard: false, zIndexOffset: -10
        });
        onMapCompassLayerGroup.addLayer(currentOnMapCompassMarker);
    }
}
// --- **** END: On-Map Compass Helper Functions **** ---


// --- END OF FILE markerManager.js ---