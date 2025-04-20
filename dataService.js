// --- START OF FILE dataService.js ---
// dataService.js
import * as config from './config.js'; // Import config

// Data store & Layers
export let forecastAvailability = new Map();
export const siteDataStore = new Map(); // Holds { site, weatherData, weatherError, marker }

// --- Caching Configuration ---
const CACHE_ENABLED = config.WEATHER_CACHE_ENABLED;
const CACHE_MAX_AGE_MS = config.WEATHER_CACHE_DURATION_MINUTES * 60 * 1000;
const DB_NAME = config.WEATHER_DB_NAME;
const STORE_NAME = config.WEATHER_STORE_NAME; // Existing store for per-site weather
// **** ADDED: Use constant for the new store name ****
const UKMO_STORE_NAME = config.UKMO_DATA_STORE_NAME; // New store for bulk UKMO data
const MAX_CONCURRENT = config.MAX_CONCURRENT_FETCHES;

// --- Initialize Dexie Database ---
let db = null;
let dbOpenPromise = null; // Store the promise for opening the DB

// ***** START: Updated Dexie Block *****
const CURRENT_DB_VERSION = 2; // Increment version number to trigger schema upgrade

if (CACHE_ENABLED && typeof Dexie !== 'undefined') {
    try {
        db = new Dexie(DB_NAME);

        // Define version 2 schema (includes BOTH stores)
        db.version(CURRENT_DB_VERSION).stores({
            [STORE_NAME]: `siteId, timestamp`,         // Existing store: siteId=primary key, timestamp=index
            [UKMO_STORE_NAME]: `&key, timestamp` // '&key' makes 'key' the primary key AND unique index   
        });

        // Define version 1 schema (for upgrade path - tells Dexie what existed before)
        // This is important if users might already have version 1 in their browser.
        // If this is a completely new deployment, you could technically omit this.
        db.version(1).stores({
            [STORE_NAME]: `siteId, timestamp`
            // The ukmoBulkWeatherStore did not exist in version 1
        });

        // Log the final version and defined stores
        console.log(`Dexie: DB "${DB_NAME}" v${CURRENT_DB_VERSION} stores defined: ${STORE_NAME}, ${UKMO_STORE_NAME}.`);

        // Store the promise returned by open()
        dbOpenPromise = db.open()
            .then((openedDb) => { // Dexie passes the db instance on success
                console.log(`Dexie: Database "${DB_NAME}" v${CURRENT_DB_VERSION} opened successfully.`);
                db = openedDb; // Ensure our module-scoped variable is the opened instance
                return db; // Return the db instance for chaining or use by others
            })
            .catch(Dexie.UpgradeError, err => {
                 // Specific handling for upgrade errors
                 console.error(`Dexie: Failed to upgrade database "${DB_NAME}" to v${CURRENT_DB_VERSION}. Wiping and retrying. Error:`, err);
                 // Attempt to delete the database and reopen - suitable for development
                 return Dexie.delete(DB_NAME).then(() => {
                     console.log(`Dexie: Database "${DB_NAME}" deleted due to upgrade error. Reopening...`);
                      // Re-initialize Dexie instance and schema after delete
                      db = new Dexie(DB_NAME);
                      // Define the LATEST schema again for the fresh database
                      db.version(CURRENT_DB_VERSION).stores({
                          [STORE_NAME]: `siteId, timestamp`,
                          [UKMO_STORE_NAME]: `key, timestamp`
                      });
                      return db.open().then(reopenedDb => {
                           console.log(`Dexie: Database "${DB_NAME}" v${CURRENT_DB_VERSION} opened successfully after wipe.`);
                           db = reopenedDb;
                           return reopenedDb; // Return the newly opened db
                      });
                 });
            })
            .catch(err => {
                 // General open error handling
                 console.error(`Dexie: Failed to open database "${DB_NAME}" v${CURRENT_DB_VERSION}:`, err);
                 db = null; // Ensure db is null if open failed
                 throw err; // Re-throw the error so calling code knows it failed
            });

    } catch (dexieError) {
         console.error("Dexie: Error initializing Dexie instance:", dexieError);
         db = null;
         dbOpenPromise = Promise.reject(dexieError); // Reject the promise on init error
    }
} else if (CACHE_ENABLED) {
    console.error("Dexie library not found. Caching will be disabled.");
    dbOpenPromise = Promise.reject(new Error("Dexie library not found"));
} else {
     console.log("Config: Weather caching is disabled.");
     dbOpenPromise = Promise.reject(new Error("Caching disabled"));
     // Attempt delete... (no change needed here)
     if (typeof Dexie !== 'undefined') {
         Dexie.delete(DB_NAME).then(() => {
             console.log(`Dexie: Database "${DB_NAME}" deleted (caching disabled).`);
         }).catch(err => {
             console.warn(`Dexie: Could not delete database "${DB_NAME}" while caching is disabled:`, err.message);
         });
     }
}


// --- Getter function for the DB instance promise ---
// Allows other services (like ukmoWeatherService) to get the DB instance once ready
export function getDbInstance() {
    if (!dbOpenPromise) {
        // This case should only happen if caching is disabled or Dexie failed early
        return Promise.reject(new Error("Dexie DB Promise not available. Caching might be disabled or initialization failed."));
    }
    return dbOpenPromise; // Return the promise. The caller needs to await/then it.
}


/**
 * Fetches initial site and weather data, utilizing IndexedDB cache via Dexie.js.
 * Includes throttling for API requests.
 * @param {string} sitesApiUrl - URL for the sites list API.
 * @param {string} weatherApiBaseUrl - Base URL for the weather API (needs site ID appended).
 * @returns {Promise<{siteDataStore: Map, forecastAvailability: Map}>} A promise resolving with the populated stores.
 */
 // --- REMOVED loadingIndicatorElement parameter vvv ---
export async function fetchInitialData(sitesApiUrl, weatherApiBaseUrl) {

    // --- Wait for DB Open/Fail AND Check Cache Enabled ---
    const dbOpenedSuccessfully = dbOpenPromise ? await dbOpenPromise : false;
    const useCache = CACHE_ENABLED && dbOpenedSuccessfully;

    console.log(`Data Fetch: Starting... (Cache: ${useCache ? `ON, ${config.WEATHER_CACHE_DURATION_MINUTES} min expiry` : 'OFF'})`);
    // --- End Wait ---

    siteDataStore.clear();
    forecastAvailability.clear();

    const siteIdsLoadedFromCache = new Set();
    const siteIdsToFetchWeather = new Set();
    const knownSiteIdsFromAPI = new Set();
    let fullSiteList = [];

    // Counters for cache summary
    let cacheCheckedCount = 0;
    let cacheFoundCount = 0;
    let cacheValidCount = 0;
    let cacheExpiredCount = 0;
    let cacheInvalidDataCount = 0;
    let cacheMissingTimestampCount = 0;
    let totalValidCacheAgeMs = 0;

    try {
        // --- 1. Fetch Site List ---
        console.log(`Data Fetch: Fetching site list from ${sitesApiUrl}...`);
        const sitesResponse = await fetch(sitesApiUrl);
        if (!sitesResponse.ok) throw new Error(`Failed to fetch sites: HTTP ${sitesResponse.status}`);
        fullSiteList = await sitesResponse.json();
        console.log(`Data Fetch: Received ${fullSiteList.length} sites from API.`);

        // --- 2. Initialize siteDataStore & Check Cache ---
        console.log(`Data Fetch: Initializing store and checking cache for ${fullSiteList.length} sites...`);
        const now = Date.now();
        let cacheCheckPromises = [];

        fullSiteList.forEach(site => {
            if (site && site.siteID !== null && typeof site.siteID !== 'undefined') {
                const siteId = String(site.siteID);
                knownSiteIdsFromAPI.add(siteId);
                siteDataStore.set(siteId, { site: site, weatherData: null, weatherError: null, marker: null });

                if (useCache) {
                    cacheCheckedCount++;
                    cacheCheckPromises.push(
                        db[STORE_NAME].get(siteId).then(cachedEntry => {
                            if (cachedEntry) {
                                cacheFoundCount++;
                                const age = now - (cachedEntry.timestamp || 0);
                                const hasTimestamp = typeof cachedEntry.timestamp === 'number';
                                const hasWeatherData = !!cachedEntry.weatherData && Array.isArray(cachedEntry.weatherData.weather); // Basic structure check
                                const isExpired = hasTimestamp && age >= CACHE_MAX_AGE_MS;

                                // Detailed validation for summary
                                if (hasTimestamp && hasWeatherData && !isExpired) {
                                    cacheValidCount++;
                                    totalValidCacheAgeMs += age;
                                    siteDataStore.get(siteId).weatherData = cachedEntry.weatherData;
                                    siteIdsLoadedFromCache.add(siteId);
                                } else {
                                    // Add to fetch list if not valid
                                    siteIdsToFetchWeather.add(siteId);
                                    // Count reasons for invalidity
                                    if (isExpired) cacheExpiredCount++;
                                    if (!hasWeatherData) cacheInvalidDataCount++;
                                    if (!hasTimestamp) cacheMissingTimestampCount++;
                                    // Removed the verbose per-site log here
                                }
                            } else {
                                // Cache entry not found
                                siteIdsToFetchWeather.add(siteId);
                            }
                        }).catch(error => {
                            console.error(`Dexie GET Error for site ${siteId}:`, error.message); // Keep errors
                            siteIdsToFetchWeather.add(siteId); // Fetch if cache check failed
                        })
                    );
                } else {
                    // Cache disabled or DB failed, mark all for fetch
                    siteIdsToFetchWeather.add(siteId);
                }
            } else {
                console.warn("Data Fetch: Skipping site with missing/invalid ID:", site); // Keep warning for bad data
            }
        });

        if (cacheCheckPromises.length > 0) {
            await Promise.allSettled(cacheCheckPromises); // Wait for all cache checks
            // --- Cache Summary Log ---
            const avgAgeHours = cacheValidCount > 0 ? (totalValidCacheAgeMs / cacheValidCount / (1000 * 60 * 60)).toFixed(2) : 'N/A';
            console.log(
                `Cache Check Summary: ${cacheCheckedCount} checked. ` +
                `${cacheValidCount} valid (Avg Age: ${avgAgeHours} hrs), ` +
                `${cacheExpiredCount} expired, ` +
                `${cacheInvalidDataCount} invalid data, ` +
                `${cacheMissingTimestampCount} missing timestamp, `+
                `${cacheCheckedCount - cacheFoundCount} not found.`
            );
            console.log(`Cache Check: ${siteIdsLoadedFromCache.size} sites loaded from valid cache.`);
        } else if (useCache) {
            console.log("Cache Check: No sites to check in cache (or cache disabled/failed).");
        }

        console.log(`Data Fetch: Identified ${siteIdsToFetchWeather.size} sites requiring fresh weather data fetch.`);


        // --- 3. Fetch Weather Data (Throttled) ---
        if (siteIdsToFetchWeather.size > 0) {
            console.log(`Weather API: Fetching for ${siteIdsToFetchWeather.size} sites (Concurrency: ${MAX_CONCURRENT})...`);
            const siteIdArray = Array.from(siteIdsToFetchWeather);
            let successfulFetches = 0;
            let failedFetches = 0;
            let nonJsonResponses = 0;
            let invalidStructureResponses = 0;

            for (let i = 0; i < siteIdArray.length; i += MAX_CONCURRENT) {
                const batchIds = siteIdArray.slice(i, i + MAX_CONCURRENT);
                const batchPromises = batchIds.map(async (siteId) => {
                    const weatherUrl = `${weatherApiBaseUrl}${siteId}/weather`;
                    try {
                        const response = await fetch(weatherUrl);
                        const contentType = response.headers.get("content-type");

                         if (!response.ok) throw new Error(`HTTP ${response.status}`);

                         if (!contentType || !contentType.includes("application/json")) {
                             nonJsonResponses++;
                             const text = await response.text();
                             console.warn(`Site ${siteId}: Non-JSON response (Content-Type: ${contentType}). Body: ${text.substring(0, 100)}...`);
                             throw new Error(`Non-JSON Response (HTTP ${response.status})`);
                         }

                         const data = await response.json();
                         if (!data?.weather || !Array.isArray(data.weather)) {
                             invalidStructureResponses++;
                             console.warn(`Site ${siteId}: Invalid weather data structure received.`, data); // Keep specific warning
                             throw new Error('Invalid weather data structure');
                         }

                         // --- Success Path ---
                         const storeEntry = siteDataStore.get(siteId);
                         if (storeEntry) {
                             storeEntry.weatherData = data;
                             storeEntry.weatherError = null;
                             successfulFetches++;

                             if (useCache) {
                                 const dataToCache = { siteId: siteId, timestamp: Date.now(), weatherData: data };
                                 try {
                                     await db[STORE_NAME].put(dataToCache);
                                 } catch (putError) {
                                      console.error(`Dexie PUT Error for site ${siteId}:`, putError.message);
                                 }
                             }
                         } else {
                             console.warn(`Site ${siteId}: Store entry missing after successful fetch?`);
                         }
                         // --- End Success Path ---

                    } catch (error) {
                        // --- Failure Path ---
                         failedFetches++;
                         const storeEntry = siteDataStore.get(siteId);
                         if (storeEntry) {
                             storeEntry.weatherError = error.message || 'Unknown fetch error';
                             storeEntry.weatherData = null;
                         }
                         console.warn(`Weather API FAIL for Site ${siteId}: ${error.message}`);
                         if (useCache) {
                             try {
                                 await db[STORE_NAME].delete(siteId);
                             } catch(deleteError){
                                  console.error(`Dexie DELETE Error for site ${siteId} after fetch fail:`, deleteError.message);
                             }
                         }
                        // --- End Failure Path ---
                    }
                }); // End of batchPromises.map

                await Promise.allSettled(batchPromises); // Wait for this batch
                const currentProgress = Math.min(i + MAX_CONCURRENT, siteIdArray.length);
                console.log(`Weather API: Batch processed. Progress: ${currentProgress}/${siteIdArray.length}`);
            } // End of for loop

            // --- Fetch Summary Log ---
            console.log(
                `Weather API Summary: Fetched ${siteIdArray.length} sites. ` +
                `Success: ${successfulFetches}, Failed: ${failedFetches}. ` +
                `(Failures due to: Non-JSON: ${nonJsonResponses}, Invalid Structure: ${invalidStructureResponses}, Other: ${failedFetches - nonJsonResponses - invalidStructureResponses})`
            );

        } else {
            console.log("Weather API: No sites required fresh weather fetching.");
        }

        // --- 4. Optional Cache Cleanup ---
        if (useCache) {
             console.log("Cache Cleanup: Checking for outdated site entries...");
             let deletedCount = 0;
             try {
                 await db.transaction('rw', db[STORE_NAME], async () => {
                     const keysInDb = await db[STORE_NAME].toCollection().keys();
                     const keysToDelete = keysInDb.filter(key => !knownSiteIdsFromAPI.has(key));
                     if (keysToDelete.length > 0) {
                         await db[STORE_NAME].bulkDelete(keysToDelete);
                         deletedCount = keysToDelete.length;
                     }
                 });
                  console.log(`Cache Cleanup: Finished. Removed ${deletedCount} outdated site entries.`);
             } catch (cleanupError) {
                 console.error("Cache Cleanup Error:", cleanupError);
             }
         }

        // --- 5. Populate forecastAvailability Map ---
        console.log("Data Processing: Populating forecast availability map...");
        forecastAvailability.clear();
        let sitesWithWeatherData = 0;
        siteDataStore.forEach(storeEntry => {
             if (storeEntry.weatherData?.weather) {
                 sitesWithWeatherData++;
                 storeEntry.weatherData.weather.forEach(forecastPoint => {
                     if (forecastPoint?.forecast_day && forecastPoint.time !== undefined && forecastPoint.time !== null) {
                         const date = forecastPoint.forecast_day;
                         const hour = String(forecastPoint.time).padStart(2, '0');
                         if (!forecastAvailability.has(date)) {
                             forecastAvailability.set(date, new Set());
                         }
                         forecastAvailability.get(date).add(hour);
                     }
                 });
             }
        });
        // Summary of forecast population
        console.log(`Data Processing: Forecast map populated from ${sitesWithWeatherData} sites, covering ${forecastAvailability.size} dates.`);

        console.log("Data Service: fetchInitialData finished successfully.");

        // *** REMOVED HIDING INDICATOR ON SUCCESS ***

        return { siteDataStore, forecastAvailability };

    } catch (error) {
        console.error("Data Service FATAL ERROR during fetchInitialData:", error);

        // *** REMOVED HIDING INDICATOR ON FAILURE ***

        throw error; // Re-throw essential for handling upstream
    }
}

/**
 * Retrieves the stored data entry for a specific site.
 * @param {number|string} siteId - The ID of the site.
 * @returns {object|undefined} The store entry ({ site, weatherData, weatherError, marker }) or undefined if not found.
 */
export function getSiteData(siteId) {
    // No logging needed for simple retrieval
    return siteDataStore.get(String(siteId));
}
// --- END OF FILE dataService.js ---