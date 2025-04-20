// --- START OF FILE openMeteoService.js ---
import * as config from './config.js'; // For potential future config values

// --- Configuration ---
const API_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
// Request wind direction and speed at 10m using the UKMO Seamless model
const API_PARAMS = 'hourly=wind_direction_10m,wind_speed_10m&models=ukmo_seamless&wind_speed_unit=ms'; // Use m/s for consistency internaly
const CACHE_DURATION_MS = config.OPEN_METEO_CACHE_MINUTES * 60 * 1000; // Use config or set default (e.g., 30 * 60 * 1000 for 30 mins)

// --- Data Store ---
// Stores { siteId: { timestamp: number, data: object } }
const openMeteoDataStore = new Map();

/**
 * Fetches wind forecast data from Open-Meteo for a specific location.
 * Uses a simple time-based cache.
 * @param {string|number} siteId - The unique ID of the site.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @returns {Promise<object|null>} The fetched hourly data object { time: [], wind_direction_10m: [], wind_speed_10m: [] } or null on error/no data.
 */
export async function fetchOpenMeteoData(siteId, lat, lon) {
    const cacheKey = String(siteId);
    const now = Date.now();

    // Check cache
    if (openMeteoDataStore.has(cacheKey)) {
        const cachedEntry = openMeteoDataStore.get(cacheKey);
        if (now - cachedEntry.timestamp < CACHE_DURATION_MS) {
            console.log(`[OpenMeteo] Using cached data for site ${siteId}`);
            return cachedEntry.data?.hourly || null; // Return only the hourly part
        } else {
            console.log(`[OpenMeteo] Cache expired for site ${siteId}`);
            openMeteoDataStore.delete(cacheKey); // Remove expired entry
        }
    }

    const url = `${API_BASE_URL}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&${API_PARAMS}`;
    console.log(`[OpenMeteo] Fetching data for site ${siteId} from ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status} fetching Open-Meteo data`);
        }
        const data = await response.json();

        if (!data || !data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
            console.warn(`[OpenMeteo] No hourly data returned for site ${siteId}`);
            // Cache the fact that no data was returned to avoid refetching immediately
            openMeteoDataStore.set(cacheKey, { timestamp: now, data: null });
            return null;
        }

        // Cache the successful response (containing the 'hourly' object)
        openMeteoDataStore.set(cacheKey, { timestamp: now, data: data });
        console.log(`[OpenMeteo] Successfully fetched and cached data for site ${siteId}`);
        return data.hourly; // Return only the hourly part

    } catch (error) {
        console.error(`[OpenMeteo] Error fetching data for site ${siteId}:`, error);
        // Don't cache errors, allow retrying
        openMeteoDataStore.delete(cacheKey);
        return null;
    }
}

/**
 * Gets the wind data for a specific date and hour from the cached/stored data.
 * Handles timezone conversion from UK local time to UTC for matching API data.
 * @param {string|number} siteId - The site ID.
 * @param {string} targetDateStr - Target date in "YYYY-MM-DD" format (local UK date).
 * @param {string} targetHourStr - Target hour in "HH" format (local UK hour).
 * @returns {{direction: number, speed: number}|null} Wind direction (degrees) and speed (m/s) or null if not found/error.
 */
export function getOpenMeteoDataForHour(siteId, targetDateStr, targetHourStr) {
    const cacheKey = String(siteId);
    if (!openMeteoDataStore.has(cacheKey)) {
        // console.log(`[OpenMeteo] No data in store for site ${siteId} to get hour.`); // Can be noisy
        return null;
    }

    const storedData = openMeteoDataStore.get(cacheKey)?.data; // Get the full stored object
    const hourlyData = storedData?.hourly; // Extract the hourly data

    if (!hourlyData || !hourlyData.time || !hourlyData.wind_direction_10m || !hourlyData.wind_speed_10m) {
        // console.log(`[OpenMeteo] Incomplete hourly data structure for site ${siteId}`);
        return null;
    }

    try {
        // --- Timezone Handling ---
        // Construct a Date object assuming the targetDate/Hour are UK local.
        // Find the UTC equivalent hour. This is tricky without a full library.
        // We approximate by creating a local date and getting its UTC hour.
        // WARNING: This might be off by an hour around DST changes if not careful.
        // A robust solution uses libraries like `date-fns-tz` or `luxon`.

        // Create a date object representing the local time selected
        // Use T12:00:00 to minimize DST ambiguity for the *date* part
        const localDateForDSTCheck = new Date(`${targetDateStr}T12:00:00`);
        const isLikelyDST = isUkDst(localDateForDSTCheck); // Use the existing helper
        const utcOffsetHours = isLikelyDST ? 1 : 0;

        // Construct the target time in UTC
        const targetLocalIso = `${targetDateStr}T${targetHourStr.padStart(2, '0')}:00:00`;
        // Create a Date object *as if* it's local time. This is a common JS pitfall.
        // Let's calculate the target UTC ISO string directly.
        const targetHourNum = parseInt(targetHourStr, 10);
        if (isNaN(targetHourNum)) return null;

        // Calculate the UTC hour corresponding to the selected UK hour
        const targetUtcHour = (targetHourNum - utcOffsetHours + 24) % 24; // Adjust UK hour to UTC hour
        const targetUtcIsoPrefix = `${targetDateStr}T${String(targetUtcHour).padStart(2, '0')}:00`; // Target time string in UTC

        // Find the index in the API's time array (which is UTC)
        const timeIndex = hourlyData.time.findIndex(t => t.startsWith(targetUtcIsoPrefix));

        // --- End Timezone Handling ---


        if (timeIndex === -1) {
           // console.log(`[OpenMeteo] Target time ${targetUtcIsoPrefix} (UTC) not found in data for site ${siteId}`);
            return null;
        }

        const direction = hourlyData.wind_direction_10m[timeIndex];
        const speed = hourlyData.wind_speed_10m[timeIndex]; // Speed in m/s

        if (direction === null || direction === undefined || speed === null || speed === undefined) {
            // console.log(`[OpenMeteo] Null/undefined direction or speed at index ${timeIndex} for site ${siteId}`);
            return null;
        }

        // Convert direction/speed to numbers, just in case
        const dirNum = parseFloat(direction);
        const speedNum = parseFloat(speed);

        if (isNaN(dirNum) || isNaN(speedNum)) {
           // console.log(`[OpenMeteo] Invalid numeric direction or speed at index ${timeIndex} for site ${siteId}`);
            return null;
        }

        return { direction: dirNum, speed: speedNum };

    } catch (error) {
        console.error(`[OpenMeteo] Error processing data for hour (${targetDateStr} ${targetHourStr}) for site ${siteId}:`, error);
        return null;
    }
}

/**
 * Removes cached data for a specific site.
 * @param {string|number} siteId
 */
export function clearOpenMeteoData(siteId) {
    const cacheKey = String(siteId);
    if (openMeteoDataStore.has(cacheKey)) {
        openMeteoDataStore.delete(cacheKey);
        console.log(`[OpenMeteo] Cleared cached data for site ${siteId}`);
    }
}

/**
 * Helper to determine if the UK is currently observing BST.
 * (Copied from timeControls.js for self-containment, consider moving to utils.js if used more widely)
 * @param {Date} date The date object to check.
 * @returns {boolean} True if likely BST, false otherwise.
 */
function isUkDst(date) {
    const year = date.getFullYear();
    const marchEnd = new Date(year, 2, 31);
    const marchLastSunday = 31 - marchEnd.getDay();
    const dstStart = new Date(Date.UTC(year, 2, marchLastSunday, 1, 0, 0, 0));
    const octoberEnd = new Date(year, 9, 31);
    const octoberLastSunday = 31 - octoberEnd.getDay();
    const dstEnd = new Date(Date.UTC(year, 9, octoberLastSunday, 1, 0, 0, 0));
    return date >= dstStart && date < dstEnd;
}

// --- END OF FILE openMeteoService.js ---