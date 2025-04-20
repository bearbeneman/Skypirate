// --- START OF FILE Tracker/js/formatters.js ---

// js/formatters.js - Refactored for Integration

// **** Import main config (might still be needed for constants like units) ****
// Although formatting logic is passed in, keeping the import might be useful
// if other parts of this file (or future parts) need config values.
import * as configModule from '../../config.js';
// **** ------------------------------------------------------------- ****


// Format HH:MM:SS from seconds since midnight UTC
export function formatTimestamp(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) return "??:??:??";
    seconds = Math.max(0, seconds);
    const h = Math.floor(seconds / 3600) % 24;
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Format Date DD/MM/YYYY from YYMMDD string
export function formatDateFromIGC(d) {
    if (!d || typeof d !== 'string' || d.length !== 6) return "Invalid Date";
    const D = d.substring(0, 2);
    const M = d.substring(2, 4);
    const Y = d.substring(4, 6);
    if (!/^\d+$/.test(D) || !/^\d+$/.test(M) || !/^\d+$/.test(Y)) return "Invalid Date";
    const yearNum = parseInt(Y, 10); const dayNum = parseInt(D, 10); const monthNum = parseInt(M, 10);
    const FY = yearNum + (yearNum < 70 ? 2000 : 1900);
    if (isNaN(dayNum) || isNaN(monthNum) || isNaN(FY) || dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return "Invalid Date";
    return `${D}/${M}/${FY}`;
}

// Format Duration (e.g., 1h 05m 10s)
export function formatDuration(totalSeconds) {
    if (typeof totalSeconds !== 'number' || isNaN(totalSeconds) || totalSeconds < 0) return "N/A";
    totalSeconds = Math.round(totalSeconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    else if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    else return `${seconds}s`;
}

// Format Duration with HTML units (e.g., 1<span...>h</span>...)
export function formatDurationDetailed(totalSeconds) {
    if (typeof totalSeconds !== 'number' || isNaN(totalSeconds) || totalSeconds < 0) return "N/A";
    totalSeconds = Math.round(totalSeconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    let parts = [];
    if (hours > 0) parts.push(`${hours}<span class="fs-11">h</span>`);
    if (minutes > 0 || (hours > 0 && minutes === 0)) parts.push(`${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}<span class="fs-11">m</span>`);
    if (seconds > 0 || parts.length === 0) parts.push(`${String(seconds).padStart(minutes > 0 || hours > 0 ? 2 : 1, '0')}<span class="fs-11">s</span>`);
    return parts.join(' ') || `0<span class="fs-11">s</span>`;
}

// --- MODIFIED Formatters ---
// Now accept the getFormattedValue function directly as 'formatterFunc'
export function formatDistance(meters, targetUnit, formatterFunc) {
    if (typeof formatterFunc === 'function') {
         return formatterFunc(meters, 'distance', targetUnit);
    }
    console.warn("formatterFunc not provided to formatDistance");
    // Fallback formatting (basic km)
    if (typeof meters === 'number' && !isNaN(meters)) return `${(meters/1000).toFixed(2)} km`;
    return "N/A";
}
export function formatAltitude(meters, targetUnit, formatterFunc) {
    if (typeof formatterFunc === 'function') {
        return formatterFunc(meters, 'altitude', targetUnit);
    }
    console.warn("formatterFunc not provided to formatAltitude");
     // Fallback formatting (basic m)
     if (typeof meters === 'number' && !isNaN(meters)) return `${meters.toFixed(0)} m`;
     return "N/A";
}
export function formatSpeed(kph, targetUnit, formatterFunc) {
    if (typeof formatterFunc === 'function') {
        return formatterFunc(kph, 'speed', targetUnit);
    }
    console.warn("formatterFunc not provided to formatSpeed");
    // Fallback formatting (basic kph)
    if (typeof kph === 'number' && !isNaN(kph)) return `${kph.toFixed(1)} km/h`;
    return "N/A";
}
export function formatVario(mps, formatterFunc) {
    if (typeof formatterFunc === 'function') {
        // Pass 'm/s' as targetUnit, as the config formatter expects it for 'vario' type
        return formatterFunc(mps, 'vario', 'm/s');
    }
    console.warn("formatterFunc not provided to formatVario");
     // Fallback formatting (basic m/s)
     if (typeof mps === 'number' && !isNaN(mps)) return `${mps.toFixed(1)} m/s`;
    return "N/A";
}
// --- END MODIFIED Formatters ---

// --- END OF FILE Tracker/js/formatters.js ---