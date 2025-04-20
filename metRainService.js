// metRainService.js
import * as config from './config.js';
import * as state from './state.js';
import * as timeControls from './timeControls.js'; // Needed for getAvailableDates in buildPrecipImageIndex
import { formatUtcDateForPrecipFilename, isUkDst } from './utils.js';
// We might need imageProcessor later if we move processing coordination here, but not yet.

let precipDataUrlCache = new Map(); // Cache for PROCESSED data: URLs

// --- **** Build Precipitation Image Availability Index **** ---
/**
 * Asynchronously checks for the existence of precipitation images for a given period
 * and populates the state.precipImageIndex Map.
 * This function ONLY manages the state related to the index and performs checks.
 * It does NOT interact with the DOM or trigger UI layer updates directly.
 * The calling module (metRainControls.js) is responsible for updating UI based on state changes.
 */
async function buildPrecipImageIndex() {
    // 1. Check if build is already running or complete
    if (state.isPrecipIndexLoading || state.isPrecipIndexBuilt) {
        console.log("Precip Index Service: Build skipped (already loading or built). State:", { loading: state.isPrecipIndexLoading, built: state.isPrecipIndexBuilt });
        // No DOM interaction here
        return; // Exit early
    }

    console.log("Precip Index Service: Starting build process...");
    // 2. Set loading state
    state.setPrecipIndexLoading(true);
    state.clearPrecipImageIndex(); // Clear any previous index data
    // No DOM interaction here (precipStatusSpan removed)

    // 3. Get available dates
    const availableDates = timeControls.getAvailableDates();
    if (!availableDates || availableDates.length === 0) {
        console.warn("Precip Index Service: No forecast dates available to build index.");
        state.setPrecipIndexLoading(false); // Ensure loading state is reset
        state.setPrecipIndexBuilt(true); // Mark as 'built' (even if empty) so we don't retry immediately
        // No DOM interaction here (precipStatusSpan removed)
        // No UI update trigger here (updatePrecipOverlayVisibilityAndUrl removed)
        return; // Exit early
    }

    // 4. Prepare for image checks
    const startDate = new Date(`${availableDates[0]}T00:00:00Z`);
    const daysToCheck = 5; // Check 5 days forward from the first available date
    const imagePromises = [];
    let totalUrlsToCheck = 0;

    console.log(`Precip Index Service: Checking dates from ${availableDates[0]} for ${daysToCheck} days.`);

    // 5. Create check promises for each potential image
    for (let d = 0; d < daysToCheck; d++) {
        const currentDate = new Date(startDate);
        currentDate.setUTCDate(currentDate.getUTCDate() + d);

        for (let h = 0; h < 24; h++) {
            totalUrlsToCheck++;
            const checkDate = new Date(currentDate);
            checkDate.setUTCHours(h, 0, 0, 0);

            const utcTimestampString = formatUtcDateForPrecipFilename(checkDate);
            if (!utcTimestampString) continue;

            const imageUrl = `${config.PRECIP_IMAGE_BASE_URL}/${config.PRECIP_IMAGE_PREFIX}${utcTimestampString}${config.PRECIP_IMAGE_SUFFIX}`;

            // Create a promise to check if the image loads
            const promise = new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    // IMPORTANT: Update the shared state when image is found
                    state.addPrecipImageToIndex(utcTimestampString, imageUrl);
                    resolve({ status: 'found', key: utcTimestampString }); // Resolve with success status
                };
                img.onerror = () => {
                    resolve({ status: 'not_found', key: utcTimestampString }); // Resolve with failure status
                };
                img.src = imageUrl;
            });
            imagePromises.push(promise);
        }
    }

    console.log(`Precip Index Service: Created ${imagePromises.length} checks.`);

    // 6. Wait for all checks to complete
    // Use Promise.allSettled to ensure all checks complete, even if some fail network-wise
    await Promise.allSettled(imagePromises); // We don't strictly need the results, as state is updated in onload

    // 7. Finalize state updates
    state.setPrecipIndexLoading(false); // Set loading to false
    state.setPrecipIndexBuilt(true);    // Set built to true
    const foundCount = state.getPrecipImageIndex().size;
    console.log(`Precip Index Service: Build complete. Found ${foundCount} available images out of ${totalUrlsToCheck} checked.`);
    // No DOM interaction here (precipStatusSpan removed)
    // No UI update trigger here (updatePrecipOverlayVisibilityAndUrl removed)

    // The promise returned by buildPrecipImageIndex will now resolve,
    // allowing the calling function in metRainControls.js to proceed.
}
// --- **** END Build Precipitation Image Availability Index **** ---


// --- **** Generate Precipitation Image URL **** ---
/**
 * Determines the best available precipitation image URL based on the current
 * selected time and the available image index in the state.
 * Returns an image URL or the configured error URL.
 */
function generatePrecipImageUrl() {
    // Access state directly (this is okay as it's reading state)
    const { selectedGlobalDate, selectedGlobalHour, isPrecipIndexBuilt, isPrecipIndexLoading } = state;

    // 1. Check if index is ready
    if (!isPrecipIndexBuilt) {
        console.warn("Precip URL Gen: Index not built yet.");
        return config.PRECIP_IMAGE_ERROR_URL;
    }
    if (isPrecipIndexLoading) { // Check loading flag as well
        console.log("Precip URL Gen: Index still loading.");
        return config.PRECIP_IMAGE_ERROR_URL;
    }

    // 2. Check if index is empty
    const imageIndex = state.getPrecipImageIndex();
    if (imageIndex.size === 0) { // Removed redundant isPrecipIndexBuilt check here
        console.warn("Precip URL Gen: Index is built but empty.");
        return config.PRECIP_IMAGE_ERROR_URL;
    }

    // 3. Check if date/time is selected
    if (!selectedGlobalDate || selectedGlobalHour === null || selectedGlobalHour === "") {
        console.warn("Precip URL Gen: No date/hour selected.");
        return config.PRECIP_IMAGE_ERROR_URL;
    }

    // 4. Calculate Target Time and Perform Lookup
    try {
        // Calculate the Target UTC Time (using imported utils)
        const year = parseInt(selectedGlobalDate.substring(0, 4), 10);
        const monthIndex = parseInt(selectedGlobalDate.substring(5, 7), 10) - 1;
        const day = parseInt(selectedGlobalDate.substring(8, 10), 10);
        const ukHour = parseInt(selectedGlobalHour, 10);

        // Use utils.isUkDst to determine offset
        const tempTimestampForDstCheck = Date.UTC(year, monthIndex, day, ukHour, 0, 0);
        const tempDateForDstCheck = new Date(tempTimestampForDstCheck);
        const isDst = isUkDst(tempDateForDstCheck);
        const utcOffset = isDst ? 1 : 0;
        let targetUtcHour = ukHour - utcOffset;
        let targetUtcDay = day;
        let targetUtcMonthIndex = monthIndex;
        let targetUtcYear = year;

        // Handle date rollover if UTC hour becomes negative
        if (targetUtcHour < 0) {
             targetUtcHour += 24;
             // Calculate previous day correctly using Date object manipulation
             let dateRollover = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0));
             dateRollover.setUTCDate(dateRollover.getUTCDate() - 1);
             targetUtcDay = dateRollover.getUTCDate();
             targetUtcMonthIndex = dateRollover.getUTCMonth();
             targetUtcYear = dateRollover.getUTCFullYear();
        }

        const targetUtcTimestampMs = Date.UTC(targetUtcYear, targetUtcMonthIndex, targetUtcDay, targetUtcHour, 0, 0);
        const targetUtcDate = new Date(targetUtcTimestampMs);

         if (isNaN(targetUtcDate.getTime())) {
             console.error("Precip URL Gen: Failed to create valid target UTC date object.");
             return config.PRECIP_IMAGE_ERROR_URL;
         }

        // Format the Target UTC time string for lookup (using imported utils)
        const targetUtcString = formatUtcDateForPrecipFilename(targetUtcDate);
        if (!targetUtcString) {
             console.error("Precip URL Gen: Failed to format target UTC string.");
            return config.PRECIP_IMAGE_ERROR_URL;
        }
        // console.log(`Precip URL Gen: Looking for index key: ${targetUtcString}`); // Keep for debugging if needed

        // Index Lookup (using state.getPrecipImageIndex())
        if (imageIndex.has(targetUtcString)) {
            const imageUrl = imageIndex.get(targetUtcString);
            // console.log(`Precip URL Gen: Exact match found: ${imageUrl}`); // Keep for debugging
            return imageUrl;
        } else {
            // Find Closest Preceding Available Image
            // console.log(`Precip URL Gen: Exact match not found for ${targetUtcString}. Searching backward...`); // Keep for debugging
            let searchDate = new Date(targetUtcDate.getTime()); // Clone target date
            const maxSearchHours = 48; // How far back to look

            for (let i = 0; i < maxSearchHours; i++) {
                 searchDate.setUTCHours(searchDate.getUTCHours() - 1); // Go back one hour
                 const searchUtcString = formatUtcDateForPrecipFilename(searchDate);

                 if (searchUtcString && imageIndex.has(searchUtcString)) {
                     const imageUrl = imageIndex.get(searchUtcString);
                     console.log(`Precip URL Gen: Found preceding image (${i + 1}h back: ${searchUtcString})`); // More concise log
                     return imageUrl;
                 }
            }

            // If loop completes without finding an image
            console.warn(`Precip URL Gen: No preceding image found within ${maxSearchHours} hours for target ${targetUtcString}.`);
            return config.PRECIP_IMAGE_ERROR_URL;
        }

    } catch (error) {
        console.error("Precip URL Gen: Error during lookup:", error);
        return config.PRECIP_IMAGE_ERROR_URL; // Return error URL on unexpected error
    }
}
// --- **** END Generate Precipitation Image URL **** ---


// --- EXPORTS ---
// Export the functions needed by other modules and the cache
export { buildPrecipImageIndex, generatePrecipImageUrl, precipDataUrlCache };