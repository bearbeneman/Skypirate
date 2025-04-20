// --- START OF FILE ukmoWeatherService.js ---

import * as config from './config.js';
import { isUkDst } from './utils.js'; // Needed later for matching time
import { getDbInstance } from './dataService.js'; // Import the getter for the DB instance

// --- Module Variables ---
let db = null; // Will hold the Dexie DB instance received during initialization
let ukmoMemoryCache = { timestamp: 0, apiResponse: null }; // In-memory cache for the bulk data
let isFetching = false; // Flag to prevent concurrent fetches of the bulk data
let siteCoordsMap = new Map(); // Stores Map<siteId, {lat: number, lon: number}>
let currentFetchPromise = null; // Holds the promise of the current fetch operation

// --- END: Module Variables ---

/**
 * Initializes the UKMO Weather Service.
 * Stores the DB instance, populates the site coordinate map, and
 * attempts an initial load from cache or triggers a fetch if needed.
 * @param {Dexie} databaseInstance - The initialized Dexie database instance.
 * @param {Map} allSitesDataStore - The main site data store (Map<siteId, {site: object, ...}>).
 */
/* REMOVE export */ async function initialize(databaseInstance, allSitesDataStore) { // <<<< REMOVED export
    console.log("UKMO Weather Service: Initializing...");
    if (!databaseInstance) {
        console.error("UKMO Service Init ERROR: Database instance is required.");
        return;
    }
    if (!allSitesDataStore || !(allSitesDataStore instanceof Map) || allSitesDataStore.size === 0) {
        console.error("UKMO Service Init ERROR: Valid allSitesDataStore (Map) is required.");
        return;
    }

    db = databaseInstance; // Store the DB instance

    // Populate the siteCoordsMap
    siteCoordsMap.clear();
    allSitesDataStore.forEach((entry, siteId) => {
        if (entry?.site && typeof entry.site.lat === 'number' && typeof entry.site.lng === 'number') {
            siteCoordsMap.set(String(siteId), { // Ensure siteId is string
                lat: entry.site.lat,
                lon: entry.site.lng
            });
        } else {
            console.warn(`UKMO Service Init: Skipping site ID ${siteId} due to missing site data or coordinates.`);
        }
    });

    console.log(`UKMO Service Init: Populated siteCoordsMap with ${siteCoordsMap.size} sites.`);

    // Trigger initial data load check (don't necessarily wait for it here)
    _loadDataFromCacheOrFetch().catch(err => {
        console.error("UKMO Service Init: Error during initial data load attempt:", err);
    });

    console.log("UKMO Weather Service: Initialized.");
}

/**
 * Builds the Open-Meteo API URL for fetching UKMO data for all known sites.
 * Handles potential batching if siteCoordsMap exceeds max fetch limit (though unlikely needed).
 * @returns {string | null} The constructed API URL or null if no sites are available.
 * @private
 */
function _buildApiUrl() { // <<<<<<<<<<<<<<<<<<<< ADD THIS FUNCTION
    if (siteCoordsMap.size === 0) {
        console.warn("UKMO Service (_buildApiUrl): Cannot build URL, siteCoordsMap is empty.");
        return null;
    }

    const latitudes = [];
    const longitudes = [];
    const coordPrecision = config.UKMO_COORD_PRECISION;

    // --- Get Coordinates from the Map ---
    // Use all sites since we fetch in one go
    const allSiteCoords = Array.from(siteCoordsMap.values());

    if (allSiteCoords.length === 0) {
        console.warn("UKMO Service (_buildApiUrl): No valid coordinates in siteCoordsMap.");
        return null;
    }

    // --- Format Coordinates ---
    allSiteCoords.forEach(coords => {
        // Add basic validation within the loop
        if (typeof coords.lat === 'number' && typeof coords.lon === 'number' &&
            !isNaN(coords.lat) && !isNaN(coords.lon)) {
            latitudes.push(coords.lat.toFixed(coordPrecision));
            longitudes.push(coords.lon.toFixed(coordPrecision));
        } else {
            console.warn(`UKMO Service (_buildApiUrl): Skipping invalid coordinate pair:`, coords);
        }
    });

    // Check if we ended up with any valid coordinates after filtering
    if (latitudes.length === 0) {
        console.warn("UKMO Service (_buildApiUrl): No valid coordinates to include in URL after validation.");
        return null;
    }

    // --- Check against Max Locations (Optional but good practice) ---
    if (latitudes.length > config.UKMO_MAX_LOCATIONS_PER_FETCH) {
        console.warn(`UKMO Service (_buildApiUrl): Number of sites (${latitudes.length}) exceeds UKMO_MAX_LOCATIONS_PER_FETCH (${config.UKMO_MAX_LOCATIONS_PER_FETCH}). Truncating request.`);
        // If you hit this, you might need to implement actual batching later,
        // but for now, we'll just warn and truncate.
        latitudes.length = config.UKMO_MAX_LOCATIONS_PER_FETCH; // Truncate arrays
        longitudes.length = config.UKMO_MAX_LOCATIONS_PER_FETCH;
    }

    // --- Join Coordinates ---
    const latString = latitudes.join(',');
    const lonString = longitudes.join(',');

    // --- Construct Final URL ---
    // Ensure all components are present in config
    const baseUrl = config.UKMO_API_BASE_URL;
    const hourlyParams = config.UKMO_API_HOURLY_PARAMS;
    const modelParam = config.UKMO_API_MODEL_PARAM;

    if (!baseUrl || !hourlyParams || !modelParam) {
        console.error("UKMO Service (_buildApiUrl): Missing required config values (UKMO_API_BASE_URL, UKMO_API_HOURLY_PARAMS, UKMO_API_MODEL_PARAM).");
        return null;
    }

    const url = `${baseUrl}?latitude=${latString}&longitude=${lonString}&hourly=${hourlyParams}&models=${modelParam}`;

    // Log the first part for debugging without excessive length
    console.log(`UKMO Service (_buildApiUrl): Built URL (Truncated if > 250 chars): ${url.substring(0, 250)}${url.length > 250 ? '...' : ''}`);

    return url;
}

/**
 * Fetches bulk UKMO data from the API, caches it in Dexie and memory.
 * Uses the isFetching flag to prevent concurrent runs.
 * @returns {Promise<object[] | null>} The API response array or null on error/fetch already in progress.
 * @private
 */
async function _fetchAndCacheData() {
    if (isFetching) {
        console.log("UKMO Service (_fetchAndCacheData): Fetch already in progress, returning existing promise.");
        // Return the promise of the ongoing fetch
        return currentFetchPromise;
    }

    isFetching = true;
    console.log("UKMO Service (_fetchAndCacheData): Starting fetch...");
    currentFetchPromise = (async () => { // Wrap the async logic in a self-invoking function to store the promise
        const apiUrl = _buildApiUrl();
        if (!apiUrl) {
            console.error("UKMO Service (_fetchAndCacheData): Failed to build API URL.");
            isFetching = false; // Reset flag on error
            currentFetchPromise = null;
            return null;
        }

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                // Attempt to get error message from API response body
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.reason) {
                        errorMsg += ` - ${errorData.reason}`;
                    }
                } catch (jsonError) { /* Ignore if response body isn't JSON */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            // Basic validation: Open-Meteo returns an array for multi-location requests
            if (!Array.isArray(data)) {
                console.error("UKMO Service (_fetchAndCacheData): API response is not an array.", data);
                throw new Error("Invalid API response format (expected array).");
            }

            console.log(`UKMO Service (_fetchAndCacheData): Fetch successful. Received data for ${data.length} locations.`);

            // --- Caching Step (Phase 3) ---
            const cacheEntry = {
                key: config.UKMO_BULK_CACHE_KEY, // Use the fixed key
                timestamp: Date.now(),
                apiResponse: data // Store the raw array response
            };

            if (db) { // Ensure DB instance is available
                try {
                    await db[config.UKMO_DATA_STORE_NAME].put(cacheEntry);
                    console.log(`UKMO Service (_fetchAndCacheData): Successfully cached bulk data in Dexie store "${config.UKMO_DATA_STORE_NAME}".`);

                    // Update in-memory cache AFTER successful DB write
                    ukmoMemoryCache.timestamp = cacheEntry.timestamp;
                    ukmoMemoryCache.apiResponse = cacheEntry.apiResponse;
                    console.log("UKMO Service (_fetchAndCacheData): Updated in-memory cache.");

                } catch (dexieError) {
                    console.error(`UKMO Service (_fetchAndCacheData): Failed to cache data in Dexie store "${config.UKMO_DATA_STORE_NAME}":`, dexieError);
                    // Data is fetched but not cached, memory cache won't be updated either in this case
                }
            } else {
                console.warn("UKMO Service (_fetchAndCacheData): Dexie DB instance not available, cannot cache data.");
                // Update memory cache anyway if DB isn't available? Optional.
                // ukmoMemoryCache.timestamp = cacheEntry.timestamp;
                // ukmoMemoryCache.apiResponse = cacheEntry.apiResponse;
            }
            // --- End Caching Step ---

            return data; // Return the fetched data array

        } catch (error) {
            console.error("UKMO Service (_fetchAndCacheData): Fetch or processing error:", error);
            // Clear potentially stale memory cache on error
            ukmoMemoryCache.timestamp = 0;
            ukmoMemoryCache.apiResponse = null;
            return null; // Indicate failure

        } finally {
            isFetching = false; // Reset flag regardless of success or failure
            currentFetchPromise = null; // Clear the stored promise
            console.log("UKMO Service (_fetchAndCacheData): Fetch attempt finished.");
        }
    })(); // Immediately invoke the async function

    return currentFetchPromise; // Return the promise
}

/**
 * Checks memory cache, then Dexie cache. If both are invalid or missing,
 * triggers a new fetch. Returns the data if found in a valid cache.
 * @returns {Promise<object[] | null>} A promise resolving with the bulk API response array or null.
 * @private
 */
async function _loadDataFromCacheOrFetch() {
    const now = Date.now();
    const cacheExpiryTime = now - config.UKMO_CACHE_DURATION_MS;

    // 1. Check Memory Cache
    if (ukmoMemoryCache.timestamp > cacheExpiryTime && ukmoMemoryCache.apiResponse) {
        console.log("UKMO Service (_loadDataFromCacheOrFetch): Using valid data from memory cache.");
        return ukmoMemoryCache.apiResponse;
    } else if (ukmoMemoryCache.timestamp > cacheExpiryTime && ukmoMemoryCache.apiResponse === null) {
        // If memory has a recent 'null' response (e.g., fetch failed recently), respect that for a short time? Optional.
        // For now, we'll proceed to check Dexie even if memory cache recently failed.
         console.log("UKMO Service (_loadDataFromCacheOrFetch): Memory cache has recent null, checking Dexie.");
    } else {
         console.log("UKMO Service (_loadDataFromCacheOrFetch): Memory cache stale or empty.");
    }

    // 2. Check Dexie Cache
    if (!db) {
        console.warn("UKMO Service (_loadDataFromCacheOrFetch): Cannot check Dexie cache, DB instance not available.");
        // If DB isn't ready, we might need to wait or trigger fetch anyway?
        // Let's trigger fetch if DB isn't ready yet.
        console.log("UKMO Service (_loadDataFromCacheOrFetch): Triggering fetch because DB is not ready.");
        return _fetchAndCacheData(); // Trigger fetch
    }

    try {
        const cachedEntry = await db[config.UKMO_DATA_STORE_NAME].get(config.UKMO_BULK_CACHE_KEY);

        if (cachedEntry) {
            // Entry found in Dexie
            if (cachedEntry.timestamp > cacheExpiryTime) {
                // Dexie cache is valid
                console.log("UKMO Service (_loadDataFromCacheOrFetch): Using valid data from Dexie cache.");
                // Update memory cache
                ukmoMemoryCache.timestamp = cachedEntry.timestamp;
                ukmoMemoryCache.apiResponse = cachedEntry.apiResponse; // Can be array or null
                return cachedEntry.apiResponse; // Return data (could be null if last fetch failed)
            } else {
                // Dexie cache is expired
                console.log("UKMO Service (_loadDataFromCacheOrFetch): Dexie cache expired.");
                // Optionally delete expired entry from Dexie?
                // db[config.UKMO_DATA_STORE_NAME].delete(config.UKMO_BULK_CACHE_KEY);
                return _fetchAndCacheData(); // Trigger fetch
            }
        } else {
            // Not found in Dexie
            console.log("UKMO Service (_loadDataFromCacheOrFetch): Data not found in Dexie cache.");
            return _fetchAndCacheData(); // Trigger fetch
        }
    } catch (dexieError) {
        console.error("UKMO Service (_loadDataFromCacheOrFetch): Error reading from Dexie:", dexieError);
        // Fallback to fetch on DB error? Or return null? Let's fetch.
        return _fetchAndCacheData();
    }
}

/**
 * Ensures the latest UKMO data (from cache or fetch) is loaded and returns it.
 * This is the primary function external modules should call to get the bulk data.
 * @returns {Promise<object[] | null>} A promise resolving with the bulk API response array,
 *                                      or null if data is unavailable or fetch failed.
 */
/* REMOVE export */ async function getBulkUkmoData() { // <<<< REMOVED export
    console.log("UKMO Service: getBulkUkmoData called.");
    // This automatically handles checking caches and triggering fetches if needed.
    // The result will be the current valid data or null.
    try {
        const data = await _loadDataFromCacheOrFetch();
        return data;
    } catch (error) {
        console.error("UKMO Service (getBulkUkmoData): Caught error during data retrieval:", error);
        return null; // Ensure null is returned on any unexpected error
    }
}

/**
 * Finds the data object for a specific site within the bulk API response array.
 * Finds the API response entry geographically closest to the site's stored coordinates.
 * @param {string} siteId - The ID of the site to find.
 * @param {object[]} bulkApiResponse - The array of location data objects from the API.
 * @returns {object | null} The matching site data object (incl. hourly data) or null if not found.
 * @private
 */
function _findSiteDataInResponse(siteId, bulkApiResponse) {
    if (!siteId || !Array.isArray(bulkApiResponse) || bulkApiResponse.length === 0) {
        console.warn(`UKMO Service (_findSiteDataInResponse): Invalid input - siteId=${siteId}, bulkApiResponse isArray=${Array.isArray(bulkApiResponse)}, length=${bulkApiResponse?.length}`);
        return null;
    }

    const targetCoords = siteCoordsMap.get(String(siteId)); // Ensure string ID
    if (!targetCoords) {
        console.warn(`UKMO Service (_findSiteDataInResponse): Coordinates not found in siteCoordsMap for siteId: ${siteId}`);
        return null;
    }

    // --- Initialize variables to track the closest match ---
    let closestMatchData = null; // <<<< RENAMED variable
    let minDistanceSq = Infinity;
    // --- ----------------------------------------------- ---

    // --- Calculate squared distance tolerance for sanity check (e.g., ~5km) ---
    const MAX_REASONABLE_DISTANCE_SQ = 0.05 * 0.05;

    for (const siteData of bulkApiResponse) {
        if (siteData && typeof siteData.latitude === 'number' && typeof siteData.longitude === 'number') {
            const latDiff = siteData.latitude - targetCoords.lat;
            const lonDiff = siteData.longitude - targetCoords.lon;
            const distanceSq = (latDiff * latDiff) + (lonDiff * lonDiff);

            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                closestMatchData = siteData; // <<<< Assign to RENAMED variable
            }
        }
    }

    // --- Check the final result stored in closestMatchData ---
    if (closestMatchData) { // Check if we found *any* closest point
        if (minDistanceSq <= MAX_REASONABLE_DISTANCE_SQ) {
            // Optional: Log if the found coordinates differ significantly
            const foundLat = closestMatchData.latitude; // <<<< Use RENAMED variable
            const foundLon = closestMatchData.longitude; // <<<< Use RENAMED variable
            if (Math.abs(foundLat - targetCoords.lat) > 0.01 || Math.abs(foundLon - targetCoords.lon) > 0.01) {
                console.log(`UKMO Service (_findSiteDataInResponse): Site ${siteId} matched API point at (${foundLat.toFixed(4)}, ${foundLon.toFixed(4)}), differing from target (${targetCoords.lat.toFixed(4)}, ${targetCoords.lon.toFixed(4)}). DistSq: ${minDistanceSq.toFixed(6)}`);
            }
            return closestMatchData; // <<<< Return RENAMED variable
        } else {
            // Closest match was found, but it's potentially too far away
            console.warn(`UKMO Service (_findSiteDataInResponse): Closest match for site ${siteId} (Target: ${targetCoords.lat.toFixed(4)},${targetCoords.lon.toFixed(4)}) was at (${closestMatchData.latitude.toFixed(4)}, ${closestMatchData.longitude.toFixed(4)}), which is potentially too far (DistSq: ${minDistanceSq.toFixed(6)} > ${MAX_REASONABLE_DISTANCE_SQ.toFixed(6)}). Returning null.`); // <<<< Use RENAMED variable
            return null;
        }
    } else {
        // No valid data points found in the API response at all
        console.warn(`UKMO Service (_findSiteDataInResponse): No valid coordinates found in API response to compare for siteId: ${siteId} (Target: ${targetCoords.lat.toFixed(4)},${targetCoords.lon.toFixed(4)}).`);
        return null;
    }
}

/**
 * Gets the UKMO weather forecast data object for a specific site ID.
 * Retrieves the bulk data first (from cache or fetch) and then finds the site.
 * @param {string} siteId - The ID of the site.
 * @returns {Promise<object | null>} A promise resolving with the site's data object
 *                                   (containing hourly arrays etc.) or null if not found.
 */
/* REMOVE export */ async function getUkmoDataForSite(siteId) { // <<<< REMOVED export
    if (!siteId) return null;

    const bulkData = await getBulkUkmoData(); // Get the full dataset

    if (!bulkData) {
        console.log(`UKMO Service (getUkmoDataForSite): Bulk data unavailable for site ${siteId}.`);
        return null; // Bulk data fetch failed or pending
    }

    const siteData = _findSiteDataInResponse(siteId, bulkData);
    return siteData; // This will be the site object or null if not found
}

/**
 * Finds the index within the hourly time array that matches the target local UK date and hour.
 * @param {object} hourlyData - The 'hourly' object from the API response for a site.
 * @param {string} targetDateStr - Target local date (YYYY-MM-DD).
 * @param {string | number} targetHour - Target local hour (HH or number).
 * @returns {number} The matching index, or -1 if not found or invalid input.
 * @private
 */
function _matchTimeToHourlyIndex(hourlyData, targetDateStr, targetHour) {
    if (!hourlyData || !Array.isArray(hourlyData.time) || hourlyData.time.length === 0 || !targetDateStr || targetHour === null || targetHour === undefined) {
        // console.warn("UKMO Service (_matchTimeToHourlyIndex): Invalid input or empty time array."); // Can be noisy
        return -1;
    }

    try {
        // --- Timezone Handling to get Target UTC ISO String ---
        const year = parseInt(targetDateStr.substring(0, 4), 10);
        const monthIndex = parseInt(targetDateStr.substring(5, 7), 10) - 1; // JS months 0-11
        const day = parseInt(targetDateStr.substring(8, 10), 10);
        const ukHour = parseInt(targetHour, 10);

        if (isNaN(year) || isNaN(monthIndex) || isNaN(day) || isNaN(ukHour)) {
            console.warn(`UKMO Service (_matchTimeToHourlyIndex): Invalid date/hour components parsed: ${targetDateStr} ${targetHour}`);
            return -1;
        }

        // Determine DST based on the target date/time
        const tempTimestampForDstCheck = Date.UTC(year, monthIndex, day, ukHour, 0, 0);
        const tempDateForDstCheck = new Date(tempTimestampForDstCheck);
        const isCurrentlyDst = isUkDst(tempDateForDstCheck);
        const utcOffsetHours = isCurrentlyDst ? 1 : 0;

        // Calculate the target time in UTC
        let targetUtcHour = ukHour - utcOffsetHours;
        let targetUtcDay = day;
        let targetUtcMonthIndex = monthIndex;
        let targetUtcYear = year;

        // Handle crossing midnight backward when converting UK->UTC
        if (targetUtcHour < 0) {
            targetUtcHour += 24;
            // Use Date object to safely get the previous day's components
            let dateRollover = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0)); // Start of UK day in UTC
            dateRollover.setUTCDate(dateRollover.getUTCDate() - 1); // Go back one UTC day
            targetUtcDay = dateRollover.getUTCDate();
            targetUtcMonthIndex = dateRollover.getUTCMonth();
            targetUtcYear = dateRollover.getUTCFullYear();
        }

        // Format the target UTC time string (YYYY-MM-DDTHH:MM) expected by Open-Meteo
        const targetUtcIsoString = `${targetUtcYear}-${String(targetUtcMonthIndex + 1).padStart(2, '0')}-${String(targetUtcDay).padStart(2, '0')}T${String(targetUtcHour).padStart(2, '0')}:00`;
        // --- End Timezone Handling ---

        // Find the index
        const index = hourlyData.time.findIndex(t => t === targetUtcIsoString);

        // if (index === -1) { // Can be noisy
        //     console.log(`UKMO Service (_matchTimeToHourlyIndex): Time "${targetUtcIsoString}" not found in hourly array for date ${targetDateStr}, hour ${targetHour}.`);
        // }

        return index;

    } catch (error) {
        console.error(`UKMO Service (_matchTimeToHourlyIndex): Error calculating target UTC time for ${targetDateStr} ${targetHour}:`, error);
        return -1;
    }
}

/**
 * Gets the processed UKMO weather data for a specific site, date, and hour.
 * @param {string} siteId - The ID of the site.
 * @param {string} targetDate - Target local date (YYYY-MM-DD).
 * @param {string | number} targetHour - Target local hour (HH or number).
 * @returns {Promise<object | null>} A promise resolving with an object containing the
 *                                   weather parameters for that hour, or null if not found/error.
 */
/* REMOVE export */ async function getUkmoDataForSiteAndHour(siteId, targetDate, targetHour) { // <<<< REMOVED export
    if (!siteId || !targetDate || targetHour === null || targetHour === undefined) return null;

    const siteData = await getUkmoDataForSite(siteId);

    if (!siteData || !siteData.hourly) {
        // console.log(`UKMO Service (getUkmoDataForSiteAndHour): No UKMO data found for site ${siteId}.`);
        return null;
    }

    const index = _matchTimeToHourlyIndex(siteData.hourly, targetDate, targetHour);

    if (index === -1) {
        // console.log(`UKMO Service (getUkmoDataForSiteAndHour): Hour ${targetHour} on ${targetDate} not found in data for site ${siteId}.`);
        return null;
    }

    // Construct the result object by extracting data at the found index
    const result = {
        time: siteData.hourly.time[index] // Include the matched UTC time
    };
    const params = config.UKMO_API_HOURLY_PARAMS.split(',');

    params.forEach(param => {
        // Check if the parameter array exists and has an element at the target index
        if (siteData.hourly[param] && siteData.hourly[param].length > index && siteData.hourly[param][index] !== null) {
            result[param] = siteData.hourly[param][index];
        } else {
            result[param] = null; // Use null if parameter array is missing, too short, or the value is null
        }
    });


    return result;
}

// --- Exports ---
// Use a single export block at the end
export {
    initialize,
    getBulkUkmoData,
    getUkmoDataForSite,
    getUkmoDataForSiteAndHour
    // Potentially export _loadDataFromCacheOrFetch if manual refresh needed externally
};

// --- END OF FILE ukmoWeatherService.js ---