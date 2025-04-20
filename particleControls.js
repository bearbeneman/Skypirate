// --- START OF FILE particlecontrols.js ---
// particleControls.js (Leaflet Control Version)

// Import necessary constants from config.js
import {
    INITIAL_PARTICLE_COUNT,
    INITIAL_PARTICLE_SPEED_FACTOR_VALUE,
    PARTICLE_SPEED_SLIDER_SCALE,
    INITIAL_PARTICLE_COLOR,
    INITIAL_PARTICLE_SIZE,
    // --- Use updated age/fade constants ---
    INITIAL_PARTICLE_MIN_AGE,
    INITIAL_PARTICLE_MAX_AGE,
    INITIAL_PARTICLE_FADE_FACTOR
    // --- REMOVED: INITIAL_PARTICLE_TRAIL (no longer exported/used) ---
} from './config.js';

// Reference to the particle layer instance
let _particleWindLayer = null;
// Reference to the map instance
let _mapInstance = null;
// Reference to the control instance itself
let _particleControlInstance = null;

// Define the Leaflet Control
const ParticleControl = L.Control.extend({
    options: {
        position: 'topleft'
    },

    initialize: function (particleLayer, options) {
        L.Util.setOptions(this, options);
        this._particleWindLayer = particleLayer;
        this._panelVisible = false;
        this._elements = {};
    },

    onAdd: function (map) {
        this._map = map;
        _mapInstance = map;

        const container = L.DomUtil.create('div', 'leaflet-control-particles leaflet-bar');
        this._container = container;

        const button = L.DomUtil.create('a', 'leaflet-control-particles-button', container);
        button.href = '#';
        button.title = 'Particle Settings';
        button.role = 'button';
        button.innerHTML = '<i class="fas fa-wind"></i>';
        this._toggleButton = button;

        const panel = L.DomUtil.create('div', 'leaflet-control-particles-panel', container);
        panel.style.display = 'none';
        this._panel = panel;

        this._createControls(panel);

        L.DomEvent.on(button, 'click', L.DomEvent.stop);
        L.DomEvent.on(button, 'click', this._togglePanel, this);
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        this._setInitialValues(); // Set initial values after creation

        return container;
    },

    onRemove: function (map) {
        L.DomEvent.off(this._toggleButton, 'click', this._togglePanel, this);
        Object.values(this._elements).forEach(elGroup => {
            // Make sure to check for slider AND colorInput
            if (elGroup.slider) L.DomEvent.off(elGroup.slider, 'input change', elGroup.handler, this);
            if (elGroup.colorInput) L.DomEvent.off(elGroup.colorInput, 'input change', elGroup.handler, this);
        });
        this._elements = {};
        this._panel = null;
        this._toggleButton = null;
        this._container = null;
        _mapInstance = null;
    },

    _createControls: function (panel) {
        panel.innerHTML = '';
        this._elements = {};

        // --- Updated createSlider helper to handle display scaling ---
        const createSlider = (id, label, min, max, step, value, handler, displayScale = 1, displayFixed = 0) => {
            const div = L.DomUtil.create('div', 'particle-control-group', panel);
            const labelEl = L.DomUtil.create('label', '', div);
            labelEl.htmlFor = `particle-${id}`;
            labelEl.innerText = `${label}:`;
            const sliderEl = L.DomUtil.create('input', '', div);
            sliderEl.type = 'range';
            sliderEl.id = `particle-${id}`;
            sliderEl.min = min;
            sliderEl.max = max;
            sliderEl.step = step;
            sliderEl.value = value;
            const valueSpan = L.DomUtil.create('span', 'particle-value-span', div);
            valueSpan.id = `particle-${id}-value`;

            L.DomEvent.on(sliderEl, 'input', handler, this); // Attach the correct handler

            // Store references including display info
            this._elements[id] = { slider: sliderEl, valueSpan: valueSpan, handler: handler, displayScale: displayScale, displayFixed: displayFixed };
            return valueSpan; // Return span for initial update
        };

        // --- Create Sliders (using updated constants and new sliders) ---
        // Note: Slider ranges can be adjusted for usability if needed
        createSlider('count', 'Particles', 5000, 150000, 1000, INITIAL_PARTICLE_COUNT, this._handleCountChange); // Increased max based on config
        createSlider('speed', 'Speed', 1, 50, 1, INITIAL_PARTICLE_SPEED_FACTOR_VALUE, this._handleSpeedChange, PARTICLE_SPEED_SLIDER_SCALE, 5); // Adjusted range/step
        createSlider('size', 'Size', 1, 5, 0.1, INITIAL_PARTICLE_SIZE, this._handleSizeChange, 1, 1); // Adjusted range

        // --- Renamed "Trail" to "Max Age" ---
        createSlider('maxAge', 'Max Age', 20, 2000, 10, INITIAL_PARTICLE_MAX_AGE, this._handleMaxAgeChange); // Use MAX_AGE constant and appropriate range

        // --- NEW: Min Age Slider ---
        createSlider('minAge', 'Min Age', 10, 1000, 10, INITIAL_PARTICLE_MIN_AGE, this._handleMinAgeChange); // Use MIN_AGE constant and appropriate range

        // --- NEW: Fade Factor Slider ---
        // Use integer range (e.g., 900-999) for slider, display as float (0.900-0.999)
        const fadeFactorValue = Math.round(INITIAL_PARTICLE_FADE_FACTOR * 1000);
        createSlider('fadeFactor', 'Fade Factor', 900, 999, 1, fadeFactorValue, this._handleFadeFactorChange, 1000, 3); // Range 0.900-0.999

        // --- Create Color Picker ---
        const colorDiv = L.DomUtil.create('div', 'particle-control-group', panel);
        const colorLabel = L.DomUtil.create('label', '', colorDiv);
        colorLabel.htmlFor = 'particle-color';
        colorLabel.innerText = 'Color:';
        const colorInputEl = L.DomUtil.create('input', '', colorDiv);
        colorInputEl.type = 'color';
        colorInputEl.id = 'particle-color';
        colorInputEl.value = INITIAL_PARTICLE_COLOR;
        L.DomEvent.on(colorInputEl, 'input', this._handleColorChange, this);
        L.DomEvent.on(colorInputEl, 'change', this._handleColorChange, this);
        this._elements['color'] = { colorInput: colorInputEl, handler: this._handleColorChange };

        // --- Update initial span values using helper ---
        const updateSpan = (id) => {
            const elGroup = this._elements[id];
            if (elGroup && elGroup.slider && elGroup.valueSpan) {
                const value = parseFloat(elGroup.slider.value);
                const displayValue = (value / elGroup.displayScale).toFixed(elGroup.displayFixed);
                elGroup.valueSpan.textContent = displayValue;
            } else if (id === 'color' && elGroup && elGroup.colorInput){
                // No span for color picker
            } else {
                 console.warn(`Could not find elements for initial span update: ${id}`);
            }
        };

        updateSpan('count');
        updateSpan('speed');
        updateSpan('size');
        updateSpan('maxAge'); // Updated ID
        updateSpan('minAge'); // New ID
        updateSpan('fadeFactor'); // New ID
    },

    // Method to explicitly set initial values AFTER controls are created
    _setInitialValues: function() {
        if (!this._elements.count) {
            console.warn("Particle controls not ready for setting initial values.");
            return;
        }
        console.log("Setting initial values in Particle Control panel");

        // Helper function to set slider and update span
        const setSliderValue = (id, value) => {
            const elGroup = this._elements[id];
            if (elGroup && elGroup.slider && elGroup.valueSpan) {
                elGroup.slider.value = value; // Set slider value
                // Calculate and set display value in the span
                const displayValue = (value / elGroup.displayScale).toFixed(elGroup.displayFixed);
                elGroup.valueSpan.textContent = displayValue;
            } else if (id === 'color' && elGroup && elGroup.colorInput) {
                elGroup.colorInput.value = value; // Set color picker value
            } else {
                 console.warn(`Could not find elements for initial value setting: ${id}`);
            }
        };

        // Set values based on imported config constants
        setSliderValue('count', INITIAL_PARTICLE_COUNT);
        setSliderValue('speed', INITIAL_PARTICLE_SPEED_FACTOR_VALUE);
        setSliderValue('color', INITIAL_PARTICLE_COLOR);
        setSliderValue('size', INITIAL_PARTICLE_SIZE);
        setSliderValue('maxAge', INITIAL_PARTICLE_MAX_AGE); // Use MAX_AGE constant
        setSliderValue('minAge', INITIAL_PARTICLE_MIN_AGE); // Use MIN_AGE constant
        setSliderValue('fadeFactor', Math.round(INITIAL_PARTICLE_FADE_FACTOR * 1000)); // Use FADE_FACTOR constant (scaled)
    },

    _togglePanel: function () {
        this._panelVisible = !this._panelVisible;
        this._panel.style.display = this._panelVisible ? 'block' : 'none';
        if (this._panelVisible) {
            L.DomUtil.addClass(this._toggleButton, 'active');
        } else {
            L.DomUtil.removeClass(this._toggleButton, 'active');
        }
    },

    // --- Event Handlers ---

    _handleCountChange: function (event) {
        if (!this._particleWindLayer || !event?.target) return;
        const count = parseInt(event.target.value, 10);
        // Update display span directly (no scaling needed for count)
        if (this._elements.count?.valueSpan) this._elements.count.valueSpan.textContent = count;
        // Update the layer option
        if (this._particleWindLayer.options) this._particleWindLayer.options.particleCount = count;
        // Trigger a reset in the layer if it's active
        if (this._particleWindLayer._resetParticles) {
             if (this._map && this._map.hasLayer(this._particleWindLayer)) {
                 // Layer's _resetParticles handles internal count scaling based on zoom
                 this._particleWindLayer._resetParticles();
             }
        }
    },

    _handleSpeedChange: function (event) {
        if (!this._particleWindLayer || !event?.target) return;
        const speedValue = parseInt(event.target.value, 10);
        const scale = this._elements.speed.displayScale; // Use stored scale
        const fixed = this._elements.speed.displayFixed; // Use stored fixed decimals
        const speedFactor = speedValue / scale; // Calculate actual speed factor
        // Update display span
        if (this._elements.speed?.valueSpan) this._elements.speed.valueSpan.textContent = speedFactor.toFixed(fixed);
        // Update the layer option
        if (this._particleWindLayer.options) this._particleWindLayer.options.speedFactor = speedFactor;
        // Speed changes take effect immediately in the animation loop, no reset needed
    },

    _handleColorChange: function (event) {
        if (!this._particleWindLayer || !event?.target) return;
        if (this._particleWindLayer.options) this._particleWindLayer.options.particleBaseColor = event.target.value;
        // Color changes take effect immediately, no reset needed
    },

    _handleSizeChange: function (event) {
        if (!this._particleWindLayer || !event?.target) return;
        const size = parseFloat(event.target.value);
        const fixed = this._elements.size.displayFixed; // Use stored fixed decimals
        // Update display span
        if (this._elements.size?.valueSpan) this._elements.size.valueSpan.textContent = size.toFixed(fixed);
        // Update the layer option
        if (this._particleWindLayer.options) this._particleWindLayer.options.particleLineWidth = size;
        // Size changes take effect immediately, no reset needed
    },

    // --- RENAMED from _handleTrailChange ---
    _handleMaxAgeChange: function (event) {
        if (!this._particleWindLayer || !event?.target) return;
        const maxAge = parseInt(event.target.value, 10);
        // Update display span
        if (this._elements.maxAge?.valueSpan) this._elements.maxAge.valueSpan.textContent = maxAge;
        // Update the layer option
        if (this._particleWindLayer.options) this._particleWindLayer.options.particleMaxAge = maxAge;

        // Optional: Attempt to update internal scaled age (might be better handled solely within wind-particles.js)
        // This ensures the internal state reflects the change immediately if needed,
        // otherwise it updates on the next _reset anyway.
        if (this._particleWindLayer._map && this._particleWindLayer.options.ageZoomScaleFactor && this._particleWindLayer.options.referenceZoom) {
             try {
                const currentZoom = this._particleWindLayer._map.getZoom();
                const refZoom = this._particleWindLayer.options.referenceZoom;
                const zoomScale = Math.pow(this._particleWindLayer.options.ageZoomScaleFactor, currentZoom - refZoom);
                const scaledMaxAgeBase = Math.round(maxAge / zoomScale);
                // Use the layer's *current* internal scaled min age for comparison
                const currentScaledMin = this._particleWindLayer._currentScaledMinAge || (this.options.minAgeThreshold || 10);
                this._particleWindLayer._currentScaledMaxAge = Math.max(currentScaledMin + 1, scaledMaxAgeBase);
            } catch (e) {
                console.warn("Could not update internal scaled max age on change:", e);
            }
        }
        // No immediate particle reset needed, age applies on next natural reset or boundary hit
    },

    // --- NEW Handler for Min Age ---
    _handleMinAgeChange: function (event) {
        if (!this._particleWindLayer || !event?.target) return;
        const minAge = parseInt(event.target.value, 10);
        // Update display span
        if (this._elements.minAge?.valueSpan) this._elements.minAge.valueSpan.textContent = minAge;
        // Update the layer option
        // Note: wind-particles.js uses 'minParticleAge' in its options object
        if (this._particleWindLayer.options) this._particleWindLayer.options.minParticleAge = minAge;

        // Optional: Attempt to update internal scaled age
        if (this._particleWindLayer._map && this._particleWindLayer.options.ageZoomScaleFactor && this._particleWindLayer.options.referenceZoom) {
             try {
                const currentZoom = this._particleWindLayer._map.getZoom();
                const refZoom = this._particleWindLayer.options.referenceZoom;
                const zoomScale = Math.pow(this._particleWindLayer.options.ageZoomScaleFactor, currentZoom - refZoom);
                const scaledMinAgeBase = Math.round(minAge / zoomScale);
                // Apply threshold from layer options or fallback
                const minThreshold = this._particleWindLayer.options.minAgeThreshold || 10;
                this._particleWindLayer._currentScaledMinAge = Math.max(minThreshold, scaledMinAgeBase);

                // Also ensure current scaled max age is still greater than the new min age
                if (this._particleWindLayer._currentScaledMaxAge <= this._particleWindLayer._currentScaledMinAge) {
                   this._particleWindLayer._currentScaledMaxAge = this._particleWindLayer._currentScaledMinAge + 1;
                   console.log("Adjusted scaled max age due to min age change.");
                }

            } catch (e) {
                console.warn("Could not update internal scaled min age on change:", e);
            }
        }
         // No immediate particle reset needed
    },

    // --- NEW Handler for Fade Factor ---
    _handleFadeFactorChange: function (event) {
        if (!this._particleWindLayer || !event?.target) return;
        const fadeValue = parseInt(event.target.value, 10); // Value from slider (e.g., 900-999)
        const scale = this._elements.fadeFactor.displayScale; // Use stored scale (1000)
        const fixed = this._elements.fadeFactor.displayFixed; // Use stored fixed (3)
        const fadeFactor = fadeValue / scale; // Convert to float (e.g., 0.900 - 0.999)
        // Update display span
        if (this._elements.fadeFactor?.valueSpan) this._elements.fadeFactor.valueSpan.textContent = fadeFactor.toFixed(fixed);
        // Update the layer option
        if (this._particleWindLayer.options) this._particleWindLayer.options.fadeFactor = fadeFactor;
        // Fade factor changes take effect immediately, no reset needed
    },


    // --- Public methods ---
    disable: function() {
        if (this._container) {
            L.DomUtil.addClass(this._container, 'disabled');
            if (this._toggleButton) this._toggleButton.style.pointerEvents = 'none';
            if (this._panel) this._panel.style.display = 'none';
            this._panelVisible = false;
            L.DomUtil.removeClass(this._toggleButton, 'active');
        }
        console.log("Particle control disabled.");
    },

    enable: function() {
         if (this._container) {
            L.DomUtil.removeClass(this._container, 'disabled');
            if (this._toggleButton) this._toggleButton.style.pointerEvents = 'auto';
        }
         console.log("Particle control enabled.");
    }

});

// Factory function
export function initialize(map, particleLayerInstance) {
    console.log("Initializing Particle Controls (Leaflet Control)...");
    if (!map) {
        console.error("Map instance not provided to Particle Controls initialization.");
        return null;
    }
    if (!particleLayerInstance) {
         console.warn("Particle layer instance not provided. Controls will be added but non-functional.");
         // Optionally: Don't add the control at all
         // return null;
    }

    _particleWindLayer = particleLayerInstance;
    _particleControlInstance = new ParticleControl(particleLayerInstance);
    _particleControlInstance.addTo(map);

    // --- Sync control display with actual layer options after creation ---
    // This handles cases where the layer might have been initialized with
    // options different from the config defaults (e.g., from saved state later?)
    if (_particleControlInstance && _particleWindLayer && _particleWindLayer.options && _particleControlInstance._elements.count) {
        console.log("Syncing particle control display with layer options.");
        const layerOpts = _particleWindLayer.options;
        const elements = _particleControlInstance._elements;

        // Helper to update slider and span based on layer option
        const syncControl = (id, layerOptionValue, scale = 1, valueTransform = v => v) => {
            const elGroup = elements[id];
            if (elGroup && elGroup.slider && elGroup.valueSpan && layerOptionValue !== undefined) {
                const sliderValue = valueTransform(layerOptionValue) * scale;
                elGroup.slider.value = sliderValue;
                const displayValue = (sliderValue / elGroup.displayScale).toFixed(elGroup.displayFixed);
                elGroup.valueSpan.textContent = displayValue;
            } else if (id === 'color' && elGroup && elGroup.colorInput && layerOptionValue !== undefined) {
                elGroup.colorInput.value = layerOptionValue;
            }
        };

        syncControl('count', layerOpts.particleCount);
        syncControl('speed', layerOpts.speedFactor, PARTICLE_SPEED_SLIDER_SCALE);
        syncControl('color', layerOpts.particleBaseColor);
        syncControl('size', layerOpts.particleLineWidth);
        syncControl('maxAge', layerOpts.particleMaxAge);
        syncControl('minAge', layerOpts.minParticleAge); // Use correct layer option name
        syncControl('fadeFactor', layerOpts.fadeFactor, 1000); // Scale float to slider value

    } else if (_particleControlInstance && !_particleControlInstance._elements.count) {
         console.warn("Particle control elements not ready for syncing.");
    }
    // ---

    console.log("Particle Control Added to Map.");
    return _particleControlInstance;
}

// Function to disable the control
export function disable() {
    if (_particleControlInstance) {
        _particleControlInstance.disable();
    } else {
         console.warn("Attempted to disable particle controls, but instance not found.");
    }
}
// --- END OF FILE particlecontrols.js ---