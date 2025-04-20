// --- START OF FILE particleService.js ---
import * as utils from './utils.js';
import * as state from './state.js';

/**
 * Extracts wind data points {lat, lng, u, v} for the particle layer
 * for the currently selected global time.
 * @param {Map} siteDataStore - The main data store holding site and weather info.
 * @returns {Array<object>} Array of points suitable for L.canvasLayer.particles.setWindData(), or empty array.
 */
// **** REVERTED FUNCTION SIGNATURE AND RETURN TYPE ****
export function getWindDataForParticleLayer(siteDataStore) {
    const windPoints = [];
    // **** REMOVED minSpeed, maxSpeed, dataFound variables ****

    const targetDate = state.selectedGlobalDate;
    const targetHour = state.selectedGlobalHour;

    if (!targetDate || targetHour === null || targetHour === undefined || targetHour === "") {
        // console.log("Particle Service: No specific time selected."); // Reduce log spam
        return []; // **** REVERTED: Return empty array ****
    }

    siteDataStore.forEach(({ site, weatherData }) => {
        if (site && weatherData && weatherData.weather && typeof site.lat === 'number' && typeof site.lng === 'number') {
            const latestForecast = utils.getLatestForecastForHour(weatherData.weather, targetDate, targetHour);

            if (latestForecast && latestForecast.wind_knts !== undefined && latestForecast.wind_dir !== undefined) {
                const windSpeedKnots = latestForecast.wind_knts;
                // Convert knots and degrees to u/v components (m/s)
                const { u, v } = utils.windSpeedDirToUV(windSpeedKnots, latestForecast.wind_dir);

                if (!isNaN(u) && !isNaN(v)) {
                    windPoints.push({ lat: site.lat, lng: site.lng, u: u, v: v });
                    // **** REMOVED speedMag calculation and min/max update ****
                }
            }
        }
    });

    // **** REMOVED Handling for !dataFound and uniform speed ****
    if (windPoints.length === 0) {
        console.log(`Particle Service: No valid wind data found for ${targetDate} ${targetHour}:00`);
    }

    // console.log(`Particle Service: Found ${windPoints.length} points.`); // Simplified log

    // **** REVERTED: Return only the points array ****
    return windPoints;
}

/**
 * Updates the particle layer's data (wind points) and visibility. // <<< Updated doc comment
 * @param {L.CanvasLayer.Particles} particleLayer - The particle layer instance.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {Map} siteDataStore - The main data store.
 */
export function updateParticleLayer(particleLayer, map, siteDataStore) {
    if (!particleLayer || !map) {
        console.warn("Particle Service: particleLayer or map instance missing in updateParticleLayer.");
        return;
    }

    const isSpecificTimeSelected = state.selectedGlobalDate && state.selectedGlobalHour !== null && state.selectedGlobalHour !== "";
    const userWantsParticles = state.userPrefersParticlesVisible;
    const isCurrentlyVisible = map.hasLayer(particleLayer);

    // **** REVERTED: Only get wind points ****
    let windPoints = []; // Default to empty array
    if (isSpecificTimeSelected) {
        windPoints = getWindDataForParticleLayer(siteDataStore);
    }

    // Update layer data
    // **** REVERTED: Call setWindData with only points ****
    particleLayer.setWindData(windPoints);


    // Add/remove layer based on time selection and user preference (logic unchanged)
    if (isSpecificTimeSelected && userWantsParticles) {
        if (!isCurrentlyVisible) {
            particleLayer.addTo(map);
            state.setWindLayerVisible(true);
            console.log("Particle layer added (time selected & user preference).");
        } else if (!state.isWindLayerVisible) {
            // Correct state if inconsistent
            state.setWindLayerVisible(true);
        }
    } else {
        if (isCurrentlyVisible) {
            particleLayer.remove();
            state.setWindLayerVisible(false);
             if (!isSpecificTimeSelected) {
                 console.log("Particle layer removed (no time selected).");
             } else { // !userWantsParticles must be true
                 console.log("Particle layer removed (user preference via Layer Control).");
             }
        } else if (state.isWindLayerVisible) {
            // Correct state if inconsistent
            state.setWindLayerVisible(false);
        }
    }
}
// --- END OF FILE particleService.js ---