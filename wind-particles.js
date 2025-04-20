// --- START OF FILE wind-particles.js ---

if (typeof L === 'undefined') {
    throw new Error('Leaflet must be loaded before wind-particles.js');
}

/**
 * Represents a single particle in the wind simulation.
 */
class Particle {
    /**
     * Creates a new Particle.
     * @param {L.LatLngBounds} bounds - The current visible map bounds.
     * @param {number} scaledMinAge - The minimum lifespan (in frames) for this particle, adjusted for zoom.
     * @param {number} scaledMaxAge - The maximum lifespan (in frames) for this particle, adjusted for zoom.
     */
    constructor(bounds, scaledMinAge, scaledMaxAge) {
        this.bounds = bounds;
        // Store the base scaled age range provided
        this.baseMinAge = scaledMinAge;
        this.baseMaxAge = scaledMaxAge;

        // Fade-in effect parameters
        this.fadeInDurationFrames = 60; // Duration of the fade-in effect
        this.fadeInMaxDelayFrames = 60; // Maximum random delay before fade-in starts

        this.reset(); // Initialize position, age, etc.
    }

    /**
     * Resets the particle's state (position, age, lifespan, velocity).
     * Calculates a random lifespan within the current baseMinAge/baseMaxAge range.
     */
    reset() {
        if (!this.bounds || !this.bounds.isValid()) {
            // Safety check if bounds are invalid
            this.lat = 0; this.lng = 0; this.current_vLat = 0; this.current_vLng = 0; this.lastPos = null; return;
        }

        // Randomly position particle within bounds (with a small buffer)
        const latBuffer = (this.bounds.getNorth() - this.bounds.getSouth()) * 0.05;
        const lngBuffer = (this.bounds.getEast() - this.bounds.getWest()) * 0.05;
        this.lat = (this.bounds.getSouth() + latBuffer) + Math.random() * (this.bounds.getNorth() - this.bounds.getSouth() - 2 * latBuffer);
        this.lng = (this.bounds.getWest() + lngBuffer) + Math.random() * (this.bounds.getEast() - this.bounds.getWest() - 2 * lngBuffer);

        // --- Calculate Lifespan for this instance ---
        // Ensure minAge is at least a small positive number (e.g., 10 frames)
        const minAge = Math.max(10, this.baseMinAge);
        // Ensure maxAge is greater than minAge
        const maxAge = Math.max(minAge + 1, this.baseMaxAge);
        // Assign a random lifespan within the valid [minAge, maxAge] range
        this.maxAge = minAge + Math.random() * (maxAge - minAge);
        // --- End Lifespan Calculation ---

        this.age = 0; // Reset current age
        this.fadeInDelayFrames = Math.random() * this.fadeInMaxDelayFrames; // Reset fade-in delay
        this.current_vLat = 0; // Reset velocity components
        this.current_vLng = 0;
        this.lastPos = null; // Reset last known position (breaks trail)
    }

    /**
     * Resets the particle when it hits a boundary or ages out.
     * Updates the base age range before calling the main reset method.
     * @param {number} scaledMinAge - The current minimum lifespan based on zoom.
     * @param {number} scaledMaxAge - The current maximum lifespan based on zoom.
     */
    resetFromBoundary(scaledMinAge, scaledMaxAge) {
        // Update the base age range for the next lifespan calculation
        this.baseMinAge = scaledMinAge;
        this.baseMaxAge = scaledMaxAge;
        this.reset(); // Perform the full reset
    }

    /**
     * Updates the particle's state for one animation frame.
     * @param {number} target_vLat - The target latitude velocity component from the wind field.
     * @param {number} target_vLng - The target longitude velocity component from the wind field.
     * @param {number} deltaTimeMultiplier - Time step factor (usually 1).
     * @param {number} smoothingFactor - Velocity smoothing factor (0-1).
     */
    update(target_vLat, target_vLng, deltaTimeMultiplier, smoothingFactor) {
        this.age++; // Increment age
        if (this.age > this.maxAge) {
            // If aged out, do nothing; reset is handled externally in the main loop
            return;
        }

        // Apply velocity smoothing (exponential moving average)
        this.current_vLat = this.current_vLat * smoothingFactor + target_vLat * (1.0 - smoothingFactor);
        this.current_vLng = this.current_vLng * smoothingFactor + target_vLng * (1.0 - smoothingFactor);

        // Store current position before updating
        this.lastPos = { lat: this.lat, lng: this.lng };

        // Update position based on smoothed velocity and time delta
        this.lat += this.current_vLat * deltaTimeMultiplier;
        this.lng += this.current_vLng * deltaTimeMultiplier;
    }
} // --- End of Particle Class ---


// --- Leaflet Layer Definition ---
L.CanvasLayer = (L.Layer ? L.Layer : L.Class); // Handle different Leaflet versions

L.CanvasLayer.Particles = L.CanvasLayer.extend({
    // Default options for the layer
    options: {
        padding: 0.2,                   // Extend bounds processing beyond viewport
        particleCount: 2000,            // Base particle count at referenceZoom
        particleLineOpacity: 0.85,      // Max opacity for particle trails
        particleLineWidth: 1.2,         // Width of particle trails
        particleBaseColor: '#FFFFFF',   // Base color of particles
        particleMaxAge: 500,            // Default base max lifespan (frames)
        minParticleAge: 90,             // Default base min lifespan (frames) - Correct option name
        fadeFactor: 0.97,               // Rate at which trails fade each frame (0.9-0.99)
        idwPower: 2,                    // Interpolation weighting power
        maxInterpolationDist: 3.0,      // Max distance (degrees) for interpolation points
        speedFactor: 0.00020,           // Base speed multiplier
        deltaTimeMultiplier: 1,         // Time step multiplier (usually 1)
        velocitySmoothing: 0.95,        // Velocity smoothing factor (0-1)
        nearestNeighborFactor: 0.2,     // Blend factor for nearest neighbor vs. IDW average
        referenceZoom: 7,               // Zoom level where base values apply
        countZoomScaleFactor: 1.8,      // Default scaling factor for particle count
        ageZoomScaleFactor: 1.8,        // Default scaling factor for particle age
        speedZoomScaleFactor: 1.0,      // Default scaling factor for particle speed (1.0 = no scaling)
        minCount: 50,                   // Min allowed particle count after scaling
        maxCount: 15000,                // Max allowed particle count after scaling
        minAgeThreshold: 10,             // Absolute minimum lifespan (frames) after scaling
		speedWeightFromData: 0.0
    },

    /**
     * Initializes the layer. Merges provided options with defaults.
     * @param {object} options - Layer options provided during instantiation.
     */
    initialize: function (options) {
        L.setOptions(this, options); // Merge options with defaults
        this._windDataPoints = [];       // Array to store wind data points {lat, lng, u, v}
        this._particles = [];            // Array to store Particle instances
        this._animationFrameId = null;   // Stores the ID from requestAnimationFrame
        this._map = null;                // Reference to the Leaflet map instance
        this._canvas = null;             // The HTML canvas element
        this._ctx = null;                // The 2D rendering context of the canvas
        this._bounds = null;             // The current map bounds being rendered

        // Initialize internal scaled age variables based on initial options
        // These will be recalculated properly in the first _reset() call
        this._currentScaledMinAge = Math.max(this.options.minAgeThreshold, this.options.minParticleAge);
        this._currentScaledMaxAge = Math.max(this._currentScaledMinAge + 1, this.options.particleMaxAge);
    },

    /**
     * Called when the layer is added to the map.
     * Creates the canvas, adds it to the map, and sets up event listeners.
     * @param {L.Map} map - The Leaflet map instance.
     */
    onAdd: function (map) {
        this._map = map;
        // Create canvas and context if they don't exist
        if (!this._canvas) {
            this._canvas = L.DomUtil.create('canvas', 'leaflet-particles-layer leaflet-layer');
            this._ctx = this._canvas.getContext('2d');
        }
        // Set canvas size to match map container
        const size = map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        // Add canvas to the overlay pane
        map.getPanes().overlayPane.appendChild(this._canvas);

        // Attach map event listeners for synchronization
        map.on('moveend', this._reset, this);      // After pan or zoom finishes
        map.on('zoomstart', this._onZoomStart, this); // Before zoom animation starts
        map.on('resize', this._resize, this);        // When map container size changes

        this._reset();          // Perform initial setup (bounds, particles)
        this._startAnimation(); // Start the drawing loop
    },

    /**
     * Called when the layer is removed from the map.
     * Stops animation, removes the canvas, and detaches listeners.
     * @param {L.Map} map - The Leaflet map instance.
     */
    onRemove: function (map) {
        this._stopAnimation(); // Stop the drawing loop
        // Remove canvas from the DOM if it exists
        if (this._canvas && this._canvas.parentNode) {
            this._canvas.parentNode.removeChild(this._canvas);
        }
        // Detach map event listeners
        map.off('moveend', this._reset, this);
        map.off('zoomstart', this._onZoomStart, this);
        map.off('resize', this._resize, this);

        // Clear references
        this._map = null;
        this._particles = [];
        this._windDataPoints = [];
        // Note: _canvas and _ctx are kept for potential re-adding
    },

    /**
     * Sets the wind data points used for interpolation.
     * @param {Array<object>} windDataPoints - Array of {lat, lng, u, v}.
     */
    setWindData: function (windDataPoints) {
        this._windDataPoints = windDataPoints || [];
        // Optional: Reduce log spam
        // console.log(`Wind layer received ${this._windDataPoints.length} data points.`);
        // Restart animation if it was stopped (e.g., due to previous lack of data)
        if (this._windDataPoints.length > 0 && !this._animationFrameId && this._map) {
            this._startAnimation();
        }
    },

    /**
     * Hides the canvas and stops animation at the start of a zoom animation.
     * Prevents visual tearing or lagging during the zoom.
     */
    _onZoomStart: function() {
        this._stopAnimation(); // Pause drawing
        if (this._canvas) {
            // Optional: Clear canvas content immediately
            // this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
            this._canvas.style.visibility = 'hidden'; // Hide the canvas element
        }
    },

    /**
     * Handles map resize events. Adjusts canvas dimensions and triggers a reset.
     */
    _resize: function() {
        if (!this._map || !this._canvas) return;
        const size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._reset(); // Reset needed for new canvas size and bounds
    },

    /**
     * Repositions the canvas element over the map pane.
     */
    _resetCanvasPosition: function() {
         if (!this._map || !this._canvas) return;
         // Get the map's pixel origin relative to the layer's container point
         const topLeft = this._map.containerPointToLayerPoint([0, 0]);
         L.DomUtil.setPosition(this._canvas, topLeft);
    },

    /**
     * Recalculates bounds, determines scaled particle count/age based on zoom,
     * and potentially triggers a full reset of the particle array.
     * Called after map move/zoom ends or on resize.
     */
    _reset: function () {
        if (!this._map || !this._canvas) return; // Need map and canvas context
        // Ensure canvas is visible (might have been hidden by _onZoomStart)
        if (this._canvas) { this._canvas.style.visibility = 'visible'; }
        this._resetCanvasPosition(); // Update canvas position

        // Get new map bounds with padding
        const newBounds = this._map.getBounds().pad(this.options.padding);
        // Check if bounds have changed significantly since last reset
        const boundsChanged = !this._bounds || !this._bounds.getCenter().distanceTo(newBounds.getCenter()) > 1 || !this._bounds.equals(newBounds, 0.1);
        this._bounds = newBounds; // Store the new bounds

        // --- Calculate Scaling Factors ---
        const currentZoom = this._map.getZoom();
        const refZoom = this.options.referenceZoom;
        const zoomDiff = currentZoom - refZoom;
        const countZoomScale = Math.pow(this.options.countZoomScaleFactor, zoomDiff);
        const ageZoomScale = Math.pow(this.options.ageZoomScaleFactor, zoomDiff);
        // Note: Speed scale factor is calculated per frame in _animate

        // --- Calculate Scaled Age Range ---
        const scaledMinAgeBase = Math.round(this.options.minParticleAge / ageZoomScale);
        const scaledMaxAgeBase = Math.round(this.options.particleMaxAge / ageZoomScale);
        // Apply absolute minimum threshold and ensure max > min
        this._currentScaledMinAge = Math.max(this.options.minAgeThreshold, scaledMinAgeBase);
        this._currentScaledMaxAge = Math.max(this._currentScaledMinAge + 1, scaledMaxAgeBase);

        // --- Calculate Scaled Particle Count ---
        let scaledCount = Math.round(this.options.particleCount / countZoomScale);
        // Apply min/max count clamps
        scaledCount = Math.max(this.options.minCount, Math.min(scaledCount, this.options.maxCount));

        // --- Determine if Particle Array Needs Resetting ---
        if (this._particles.length === 0 || boundsChanged || this._particles.length !== scaledCount) {
            // Reset if first time, bounds changed significantly, or target count differs
            // console.log(`Resetting particles... Zoom: ${currentZoom}, Target Count: ${scaledCount}, Scaled MinAge: ${this._currentScaledMinAge}, Scaled MaxAge: ${this._currentScaledMaxAge}`);
            this._resetParticles(scaledCount); // Trigger full particle regeneration
        } else {
            // No full reset needed, but update internal ages for potential resets in _animate
            // console.log(`Move ended. Count: ${this._particles.length}, Scaled MinAge: ${this._currentScaledMinAge}, Scaled MaxAge: ${this._currentScaledMaxAge}`);
        }

        this._startAnimation(); // Ensure animation loop is running
    },

     /**
      * Clears and regenerates the entire array of Particle instances.
      * Calculates the target count and scaled age range based on current zoom.
      * @param {number} [targetCount] - Optional. If provided, uses this count directly. Otherwise calculates based on zoom.
      */
     _resetParticles: function(targetCount) {
        // Calculate target count based on zoom if not provided
        if (targetCount === undefined) {
            if (!this._map) return; // Need map context
            const currentZoom = this._map.getZoom();
            const refZoom = this.options.referenceZoom;
            const zoomDiff = currentZoom - refZoom;
            const countZoomScale = Math.pow(this.options.countZoomScaleFactor, zoomDiff);
            let scaledCount = Math.round(this.options.particleCount / countZoomScale);
            targetCount = Math.max(this.options.minCount, Math.min(scaledCount, this.options.maxCount));
        }

        // Recalculate and store the current scaled age range
        if (this._map) {
            const currentZoom = this._map.getZoom();
            const refZoom = this.options.referenceZoom;
            const zoomDiff = currentZoom - refZoom;
            const ageZoomScale = Math.pow(this.options.ageZoomScaleFactor, zoomDiff);
            // Use correct option names and apply threshold
            const scaledMinAgeBase = Math.round(this.options.minParticleAge / ageZoomScale);
            const scaledMaxAgeBase = Math.round(this.options.particleMaxAge / ageZoomScale);
            this._currentScaledMinAge = Math.max(this.options.minAgeThreshold, scaledMinAgeBase);
            this._currentScaledMaxAge = Math.max(this._currentScaledMinAge + 1, scaledMaxAgeBase);
            // console.log(`_resetParticles: Count=${targetCount}, MinAge=${this._currentScaledMinAge}, MaxAge=${this._currentScaledMaxAge}`);
        } else {
            // Fallback if map isn't ready (e.g., during initial setup)
            this._currentScaledMinAge = Math.max(this.options.minAgeThreshold, this.options.minParticleAge);
            this._currentScaledMaxAge = Math.max(this._currentScaledMinAge + 1, this.options.particleMaxAge);
            // console.warn(`_resetParticles (no map): Count=${targetCount}, MinAge=${this._currentScaledMinAge}, MaxAge=${this._currentScaledMaxAge}`);
        }

        this._particles = []; // Clear the existing particle array
        if (!this._bounds || !this._bounds.isValid()) {
            console.warn("Cannot reset particles, bounds invalid.");
            return; // Cannot proceed without valid bounds
        }

        // Create the new set of particles
        for (let i = 0; i < targetCount; i++) {
            // Pass the calculated scaled min and max ages to each new particle
            this._particles.push(new Particle(this._bounds, this._currentScaledMinAge, this._currentScaledMaxAge));
        }
    },

    /**
     * Starts the animation loop if it's not already running.
     */
    _startAnimation: function () {
        if (this._animationFrameId || !this._map) return; // Don't start if already running or no map
        this._animationFrameId = L.Util.requestAnimFrame(this._animate, this);
    },

    /**
     * Stops the animation loop if it is running.
     */
    _stopAnimation: function () {
        if (this._animationFrameId) {
            L.Util.cancelAnimFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
    },

    /**
     * The main animation loop, called every frame by requestAnimationFrame.
     * Handles canvas fading, calculates effective speed, updates and draws particles.
     */
    // wind-particles.js -> L.CanvasLayer.Particles class

    _animate: function () {
        if (!this._map || !this._ctx) { // Safety check
            this._stopAnimation(); return;
        }
        // Schedule the next frame
        this._animationFrameId = L.Util.requestAnimFrame(this._animate, this);

        const { width, height } = this._canvas;

        // --- Apply Fading Effect ---
        const prev = this._ctx.globalCompositeOperation;
        this._ctx.globalCompositeOperation = 'destination-in';
        this._ctx.fillStyle = `rgba(0, 0, 0, ${this.options.fadeFactor})`;
        this._ctx.fillRect(0, 0, width, height);
        this._ctx.globalCompositeOperation = prev;
        // --- End Fading ---

        if (this._windDataPoints.length === 0) return; // Skip drawing if no wind data

        // --- Calculate Effective Speed Factor (per frame) ---
        // This factor now represents the desired *magnitude* of speed,
        // potentially blended later with data magnitude speed.
        let effectiveSpeedFactor = this.options.speedFactor; // Start with base speed
        let currentZoom = '?';
        let speedScaleFactorFromOpts = '?';

        try {
            currentZoom = this._map.getZoom();
            const refZoom = this.options.referenceZoom;
            speedScaleFactorFromOpts = this.options.speedZoomScaleFactor; // Read from layer options

            if (speedScaleFactorFromOpts && speedScaleFactorFromOpts !== 1.0 && refZoom !== undefined && currentZoom !== undefined) {
                 const zoomDiff = currentZoom - refZoom;
                 const zoomScale = Math.pow(speedScaleFactorFromOpts, zoomDiff);
                 effectiveSpeedFactor = this.options.speedFactor / Math.max(0.01, zoomScale); // Apply scaling
            }
        } catch(e) {
             console.warn("Could not calculate effective speed factor:", e);
             effectiveSpeedFactor = this.options.speedFactor; // Fallback on error
        }

        // --- Keep Throttled Debug Log ---
        const now = Date.now();
        const logInterval = this.options.logThrottleMillis || 3000;
        if (now - this._lastLogTime >= logInterval) {
            // Include the weight being used in the log
            const weightLog = (typeof this.options.speedWeightFromData === 'number') ? this.options.speedWeightFromData.toFixed(2) : 'N/A';
            console.log(`DEBUG animate (Throttled): Zoom=${currentZoom}, Opts.speedZoomScaleFactor=${speedScaleFactorFromOpts}, Opts.speedWeightFromData=${weightLog}, EffectiveSpeedFactor=${effectiveSpeedFactor.toFixed(7)}`);
            this._lastLogTime = now;
        }
        // --- End Speed Factor Calc & Log ---


        // --- Prepare Drawing Settings ---
        const lineWidth = this.options.particleLineWidth;
        const baseColorHex = this.options.particleBaseColor;
        const baseOpacity = this.options.particleLineOpacity;
        const smoothingFactor = this.options.velocitySmoothing;
        const deltaTime = this.options.deltaTimeMultiplier;
        const r = parseInt(baseColorHex.slice(1, 3), 16);
        const g = parseInt(baseColorHex.slice(3, 5), 16);
        const b = parseInt(baseColorHex.slice(5, 7), 16);
        // --- End Drawing Settings ---


        // --- Process Each Particle ---
        this._particles.forEach(particle => {
            if (!this._bounds || !this._bounds.isValid()) return; // Safety check

            const currentScaledMinAge = this._currentScaledMinAge;
            const currentScaledMaxAge = this._currentScaledMaxAge;

            // --- Lifecycle & Boundary Check ---
            if (particle.age >= particle.maxAge || !this._bounds.contains([particle.lat, particle.lng])) {
                particle.resetFromBoundary(currentScaledMinAge, currentScaledMaxAge);
            } else {
                // --- Get Wind Data ---
                const [u, v] = this._getInterpolatedWind(particle.lat, particle.lng);

                if (Math.abs(u) < 0.01 && Math.abs(v) < 0.01) { // Skip if negligible wind
                    particle.age++; particle.lastPos = null; return;
                }

                // **** START: Speed Blending Logic ****
                const magnitude = Math.sqrt(u * u + v * v);
                const epsilon = 1e-6;
                let u_norm = 0, v_norm = 0;
                if (magnitude > epsilon) {
                    u_norm = u / magnitude;
                    v_norm = v / magnitude;
                }

                // Method 0 Speed Components (Normalized direction * effectiveSpeedFactor)
                const core_vLat_method0 = v_norm * effectiveSpeedFactor;
                const core_vLng_method0 = u_norm * effectiveSpeedFactor;

                // Method 1 Speed Components (Data vector * effectiveSpeedFactor)
                const core_vLat_method1 = v * effectiveSpeedFactor;
                const core_vLng_method1 = u * effectiveSpeedFactor;

                // --- Blend Between Methods ---
                let weight = this.options.speedWeightFromData;
                // Validate weight
                if (typeof weight !== 'number' || weight < 0 || weight > 1) {
                    // Log warning only once if invalid weight detected to avoid spam
                    if (!this._invalidWeightWarned) {
                         console.warn(`Invalid speedWeightFromData (${weight}), defaulting to 0.`);
                         this._invalidWeightWarned = true; // Flag to prevent repeat warnings
                    }
                    weight = 0.0;
                } else {
                    this._invalidWeightWarned = false; // Reset flag if weight becomes valid
                }
                const weight0 = 1.0 - weight; // Weight for normalized speed
                const weight1 = weight;         // Weight for data magnitude speed

                // Perform linear interpolation
                const final_core_vLat = (core_vLat_method1 * weight1) + (core_vLat_method0 * weight0);
                const final_core_vLng = (core_vLng_method1 * weight1) + (core_vLng_method0 * weight0);
                // --- End Blending ---

                // --- Apply Latitude Correction (Cosine Factor) ---
                const cosLat = Math.cos(particle.lat * Math.PI / 180);
                const safeCosLat = Math.max(0.1, Math.abs(cosLat));

                // Apply correction only to the longitude component
                const target_vLng = final_core_vLng / safeCosLat;
                const target_vLat = final_core_vLat;
                // **** END: Speed Blending Logic ****


                // --- Update Particle State ---
                particle.update(target_vLat, target_vLng, deltaTime, smoothingFactor);

                // --- Boundary Check After Move ---
                if (!this._bounds.contains([particle.lat, particle.lng])) {
                    particle.resetFromBoundary(currentScaledMinAge, currentScaledMaxAge);
                    particle.lastPos = null;
                }

                // --- Draw Particle Trail Segment ---
                // ... (existing drawing logic using finalOpacity, lineWidth, strokeStyle etc.) ...
                if (particle.lastPos && particle.age > 0) {
                    const currentPoint = this._map.latLngToContainerPoint([particle.lat, particle.lng]);
                    const lastPoint = this._map.latLngToContainerPoint([particle.lastPos.lat, particle.lastPos.lng]);
                    const dx = currentPoint.x - lastPoint.x;
                    const dy = currentPoint.y - lastPoint.y;
                    const distSq = dx * dx + dy * dy;

                    let finalOpacity = 0;
                    if (particle.age >= particle.fadeInDelayFrames) {
                        const lifeRatio = Math.min(1, particle.age / particle.maxAge);
                        const tailOpacity = baseOpacity * (1 - lifeRatio);
                        const fadeInAge = particle.age - particle.fadeInDelayFrames;
                        const fadeInProgress = Math.min(1.0, fadeInAge / Math.max(1, particle.fadeInDurationFrames));
                        finalOpacity = tailOpacity * fadeInProgress;
                    }

                    if (distSq > 0.1 && distSq < (150*150) && finalOpacity > 0.05) {
                        this._ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.max(0, finalOpacity)})`;
                        this._ctx.lineWidth = lineWidth;
                        this._ctx.lineCap = "round";
                        this._ctx.beginPath();
                        this._ctx.moveTo(lastPoint.x, lastPoint.y);
                        this._ctx.lineTo(currentPoint.x, currentPoint.y);
                        this._ctx.stroke();
                    } else {
                        particle.lastPos = null;
                    }
                } else {
                   particle.lastPos = null;
                }
                // --- End Drawing ---
            } // End else block (particle is alive and in bounds)
        }); // --- End ForEach Particle ---
    }, // --- End _animate ---

    /**
     * Interpolates wind velocity (u, v) at a given point using IDW.
     * @param {number} lat - Latitude of the point.
     * @param {number} lng - Longitude of the point.
     * @returns {Array<number>} - Array [u, v] representing wind velocity.
     */
    _getInterpolatedWind: function (lat, lng) {
        // --- Inverse Distance Weighting Logic ---
        let totalWeight = 0, totalU = 0, totalV = 0;
        let nearestDistSq = Infinity, nearestU = 0, nearestV = 0;
        let pointsInRange = 0;
        const maxDistSq = this.options.maxInterpolationDist * this.options.maxInterpolationDist;
        const power = this.options.idwPower;
        const epsilon = 1e-6; // Prevent division by zero

        for (const p of this._windDataPoints) {
            // Basic validation of data point
            if (p.u === undefined || p.v === undefined || p.lat === undefined || p.lng === undefined) continue;

            const dy = lat - p.lat;
            const dx = lng - p.lng;
            const distSq = dx * dx + dy * dy; // Use squared distance for efficiency

            // Track the absolute nearest point found
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestU = p.u;
                nearestV = p.v;
            }

            // Consider point for IDW if within max distance and not exactly the same point
            if (distSq < maxDistSq && distSq > epsilon) {
                pointsInRange++;
                const weight = 1.0 / (Math.pow(distSq, power / 2) + epsilon); // Calculate weight
                totalU += p.u * weight;
                totalV += p.v * weight;
                totalWeight += weight;
            } else if (distSq <= epsilon) {
                // If we are exactly at a data point, return its value directly
                return [p.u, p.v];
            }
        }

        // --- Combine results ---
        if (totalWeight > 0) {
            // If points were found within range, calculate the weighted average
            const avgU = totalU / totalWeight;
            const avgV = totalV / totalWeight;

            // Optional: Blend with nearest neighbor if data is very sparse locally
            let factor = 0;
            if (pointsInRange <= 2 && nearestDistSq < maxDistSq * 0.1) {
                 factor = this.options.nearestNeighborFactor; // Use configured blend factor
            }
            const finalU = avgU * (1 - factor) + nearestU * factor;
            const finalV = avgV * (1 - factor) + nearestV * factor;
            return [finalU, finalV];

        } else if (nearestDistSq <= maxDistSq * 1.5) {
            // If no points were strictly within range, but the nearest is reasonably close, use it
            return [nearestU, nearestV];
        } else {
            // If no data points are nearby, return zero wind
            return [0, 0];
        }
    } // --- End _getInterpolatedWind ---

}); // --- End of L.CanvasLayer.Particles Class ---


// --- Factory Function ---
// Creates a new instance of the particle layer, merging provided options with defaults.
L.canvasLayer = L.canvasLayer || {}; // Ensure namespace exists
L.canvasLayer.particles = function (options) {
    // Use L.Util.extend to merge the default options with the user-provided options
    const mergedOptions = L.Util.extend({}, L.CanvasLayer.Particles.prototype.options, options);
    // Create and return a new layer instance with the merged options
    return new L.CanvasLayer.Particles(mergedOptions);
};
// --- End Factory Function ---

// --- END OF FILE wind-particles.js ---