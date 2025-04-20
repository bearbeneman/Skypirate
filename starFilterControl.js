// --- START OF FILE starFilterControl.js ---
import * as state from './state.js';
// import * as L from 'leaflet'; // Assuming Global L is used - REMOVED IMPORT

/**
 * Custom Leaflet control for filtering sites by minimum star rating for the day,
 * using clickable star icons.
 */
export const StarFilterControl = L.Control.extend({
    options: {
        position: 'topright' // Default position
    },

    initialize: function (options, updateCallbacks) {
        L.Util.setOptions(this, options);
        this._updateCallbacks = updateCallbacks;
        this._starElements = []; // To hold references to the star icon elements
        this._container = null; // Reference to the main container
    },

    onAdd: function (map) {
        // Create main container
        const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar leaflet-control-stars'); // Use standard classes + custom
        this._container = container; // Store reference
        container.style.backgroundColor = 'rgba(255, 255, 255, 0.9)'; // Match other controls
        container.style.padding = '5px 8px';
        container.style.fontSize = '1em'; // Adjust base size if needed
        container.style.display = 'flex'; // Use flexbox for alignment
        container.style.alignItems = 'center'; // Vertically center items
        container.style.gap = '8px'; // Space between label and stars

        // --- Create Label ---
        const label = L.DomUtil.create('span', 'leaflet-control-stars-main-label', container);
        label.innerText = 'Filter Thermal Stars:';
        label.style.fontWeight = 'bold';
        label.style.fontSize = '0.9em';
        label.style.marginRight = '5px'; // Space after label text
        label.style.flexShrink = '0'; // Prevent label from shrinking

        // --- Create Star Icon Container ---
        const starContainer = L.DomUtil.create('div', 'leaflet-control-stars-icon-container', container);
        this._starElements = []; // Clear previous references if any

        // --- Create 5 clickable star icons ---
        for (let i = 0; i < 5; i++) {
            const starValue = i + 1; // Star value (1 to 5)
            const starIcon = L.DomUtil.create('i', 'leaflet-control-star-icon', starContainer);
            starIcon.dataset.value = starValue; // Store the value this star represents
            starIcon.title = `Show sites with at least ${starValue} star${starValue > 1 ? 's' : ''}`; // Tooltip

            // Add Font Awesome classes (start empty)
            starIcon.classList.add('far', 'fa-star'); // Use 'far' for regular (empty) style

            // Add click listener
            L.DomEvent.on(starIcon, 'click', this._handleStarClick, this);

            this._starElements.push(starIcon); // Store reference
        }

        // --- Create "Any" / Reset Button (Optional but Recommended) ---
        const resetButton = L.DomUtil.create('button', 'leaflet-control-stars-reset', container);
        resetButton.innerHTML = '×'; // Simple 'x' symbol
        resetButton.title = 'Show all sites (any stars)';
        resetButton.style.marginLeft = '5px'; // Space before reset
        resetButton.style.padding = '0px 4px';
        resetButton.style.lineHeight = '1';
        resetButton.style.fontSize = '1.2em';
        resetButton.style.border = '1px solid #aaa';
        resetButton.style.borderRadius = '3px';
        resetButton.style.cursor = 'pointer';
        resetButton.style.backgroundColor = '#f8f8f8';

        L.DomEvent.on(resetButton, 'click', this._handleResetClick, this);


        // Set initial state based on current state value
        this.updateControlDisplay();

        // Prevent map clicks when interacting with the control
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        return container;
    },

    onRemove: function (map) {
        // Remove event listeners
        this._starElements.forEach(starIcon => {
            L.DomEvent.off(starIcon, 'click', this._handleStarClick, this);
        });
         if (this._container) {
             const resetButton = this._container.querySelector('.leaflet-control-stars-reset');
             if (resetButton) {
                 L.DomEvent.off(resetButton, 'click', this._handleResetClick, this);
             }
         }
        this._starElements = [];
        this._container = null;
    },

    _handleStarClick: function (event) {
        const clickedValue = parseInt(event.target.dataset.value, 10);
        const currentValue = state.getSelectedMinStars();

        let newValue;
        // If clicking the same star that represents the current filter level, reset to 0
        if (clickedValue === currentValue) {
            newValue = 0;
            console.log(`Star filter reset via re-click.`);
        } else {
            newValue = clickedValue;
            console.log(`Star filter changed to: ${newValue}+`);
        }

        // Update global state
        state.setSelectedMinStars(newValue);

        // Update the visual display of stars
        this.updateControlDisplay();

        // Trigger marker update
        this._triggerUpdate();
    },

    _handleResetClick: function() {
        console.log(`Star filter reset via button.`);
        if (state.getSelectedMinStars() !== 0) {
            state.setSelectedMinStars(0);
            this.updateControlDisplay();
            this._triggerUpdate();
        }
    },

    _triggerUpdate: function() {
        // Trigger marker update using the provided callback
        if (this._updateCallbacks && typeof this._updateCallbacks.refreshMarkersOnly === 'function') {
            this._updateCallbacks.refreshMarkersOnly();
        } else {
            console.warn('StarFilterControl: refreshMarkersOnly callback is missing!');
        }
    },

    /**
     * Updates the visual appearance of the star icons based on the current state.
     */
    updateControlDisplay: function() {
        if (!this._container || this._starElements.length === 0) return;

        const currentMinStars = state.getSelectedMinStars();

        this._starElements.forEach((starIcon, index) => {
            const starValue = index + 1;
            // Remove previous styles
            starIcon.classList.remove('fas', 'far', 'active'); // 'fas' is solid, 'far' is regular/empty

            if (starValue <= currentMinStars) {
                // This star and stars before it are "active" (solid and yellow)
                starIcon.classList.add('fas', 'fa-star', 'active');
            } else {
                // This star is "inactive" (empty and gray)
                starIcon.classList.add('far', 'fa-star');
            }
        });

        // Update reset button visibility/state (optional)
        const resetButton = this._container.querySelector('.leaflet-control-stars-reset');
        if (resetButton) {
            resetButton.disabled = (currentMinStars === 0);
            resetButton.style.opacity = (currentMinStars === 0) ? '0.5' : '1';
        }
    },

    disable: function() {
        if (this._container) {
            L.DomUtil.addClass(this._container, 'disabled');
            // Disable click events on stars and button
             this._starElements.forEach(star => L.DomEvent.off(star, 'click', this._handleStarClick, this));
             const resetButton = this._container.querySelector('.leaflet-control-stars-reset');
             if (resetButton) L.DomEvent.off(resetButton, 'click', this._handleResetClick, this);
        }
    },

    enable: function() {
         if (this._container) {
            L.DomUtil.removeClass(this._container, 'disabled');
             // Re-enable click events
             this._starElements.forEach(star => L.DomEvent.on(star, 'click', this._handleStarClick, this));
             const resetButton = this._container.querySelector('.leaflet-control-stars-reset');
             if (resetButton) L.DomEvent.on(resetButton, 'click', this._handleResetClick, this);
        }
    }
});

// Factory function
export function starFilterControl(options, updateCallbacks) {
    return new StarFilterControl(options, updateCallbacks);
}
// --- END OF FILE starFilterControl.js ---