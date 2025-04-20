// --- START OF FILE markerFilterControl.js ---

// Ensure Leaflet is available (consider adding error handling if L is undefined)
const L = window.L;

// Define the structure for our filters
const FILTER_CATEGORIES = [
    { id: 'openSuitable',   className: 'filter-suitable',   icon: 'fa-check-circle', color: 'green',  text: 'Suitable' },
    { id: 'openUnsuitable', className: 'filter-unsuitable', icon: 'fa-times-circle', color: 'orange', text: 'Unsuitable' },
    { id: 'closed',         className: 'filter-closed',     icon: 'fa-ban',          color: 'red',    text: 'Closed' }
];

L.Control.MarkerFilter = L.Control.extend({
    options: {
        position: 'topright', // Default position
        initialState: { // Which layers are visible initially? (Matches mapService)
            openSuitable: true,
            openUnsuitable: true,
            openUnknown: true,
            closed: true
        }
    },

    initialize: function (layers, options) {
        L.setOptions(this, options);
        this._layers = layers; // Store the layer groups passed from main.js
        this._layerStates = { ...this.options.initialState }; // Track visibility state
        this._filterElements = {}; // To store references to the DOM elements
    },

    onAdd: function (map) {
        this._map = map;

        // Create main container
        const container = L.DomUtil.create('div', 'leaflet-control-marker-filter leaflet-bar');
        container.style.backgroundColor = 'white';
        container.style.padding = '5px';
        // Optional: Add a title
        // const title = L.DomUtil.create('div', 'marker-filter-title', container);
        // title.innerHTML = 'Filter Sites:';

        // Create button for each category
        FILTER_CATEGORIES.forEach(category => {
            const layerGroup = this._layers[category.id];
            if (!layerGroup) {
                console.warn(`MarkerFilterControl: Layer group for '${category.id}' not found.`);
                return; // Skip if layer group doesn't exist
            }

            const filterDiv = L.DomUtil.create('div', `marker-filter-item ${category.className}`, container);
            filterDiv.innerHTML = `<i class="fas ${category.icon}" style="color: ${category.color};"></i> ${category.text}`;
            filterDiv.title = `Toggle ${category.text} Sites`;
            filterDiv.dataset.layerId = category.id; // Store ID for easy reference

            // Set initial active state based on options/map state
            if (this._layerStates[category.id] && map.hasLayer(layerGroup)) {
                L.DomUtil.addClass(filterDiv, 'active');
            } else if (!this._layerStates[category.id] && map.hasLayer(layerGroup)) {
                // Correct mismatch if necessary (e.g., layer added externally)
                 map.removeLayer(layerGroup);
            } else if (this._layerStates[category.id] && !map.hasLayer(layerGroup)) {
                 map.addLayer(layerGroup);
                 L.DomUtil.addClass(filterDiv, 'active');
            }

            // Store element reference
            this._filterElements[category.id] = filterDiv;

            // Add click listener
            L.DomEvent.on(filterDiv, 'click', this._onFilterClick, this);
        });

        L.DomEvent.disableClickPropagation(container); // Prevent map click when clicking control
        L.DomEvent.disableScrollPropagation(container);

        return container;
    },

    onRemove: function (map) {
        // Remove event listeners if added directly (L.DomEvent handles this mostly)
        FILTER_CATEGORIES.forEach(category => {
             const filterDiv = this._filterElements[category.id];
             if (filterDiv) {
                 L.DomEvent.off(filterDiv, 'click', this._onFilterClick, this);
             }
        });
        this._map = null;
        this._filterElements = {};
    },

    _onFilterClick: function (e) {
        const clickedElement = e.currentTarget;
        const layerId = clickedElement.dataset.layerId;
        const layerGroup = this._layers[layerId];

        if (!layerGroup || !this._map) return;

        if (this._map.hasLayer(layerGroup)) {
            this._map.removeLayer(layerGroup);
            L.DomUtil.removeClass(clickedElement, 'active');
            this._layerStates[layerId] = false;
            console.log(`MarkerFilter: Removed layer '${layerId}'`);
        } else {
            this._map.addLayer(layerGroup);
            L.DomUtil.addClass(clickedElement, 'active');
            this._layerStates[layerId] = true;
             console.log(`MarkerFilter: Added layer '${layerId}'`);
        }
    }
});

// Factory function
export function markerFilterControl(layers, options) {
    return new L.Control.MarkerFilter(layers, options);
}

// --- END OF FILE markerFilterControl.js ---