// --- START OF FILE airspaceService.js ---
import * as config from './config.js';
import * as state from './state.js';

// --- Module Cache ---
let generalAirspaceText = null;
let parsedGeneralAirspace = []; // Result from openAirParse
let generalAirspaceLayers = []; // Array of Leaflet Layer objects
let dangerAreaDetails = {}; // Store details for linking: { 'DANGER_CODE': { coords: [...], details: {...} } }

let notamJson = null;
let notamLayers = []; // Array of Leaflet Layer objects

// Reference to the map instance
let mapInstance = null;

// --- Define a maximum reasonable radius in meters (e.g., 1000km) ---
const MAX_REASONABLE_RADIUS_METERS = 1000 * 1000;

// --- Initialization ---
export function initializeAirspace(map) {
    mapInstance = map;
    console.log("Airspace Service Initialized.");
}

// --- Data Fetching ---
async function fetchGeneralAirspace() {
    if (generalAirspaceText !== null) return generalAirspaceText;
    console.log("Fetching General Airspace data...");
    try {
        const response = await fetch(config.GENERAL_AIRSPACE_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        generalAirspaceText = await response.text();
        console.log("General Airspace data fetched successfully.");
        return generalAirspaceText;
    } catch (error) { console.error("Error fetching general airspace:", error); generalAirspaceText = null; throw error; }
}

async function fetchNotams() {
    if (notamJson !== null) return notamJson;
    console.log("Fetching NOTAM data...");
    try {
        const response = await fetch(config.NOTAMS_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        notamJson = await response.json();
        console.log(`Fetched ${notamJson?.length || 0} NOTAMs successfully.`);
        return notamJson;
    } catch (error) { console.error("Error fetching NOTAMs:", error); notamJson = null; throw error; }
}

// --- Parsing & Layer Creation ---
async function processGeneralAirspace() {
    if (processGeneralAirspace.processing || generalAirspaceLayers.length > 0) return;
    processGeneralAirspace.processing = true;
    try {
        const airText = await fetchGeneralAirspace(); if (!airText) { processGeneralAirspace.processing = false; return; }
        if (typeof openAirParse !== 'function') { console.error("FATAL: openAirParse function not found."); alert("Error: Airspace parsing library failed."); processGeneralAirspace.processing = false; return; }
        console.log("Parsing OpenAir data...");
        if (typeof mPolygons !== 'undefined') mPolygons = []; if (typeof mCoordList !== 'undefined') mCoordList = []; if (typeof polyDetails !== 'undefined') polyDetails = {}; if (typeof mCenter !== 'undefined') mCenter = { lat: 0, lng: 0 }; if (typeof mStep_direction !== 'undefined') mStep_direction = 1;
        parsedGeneralAirspace = openAirParse(airText); console.log(`Parsed ${parsedGeneralAirspace.length} airspace sections.`);
        generalAirspaceLayers.forEach(layer => mapInstance?.removeLayer(layer)); generalAirspaceLayers = []; dangerAreaDetails = {};
        parsedGeneralAirspace.forEach((item, index) => {
            if (!item?.coords?.length) return;
            const leafletCoords = item.coords.map(c => {
                let latVal = null, lngVal = null;
                if (c && typeof c.lat === 'function' && typeof c.lng === 'function') { latVal = c.lat(); lngVal = c.lng(); }
                else if (c && typeof c.lat === 'number' && typeof c.lng === 'number') { latVal = c.lat; lngVal = c.lng; }
                if (typeof latVal === 'number' && !isNaN(latVal) && typeof lngVal === 'number' && !isNaN(lngVal) && latVal >= -90 && latVal <= 90 && lngVal >= -180 && lngVal <= 180) { return L.latLng(latVal, lngVal); } return null;
            }).filter(coord => coord !== null);
            if (leafletCoords.length < 3) return;
            const baseAltFt = parseAltitude(item.base_alt); const ceilingAltFt = parseAltitude(item.alt_ceiling); const name = item.name || 'Unnamed Airspace'; const airspaceClass = item.class || 'Unknown'; const upperClass = airspaceClass.toUpperCase(); const upperName = name.toUpperCase(); const color = getAirspaceColor(upperClass, upperName);
            try {
                const polygon = L.polygon(leafletCoords, { color, weight: 1, opacity: 0.8, fillColor: color, fillOpacity: 0.15, base_alt: baseAltFt, ceiling_alt: ceilingAltFt, airspaceName: name, airspaceClass, originalData: item });
                const popupContent = `<b>${name} (${airspaceClass})</b><br>Floor: ${formatAltitude(baseAltFt)}<br>Ceiling: ${formatAltitude(ceilingAltFt)}`; polygon.bindPopup(popupContent); generalAirspaceLayers.push(polygon);
                if (upperClass === 'D' || upperName.startsWith('DANGER D') || upperName.startsWith('D ')) {
                    const dangerCodeMatch = upperName.match(/D\s?(\d+[A-Z]{0,2})\b/); if (dangerCodeMatch?.[1]) { const code = 'D' + dangerCodeMatch[1]; if (!dangerAreaDetails[code]) { dangerAreaDetails[code] = { coords: leafletCoords, base_alt: baseAltFt, ceiling_alt: ceilingAltFt, name, class: airspaceClass, layer: polygon }; } }
                }
            } catch (polyError) { console.error(`Error creating polygon index ${index} ("${name}"):`, polyError); }
        });
        console.log(`Created ${generalAirspaceLayers.length} General Airspace Leaflet layers.`); const storedDangerAreaKeys = Object.keys(dangerAreaDetails); console.log(`Stored details for ${storedDangerAreaKeys.length} unique Danger Area codes:`); if (storedDangerAreaKeys.length > 0 && storedDangerAreaKeys.length < 50) { console.log('Stored Keys:', storedDangerAreaKeys.sort().join(', ')); } else if (storedDangerAreaKeys.length >= 50) { console.log("(Too many keys to log)"); } else { console.log("(No Danger Area keys were stored)"); }
    } catch (error) { console.error("Error processing general airspace:", error); alert("Failed to process general airspace."); }
    finally { processGeneralAirspace.processing = false; }
}
processGeneralAirspace.processing = false;

async function processNotams() {
    if (processNotams.processing || notamLayers.length > 0) return;
    processNotams.processing = true;
    try {
        const notamData = await fetchNotams(); if (!notamData?.length) { processNotams.processing = false; return; }
        if (generalAirspaceLayers.length === 0 && !processGeneralAirspace.processing) { console.log("processNotams: Waiting for general airspace..."); await processGeneralAirspace(); }
        else if (processGeneralAirspace.processing) { console.log("processNotams: Waiting for ongoing general airspace processing..."); while (processGeneralAirspace.processing) await new Promise(resolve => setTimeout(resolve, 200)); console.log("processNotams: General airspace processing finished."); }
        notamLayers.forEach(layer => mapInstance?.removeLayer(layer)); notamLayers = [];
        notamData.forEach((notam, index) => {

            // *** ADD FILTER FOR SPECIFIC ERRONEOUS NOTAM ***
            // Check for the specific combination of coordinates and original radius string
             const isProblemNotam = (
                 notam.lat === 52.3 &&
                 notam.lng === -14.85 &&
                 String(notam.radius).trim() === "999" // Check original string value
             );

             if (isProblemNotam) {
                 console.warn(`Skipping likely erroneous NOTAM (Code: ${notam.code || 'N/A'}, Lat: ${notam.lat}, Lng: ${notam.lng}, Radius: ${notam.radius})`);
                 return; // Skip the rest of the loop for this NOTAM
             }
            // *** END FILTER ***

            let layer = null;
            const baseAltFt = parseAltitude(notam.alt_base); const ceilingAltFt = parseAltitude(notam.alt_ceiling); const details = notam.details || 'No details'; let notamCode = String(notam.code || 'Unknown').toUpperCase().trim(); const shapeType = notam.shape; const style = getNotamStyle(notamCode);
            const layerOptions = { color: style.color, weight: style.weight, opacity: style.opacity, fillColor: style.fillColor, fillOpacity: style.fillOpacity, dashArray: style.dashArray, base_alt: baseAltFt, ceiling_alt: ceilingAltFt, details, from_timestamp: notam.from_timestamp, to_timestamp: notam.to_timestamp, notamCode, shapeType, originalData: notam };

            try {
                if (shapeType === 'poly_fill' && notam.coords?.length >= 3) { layer = L.polygon(notam.coords.map(c => L.latLng(c.lat, c.lng)), layerOptions); }
                else if (shapeType === 'poly_line' && notam.coords?.length >= 2) { layer = L.polyline(notam.coords.map(c => L.latLng(c.lat, c.lng)), {...layerOptions, fill: false}); }
                else if (shapeType === 'circle' && notam.lat != null && notam.lng != null && notam.radius != null) {
                    const center = L.latLng(notam.lat, notam.lng); let radiusMeters = parseRadiusToMeters(notam.radius); let finalRadius = radiusMeters;
                    // console.log(`DEBUG: NOTAM Circle Data - Code: ${notamCode}, Lat: ${notam.lat}, Lng: ${notam.lng}, OrigRadius: "${notam.radius}", CalcMeters: ${radiusMeters}`); // Keep for now
                    if (radiusMeters > MAX_REASONABLE_RADIUS_METERS) { console.warn(`WARN: Clamping large radius (${radiusMeters}m) for NOTAM ${notamCode} to ${MAX_REASONABLE_RADIUS_METERS}m.`); finalRadius = MAX_REASONABLE_RADIUS_METERS; }
                    if (finalRadius > 0) layer = L.circle(center, { ...layerOptions, radius: finalRadius });
                }
                else if (shapeType === 'danger_area' && Array.isArray(notam.areas) && notam.areas.length > 0) {
                    let linkedCoords = null, representativeCenter = null, firstLinkedAltBase = null, firstLinkedAltCeil = null, linkedName = '', foundLink = false; let linkedDetailsObj = null;
                    for (const areaCode of notam.areas) { const cleanAreaCode = String(areaCode).toUpperCase().trim(); if (dangerAreaDetails[cleanAreaCode]) { linkedDetailsObj = dangerAreaDetails[cleanAreaCode]; if (linkedDetailsObj.coords?.length >= 3) { foundLink = true; linkedCoords = linkedDetailsObj.coords; firstLinkedAltBase = linkedDetailsObj.base_alt; firstLinkedAltCeil = linkedDetailsObj.ceiling_alt; linkedName = linkedDetailsObj.name; if (linkedDetailsObj.layer?.getBounds) representativeCenter = linkedDetailsObj.layer.getBounds().getCenter(); break; } else { console.warn(`Link found for ${cleanAreaCode}, but stored coords invalid.`); } } }
                    if (foundLink) { const finalBase = (typeof baseAltFt === 'number') ? baseAltFt : firstLinkedAltBase ?? 0; const finalCeil = (typeof ceilingAltFt === 'number') ? ceilingAltFt : firstLinkedAltCeil ?? Infinity; const daOptions = { ...layerOptions, base_alt: finalBase, ceiling_alt: finalCeil }; daOptions.details += ` (Activates: ${linkedName || notam.areas.join(', ')})`; layer = L.polygon(linkedCoords, daOptions); }
                    else { console.warn(`Danger Area NOTAM ${notamCode} (${notam.areas.join(', ')}): Could not link to valid polygon. Trying fallback...`); if (notam.lat != null && notam.lng != null && notam.radius != null) { let radiusMeters = parseRadiusToMeters(notam.radius); let finalRadius = radiusMeters; /* console.log(`DEBUG: NOTAM Fallback Circle (DA) - Code: ${notamCode}, Lat: ${notam.lat}, Lng: ${notam.lng}, OrigRadius: "${notam.radius}", CalcMeters: ${radiusMeters}`); */ if (radiusMeters > MAX_REASONABLE_RADIUS_METERS) { console.warn(`WARN: Clamping large fallback radius (${radiusMeters}m) for NOTAM ${notamCode} to ${MAX_REASONABLE_RADIUS_METERS}m.`); finalRadius = MAX_REASONABLE_RADIUS_METERS; } if (finalRadius > 0) { layer = L.circle(L.latLng(notam.lat, notam.lng), { ...layerOptions, radius: finalRadius }); console.warn(` -> Falling back to NOTAM circle for ${notamCode}.`); } else { console.warn(` -> Fallback radius invalid (${notam.radius}). Skipping.`); } } else { console.warn(` -> No fallback geometry possible for ${notamCode}. Skipping.`); } }
                }
                else { if (notam.lat != null && notam.lng != null && notam.radius != null) { let radiusMeters = parseRadiusToMeters(notam.radius); let finalRadius = radiusMeters; /* console.log(`DEBUG: NOTAM Fallback Circle (Unknown Shape) - Code: ${notamCode}, Lat: ${notam.lat}, Lng: ${notam.lng}, OrigRadius: "${notam.radius}", CalcMeters: ${radiusMeters}`); */ if (radiusMeters > MAX_REASONABLE_RADIUS_METERS) { console.warn(`WARN: Clamping large fallback radius (${radiusMeters}m) for NOTAM ${notamCode} to ${MAX_REASONABLE_RADIUS_METERS}m.`); finalRadius = MAX_REASONABLE_RADIUS_METERS; } if (finalRadius > 0) { layer = L.circle(L.latLng(notam.lat, notam.lng), { ...layerOptions, radius: finalRadius }); console.warn(`NOTAM ${notamCode} has unknown/missing shape '${shapeType}', rendering as circle.`); } else { console.warn(`NOTAM ${notamCode} has unknown/missing shape '${shapeType}', invalid fallback radius. Skipping.`); } } else if (notam.coords?.length >= 3) { layer = L.polygon(notam.coords.map(c => L.latLng(c.lat, c.lng)), layerOptions); console.warn(`NOTAM ${notamCode} has unknown/missing shape '${shapeType}', rendering as polygon.`); } }
            } catch (layerError) { console.error(`Error creating layer for NOTAM index ${index} ("${notamCode}"):`, layerError); }

            if (layer) {
                 const finalDetails = layer.options.details || 'No details'; const finalBaseAlt = layer.options.base_alt ?? null; const finalCeilingAlt = layer.options.ceiling_alt ?? null; const finalCode = layer.options.notamCode || 'Unknown'; const fromDate = layerOptions.from_timestamp ? new Date(layerOptions.from_timestamp * 1000).toLocaleString() : 'N/A'; const toDate = layerOptions.to_timestamp ? new Date(layerOptions.to_timestamp * 1000).toLocaleString() : 'Ongoing';
                 const popupContent = `<b>NOTAM (${finalCode})</b><br>Floor: ${formatAltitude(finalBaseAlt)}<br>Ceiling: ${formatAltitude(finalCeilingAlt)}<br>Active: ${fromDate} to ${toDate}<br>Details: ${finalDetails}`;
                 layer.bindPopup(popupContent); notamLayers.push(layer);
             }
        });
        console.log(`Created ${notamLayers.length} NOTAM Leaflet layers.`);
    } catch (error) { console.error("Error processing NOTAMs:", error); alert("Failed to process NOTAM data."); }
    finally { processNotams.processing = false; }
}
processNotams.processing = false;


// --- Visibility & Filtering ---
export async function updateGeneralAirspaceVisibility() {
    if (!mapInstance) return;
    if (state.isGeneralAirspaceVisible && generalAirspaceLayers.length === 0 && !processGeneralAirspace.processing) { await processGeneralAirspace(); }
    generalAirspaceLayers.forEach(layer => {
        const baseAlt = layer.options.base_alt ?? 0; const meetsAltitude = baseAlt < state.airspaceAltitudeFilter;
        if (state.isGeneralAirspaceVisible && meetsAltitude) { if (!mapInstance.hasLayer(layer)) mapInstance.addLayer(layer); }
        else { if (mapInstance.hasLayer(layer)) mapInstance.removeLayer(layer); }
    });
}

export async function updateNotamVisibility() {
    if (!mapInstance) return;
    if (state.isNotamsVisible && notamLayers.length === 0 && !processNotams.processing) { await processNotams(); }
    notamLayers.forEach(layer => {
        const baseAlt = layer.options.base_alt ?? 0; const meetsAltitude = baseAlt < state.airspaceAltitudeFilter;
        const isActive = isNotamActiveForSelectedDay(layer.options.from_timestamp, layer.options.to_timestamp, state.selectedGlobalDate);
        if (state.isNotamsVisible && meetsAltitude && isActive) { if (!mapInstance.hasLayer(layer)) mapInstance.addLayer(layer); }
        else { if (mapInstance.hasLayer(layer)) mapInstance.removeLayer(layer); }
    });
}

// --- Conflict Checking ---
export function checkSiteConflict(siteLatLng) {
    if (!siteLatLng) return false;
    const conflictAltitude = config.NOTAM_CONFLICT_CHECK_ALTITUDE_FT; let conflictFound = false;
    for (const layer of generalAirspaceLayers) { const baseAlt = layer.options.base_alt ?? 0; const airspaceClass = layer.options.airspaceClass?.toUpperCase(); const airspaceName = layer.options.airspaceName?.toUpperCase(); const isVerticallyRelevant = baseAlt < conflictAltitude; const isHazardousType = airspaceClass === 'P' || airspaceClass === 'R' || airspaceClass === 'D' || airspaceName.includes('PROHIBITED') || airspaceName.includes('RESTRICTED') || airspaceName.includes('DANGER') || ['A', 'B', 'C'].includes(airspaceClass); if (isVerticallyRelevant && isHazardousType && isPointInLayer(siteLatLng, layer)) { console.log(`Conflict: Site inside General Airspace: ${layer.options.airspaceName} (${layer.options.airspaceClass})`); conflictFound = true; break; } } if (conflictFound) return true;
     for (const layer of notamLayers) { const baseAlt = layer.options.base_alt ?? 0; const isVerticallyRelevant = baseAlt < conflictAltitude; const isActive = isNotamActiveForSelectedDay(layer.options.from_timestamp, layer.options.to_timestamp, state.selectedGlobalDate); const isConflictingType = layer.options.notamCode !== 'CANP' && !String(layer.options.notamCode).includes('ADVISORY'); if (isActive && isVerticallyRelevant && isConflictingType && isPointInLayer(siteLatLng, layer)) { console.log(`Conflict: Site inside active NOTAM: ${layer.options.notamCode}`); conflictFound = true; break; } }
    return conflictFound;
}

// --- Helper Functions ---
function parseAltitude(altString) { if (altString == null || altString === '') return null; const str = String(altString).toUpperCase().trim(); if (str === 'SFC' || str === 'GND') return 0; if (str.startsWith('FL')) { const fl = parseInt(str.replace('FL', '').trim(), 10); return isNaN(fl) ? null : fl * 100; } let cleanedStr = str.replace(/\s*(FT|FEET|ALT|AGL|AMSL)\s*$/,''); let ft = parseInt(cleanedStr, 10); if (isNaN(ft) && str.endsWith('M') && !str.includes('AMSL') && !str.includes('MSL')) { const metersStr = str.replace(/\s*M\s*$/, ''); const meters = parseInt(metersStr, 10); if (!isNaN(meters) && meters < 30000) return Math.round(meters * 3.28084); else ft = NaN; } if (isNaN(ft)) { cleanedStr = str.replace('FT', '').replace('M', ''); ft = parseInt(cleanedStr, 10); } return isNaN(ft) ? null : ft; }
function formatAltitude(altFt) { if (altFt == null) return 'N/A'; if (altFt === 0) return 'SFC'; if (altFt >= 5000 && altFt % 100 === 0) { const fl = altFt / 100; return `FL${String(fl).padStart(3, '0')}`; } return `${altFt}ft`; }
function parseRadiusToMeters(radiusString) { if (radiusString == null || radiusString === '') return config.NOTAM_CIRCLE_FALLBACK_RADIUS_M; const str = String(radiusString).toUpperCase().trim(); const numericPart = str.replace(/[^0-9.]/g, ''); const value = parseFloat(numericPart); if (isNaN(value) || value <= 0) return config.NOTAM_CIRCLE_FALLBACK_RADIUS_M; if (str.includes('NM')) return value * 1852; if (str.includes('KM')) return value * 1000; if (str.includes(' M') || str.endsWith('M')) return value; return value * 1852; }
function getAirspaceColor(upperClass, upperName) { if (upperName.includes('PROHIBITED') || upperClass === 'P') return config.AIRSPACE_PROHIBITED_COLOR; if (upperName.includes('RESTRICTED') || upperClass === 'R') return config.AIRSPACE_RESTRICTED_COLOR; if (upperName.includes('DANGER') || upperClass === 'D') return config.AIRSPACE_DANGER_COLOR; if (['A', 'B', 'C', 'CTA', 'TMA', 'CTR', 'E'].includes(upperClass) || upperName.includes('TMA') || upperName.includes('CTR') || upperName.includes('CTA')) return config.AIRSPACE_GENERAL_COLOR; return config.AIRSPACE_OTHER_COLOR; }
function getNotamStyle(notamCode) { const code = String(notamCode).toUpperCase().trim(); let style = { weight: 1.5, opacity: 0.8, fillOpacity: 0.25, color: config.NOTAM_DEFAULT_COLOR, fillColor: config.NOTAM_DEFAULT_COLOR, dashArray: null }; if (code.startsWith('P') || code.includes('PROHIBIT')) { style.color = config.AIRSPACE_PROHIBITED_COLOR; style.fillColor = config.AIRSPACE_PROHIBITED_COLOR; } else if (code.startsWith('R') || code.includes('RESTRICT')) { style.color = config.NOTAM_RESTRICTED_COLOR; style.fillColor = config.NOTAM_RESTRICTED_COLOR; } else if (code.startsWith('D') || code.includes('DANGER')) { style.color = config.NOTAM_DANGER_COLOR; style.fillColor = config.NOTAM_DANGER_COLOR; } else if (code.startsWith('W') || code.includes('WARNING') || code.includes('ALERT')) { style.color = config.NOTAM_WARNING_COLOR; style.fillColor = config.NOTAM_WARNING_COLOR; } else if (code.startsWith('TRA') || code.includes('TEMPORARY')) { style.color = config.NOTAM_RESTRICTED_COLOR; style.fillColor = config.NOTAM_RESTRICTED_COLOR; style.dashArray = '10, 5'; } return style; }
function isNotamActiveForSelectedDay(fromTimestamp, toTimestamp, selectedDateStr) { if (!selectedDateStr) return false; const fromSec = parseInt(fromTimestamp, 10); const toSec = parseInt(toTimestamp, 10); if (isNaN(fromSec)) return false; try { const dayStart = Date.UTC(parseInt(selectedDateStr.substring(0, 4)), parseInt(selectedDateStr.substring(5, 7)) - 1, parseInt(selectedDateStr.substring(8, 10)), 0, 0, 0, 0) / 1000; const dayEnd = Date.UTC(parseInt(selectedDateStr.substring(0, 4)), parseInt(selectedDateStr.substring(5, 7)) - 1, parseInt(selectedDateStr.substring(8, 10)), 23, 59, 59, 999) / 1000; if (isNaN(dayStart) || isNaN(dayEnd)) return false; const notamStart = fromSec; const notamEnd = (!isNaN(toSec) && toSec > 0 && toSec >= notamStart) ? toSec : Infinity; return notamEnd >= dayStart && notamStart <= dayEnd; } catch (e) { console.error("Error parsing date for NOTAM check:", selectedDateStr, e); return false; } }
function isPointInLayer(latlng, layer) { if (!latlng || !layer) return false; try { if (layer instanceof L.Polygon) { if (!layer.getBounds) return false; const bounds = layer.getBounds(); if (!bounds) return false; if (bounds.contains(latlng)) { /* TODO: Implement proper point-in-polygon check */ return true; } return false; } else if (layer instanceof L.Circle) { if (!layer.getLatLng || !layer.getRadius) return false; const center = layer.getLatLng(); const radius = layer.getRadius(); if (!center || radius == null || radius < 0) return false; return latlng.distanceTo(center) <= radius; } else if (layer instanceof L.Polyline) { return false; } } catch (e) { console.error("Error during isPointInLayer:", e); return false; } return false; }
// --- END OF FILE airspaceService.js ---