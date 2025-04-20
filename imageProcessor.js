// --- START OF FILE imageProcessor.js ---

// <<< Import the new config options >>>
import { ENABLE_IMAGE_BOTTOM_TRANSPARENCY, IMAGE_BOTTOM_TRANSPARENCY_HEIGHT_PX } from '../config.js'; // Adjust path if needed

/**
 * Processes an image loaded from a URL: makes pixels above a threshold transparent,
 * optionally clears the bottom section, and applies blur.
 * Handles CORS and canvas security errors.
 *
 * @param {string} imageUrl The URL of the original image to process.
 * @param {object} options Configuration options.
 * @param {number} options.threshold The RGB threshold (inclusive, 0-255). Pixels with R, G, AND B >= threshold become transparent.
 * @param {string} options.blurAmount CSS blur filter value (e.g., '1px', '0.5px'). Set to '0px' or '' to disable blur.
 * @returns {Promise<string|null>} A promise resolving with the processed image as a data URL, or null if processing fails (e.g., CORS error, load error).
 */
// <<< No changes needed to function signature if we use imported config directly >>>
export function processImageForEffects(imageUrl, { threshold = 227, blurAmount = '1px' } = {}) {
    console.log(`Image Processor: Request to process ${imageUrl} (Thresh: ${threshold}, Blur: ${blurAmount}, ClearBottom: ${ENABLE_IMAGE_BOTTOM_TRANSPARENCY}, ClearHeight: ${IMAGE_BOTTOM_TRANSPARENCY_HEIGHT_PX})`); // Log new params

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";

        img.onload = () => {
            let canvas = document.createElement('canvas');
            let ctx = canvas.getContext('2d', { willReadFrequently: true });

            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            try {
                // 1. Draw original image
                ctx.drawImage(img, 0, 0);

                // 2. Apply White Background Transparency
                let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                let data = imageData.data;
                let processedPixelCount = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) {
                        data[i + 3] = 0; // Set alpha to 0
                        processedPixelCount++;
                    }
                }
                ctx.putImageData(imageData, 0, 0); // Write transparent pixels back
                console.log(`Image Processor: Made ${processedPixelCount} white pixels transparent.`);

                // **** START: ADD BOTTOM CLEARING ****
                // 3. Optionally Clear Bottom Section
                if (ENABLE_IMAGE_BOTTOM_TRANSPARENCY && IMAGE_BOTTOM_TRANSPARENCY_HEIGHT_PX > 0) {
                    const clearHeight = Math.min(IMAGE_BOTTOM_TRANSPARENCY_HEIGHT_PX, canvas.height); // Don't clear more than image height
                    const clearY = canvas.height - clearHeight;
                    console.log(`Image Processor: Clearing bottom ${clearHeight}px (from y=${clearY})`);
                    ctx.clearRect(0, clearY, canvas.width, clearHeight);
                } else {
                    console.log("Image Processor: Skipping bottom clearing.");
                }
                // **** END: ADD BOTTOM CLEARING ****

                // 4. Apply Blur (if specified) - Now Step 4
                const blurValue = typeof blurAmount === 'string' && blurAmount.trim() !== '' && blurAmount.trim() !== '0px' ? blurAmount.trim() : null;
                if (blurValue) {
                    console.log(`Image Processor: Applying blur: ${blurValue}`);
                    ctx.filter = `blur(${blurValue})`;
                    // Redraw the canvas (with white+bottom transparency) onto itself with the filter
                    // Need to draw from the canvas, not the original img
                    ctx.drawImage(canvas, 0, 0);
                    ctx.filter = 'none'; // Reset filter
                } else {
                    console.log("Image Processor: Skipping blur.");
                }

                // 5. Get Final Data URL - Now Step 5
                const dataUrl = canvas.toDataURL('image/png');
                console.log("Image Processor: Processing successful.");
                resolve(dataUrl);

            } catch (error) {
                // ... (error handling remains the same) ...
                 if (error.name === 'SecurityError') { /* ... */ resolve(null); }
                 else { /* ... */ resolve(null); }
            } finally {
                // ... (canvas cleanup remains the same) ...
            }
        };

        img.onerror = (err) => {
            // ... (error handling remains the same) ...
            resolve(null);
        };

        img.src = imageUrl; // Start loading
    });
}
// --- END OF FILE imageProcessor.js ---