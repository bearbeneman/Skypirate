function processImage(originalImageElement, previewCanvasElement, outputContainerElement, processingCanvasElement, threshold) {
    // Clear previous results immediately
    const previewCtx = previewCanvasElement.getContext('2d');
    previewCtx.clearRect(0, 0, previewCanvasElement.width, previewCanvasElement.height);
    previewCanvasElement.width = 100; // Reset to small size prevents old large canvas flashing
    previewCanvasElement.height = 50;
    outputContainerElement.innerHTML = '<p class="info">Processing...</p>';

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Crucial for canvas processing with local/cross-origin images

        img.onload = () => {
            console.log(`Image loaded: ${originalImageElement.id}`);
            const pCtx = processingCanvasElement.getContext('2d', { willReadFrequently: true }); // Processing Canvas context

            // Set processing canvas size
            processingCanvasElement.width = img.naturalWidth;
            processingCanvasElement.height = img.naturalHeight;

            // Draw image onto the processing canvas
            pCtx.drawImage(img, 0, 0);

            // Also draw image onto the preview canvas
            previewCanvasElement.width = img.naturalWidth;
            previewCanvasElement.height = img.naturalHeight;
            previewCtx.drawImage(img, 0, 0); // Draw original image for preview base

            // Get pixel data from processing canvas
            let imageData;
            try {
                imageData = pCtx.getImageData(0, 0, processingCanvasElement.width, processingCanvasElement.height);
            } catch (e) {
                console.error("Error getting ImageData:", e);
                const errorMsg = `<p class="error">Could not process image due to security restrictions (CORS). Try running from a local web server.</p>`;
                outputContainerElement.innerHTML = errorMsg;
                previewCtx.clearRect(0, 0, previewCanvasElement.width, previewCanvasElement.height); // Clear preview on error too
                 reject(new Error("CORS or security error"));
                 return; // Stop execution here
            }

            const data = imageData.data;
            let minX = processingCanvasElement.width;
            let minY = processingCanvasElement.height;
            let maxX = 0;
            let maxY = 0;

            // --- Blue Detection Logic ---
            // We're looking for pixels where Blue is significantly greater than Red and Green
            const blueDominanceThreshold = parseInt(threshold, 10); // How much bluer it needs to be
            const minBlueValue = 50; // Minimum absolute blue value (avoid dark near-black pixels)
            const alphaThreshold = 200; // Require pixels to be mostly opaque

            for (let y = 0; y < processingCanvasElement.height; y++) {
                for (let x = 0; x < processingCanvasElement.width; x++) {
                    const index = (y * processingCanvasElement.width + x) * 4;
                    const r = data[index];
                    const g = data[index + 1];
                    const b = data[index + 2];
                    const a = data[index + 3];

                    // Check if pixel is opaque enough AND is 'blue enough'
                    if (a > alphaThreshold &&
                        b > minBlueValue &&         // Must have a minimum amount of blue
                        b > (r + blueDominanceThreshold) && // Blue must be significantly higher than Red
                        b > (g + blueDominanceThreshold)    // Blue must be significantly higher than Green
                       ) {
                        // This pixel is considered part of the blue box
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            console.log(`Blue Bounds for ${originalImageElement.id}: X=${minX}-${maxX}, Y=${minY}-${maxY} (Threshold: ${threshold})`);

            // Check if any blue content was found
            if (maxX < minX || maxY < minY) {
                console.warn(`No dominant blue pixels found in ${originalImageElement.id} with threshold ${threshold}.`);
                outputContainerElement.innerHTML = `<p class="info">No blue area found with current threshold.</p>`;
                 // Clear potential old bounding box on preview
                previewCtx.drawImage(img, 0, 0); // Redraw original image without box
                resolve(); // Resolve successfully, nothing to crop
                return;
            }

            // --- Draw Bounding Box on Preview Canvas ---
            previewCtx.strokeStyle = 'red'; // Color of the bounding box
            previewCtx.lineWidth = 2;       // Thickness of the box line
            previewCtx.strokeRect(minX, minY, maxX - minX + 1, maxY - minY + 1); // Draw the rectangle

            // --- Create Cropped Canvas ---
            const croppedWidth = maxX - minX + 1;
            const croppedHeight = maxY - minY + 1;

            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = croppedWidth;
            outputCanvas.height = croppedHeight;
            const outputCtx = outputCanvas.getContext('2d');

            // Draw the cropped portion from the processing canvas onto the new output canvas
            outputCtx.drawImage(
                processingCanvasElement,
                minX, minY,             // Source x, y
                croppedWidth, croppedHeight, // Source width, height
                0, 0,                   // Destination x, y
                croppedWidth, croppedHeight  // Destination width, height
            );

            // Display the cropped canvas
            outputContainerElement.innerHTML = ''; // Clear previous content/message
            outputContainerElement.appendChild(outputCanvas);
            console.log(`Cropped ${originalImageElement.id} displayed.`);

            resolve(); // Signal completion
        };

        img.onerror = (err) => {
            console.error(`Error loading image: ${originalImageElement.src}`, err);
             const errorMsg = `<p class="error">Failed to load image: ${originalImageElement.src}</p>`;
             outputContainerElement.innerHTML = errorMsg;
             previewCtx.clearRect(0, 0, previewCanvasElement.width, previewCanvasElement.height); // Clear preview on error too
             reject(new Error(`Failed to load image: ${originalImageElement.src}`));
        };

        // Set the src AFTER defining onload/onerror. Check if src exists.
        if (originalImageElement.src && originalImageElement.src !== window.location.href) { // Check src isn't empty or just the page URL
             img.src = originalImageElement.src;
        } else {
            const errorMsg = `<p class="error">Image source is missing or invalid for ${originalImageElement.id}.</p>`;
            console.error(`Image source is empty or invalid for element: ${originalImageElement.id}`);
            outputContainerElement.innerHTML = errorMsg;
             previewCtx.clearRect(0, 0, previewCanvasElement.width, previewCanvasElement.height); // Clear preview on error too
            reject(new Error("Image source missing or invalid"));
        }
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded. Setting up cropper.');

    const img1 = document.getElementById('originalImage1');
    const previewCanvas1 = document.getElementById('previewCanvas1');
    const container1 = document.getElementById('croppedContainer1');

    const img2 = document.getElementById('originalImage2');
    const previewCanvas2 = document.getElementById('previewCanvas2');
    const container2 = document.getElementById('croppedContainer2');

    const processingCanvas = document.getElementById('processingCanvas');
    const thresholdSlider = document.getElementById('blueThreshold');
    const thresholdValueDisplay = document.getElementById('thresholdValue');
    const processButton = document.getElementById('processButton');

    // Basic check for essential elements
    if (!img1 || !previewCanvas1 || !container1 || !img2 || !previewCanvas2 || !container2 || !processingCanvas || !thresholdSlider || !thresholdValueDisplay || !processButton) {
        console.error("One or more required HTML elements not found!");
        alert("Error: Page setup is incorrect. Cannot initialize cropper.");
        return;
    }

    // Update threshold display when slider changes
    thresholdSlider.addEventListener('input', () => {
        thresholdValueDisplay.textContent = thresholdSlider.value;
    });

    // Process images when button is clicked
    processButton.addEventListener('click', () => {
        console.log('Process button clicked.');
        const currentThreshold = thresholdSlider.value;
        thresholdValueDisplay.textContent = currentThreshold; // Ensure display matches value on click

        // Clear previous errors/info messages
        container1.innerHTML = '<p class="info">Processing...</p>';
        container2.innerHTML = '<p class="info">Processing...</p>';

        // Use Promise.all to run processing in parallel (or sequentially if preferred)
        Promise.all([
            processImage(img1, previewCanvas1, container1, processingCanvas, currentThreshold),
            processImage(img2, previewCanvas2, container2, processingCanvas, currentThreshold)
        ])
        .then(() => {
            console.log("All image processing finished for this run.");
        })
        .catch(error => {
            console.error("An error occurred during batch image processing:", error);
            // Specific errors are already displayed in the respective containers by processImage
        });
    });

    // Optional: Load images initially to get dimensions for preview canvas, but don't process
    const initLoad = (imgElement, previewCanvas) => {
         const img = new Image();
         img.crossOrigin = "Anonymous";
         img.onload = () => {
            // Set initial preview size, maybe draw the image grayed out?
            previewCanvas.width = img.naturalWidth;
            previewCanvas.height = img.naturalHeight;
            const pCtx = previewCanvas.getContext('2d');
            pCtx.drawImage(img, 0, 0);
            // Optionally gray it out slightly to indicate it needs processing
            // pCtx.fillStyle = 'rgba(200, 200, 200, 0.5)';
            // pCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
         }
         img.onerror = () => {
            previewCanvas.getContext('2d').fillText('Cannot load preview', 10, 20);
         }
         if (imgElement.src && imgElement.src !== window.location.href) {
             img.src = imgElement.src;
         } else {
             previewCanvas.getContext('2d').fillText('No image source', 10, 20);
         }
    }
    // initLoad(img1, previewCanvas1); // Call this if you want initial previews loaded
    // initLoad(img2, previewCanvas2); // Call this if you want initial previews loaded

     console.log('Cropper setup complete. Ready for processing.');

});