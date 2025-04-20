// --- START OF FILE searchControl.js ---
// REMOVED: import * as L from 'leaflet'; // Leaflet is globally available via <script> tag
// >>> Fuse.js is expected to be loaded globally via <script> tag <<<
import * as config from './config.js';
import * as state from './state.js';
import { debounce } from './utils.js';
import * as dataService from './dataService.js'; // Needed for getSiteData

export const SearchControl = L.Control.extend({
    options: {
        position: 'topleft',
        // --- Fuse.js Options ---
        fuseOptions: {
            keys: ['name'],          // Search only in the 'name' field
            includeScore: true,      // Include relevance score in results
            threshold: 0.4,          // Fuzziness threshold (0=exact, 1=match anything). Adjust 0.3-0.5 as needed.
            minMatchCharLength: 2,   // Minimum query length for fuzzy matching (starts searching after 2 chars)
            location: 0,             // Approx location of the expected match
            distance: 100,           // How far from 'location' accuracy decays
            // ignoreLocation: false, // Set true if matching beginning of string isn't important
            // ignoreFieldNorm: false, // Set true for potentially faster searches at cost of relevance ranking
            // useExtendedSearch: false, // Enable advanced query syntax (e.g., !term, ^term, term$)
        }
        // --- End Fuse.js Options ---
    },

    initialize: function (options, siteDataStore, updateCallbacks) {
        L.Util.setOptions(this, options);
        this._siteDataStore = siteDataStore;
        this._updateCallbacks = updateCallbacks;
        this._map = null;
        this._inputElement = null;
        this._suggestionsContainer = null;
        this._container = null;
        this._fuse = null; // To store the Fuse instance

        this._handleInput = debounce(this._performSearch.bind(this), 300); // Debounce input
        this._handleSuggestionClick = this._handleSuggestionClick.bind(this);
        this._hideSuggestions = this._hideSuggestions.bind(this);
        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handleClickOutside = this._handleClickOutside.bind(this);

        // --- Prepare data and initialize Fuse.js ---
        // Data might not be ready yet, also called in onAdd
        this._prepareFuseData();
    },

    // --- Prepare data for Fuse.js ---
    _prepareFuseData: function() {
        console.log("Search Control: Attempting to prepare Fuse data..."); // DEBUG LOG

        // Ensure Fuse global exists and siteDataStore is provided
        if (typeof Fuse === 'undefined') {
            console.warn("Search Control: Fuse is not defined globally. Ensure Fuse.js <script> tag loads BEFORE this script."); // DEBUG LOG
            return;
        }
        if (!this._siteDataStore) {
             console.warn("Search Control: siteDataStore not provided during initialization."); // DEBUG LOG
             return;
        }
         if (!(this._siteDataStore instanceof Map)) {
             console.warn("Search Control: siteDataStore is not a Map instance. Type:", typeof this._siteDataStore); // DEBUG LOG
             // Attempt to use if it's iterable, otherwise fail
             if (typeof this._siteDataStore[Symbol.iterator] !== 'function' && typeof this._siteDataStore.forEach !== 'function') {
                 console.error("Search Control: Cannot iterate over provided siteDataStore.");
                 return;
             }
         }


        console.log("Search Control: siteDataStore size:", this._siteDataStore.size ?? 'N/A (Not a Map?)'); // DEBUG LOG

        const fuseData = [];
        try {
            // Use .forEach if it's a Map, otherwise assume iterable
             const iterator = this._siteDataStore instanceof Map ? this._siteDataStore.entries() : Object.entries(this._siteDataStore);

             for (const [id, entry] of iterator) {
                // Only include sites with valid names and coordinates
                if (entry?.site?.name && typeof entry.site.lat === 'number' && typeof entry.site.lng === 'number') {
                    fuseData.push({
                        id: id, // Keep original ID
                        name: entry.site.name,
                        lat: entry.site.lat,
                        lng: entry.site.lng
                    });
                } else {
                     // Optional Log: See if any sites are being skipped
                     // console.warn(`Search Control: Skipping site ID ${id} due to missing name or coords.`, entry?.site);
                }
            }
        } catch (e) {
             console.error("Search Control: Error iterating siteDataStore:", e, this._siteDataStore); // DEBUG LOG
             return; // Stop if iteration fails
        }


        console.log(`Search Control: Prepared ${fuseData.length} items for Fuse index.`); // DEBUG LOG
        if (fuseData.length > 0) {
            console.log("Search Control: First item prepared for Fuse:", JSON.stringify(fuseData[0])); // DEBUG LOG
        }


        if (fuseData.length > 0) {
             try {
                console.log("Search Control: Initializing Fuse with options:", this.options.fuseOptions); // DEBUG LOG
                this._fuse = new Fuse(fuseData, this.options.fuseOptions);
                console.log("Search Control: Fuse.js successfully initialized.", this._fuse); // DEBUG LOG
             } catch (e) {
                 console.error("Search Control: Error initializing Fuse.js:", e); // DEBUG LOG
                 this._fuse = null; // Ensure fuse is null if init fails
             }
        } else {
            console.warn("Search Control: No valid site data found to initialize Fuse.js index."); // DEBUG LOG
            this._fuse = null; // Ensure fuse is null if no data
        }
    },

    // --- Method to update Fuse if data changes later ---
    updateSearchIndex: function() {
        console.log("Search Control: Re-indexing search data requested..."); // DEBUG LOG
        this._prepareFuseData();
    },

    onAdd: function (map) {
        this._map = map;
        const container = L.DomUtil.create('div', 'leaflet-control-search leaflet-bar');
        this._container = container;
        container.style.backgroundColor = 'white'; // Match other controls
        this._inputElement = L.DomUtil.create('input', 'leaflet-control-search-input', container);
        this._inputElement.type = 'text';
        this._inputElement.placeholder = 'Search for a site...';
        this._inputElement.setAttribute('aria-label', 'Search for a flying site');
        this._suggestionsContainer = L.DomUtil.create('div', 'leaflet-control-search-suggestions', container);
        this._suggestionsContainer.style.display = 'none';

        // Add event listeners
        L.DomEvent.on(this._inputElement, 'input', this._handleInput);
        L.DomEvent.on(this._inputElement, 'keydown', this._handleKeyDown);
        L.DomEvent.on(this._suggestionsContainer, 'click', this._handleSuggestionClick);
        // Add listener to hide suggestions when clicking outside
        document.addEventListener('click', this._handleClickOutside, true);
        // Prevent map interaction when using the control
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        // If Fuse wasn't ready during initialize (e.g., data loaded async or store was empty), try again now.
        if (!this._fuse && this._siteDataStore && (this._siteDataStore.size > 0 || Object.keys(this._siteDataStore).length > 0)) {
            console.log("Search Control: Fuse not initialized earlier, attempting now in onAdd."); // DEBUG LOG
            this._prepareFuseData();
        } else if (!this._fuse) {
             console.log("Search Control: Fuse still not initialized in onAdd (likely no data yet)."); // DEBUG LOG
        }

        return container;
    },

    onRemove: function (map) {
         if (this._inputElement) {
            L.DomEvent.off(this._inputElement, 'input', this._handleInput);
            L.DomEvent.off(this._inputElement, 'keydown', this._handleKeyDown);
        }
        if (this._suggestionsContainer) {
            L.DomEvent.off(this._suggestionsContainer, 'click', this._handleSuggestionClick);
        }
        document.removeEventListener('click', this._handleClickOutside, true);
        if (this._container) {
             L.DomUtil.removeClass(this._container, 'suggestions-visible');
        }
        this._map = null;
        this._inputElement = null;
        this._suggestionsContainer = null;
        this._container = null;
        this._fuse = null; // Clear fuse instance on removal
    },

    // --- Use Fuse.js for searching ---
    _performSearch: function() {
        console.log("Search Control: Entering _performSearch..."); // DEBUG LOG

        // Ensure Fuse instance is ready and elements exist
        if (!this._fuse) {
             console.log("Search Control: Exiting _performSearch - Fuse instance is not available."); // DEBUG LOG
             this._hideSuggestions();
             return;
        }
        if (!this._inputElement || !this._suggestionsContainer) {
            console.log("Search Control: Exiting _performSearch - Input or suggestions container missing."); // DEBUG LOG
             this._hideSuggestions();
            return;
        }


        const query = this._inputElement.value.trim(); // Don't lowercase here, Fuse handles it
        this._suggestionsContainer.innerHTML = ''; // Clear previous suggestions

        // Use minimum length from fuse options or default to 1
        const minQueryLength = this.options.fuseOptions?.minMatchCharLength || 1;
        console.log(`Search Control: Query: "${query}", Min Length: ${minQueryLength}`); // DEBUG LOG


        if (query.length < minQueryLength) {
            console.log("Search Control: Query too short, hiding suggestions."); // DEBUG LOG
            this._hideSuggestions();
            return;
        }

        try {
            console.log("Search Control: Performing Fuse search..."); // DEBUG LOG
            const results = this._fuse.search(query, { limit: 10 }); // Use Fuse search, limit results
            console.log("Search Control: Fuse search results:", results); // DEBUG LOG

            if (results.length > 0) {
                console.log(`Search Control: Found ${results.length} results, adding suggestions...`); // DEBUG LOG
                results.forEach(result => {
                    const site = result.item; // The original site object is in 'item'

                    // Double-check site data integrity in case something odd got into the index
                    if (!site || !site.name || typeof site.lat !== 'number' || typeof site.lng !== 'number' || typeof site.id === 'undefined') {
                         console.warn("Search Control: Skipping invalid item from Fuse results:", site);
                         return; // Skip this result
                    }

                    const div = L.DomUtil.create('div', '', this._suggestionsContainer);
                    div.textContent = site.name; // Use name from result.item
                    div.dataset.siteId = site.id;
                    div.dataset.lat = site.lat;
                    div.dataset.lng = site.lng;
                    div.setAttribute('role', 'option');
                    div.setAttribute('tabindex', '-1');
                    // Optional: Show score for debugging: div.title = `Score: ${result.score.toFixed(3)}`;
                     // console.log("Search Control: Added suggestion:", site.name); // DEBUG LOG (Optional)
                });
                // Only show if we actually added valid divs
                if (this._suggestionsContainer.children.length > 0) {
                     this._showSuggestions();
                } else {
                    console.log("Search Control: No valid results to show after filtering, hiding suggestions."); // DEBUG LOG
                     this._hideSuggestions();
                }
            } else {
                console.log("Search Control: No results found, hiding suggestions."); // DEBUG LOG
                this._hideSuggestions();
            }
        } catch(e) {
             console.error("Search Control: Error during Fuse search:", e); // DEBUG LOG
             this._hideSuggestions(); // Hide suggestions on error
        }
    },

    // --- Handle clicking a suggestion ---
    _handleSuggestionClick: function (event) {
         if (event.target?.dataset.siteId && this._map) {
            const siteIdString = event.target.dataset.siteId;
            const lat = parseFloat(event.target.dataset.lat);
            const lng = parseFloat(event.target.dataset.lng);
            const siteName = event.target.textContent;
            // Attempt to parse as integer, fallback to string if needed
            let siteId = parseInt(siteIdString, 10); if (isNaN(siteId)) siteId = siteIdString;


            console.log(`Search Control: Suggestion clicked: ${siteName} (ID: ${siteId}, Coords: ${lat}, ${lng})`);

            if (!isNaN(lat) && !isNaN(lng)) {
                this._map.flyTo([lat, lng], config.SEARCH_RESULT_ZOOM_LEVEL || 13, { duration: config.SEARCH_FLYTO_DURATION || 1.5 });

                // Get site data entry for marker check
                const siteEntry = dataService.getSiteData(siteId);

                 // Delay opening popup until flyTo animation likely finishes
                 setTimeout(() => {
                     // Re-fetch or use existing entry, check marker exists and is on map
                     const currentSiteEntry = dataService.getSiteData(siteId) || siteEntry;
                     if (currentSiteEntry?.marker && this._map.hasLayer(currentSiteEntry.marker)) {
                        // Close any other popup first
                        if (state.currentlyOpenPopupSiteId !== null && state.currentlyOpenPopupSiteId !== siteId) {
                            dataService.getSiteData(state.currentlyOpenPopupSiteId)?.marker?.closePopup();
                        }
                         currentSiteEntry.marker.openPopup();
                         state.setOpenPopupSiteId(siteId); // Update state
                     } else {
                         console.warn(`Search Control: Marker for site ID ${siteId} not found or not on map within timeout.`);
                     }
                 }, (config.SEARCH_FLYTO_DURATION || 1.5) * 1000 + 150); // Delay slightly longer than animation

                  // Hide calendar if a different site's calendar was open
                  if (state.selectedSiteIdForCalendar && state.selectedSiteIdForCalendar !== siteId && this._updateCallbacks?.hideCalendar) {
                    this._updateCallbacks.hideCalendar();
                  }

                // Clear input and hide suggestions
                if(this._inputElement) this._inputElement.value = '';
                this._hideSuggestions();

            } else { console.error(`Search Control: Invalid coordinates parsed for site ID: ${siteId}`); }
        }
    },

    // --- Handle keyboard events (e.g., Escape key) ---
    _handleKeyDown: function(event) {
        if (event.key === 'Escape') {
            this._hideSuggestions();
        }
        // Future: Add arrow key navigation for suggestions
    },

    // --- Handle clicks outside the control to hide suggestions ---
     _handleClickOutside: function(event) {
        if (this._container && !this._container.contains(event.target)) {
            this._hideSuggestions();
        }
    },

    // --- Show the suggestions dropdown ---
    _showSuggestions: function() {
        if (this._suggestionsContainer && this._container) {
            this._suggestionsContainer.style.display = 'block';
            // Add class to parent to potentially elevate z-index
            L.DomUtil.addClass(this._container, 'suggestions-visible');
        }
    },

    // --- Hide the suggestions dropdown ---
    _hideSuggestions: function() {
         if (this._suggestionsContainer && this._container) {
            this._suggestionsContainer.style.display = 'none';
            this._suggestionsContainer.innerHTML = ''; // Clear content when hiding
            // Remove class from parent
            L.DomUtil.removeClass(this._container, 'suggestions-visible');
        }
    },

    // --- Disable the search input ---
    disable: function() {
        if (this._inputElement) this._inputElement.disabled = true;
        if (this._container) L.DomUtil.addClass(this._container, 'disabled');
        this._hideSuggestions(); // Ensure suggestions are hidden
         console.log("Search control disabled.");
    },

    // --- Enable the search input ---
    enable: function() {
         if (this._inputElement) this._inputElement.disabled = false;
         if (this._container) L.DomUtil.removeClass(this._container, 'disabled');
          console.log("Search control enabled.");
    }
});

// Factory function to create the control
export function searchControl(options, siteDataStore, updateCallbacks) {
    return new SearchControl(options, siteDataStore, updateCallbacks);
}
// --- END OF FILE searchControl.js ---