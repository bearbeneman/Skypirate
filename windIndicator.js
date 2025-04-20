// --- START OF FILE windIndicator.js ---
import * as config from './config.js';

// Layer group to hold all wind indicators for easy management
let windIndicatorLayerGroup = null;
// Z-offset might not be needed if using DivIcon correctly, but keep for now
const INDICATOR_Z_OFFSET = 10;

/**
 * Initializes the layer group for wind indicators.
 * Should be called once when the map is ready.
 * @param {L.Map} map - The Leaflet map instance.
 */
export function initializeWindIndicatorLayer(map) {
    if (!windIndicatorLayerGroup) {
        windIndicatorLayerGroup = L.layerGroup().addTo(map);
        console.log("Wind Indicator Layer Group created and added to map.");
    }
}

/**
 * Creates the visual wind indicator marker using L.DivIcon.
 * The arrowhead sits AT the marker location, the tail extends INTO the wind.
 * @param {L.Map} map - The Leaflet map instance.
 * @param {L.Marker} mainMarker - The main site marker.
 * @param {number} initialDirection - The initial wind direction (degrees, FROM).
 * @returns {L.Marker|null} The created indicator marker or null on error.
 */
export function createWindIndicator(map, mainMarker, initialDirection = 0) {
    // ... (initial checks remain the same) ...

    // Remove existing indicator for this marker, if any
    removeWindIndicator(mainMarker);

    const latLng = mainMarker.getLatLng();

    // Initial rotation uses the meteorological direction (FROM)
    // Initial rotation uses the meteorological direction (FROM) + offset
	const baseRotation = initialDirection + config.WIND_INDICATOR_ROTATION_OFFSET_DEGREES;
	const initialRotation = (baseRotation % 360 + 360) % 360; // Ensure 0-359 range

    // Define the DivIcon for the arrow
    // Total length is ~220px (stem + head), width is ~30px (head base)
    const arrowIcon = L.divIcon({
        className: 'wind-indicator-icon',
        // **** MODIFIED HTML: Added indicator-model span ****
        html: `<div class="wind-indicator-arrow" style="transform: rotate(${initialRotation}deg);">
                   <div class="indicator-text-wrapper">
                       <span class="indicator-model">UKMO</span>
                       <span class="indicator-direction">--°</span>
                       <span class="indicator-speed">-- kph</span>
                   </div>
               </div>`,
        // Anchor Point is TOP-CENTER (base of the stem)
        iconSize: [30, 220], // Approx width of head, length of stem+head
        iconAnchor: [15, 0]   // Anchor at top-center (arrowhead tip)
    });

    // Create a new marker for the indicator
    const indicatorMarker = L.marker(latLng, {
     icon: arrowIcon,
     interactive: false,
     // zIndexOffset: 500   // <<< REMOVE THIS if present
     // pane: 'tooltipPane' // <<< REMOVE THIS if present
     pane: 'windIndicatorPane' // <<< USE THE CUSTOM PANE NAME
	});

    // Store reference on the main marker
    mainMarker._windIndicatorLayer = indicatorMarker;

    // Add to the dedicated layer group
    windIndicatorLayerGroup.addLayer(indicatorMarker);
    return indicatorMarker;
}

/**
 * Updates the rotation and embedded text of an existing wind indicator.
 * @param {L.Marker} mainMarker - The main site marker that has the indicator attached.
 * @param {number} direction - New wind direction in degrees (FROM).
 * @param {number} speed - Wind speed (m/s).
 */
export function updateWindIndicator(mainMarker, direction, speed) {
    const indicatorMarker = mainMarker?._windIndicatorLayer;
    if (!indicatorMarker || !indicatorMarker.getElement) {
        return;
    }

    const iconElement = indicatorMarker.getElement();
    if (iconElement) {
        const arrowElement = iconElement.querySelector('.wind-indicator-arrow');
        if (arrowElement) {
            // **** Rotation based on direction FROM ****
            const baseRotation = direction + config.WIND_INDICATOR_ROTATION_OFFSET_DEGREES;
			const rotation = (baseRotation % 360 + 360) % 360; // Ensure 0-359 range	
            arrowElement.style.transform = `rotate(${rotation}deg)`;

            // Update embedded text (find spans within the text wrapper)
            const textWrapper = arrowElement.querySelector('.indicator-text-wrapper');
            if (textWrapper) {
                const dirSpan = textWrapper.querySelector('.indicator-direction');
                const speedSpan = textWrapper.querySelector('.indicator-speed');

                if (dirSpan && speedSpan) {
                    const speedKmph = (speed * 3.6).toFixed(0);
                    dirSpan.textContent = `${direction.toFixed(0)}°`;
                    speedSpan.textContent = `${speedKmph} kph`;
                }
            }

            // Removed tooltip logic
            if (indicatorMarker.getTooltip()) {
                indicatorMarker.unbindTooltip();
            }
        }
    }
}

// --- removeWindIndicator and removeAllWindIndicators remain the same ---
/**
 * Removes the wind indicator associated with a main marker.
 * @param {L.Marker} mainMarker - The main site marker.
 */
export function removeWindIndicator(mainMarker) {
    if (mainMarker?._windIndicatorLayer) {
        if (mainMarker._windIndicatorLayer.getTooltip()) {
             mainMarker._windIndicatorLayer.unbindTooltip();
        }
        windIndicatorLayerGroup.removeLayer(mainMarker._windIndicatorLayer);
        mainMarker._windIndicatorLayer = null;
    }
}

/**
 * Removes all wind indicators from the map.
 */
export function removeAllWindIndicators() {
    if (windIndicatorLayerGroup) {
        console.log("Removing all wind indicators.");
         windIndicatorLayerGroup.eachLayer(layer => {
             if (layer.getTooltip()) {
                 layer.unbindTooltip();
             }
         });
        windIndicatorLayerGroup.clearLayers();
    }
}
// --- END OF FILE windIndicator.js ---