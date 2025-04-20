// --- START OF FILE wind-particles-unique.js ---
// Purpose: Leaflet Canvas Layer for rendering wind particles.
// Unique Naming: Uses 'WindFlow' prefix to avoid conflicts.
//   - Main Class: L.CanvasLayer.WindFlowLayer
//   - Factory: L.canvasLayer.windFlow
//   - Particle Element: WindFlowParticleElement

if (typeof L === 'undefined') {
    throw new Error('Leaflet must be loaded before wind-particles-unique.js');
}

// --- Internal Particle Element Class (Renamed) ---
class WindFlowParticleElement { // Renamed from Particle
    constructor(bounds, initialMaxLife) {
        this.bounds = bounds; // Geographical bounds
        this.baseMaxLife = initialMaxLife; // Base lifetime from scaled options

        // Geographical coordinates for wind lookup & update
        this.lat = 0;
        this.lng = 0;

        // Pixel coordinates for drawing (Leaflet Point objects)
        this.lastScreenPos = null;
        this.currentScreenPos = null;

        // Lifecycle
        this.maxLife = 100; // Will be randomized in reset
        this.life = 0;      // Will be randomized in reset

        this.reset(true); // Initial reset
    }

    reset(initial = false) {
        if (!this.bounds || !this.bounds.isValid()) {
            this.life = -1; return;
        }
        // --- Reset Geographical Position ---
        const latBuffer = (this.bounds.getNorth() - this.bounds.getSouth()) * 0.05;
        const lngBuffer = (this.bounds.getEast() - this.bounds.getWest()) * 0.05;
        this.lat = (this.bounds.getSouth() + latBuffer) + Math.random() * (this.bounds.getNorth() - this.bounds.getSouth() - 2 * latBuffer);
        this.lng = (this.bounds.getWest() + lngBuffer) + Math.random() * (this.bounds.getEast() - this.bounds.getWest() - 2 * lngBuffer);

        // --- Reset Lifecycle ---
        this.maxLife = Math.random() * (this.baseMaxLife * 0.5) + (this.baseMaxLife * 0.75);
        this.life = initial ? Math.random() * this.maxLife : this.maxLife;

        // --- Reset Screen Positions ---
        this.lastScreenPos = null;
        this.currentScreenPos = null; // Will be calculated on first frame after reset
    }

    update(deltaLat, deltaLng) { // Update based on calculated GEO changes
        if (this.life <= 0) return;
        this.life--;
        if (this.life <= 0) return;

        // Update geographical position
        this.lat += deltaLat;
        this.lng += deltaLng;
    }

    // Draw using pre-calculated screen positions
    draw(ctx, baseColorRGB, baseAlpha = 0.8, offset = 0.1) {
        if (this.life <= 0 || !this.lastScreenPos || !this.currentScreenPos) return; // Need valid positions

        const dx = this.currentScreenPos.x - this.lastScreenPos.x;
        const dy = this.currentScreenPos.y - this.lastScreenPos.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 0.1) return; // Don't draw if not moved visibly

        const lifeRatio = Math.max(0, Math.min(1, (1 - this.life / this.maxLife)));
        const alphaFactor = Math.sin(lifeRatio * Math.PI);
        const finalAlpha = alphaFactor * baseAlpha + offset;

        if (finalAlpha <= 0.01) return; // Don't draw if invisible

        ctx.strokeStyle = `rgba(${baseColorRGB.r}, ${baseColorRGB.g}, ${baseColorRGB.b}, ${finalAlpha})`;
        ctx.beginPath();
        ctx.moveTo(this.lastScreenPos.x, this.lastScreenPos.y);
        ctx.lineTo(this.currentScreenPos.x, this.currentScreenPos.y);
        ctx.stroke();
    }
}
// --- END WindFlowParticleElement Class ---


L.CanvasLayer = (L.Layer ? L.Layer : L.Class); // Handle different Leaflet versions

// --- Main Layer Class (Renamed) ---
L.CanvasLayer.WindFlowLayer = L.CanvasLayer.extend({ // Renamed from Particles
    // --- Options ---
    // NOTE: Option *names* are kept the same for compatibility with particleControls.js
    // They are specific to this WindFlowLayer instance.
    options: {
        particleCount: 2000,
        particleLineWidth: 1.0,
        particleBaseColor: '#FFFFFF',
        particleMaxAge: 200,
        geoSpeedFactor: 0.00020, // Scales geographical movement per frame
        padding: 0.1,
        idwPower: 2,
        maxInterpolationDist: 3.0,
        velocitySmoothing: 0.95, // Smoothing on U/V data itself
        nearestNeighborFactor: 0.2,
        referenceZoom: 7,
        countZoomScaleFactor: 1.8,
        ageZoomScaleFactor: 1.8,
        minCount: 50,
        maxCount: 15000,
        minAge: 20
    },

    // --- Methods (Keep internal names, they are scoped to this class instance) ---
    initialize: function (options) {
        L.setOptions(this, options);
        this._windDataPoints = [];
        this._particles = []; // Will hold WindFlowParticleElement instances
        this._animationFrameId = null;
        this._map = null;
        this._canvas = null;
        this._ctx = null;
        this._bounds = null;
        this._currentScaledMaxAge = Math.max(this.options.minAge, this.options.particleMaxAge);
        this._baseColorRGB = this._parseColor(this.options.particleBaseColor);
        // Initialize particle draw counter for logging
        console.countReset("WindFlowParticle Draw Call");
    },

    _parseColor: function(hex) {
        // Simplified hex parser (handles #FFF and #FFFFFF)
        hex = hex.replace('#', '');
        let r, g, b;
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else {
            console.warn(`WindFlowLayer: Invalid hex color '${hex}', defaulting to white.`);
            return { r: 255, g: 255, b: 255 };
        }
        return { r, g, b };
    },

    onAdd: function (map) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-wind-flow-layer leaflet-layer'); // Unique class
        const size = map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._canvas.style.opacity = 1; // Control opacity via layer options if needed later

        map.getPanes().overlayPane.appendChild(this._canvas);
        this._ctx = this._canvas.getContext('2d');

        map.on('moveend viewreset zoomstart', this._reset, this); // Use moveend, viewreset instead of move
        map.on('zoomstart', this._onZoomStart, this);
        map.on('resize', this._resize, this); // Handle map resize

        this._resetCanvasPosition(); // Set initial position
        this._reset();             // Initialize particles and start animation
    },

    onRemove: function (map) {
        this._stopAnimation(); // Stop animation loop

        map.getPanes().overlayPane.removeChild(this._canvas);
        map.off('moveend viewreset zoomstart', this._reset, this);
        map.off('zoomstart', this._onZoomStart, this);
        map.off('resize', this._resize, this);

        this._canvas = null;
        this._ctx = null;
        this._map = null;
        this._particles = [];
        this._windDataPoints = [];
    },

    setWindData: function (windDataPoints) {
        if (!Array.isArray(windDataPoints)) {
            console.error("WindFlowLayer Error: setWindData expects an array.");
            this._windDataPoints = [];
            return;
        }
        this._windDataPoints = windDataPoints;
        console.log(`WindFlowLayer: Received ${this._windDataPoints.length} wind data points.`);
        // Optional: Trigger a reset or update if needed immediately,
        // but typically the animation loop will pick up the new data.
        // If the layer is already on the map, ensure animation is running
        if (this._map && !this._animationFrameId) {
            this._startAnimation();
        }
    },

    _onZoomStart: function() {
        // Hide canvas during zoom to prevent graphical glitches/smearing
        if (this._canvas) {
            this._canvas.style.visibility = 'hidden';
        }
    },

     _resize: function(event) {
        if (!this._canvas || !event || !event.newSize) return;
        this._canvas.width = event.newSize.x;
        this._canvas.height = event.newSize.y;
        // No need to call _resetCanvasPosition here, Leaflet handles layer position on resize
        // We *do* need to reset particles because the view bounds/pixel mapping changed
        this._reset();
    },

    _resetCanvasPosition: function () {
        if (!this._map || !this._canvas) return;
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
    },

    _reset: function () {
        if (!this._map) return;

        // Make canvas visible again after zoom/moveend
        if (this._canvas) {
             this._canvas.style.visibility = 'visible';
        }


        this._resetCanvasPosition(); // Recalculate canvas position after move/zoom

        this._bounds = this._map.getBounds().pad(this.options.padding); // Recalculate bounds

        // --- Calculate Scaled Count and Age based on Zoom ---
        const currentZoom = this._map.getZoom();
        const refZoom = this.options.referenceZoom;
        const countZoomScale = Math.pow(this.options.countZoomScaleFactor, currentZoom - refZoom);
        const ageZoomScale = Math.pow(this.options.ageZoomScaleFactor, currentZoom - refZoom);

        let targetCount = Math.round(this.options.particleCount * countZoomScale);
        targetCount = Math.max(this.options.minCount, Math.min(this.options.maxCount, targetCount)); // Clamp count

        this._currentScaledMaxAge = Math.round(this.options.particleMaxAge / ageZoomScale);
        this._currentScaledMaxAge = Math.max(this.options.minAge, this._currentScaledMaxAge); // Clamp age

        console.log(`WindFlowLayer: Resetting - Zoom: ${currentZoom}, Target Count: ${targetCount}, Target Base Age: ${this._currentScaledMaxAge}`);
        // --- End Scaling Calculation ---

        this._resetParticles(targetCount, this._currentScaledMaxAge); // Reset particle positions/lifecycles

        // Restart animation if it wasn't running
        if (!this._animationFrameId) {
             this._startAnimation();
        }
    },

    _resetParticles: function(targetCount, baseMaxLife) {
        this._particles = [];
        if (!this._bounds || !this._bounds.isValid() || !this._map) {
             console.warn("WindFlowLayer: Cannot reset particles - bounds or map invalid.");
            return;
        }
        for (let i = 0; i < targetCount; i++) {
            // Create using new renamed constructor
            this._particles.push(new WindFlowParticleElement(this._bounds, baseMaxLife));
        }
         // Reset draw call counter for new set of particles
        console.countReset("WindFlowParticle Draw Call");
        console.log(`WindFlowLayer: _resetParticles created ${this._particles.length} particles.`);
    },

    _startAnimation: function () {
        if (!this._animationFrameId && this._canvas) {
            console.log("WindFlowLayer: Starting animation loop.");
            // Reset draw call counter when starting fresh
            console.countReset("WindFlowParticle Draw Call");
            this._animate();
        }
    },

    _stopAnimation: function () {
        if (this._animationFrameId) {
            console.log("WindFlowLayer: Stopping animation loop.");
            L.Util.cancelAnimFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
    },

    _animate: function () {
        if (!this._map || !this._ctx || !this._canvas) {
            this._stopAnimation(); return;
        }
        this._animationFrameId = L.Util.requestAnimFrame(this._animate, this);

        const { width, height } = this._canvas;
        const prevCompositeOp = this._ctx.globalCompositeOperation;
        // Slightly fade previous frame for trails (optional, adjust alpha)
        this._ctx.globalCompositeOperation = "destination-in";
        this._ctx.fillStyle = "rgba(0, 0, 0, 0.95)"; // Adjust alpha for trail length (0.9-0.98)
        this._ctx.fillRect(0, 0, width, height);
        this._ctx.globalCompositeOperation = prevCompositeOp; // Restore default


        if (this._windDataPoints.length === 0 || this._particles.length === 0) return;

        // --- Prepare Global Styles ---
        const lineWidth = this.options.particleLineWidth;
        const geoSpeedFactor = this.options.geoSpeedFactor;
        const baseColorRGB = this._baseColorRGB;
        const currentScaledMaxAge = this._currentScaledMaxAge;

        this._ctx.lineWidth = lineWidth;
        this._ctx.lineCap = "round";
        // --- End Prepare Global Styles ---

        // --- Process Each Particle ---
        this._particles.forEach((particle) => { // Use renamed class: WindFlowParticleElement
            // --- Particle Lifecycle & Boundary Check ---
            if (particle.life <= 0 || !this._bounds.contains([particle.lat, particle.lng])) {
                 particle.baseMaxLife = currentScaledMaxAge;
                 particle.reset();
                 return; // Skip rest for this particle this frame
            }

            // --- Calculate Target GEO Velocity ---
            const [u, v] = this._getInterpolatedWind(particle.lat, particle.lng);

            // If wind is negligible, just age particle, don't move/draw
            if (Math.abs(u) < 0.01 && Math.abs(v) < 0.01) {
                 particle.life--; // Still ages
                 particle.lastScreenPos = particle.currentScreenPos; // Update screen pos for next frame
                 try {
                    if(this._map) particle.currentScreenPos = this._map.latLngToContainerPoint([particle.lat, particle.lng]);
                 } catch(e){ particle.currentScreenPos = null;}
                 particle.lastScreenPos = null; // Break line continuity explicitly if not drawing
                 return;
            }

            const cosLat = Math.cos(particle.lat * Math.PI / 180);
            const safeCosLat = Math.max(0.1, Math.abs(cosLat)); // Avoid division by zero near poles

            // Calculate GEO change using geoSpeedFactor
            const deltaLng = (u / safeCosLat) * geoSpeedFactor;
            const deltaLat = v * geoSpeedFactor;

            // --- Store Previous Screen Position ---
             if (!particle.currentScreenPos && this._map) {
                  try {
                      particle.currentScreenPos = this._map.latLngToContainerPoint([particle.lat, particle.lng]);
                  } catch (e) { /* ignore projection error */ }
             }
            particle.lastScreenPos = particle.currentScreenPos;

            // --- Update GEO Position ---
            particle.update(deltaLat, deltaLng); // Updates lat/lng & decrements life

            // --- Calculate New Screen Position ---
            if(this._map) {
                try {
                    particle.currentScreenPos = this._map.latLngToContainerPoint([particle.lat, particle.lng]);
                } catch (e) {
                     particle.life = 0;
                     particle.currentScreenPos = null;
                     particle.lastScreenPos = null;
                }
            } else {
                 particle.currentScreenPos = null;
                 particle.lastScreenPos = null;
            }

            // --- Draw ---
            // Pass context, color. Draw method uses internal screen positions.
            // Add particle draw call counter (for debugging frequency)
            console.count("WindFlowParticle Draw Call");
            particle.draw(this._ctx, baseColorRGB);

        }); // --- End Particle Loop ---
    },

    _getInterpolatedWind: function (lat, lng) {
        if (this._windDataPoints.length === 0) return [0, 0];

        let totalWeight = 0;
        let weightedU = 0;
        let weightedV = 0;
        let closestDistSq = Infinity;
        let closestPoint = null;

        const maxDistSq = this.options.maxInterpolationDist * this.options.maxInterpolationDist;
        const power = this.options.idwPower;

        this._windDataPoints.forEach(point => {
            if (typeof point.lat !== 'number' || typeof point.lng !== 'number' || typeof point.u !== 'number' || typeof point.v !== 'number') return;

            const dLat = lat - point.lat;
            const dLng = lng - point.lng;
            const distSq = dLat * dLat + dLng * dLng;

            if (distSq < closestDistSq) {
                closestDistSq = distSq;
                closestPoint = point;
            }

            if (distSq < maxDistSq && distSq > 1e-9) { // Check within max distance and avoid self
                const weight = 1 / Math.pow(distSq, power / 2); // IDW weight
                weightedU += point.u * weight;
                weightedV += point.v * weight;
                totalWeight += weight;
            } else if (distSq <= 1e-9) { // Exactly at the point
                 weightedU = point.u;
                 weightedV = point.v;
                 totalWeight = 1;
                 return; // Exit loop early if exact match
            }
        });

        let finalU = 0;
        let finalV = 0;

        if (totalWeight > 1e-6 && closestPoint) {
            // Use weighted average if possible
             const avgU = weightedU / totalWeight;
             const avgV = weightedV / totalWeight;

             // Blend with nearest neighbor based on distance/factor
             const nearestFactor = Math.min(1, Math.sqrt(closestDistSq) / this.options.maxInterpolationDist) * this.options.nearestNeighborFactor;
             finalU = avgU * (1 - nearestFactor) + closestPoint.u * nearestFactor;
             finalV = avgV * (1 - nearestFactor) + closestPoint.v * nearestFactor;

        } else if (closestPoint) {
            // Fallback to nearest neighbor if no points were close enough for weighting
            // console.warn(`WindFlowLayer: No points within maxInterpolationDist (${this.options.maxInterpolationDist}) for [${lat.toFixed(4)}, ${lng.toFixed(4)}]. Using nearest. Dist: ${Math.sqrt(closestDistSq).toFixed(4)}`);
            finalU = closestPoint.u;
            finalV = closestPoint.v;
        }
         // Else: No points at all, returns [0, 0]

         // Apply smoothing (optional, reduces sudden changes frame-to-frame, not implemented per-particle here)
         // You could store last u/v on the particle and smooth there if desired.

        return [finalU, finalV];
    }

});

// --- Factory Function (Renamed) ---
L.canvasLayer = L.canvasLayer || {};
L.canvasLayer.windFlow = function (options) { // Renamed from particles
    return new L.CanvasLayer.WindFlowLayer(options); // Use renamed class
};

// --- END OF FILE wind-particles-unique.js ---