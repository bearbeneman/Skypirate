// --- START OF FILE main.js ---
// main.js - Main application entry point (Refactored - Precip logic moved)

// Core & Config Imports
import * as config from './config.js';
import * as state from './state.js';
import { debounce, isUkDst, formatUtcDateForPrecipFilename } from './utils.js'; // <-- Kept relevant utils

// Service Imports
import * as mapService from './mapService.js';
import * as dataService from './dataService.js';
import * as ukmoWeatherService from './ukmoWeatherService.js'; // **** ADDED Import ****
import * as raspService from './raspService.js';
import * as particleService from './particleService.js';
import * as airspaceService from './airspaceService.js';
import * as openMeteoService from './openMeteoService.js';
import * as webcamService from './webcamService.js';
import * as obstacleService from './obstacleService.js';
import * as imageProcessor from './imageProcessor.js'; // Keep if needed by other parts or passed

// UI / Control Imports
import * as markerManager from './markerManager.js';
import * as timeControls from './timeControls.js';
import * as windFilter from './windFilter.js';
import { starFilterControl } from './starFilterControl.js';
import * as raspUi from './raspControls.js';
import * as particleUi from './particleControls.js';
import * as calendarUi from './calendar.js';
import * as airspaceControls from './airspaceControls.js';
import { searchControl } from './searchControl.js';
import * as tracker from './Tracker/trackerApp.js'; // Assuming Tracker/trackerApp.js exists
import { markerFilterControl } from './markerFilterControl.js';
import * as windIndicator from './windIndicator.js';
import * as ukmoDisplayPanel from './ukmoDisplayPanel.js'; // **** ADDED Import ****

// --- Feature Module Imports ---
import * as metRainControls from './metRainControls.js'; // Import the controls module

// --- Global Variables (Reduced) ---
let owmPrecipLayer = null; // OWM layer instance remains
const owmApiKey = 'e9586d227ba3f41affdf691b43e10cb5'; // REPLACE WITH YOUR KEY
const owmPrecipLayerOp = 'PARAIN';
let _webcamLayer = null;
let _obstacleLayer = null; // Keep obstacle layer reference if initialized here or passed around
let loadingIndicator = null; // Keep loading indicator reference

let openMeteoToggle = null; // Keep OpenMeteo toggle reference
let starFilter = null; // Keep Star Filter control instance
let _map = null; // Keep Map instance
let _raspCornersLatLng = null; // Keep RASP corners
let _particleControl = null; // Keep Particle Control instance
let _particleWindLayer = null; // Keep Particle Layer instance
let _searchControl = null; // Keep Search Control instance
let _loadIgcControl = null; // Keep Load IGC control instance
let updateUICallbacks = {}; // Keep callbacks object


// --- Obstacle Layer Logic ---
// ... (Keep existing Obstacle Layer Logic - L.Control.ObstacleToggle, loadAndDisplayObstacles) ...
function loadAndDisplayObstacles(map, geojsonUrl) {
    console.log(`Fetching obstacle GeoJSON from: ${geojsonUrl}`);
    fetch(geojsonUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${geojsonUrl}`);
            return response.json();
        })
        .then(geojsonData => {
            console.log("Obstacle GeoJSON loaded successfully.");
            if (_obstacleLayer) { map.removeLayer(_obstacleLayer); _obstacleLayer = null; }
            _obstacleLayer = L.geoJSON(geojsonData, {
                pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 3, color: '#cc0000', weight: 1, fillColor: '#ff4d4d', fillOpacity: 0.7 }),
                style: feature => (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") ? { color: '#cc0000', weight: 1.5, opacity: 0.6 } : { color: '#cc0000', weight: 1, opacity: 0.5, fillOpacity: 0.1 },
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        let popupContent = "<b>Obstacle</b><br>";
                        const type = feature.properties.type || feature.properties.TYPE || 'N/A';
                        const height = feature.properties.height || feature.properties.HEIGHT || 'N/A';
                        const elev = feature.properties.elevation || feature.properties.ELEV || null;
                        const name = feature.properties.name || feature.properties.NAME || '';
                        if(name) popupContent += `<b>Name:</b> ${name}<br>`;
                        popupContent += `<b>Type:</b> ${type}<br>`;
                        popupContent += `<b>Height:</b> ${height} ${feature.properties.height_unit || 'm'} AGL<br>`;
                        if (elev !== null) popupContent += `<b>Elevation:</b> ${elev} ${feature.properties.elevation_unit || 'm'} AMSL<br>`;
                        layer.bindPopup(popupContent);
                    }
                }
            }).addTo(map);
            console.log("Obstacle layer added to map.");
        })
        .catch(error => {
            console.error("Error loading or processing obstacle GeoJSON:", error);
            if (_obstacleLayer) { map.removeLayer(_obstacleLayer); _obstacleLayer = null; }
             const obstacleCheckbox = document.getElementById('obstacle-toggle');
             if(obstacleCheckbox) obstacleCheckbox.checked = false;
        });
}
L.Control.ObstacleToggle = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        this._container = container;
        container.style.backgroundColor = 'white';
        container.style.padding = '5px';
        container.innerHTML = '<label title="Toggle Obstacles Layer (dynamic OSM data)"><input type="checkbox" id="obstacle-toggle"> <i class="fas fa-broadcast-tower" style="margin-right: 3px;"></i> Obstacles</label>';
        L.DomEvent.disableClickPropagation(container);
        setTimeout(() => {
            const checkbox = this._container?.querySelector('#obstacle-toggle');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    const obstacleLayerInstance = obstacleService.getLayer();
                    if (!obstacleLayerInstance || !_map) {
                         console.warn("Obstacle toggle clicked, but service/map not ready.");
                         e.target.checked = !isChecked;
                         return;
                    }
                    if (isChecked) {
                        console.log("Custom Obstacle Toggle: CHECKED -> Showing dynamic layer.");
                        if (!_map.hasLayer(obstacleLayerInstance)) {
                            _map.addLayer(obstacleLayerInstance);
                        }
                        obstacleService.enableLayer();
                    } else {
                        console.log("Custom Obstacle Toggle: UNCHECKED -> Hiding dynamic layer.");
                         if (_map.hasLayer(obstacleLayerInstance)) {
                            _map.removeLayer(obstacleLayerInstance);
                        }
                        obstacleService.disableLayer();
                    }
                });
                 const obstacleLayerInstance = obstacleService.getLayer();
                 if (obstacleLayerInstance && _map && _map.hasLayer(obstacleLayerInstance)) {
                     checkbox.checked = true;
                 } else {
                     checkbox.checked = false;
                 }
            } else {
                console.error("Could not find #obstacle-toggle checkbox element after timeout.");
            }
        }, 0);
        return container;
    },
    onRemove: function(map) { this._container = null; }
});

// --- Mode Switching Functions ---
// ... (Keep existing enterTrackerMode, exitTrackerMode functions) ...
function enterTrackerMode() {
    if (state.isTrackerModeActive || !_map) return;
    console.log("Entering Tracker Mode...");
    state.setTrackerModeActive(true);
    calendarUi.hideSiteForecastCalendar();
    if (_searchControl?._suggestionsContainer) {
         _searchControl._suggestionsContainer.innerHTML = '';
         _searchControl._suggestionsContainer.style.display = 'none';
    }
    document.body.classList.add('tracker-active');
    updateUICallbacks.refreshAll?.();
    setTimeout(() => {
        const bottomPanel = document.getElementById('trackerBottomPanel');
        if (bottomPanel && state.isTrackerModeActive) {
             document.documentElement.style.setProperty('--tracker-bottom-panel-height', `${bottomPanel.offsetHeight}px`);
        }
    }, 50);
    console.log("Tracker Mode Requested. UI update pending via refreshAll.");
}
function exitTrackerMode() {
    if (!state.isTrackerModeActive || !_map) return;
    console.log("Exiting Tracker Mode...");
    state.setTrackerModeActive(false);
    tracker?.resetTracker?.();
    document.body.classList.remove('tracker-active');
    document.documentElement.style.removeProperty('--tracker-bottom-panel-height');
    updateUICallbacks.refreshAll?.();
    const targetZoom = config.DEFAULT_MAP_ZOOM || 10;
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => { if (_map) _map.flyTo([position.coords.latitude, position.coords.longitude], targetZoom); },
            (error) => { console.warn(`[ExitTracker] Geo error (${error.code}): ${error.message}. Setting default zoom.`); if (_map) _map.setZoom(targetZoom); },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
        );
    } else {
        console.warn("[ExitTracker] Geolocation not supported. Setting default zoom.");
        if (_map) _map.setZoom(targetZoom);
     }
    console.log("Tracker Mode Deactivation Requested. UI update pending via refreshAll.");
}

// --- OWM Layer Time Update ---
// ... (Keep existing updateOwmLayerTime function) ...
function updateOwmLayerTime() {
    if (!owmPrecipLayer) return;
    const dateStr = state.selectedGlobalDate;
    const hourStr = state.selectedGlobalHour;
    let newUrl = `https://maps.openweathermap.org/maps/2.0/weather/1h/${owmPrecipLayerOp}/{z}/{x}/{y}?appid=${owmApiKey}`;
    if (dateStr && hourStr !== null && hourStr !== "") {
        try {
            const dateObj = new Date(`${dateStr}T${String(hourStr).padStart(2, '0')}:00:00Z`);
            if (!isNaN(dateObj.getTime())) {
                const timestampSeconds = Math.floor(dateObj.getTime() / 1000);
                newUrl += `&date=${timestampSeconds}`;
            }
        } catch (e) { /* Use default URL if date parsing fails */ }
    }
    owmPrecipLayer.setUrl(newUrl);
}


// --- LoadIgcControl Definition (Moved Before DOMContentLoaded) ---
// ... (Keep existing LoadIgcControl definition) ...
if (typeof L !== 'undefined' && L.Control.LoadIgcControl === undefined) {
     L.Control.LoadIgcControl = L.Control.extend({
         options: { position: 'topleft' },
         onAdd: function(map) {
             const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-load-igc');
             container.title = 'Load IGC Track File';
             const button = L.DomUtil.create('a', '', container);
             button.innerHTML = '<i class="fa-solid fa-upload"></i>';
             button.href = '#';
             button.role = 'button';
             L.DomEvent.on(button, 'click', L.DomEvent.stop);
             L.DomEvent.on(button, 'click', () => {
                 const fileInput = document.getElementById('trackerFileInput');
                 if (fileInput) {
                     fileInput.value = null;
                     fileInput.click();
                 } else {
                     console.error("Load IGC Control: Tracker file input ('#trackerFileInput') not found!");
                     alert("File input element not found.");
                 }
             }, this);
             L.DomEvent.disableScrollPropagation(container);
             return container;
         }
    });
} else if (typeof L === 'undefined') {
    console.error("Leaflet (L) not defined before LoadIgcControl definition.");
}

// --- Main Application Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing application...");
    // Use global loadingIndicator variable
    loadingIndicator = document.getElementById('loading-indicator');
    const mapDiv = document.getElementById('map');

    if (!mapDiv) {
        console.error("Fatal Error: Map container 'map' not found!");
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        document.body.innerHTML = "<p style='color:red; text-align:center; padding: 20px;'>Error: Map container not found.</p>";
        return;
    }

    // --- Reset global state variables ---
    starFilter = null;
    _map = null;
    _raspCornersLatLng = null;
    _particleControl = null;
    _particleWindLayer = null;
    _searchControl = null;
    _loadIgcControl = null;
    updateUICallbacks = {};
    _obstacleLayer = null;
    owmPrecipLayer = null;
    openMeteoToggle = null;

    // --- Define Update Callbacks early ---
    console.log("Defining Update Callbacks...");
    const originalShowCalendar = calendarUi.showSiteForecastCalendar;
    // ***** START: MODIFIED updateUICallbacks *****
    updateUICallbacks = {
        refreshAll: () => {
        // Determine current site context (prioritize popup, then calendar)
        const currentSiteId = state.currentlyOpenPopupSiteId || state.selectedSiteIdForCalendar;
        const currentDate = state.selectedGlobalDate;
        const currentHour = state.selectedGlobalHour;

        // **** ADD UKMO Panel Update (Call early) ****
        if (config.DISPLAY_UKMO_PANEL && ukmoDisplayPanel.updatePanel) {
             ukmoDisplayPanel.updatePanel(currentSiteId, currentDate, currentHour);
        } else if (config.DISPLAY_UKMO_PANEL && !ukmoDisplayPanel.updatePanel) {
            console.warn("UKMO Display Panel is enabled but updatePanel function is not available.");
        }
        // **** END UKMO Panel Update ****


        // Check state for tracker mode
        if (!state.isTrackerModeActive) {
            // --- Show/Update Standard Layers/Markers ---
            markerManager.updateMapMarkers(_map, mapService.layers, dataService.siteDataStore);
            if (windFilter) windFilter.updateStatusText?.();

            // Particle Update Logic (using state.userPrefersParticlesVisible)
            if (state.userPrefersParticlesVisible) {
                if (_particleWindLayer && particleService?.updateParticleLayer) {
                     particleService.updateParticleLayer(_particleWindLayer, _map, dataService.siteDataStore);
                }
            } else {
                 if (_particleWindLayer && particleService?.stopParticles) {
                     particleService.stopParticles(_particleWindLayer);
                 }
            }

            // RASP Update
            if (raspService && raspService.updateRaspOverlay) {
                const raspUiElements = raspUi.raspOverlayStatus ? { raspOverlayStatus: raspUi.raspOverlayStatus } : {};
                const currentCorners = raspService.getCurrentRaspCorners ? (raspService.getCurrentRaspCorners() || _raspCornersLatLng) : _raspCornersLatLng;
                raspService.updateRaspOverlay(_map, currentCorners, raspUiElements, null, null);
            }

            // OWM Update
            updateOwmLayerTime();

            // --- MET RAIN UPDATE ---
            metRainControls.updateLayer();

            // Airspace Update
            airspaceService.updateGeneralAirspaceVisibility?.();
            airspaceService.updateNotamVisibility?.();

            // Calendar/Time Update
            calendarUi.updateSiteForecastCalendar?.();


            // --- REVISED OpenMeteo Indicator Update ---
            windIndicator.removeAllWindIndicators();
            if (state.isOpenMeteoIndicatorEnabled && state.currentlyOpenPopupSiteId) { // Only for open popup
                console.log(`[refreshAll] Attempting to add wind indicators for site: ${state.currentlyOpenPopupSiteId}`);
                windIndicator.addIndicatorsForSite?.(state.currentlyOpenPopupSiteId, _map);
            }
            // --- END REVISED OpenMeteo Indicator Update ---

        } else {
            // --- In Tracker Mode: Hide non-tracker layers ---
            console.log("[refreshAll] Tracker Mode Active: Hiding non-essential layers.");

            // **** ADD Hiding UKMO Panel ****
            if (config.DISPLAY_UKMO_PANEL && ukmoDisplayPanel.clearPanel) {
                ukmoDisplayPanel.clearPanel(false); // Hide completely
            }
            // **** ----------------------- ****

            // Hide other layers
            if (owmPrecipLayer && _map.hasLayer(owmPrecipLayer)) _map.removeLayer(owmPrecipLayer);
            metRainControls.updateLayer(); // Will handle its own hiding based on state
            if (_particleWindLayer && _map.hasLayer(_particleWindLayer)) _map.removeLayer(_particleWindLayer);
            raspService.removeRaspOverlay(_map);
            Object.values(mapService.layers?.kk7Layers || {}).forEach(layer => { if (layer && _map.hasLayer(layer)) _map.removeLayer(layer); });
            if (_webcamLayer && _map.hasLayer(_webcamLayer)) _map.removeLayer(_webcamLayer);
            const obstacleLayerInstance = obstacleService.getLayer(); if(obstacleLayerInstance && _map.hasLayer(obstacleLayerInstance)) _map.removeLayer(obstacleLayerInstance);
            windIndicator.removeAllWindIndicators(); // Remove site wind indicators
        }
    }, // End of refreshAll

    refreshMarkersOnly: () => {
        if (!state.isTrackerModeActive) {
           markerManager.updateMapMarkers(_map, mapService.layers, dataService.siteDataStore);
           if (windFilter) windFilter.updateStatusText?.();
           // Update UKMO panel based on current context
           const currentSiteId = state.currentlyOpenPopupSiteId || state.selectedSiteIdForCalendar;
            if (config.DISPLAY_UKMO_PANEL && ukmoDisplayPanel.updatePanel) {
               ukmoDisplayPanel.updatePanel(currentSiteId, state.selectedGlobalDate, state.selectedGlobalHour);
            }
        }
    },
    showCalendar: (siteId) => { // Pass siteId directly
        if (!state.isTrackerModeActive) {
            originalShowCalendar(siteId);
            // Update panel when calendar opens for a specific site
            if (config.DISPLAY_UKMO_PANEL && ukmoDisplayPanel.updatePanel) {
                ukmoDisplayPanel.updatePanel(siteId, state.selectedGlobalDate, state.selectedGlobalHour);
            }
        }
    },
    hideCalendar: () => { // No siteId needed here
         calendarUi.hideSiteForecastCalendar();
          // Update panel when calendar closes - check if a popup is *still* open
          const currentPopupSiteId = state.currentlyOpenPopupSiteId;
         if (config.DISPLAY_UKMO_PANEL && ukmoDisplayPanel.updatePanel) {
             ukmoDisplayPanel.updatePanel(currentPopupSiteId, state.selectedGlobalDate, state.selectedGlobalHour); // Update based on popup state (or null)
         }
    },
    enterTrackerMode: enterTrackerMode,
    exitTrackerMode: exitTrackerMode
};
// ***** END: MODIFIED updateUICallbacks *****
console.log("Update Callbacks Defined.");
window.updateUICallbacks = updateUICallbacks; // Keep for debug if needed


    try {
        if (loadingIndicator) loadingIndicator.style.display = 'block';

        // 1. Initialize Map Service
        // ... (map service initialization as before) ...
        console.log("Initializing Map Service...");
        const mapServiceResult = mapService.initializeMap(mapDiv);
        _map = mapServiceResult.map;
        _particleWindLayer = mapServiceResult.particleWindLayer;
        const baseMaps = mapServiceResult.baseMaps;
        const kk7Layers = mapServiceResult.kk7Layers;
        _raspCornersLatLng = mapServiceResult.raspCornersLatLng;
        _webcamLayer = mapServiceResult.webcamLayer;
        console.log("Map Service Initialized.");


        // Initialize services that depend on map
        // ... (webcam, obstacle, airspace service initializations as before) ...
        if (_webcamLayer) { webcamService.initializeWebcamLayer(_webcamLayer); } else { console.error("Webcam layer group not created!"); }
        obstacleService.initialize(_map); _obstacleLayer = obstacleService.getLayer();
        airspaceService.initializeAirspace(_map);


        // --- Initialize Feature Modules ---
        metRainControls.initialize(_map); // Initialize MET Rain controls

        // --- Initialize Core UI Modules ---
        console.log("Initializing Main UI Modules...");
        // ... (timeControls, windFilter, raspUi, calendarUi, airspaceControls, particleUi init as before) ...
        timeControls.initialize(updateUICallbacks);
        windFilter.initialize(updateUICallbacks);
        raspUi.initialize({ map: _map, raspCornersLatLng: _raspCornersLatLng }, raspService.updateRaspOverlay);
        calendarUi.initialize(dataService.siteDataStore, updateUICallbacks);
        airspaceControls.initializeControls();
        _particleControl = particleUi.initialize(_map, _particleWindLayer);

        // **** ADD UKMO Display Panel Initialization ****
        ukmoDisplayPanel.initialize(); // Initialize the new panel module
        // **** ------------------------------------ ****


        // Initialize OpenMeteo Toggle
        openMeteoToggle = document.getElementById('open-meteo-indicator-toggle');
        if (openMeteoToggle) { /* ... listener setup ... */
             openMeteoToggle.checked = state.isOpenMeteoIndicatorEnabled;
             openMeteoToggle.addEventListener('change', handleOpenMeteoToggleChange);
        } else { console.error("OpenMeteo Indicator toggle checkbox not found!"); }

        console.log("Main UI Modules Initialized.");

        // --- Add Leaflet Controls ---
        // ... (search, obstacle, zoom, star, marker filter, load igc controls as before) ...
         console.log("Adding Leaflet Controls...");
         _searchControl = searchControl({ position: 'topleft' }, dataService.siteDataStore, updateUICallbacks).addTo(_map);
         new L.Control.ObstacleToggle({ position: 'topleft' }).addTo(_map);
         L.control.zoom({ position: 'topleft' }).addTo(_map);
         starFilter = starFilterControl({ position: 'topright' }, updateUICallbacks).addTo(_map);
         markerFilterControl(mapService.layers, { position: 'topright' }).addTo(_map);
         _loadIgcControl = new L.Control.LoadIgcControl().addTo(_map);


        // --- Layer Control Setup ---
        // ... (layer control setup as before) ...
         const overlayMaps = {};
         console.log("Setting up Layer Control Overlays...");
         if (_particleWindLayer) { overlayMaps["<i class='fas fa-wind'></i> Wind Particles"] = _particleWindLayer; }
         if (kk7Layers && Object.keys(kk7Layers).length > 0) { Object.assign(overlayMaps, kk7Layers); }
         if (owmApiKey && owmApiKey !== 'YOUR_OWM_API_KEY' && owmApiKey.length > 10) {
             owmPrecipLayer = L.tileLayer(`https://maps.openweathermap.org/maps/2.0/weather/1h/${owmPrecipLayerOp}/{z}/{x}/{y}?appid=${owmApiKey}`, { attribution: '© OpenWeatherMap', opacity: 0.7 });
             overlayMaps['<i class="fas fa-cloud-showers-heavy"></i> Precip Forecast (OWM)'] = owmPrecipLayer;
         } else { console.warn("OWM API key not set or invalid. OWM layer disabled."); }
         const metRainLayer = metRainControls.getLayer();
         if (metRainLayer) { overlayMaps['<i class="fa-solid fa-cloud-rain"></i> MET Rain Fcst'] = metRainLayer; console.log("Added MET Rain Forecast layer to layer control."); }
         else { console.warn("MET Rain Forecast layer not available to add to layer control."); }
         if (_webcamLayer) { overlayMaps['<i class="fas fa-video"></i> Webcams'] = _webcamLayer; console.log("Added Webcam layer to layer control."); }
         else { console.warn("Webcam layer instance not available when setting up layer control."); }
         const obstacleLayerInstanceForControl = obstacleService.getLayer();
         if (obstacleLayerInstanceForControl) { overlayMaps['<i class="fas fa-broadcast-tower"></i> Obstacles (OSM)'] = obstacleLayerInstanceForControl; console.log("Added Obstacle layer (from service) to layer control."); }
         else { console.warn("Obstacle layer (from service) not available to add to layer control."); }
         console.log("DEBUG: overlayMaps object before L.control.layers:", overlayMaps);
         const layerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: true, position: 'topright' }).addTo(_map);
         console.log("Layer Control Added.");


        // --- Map Event Listeners ---
        // ... (obstacle and particle layer listeners as before) ...
        const obstacleLayerFromService = obstacleService.getLayer();
        if (_map && obstacleLayerFromService) {
            _map.on('layeradd', function(e) { /* ... obstacle add logic ... */ if (e.layer === obstacleLayerFromService) { obstacleService.enableLayer(); const checkbox = document.getElementById('obstacle-toggle'); if (checkbox && !checkbox.checked) checkbox.checked = true; } });
            _map.on('layerremove', function(e) { /* ... obstacle remove logic ... */ if (e.layer === obstacleLayerFromService) { obstacleService.disableLayer(); const checkbox = document.getElementById('obstacle-toggle'); if (checkbox && checkbox.checked) checkbox.checked = false; } });
            console.log("Map event listeners added for obstacle layer sync.");
        } else { console.warn("Could not add obstacle layer listeners (_map or obstacleLayerFromService missing)."); }
        if (_particleWindLayer && _map) {
            _map.on('layeradd', (e) => { if (e.layer === _particleWindLayer) { if (!state.userPrefersParticlesVisible) state.setUserPrefersParticlesVisible(true); } });
            _map.on('layerremove', (e) => { if (e.layer === _particleWindLayer) { if (state.userPrefersParticlesVisible) state.setUserPrefersParticlesVisible(false); } });
            console.log("Map event listeners added for particleWindLayer state sync.");
         } else { console.warn("Could not add particle layer listeners (_particleWindLayer or _map missing)."); }


        // --- Force Search Control Top ---
        // ... (setTimeout for search z-index as before) ...
         setTimeout(() => { const searchControlElement = _searchControl?.getContainer(); if (searchControlElement) searchControlElement.style.zIndex = '1001'; }, 10);

        // --- Tracker Initialization Timeout ---
        // ... (tracker init timeout as before) ...
         const trackerInitDelay = 500; setTimeout(() => { console.log("Tracker initialization timeout reached (if applicable)."); }, trackerInitDelay);


        // --- Map Click Listener ---
        // ... (map click listener as before) ...
         _map.on('click', (e) => { console.log(`Map clicked at: ${e.latlng}`); calendarUi.hideSiteForecastCalendar(); });


        // --- 4. Fetch Initial Site Data and Populate Map ---
        console.log("Starting site data fetch process...");
        if (raspService) raspService.initializeService?.(); // Initialize RASP service if needed

        // Initialize Webcam Service (as before)
        webcamService.loadWebcams(config.WEBCAM_API_URL || 'data/webcams.json')
            .then(() => console.log("Webcam data loading initiated."))
            .catch(error => console.error("Error initiating webcam data load:", error));


        // --- Fetch Data Block (MODIFIED to Initialize UKMO Service) ---
        dataService.fetchInitialData(config.SITES_API_URL, config.WEATHER_API_BASE_URL)
            .then(async ({ siteDataStore, forecastAvailability }) => { // **** Made async ****
                console.log("Site data fetch successful. Populating UI and initializing UKMO service.");

                // --- Initialize UKMO Weather Service AFTER DB is ready and site data is available ---
                try {
                    const dbInstancePromise = dataService.getDbInstance();
                    const dbInstance = await dbInstancePromise; // Wait for DB

                    if (dbInstance && siteDataStore) {
                         await ukmoWeatherService.initialize(dbInstance, siteDataStore); // Init UKMO
                         console.log("UKMO Weather Service initialized successfully.");

                         // **** Run Tests (Keep this for now) ****
                         await runUkmoServiceTests(siteDataStore);
                         // **** ------------------------- ****

                    } else {
                        console.error("UKMO Service could not be initialized: DB instance or siteDataStore missing after fetchInitialData.");
                    }
                } catch (ukmoInitError) {
                    console.error("Error initializing UKMO Weather Service:", ukmoInitError);
                }
                // --- End UKMO Service Initialization ---


                // --- Existing UI Population based on fetched data ---
                if (timeControls.populateDates) {
                    timeControls.populateDates(forecastAvailability);
                } else { console.error("timeControls.populateDates function not found!"); }

                if (markerManager.initializeMarkers) {
                    // Make marker initialization async if it returns a promise
                    await markerManager.initializeMarkers(_map, mapService.layers, siteDataStore, updateUICallbacks);
                    console.log("Marker initialization finished.");
                } else { console.error("markerManager.initializeMarkers function not found!"); }


                if (_searchControl) _searchControl.updateSearchIndex();
                else console.warn("Main.js: _searchControl instance not found when trying to update index.");

                console.log("DEBUG: Calling initial updateUICallbacks.refreshAll()");
                if (updateUICallbacks.refreshAll) updateUICallbacks.refreshAll(); // Initial UI refresh
                else console.error("updateUICallbacks.refreshAll function not defined!");

                console.log("Application initialized successfully (UI population complete). Hiding indicator.");
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none'; // Hide loader last
                }

            }) // <<< End of .then() block
            .catch(error => { // <<< Start of .catch() for fetchInitialData
                console.error("FATAL ERROR during initial site data load or subsequent init:", error); // Updated msg
                if (loadingIndicator) { /* ... hide loader ... */ }
                if (mapDiv) { /* ... show error in map div ... */ }
                try {
                    // Disable ALL controls on any major failure
                    timeControls.disable?.();
                    windFilter.disable?.();
                    if(starFilter) starFilter.disable?.();
                    raspUi.disable?.();
                    particleUi.disable?.();
                    calendarUi.disable?.();
                    airspaceControls.disableControls?.();
                    if(_searchControl) _searchControl.disable?.();
                    if(_loadIgcControl?.getContainer()) _loadIgcControl.getContainer().classList.add('disabled');
                    const obstacleToggleCheckbox = document.getElementById('obstacle-toggle');
                    if(obstacleToggleCheckbox?.parentElement) obstacleToggleCheckbox.disabled = true;
                    metRainControls.disableOnError?.(); // Disable MET Rain
                    ukmoDisplayPanel.clearPanel?.(false); // Hide UKMO panel on error
                    // Consider adding ukmoDisplayPanel.disable() if needed
                    console.warn("UI controls disabled due to data load failure (attempted).");
                } catch (disableError) { /* ... log disable error ... */ }
            }); // <<< End of .catch() for fetchInitialData


    // IMPORTANT: The main try block ends HERE, before the outer catch block
    } catch (initializationError) {
        console.error("FATAL ERROR during application initialization:", initializationError);
        if (loadingIndicator) { /* ... hide loader ... */ }
        if (mapDiv) { /* ... show error in map div ... */ }
        try {
             // Disable ALL controls on any major failure
             timeControls.disable?.();
             windFilter.disable?.();
             if(starFilter) starFilter.disable?.();
             raspUi.disable?.();
             particleUi.disable?.();
             calendarUi.disable?.();
             airspaceControls.disableControls?.();
             if(_searchControl) _searchControl.disable?.();
             if(_loadIgcControl?.getContainer()) _loadIgcControl.getContainer().classList.add('disabled');
             const obstacleToggleCheckbox = document.getElementById('obstacle-toggle');
             if(obstacleToggleCheckbox?.parentElement) obstacleToggleCheckbox.disabled = true;
             metRainControls.disableOnError?.(); // Disable MET Rain
             ukmoDisplayPanel.clearPanel?.(false); // Hide UKMO panel on error
             console.warn("UI controls disabled due to initialization failure (attempted).");
        } catch (disableError) { /* ... log disable error ... */ }
    } // <<< End of outer catch(initializationError)

}); // <<< END OF DOMContentLoaded Listener


// --- Event Handlers ---
// ... (handleOpenMeteoToggleChange as before) ...
function handleOpenMeteoToggleChange(event) {
    const isEnabled = event.target.checked;
    state.setOpenMeteoIndicatorEnabled(isEnabled);
    const openPopupSiteId = state.currentlyOpenPopupSiteId;
    let openMarker = null;
    if (openPopupSiteId) {
        const siteEntry = dataService.getSiteData(openPopupSiteId);
        if (siteEntry?.marker?.isPopupOpen()) openMarker = siteEntry.marker;
    }
    if (isEnabled && openMarker) {
        const siteData = dataService.getSiteData(openPopupSiteId)?.site;
        if(siteData?.lat && siteData?.lng){
            openMeteoService.fetchOpenMeteoData(openPopupSiteId, siteData.lat, siteData.lng)
                .then(() => { updateUICallbacks.refreshMarkersOnly?.() });
        }
    } else if (!isEnabled) {
        windIndicator.removeAllWindIndicators();
    }
}

// --- Test Function (Keep for Debugging) ---
async function runUkmoServiceTests(siteDataStore) {
    console.log("--- Running UKMO Service Basic Tests ---");
    if (!siteDataStore || siteDataStore.size === 0) { /* ... */ return; }
    const testSiteId = siteDataStore.keys().next().value;
    if (!testSiteId) { /* ... */ return; }
    console.log(`UKMO Test: Using Site ID: ${testSiteId}`);
    try { /* ... test getUkmoDataForSite ... */
        console.log(`UKMO Test 1: Calling getUkmoDataForSite(${testSiteId})...`);
        const siteData = await ukmoWeatherService.getUkmoDataForSite(testSiteId);
        if (siteData) {
            console.log(`UKMO Test 1 SUCCESS: Received data for site ${testSiteId}. Latitude: ${siteData.latitude}`);
        } else {
            console.warn(`UKMO Test 1 NOTE: getUkmoDataForSite(${testSiteId}) returned null.`);
        }
    } catch (err) { console.error(`UKMO Test 1 FAILED: Error calling getUkmoDataForSite(${testSiteId}):`, err); }
    const testDate = state.selectedGlobalDate; const testHour = state.selectedGlobalHour;
    if (testDate && testHour !== null) {
        console.log(`UKMO Test 2: Calling getUkmoDataForSiteAndHour(${testSiteId}, ${testDate}, ${testHour})...`);
        try { /* ... test getUkmoDataForSiteAndHour ... */
            const hourlyData = await ukmoWeatherService.getUkmoDataForSiteAndHour(testSiteId, testDate, testHour);
            if (hourlyData) {
                console.log(`UKMO Test 2 SUCCESS: Received hourly data for site ${testSiteId} at ${testDate} ${testHour}:00 (UK Local):`);
                console.log("   Data:", hourlyData);
            } else {
                console.warn(`UKMO Test 2 NOTE: getUkmoDataForSiteAndHour(${testSiteId}, ${testDate}, ${testHour}) returned null.`);
            }
        } catch (err) { console.error(`UKMO Test 2 FAILED: Error calling getUkmoDataForSiteAndHour(${testSiteId}, ${testDate}, ${testHour}):`, err); }
    } else { console.log("UKMO Test 2: Skipped - No global date/hour selected for testing getUkmoDataForSiteAndHour."); }
    console.log("--- Finished UKMO Service Basic Tests ---");
}

// --- Helper function for tracker UI elements (keep if tracker uses it) ---
// ... (getExpectedIdForKey function as before) ...
function getExpectedIdForKey(key) {
    const idMap = {
        fileInput: 'trackerFileInput', barogramCanvas: 'trackerBarogramCanvas', timeSlider: 'trackerTimeSlider',
        infoDisplay: 'trackerInfoDisplay', keyFlightInfoGrid: 'trackerKeyFlightInfoGrid', playPauseBtn: 'trackerPlayPauseBtn',
        speedSelect: 'trackerSpeedSelect', loadingStatus: 'trackerLoadingStatus', stepBackBtn: 'trackerStepBackBtn',
        stepFwdBtn: 'trackerStepFwdBtn', altitudeUnitSelect: 'trackerAltitudeUnitSelect', speedUnitSelect: 'trackerSpeedUnitSelect',
        distanceUnitSelect: 'trackerDistanceUnitSelect', autoPanCheckbox: 'trackerAutoPanCheckbox', liveStatsBar: 'trackerLiveStatsBar',
        liveSpeed: 'trackerLiveSpeed', liveAltitude: 'trackerLiveAltitude', liveVario: 'trackerLiveVario',
        liveFlightTime: 'trackerLiveFlightTime', statsContent: 'trackerStatsContent',
        statsPanelToggle: 'stats-panel-toggle', statsPanel: 'trackerStatsPanel', keyStatsGridContainer: 'trackerKeyFlightInfoGrid',
        trackerMapOverlayInfo: 'trackerMapOverlayInfo', exitTrackerBtn: 'exitTrackerBtn'
    };
    return idMap[key] || key;
}

// --- END OF FILE main.js ---