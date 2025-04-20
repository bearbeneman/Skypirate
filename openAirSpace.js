// const geometry = require('spherical-geometry-js');

// Global variables
const EARTH_RADIUS = 6378137;

var mCenter = {
	lat: 0,
	lng: 0
};

var mStep_direction = 1;
var mCoordList = [];
var mPolygons = [];
var polyDetails = {};

const STEP_SIZE = 1;


function openAirParse(data) {
	var lines = data.split('\n');
	var groups = groupLines(lines);
	groups.forEach(function (group) {
		group.forEach(function (cmd) {
			if (cmd.substring(0, 1) != "*") { // ignore lines starting with *
				parseCommand(cmd);
			}

		});
		plotAndReset();
	});
	return mPolygons;
}

// geometry utilities
function toDegrees(radians) {
	return radians * 180 / Math.PI;
}
function toRadians(angleDegrees) {
	return angleDegrees * Math.PI / 180.0;
}

function computeOffset(from, distance, heading, radius = EARTH_RADIUS) {
	from = convert(from);
	distance /= radius;
	heading = toRadians(heading);

	const fromLat = toRadians(from.lat());
	const cosDistance = Math.cos(distance);
	const sinDistance = Math.sin(distance);
	const sinFromLat = Math.sin(fromLat);
	const cosFromLat = Math.cos(fromLat);
	const sc = cosDistance * sinFromLat + sinDistance
		* cosFromLat * Math.cos(heading);

	return new LatLng(
		toDegrees(Math.asin(sc)),
		toDegrees(toRadians(from.lng()) + Math.atan2(sinDistance
			* cosFromLat * Math.sin(heading),
			cosDistance - sinFromLat * sc))
	);
}

function computeHeading(from, to) {
	from = convert(from); to = convert(to);
	const fromLat = toRadians(from.lat()),
		toLat = toRadians(to.lat()),
		deltaLng = toRadians(to.lng()) - toRadians(from.lng());

	const angle = toDegrees(
		Math.atan2(
			Math.sin(deltaLng) * Math.cos(toLat),
			Math.cos(fromLat) * Math.sin(toLat) -
			Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng)
		)
	);

	if (angle === 180) return angle;
	else return fmod((fmod((angle - -180), 360) + 360), 360) + -180;
}

function computeDistanceBetween(from, to, radius = EARTH_RADIUS) {
	from = convert(from); to = convert(to);
	const radFromLat = toRadians(from.lat()), radFromLng = toRadians(from.lng());
	const radToLat = toRadians(to.lat()), radToLng = toRadians(to.lng());
	return 2 * Math.asin(Math.sqrt(
		Math.pow(Math.sin((radFromLat - radToLat) / 2), 2)
		+ Math.cos(radFromLat) * Math.cos(radToLat) *
		Math.pow(Math.sin((radFromLng - radToLng) / 2), 2)
	)) * radius;
}

function convert(like, Class = LatLng) {
	if (like instanceof LatLng) return new Class(like[LAT], like[LNG]);
	else if (has(like, 'lat') && has(like, 'lng')) {
		if (typeof like.lat == 'function' && typeof like.lng == 'function') {
			return new Class(like.lat(), like.lng());
		} else {
			return new Class(parseFloat(like.lat), parseFloat(like.lng));
		}
	} else if (has(like, 'lat') && has(like, 'long')) {
		return new Class(parseFloat(like.lat), parseFloat(like.long));
	} else if (typeof like[0] === 'number' && typeof like[1] === 'number') {
		return new Class(like[1], like[0]);
	} else if (has(like, 'x') && has(like, 'y')) {
		return new Class(parseFloat(like.y), parseFloat(like.x));
	}
}

class LatLng {
	constructor(lat, lng, noWrap = false) {
		lat = parseFloat(lat);
		lng = parseFloat(lng);

		if (Number.isNaN(lat) || Number.isNaN(lng)) {
			throw TypeError('lat or lng are not numbers');
		}

		if (!noWrap) {
			//Constrain lat to -90, 90
			lat = Math.min(Math.max(lat, -90), 90);
			//Wrap lng using modulo
			lng = lng == 180 ? lng : ((lng + 180) % 360 + 360) % 360 - 180
		}

		Object.defineProperty(this, LAT, { value: lat });
		Object.defineProperty(this, LNG, { value: lng });
		this.length = 2;
	}

	/**
	 * Comparison function
	 * @param {LatLng} other
	 * @returns {boolean}
	 */
	equals(other) { return equals(this, other); }

	/**
	 * Returns the latitude in degrees.
	 * (I'd rather use getters but this is for consistency)
	 * @returns {number}
	 */
	lat() { return this[LAT]; }

	/**
	 * Returns the longitude in degrees.
	 * (I'd rather use getters but this is for consistency)
	 * @returns {number}
	 */
	lng() { return this[LNG]; }

	/** @type {number} alias for lng */
	get x() { return this[LNG] }
	/** @type {number} alias for lat */
	get y() { return this[LAT] }
	/** @type {number} alias for lng */
	get 0() { return this[LNG] }
	/** @type {number} alias for lat */
	get 1() { return this[LAT] }
	/** @type {number} alias for lng */
	get long() { return this[LNG] }

	/**
	 * Converts to JSON representation. This function is intented to be used via
	 * JSON.stringify.
	 * @returns {Object} LatLngLiteral
	 */
	toJSON() {
		return { lat: this[LAT], lng: this[LNG] };
	}

	/**
	 * Converts to string representation.
	 * @returns {string}
	 */
	toString() {
		return `(${this[LAT]}, ${this[LNG]})`;
	}

	/**
	 * Returns a string of the form "lat,lng" for this LatLng. We round the 
	 * lat/lng values to 6 decimal places by default.
	 * @param {number} [precision=6]
	 * @returns {string}
	 */
	toUrlValue(precision = 6) {
		precision = parseInt(precision);
		return this[LAT].toFixed(precision) + ',' + this[LNG].toFixed(precision);
	}
}
const fmod = (a, b) => Number((a - (Math.floor(a / b) * b)).toPrecision(8));
const has = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
const LAT = Symbol('Latitude');
const LNG = Symbol('Longitude');
// --

/**
 * Read through the lines and group everything into definition groups.
 *
 * Create an array for each group of commands and add them all to an
 * array holding all command groups.
 *
 * @param  {Array of String} lines Raw file contents
 * @return {Array[ Array of String]}      Array with line groups each in array
 */
function groupLines(lines) {
	var groups = [];
	var i = 0;

	while (i < lines.length) {
		var g = [];

		// get ready for first group by ignoring repeating blank lines
		while (i < lines.length && lines[i].trim() == '*') {
			i++;
		}

		while (i < lines.length && lines[i].trim() != '*') {
			// add all this to group g
			g.push(lines[i++]);
		}

		groups.push(g);
	}

	return groups;
}



function plotAndReset() {
	var exclude = 0;
	if(
	    polyDetails.class=="G"
	){
	    exclude = 1;
	}

	if (!polyDetails.alt_base) {
		polyDetails.alt_base = 0;
	}

	// Add the coordinates for this polygon to the master list
	if (!exclude) {
		mPolygons.push({ coords: mCoordList, base_alt: polyDetails.alt_base, alt_ceiling: polyDetails.alt_ceiling, name: polyDetails.name , class: polyDetails.class });
	}

	// Reset internal storage
	mCoordList = [];
	polyDetails = {};
}


function parseCommand(cmd) {
	// First pattern matches two groups - the main command and the rest of the line
	var pattern = /(AN|AC|AL|AT|AH|DC|DA|DP|DB|V|\*) ([\w\d\s\:\.\=\+\-\,]*)/g;
	var m = pattern.exec(cmd);

	if (m != null) {
		var command = m[1].toUpperCase();
		var rest = m[2].trim().toUpperCase();

		var pos = null;
		var radius = 0;
		var fromDeg = 0;
		var toDeg = 0;

		//console.log('command: ' + command);
		//console.log('rest: ' + rest);

		switch (command) {
			case "*":
				// Comment - do nothing
				//console.log("parseCommand: comment");
				break;

			case "AC":
				addPolyDetails("class", rest);
				// Airspace Class - expect a simple one letter argument
				//console.log("parseCommand: Airspace Class");

				// implement coloring for different airspaces
				break;

			case "AT":
				// Airspace Type - expect a type like "TMA", "CTR" etc.
				//console.log("parseCommand: Airspace Type");

				// implement coloring for different airspace type
				break;

			case "AN":
				addPolyDetails("name", rest);
				// Airport name, expect string parameter
				// not implemented yet

				//console.log("parseCommand: Airport Name: " + rest);
				break;

			case "AL":
				if (rest == "SFC") {
					rest = 0;
				}
				if (rest) {
					rest = rest.replace("ft", "");
					rest = rest.replace("ALT", "");
					rest = rest.trim();
					if (rest.substring(0, 2) == "FL") {
						rest = Number(rest.replace("FL", ""));
						rest = rest * 100;
					} else {
						rest = Number(rest);
					}
					rest = Number(rest);
					addPolyDetails("alt_base", rest);
				}
				// Altitude Low, expect a parameters like "3500 ft" or "SFC"
				// Not implemented yet

				//console.log("parseCommand: Altitude Low");
				break;

			case "AH":
				if (rest) {
					rest = rest.replace("ft", "");
					rest = rest.replace("ALT", "");
					rest = rest.trim();
					if (rest.substring(0, 2) == "FL") {
						rest = Number(rest.replace("FL", ""));
						rest = rest * 100;
					} else {
						rest = Number(rest);
					}
					rest = Number(rest);
					addPolyDetails("alt_ceiling", rest);
				}
				// Altitude High, expect a parameters like "35000ft" or "35000 ft"
				// Not implemented yet

				//console.log("parseCommand: Altitude High");
				break;

			case "DC":
				//console.log("parseCommand: Draw Circle");

				// Draw Circle command - expect an decimal argument
				radius = Math.floor(parseFloat(rest) * 1852);
				pos = null;
				if (mCenter != null) {
					for (var deg = 0; deg < 360; deg++) {
						pos = {
							lat: 1,
							lng: 1
						};
						pos = computeOffset(mCenter, radius, deg);
						addPosToCoordList(pos);
					}
				}
				break;

			case "V":

				// Variable Assignment Command
				// The pattern matches a variable name and the value argument from the rest of the line above

				//console.log("parseCommand: Variable assignment");

				var assignPattern = /([\w]+)\s*=([\s\w\d\:\.\+\-]*)/g;
				m = assignPattern.exec(rest);

				if (m != null) {
					if (m[1] == "D") {
						// Variable name D means this is a Direction assignment
						//console.log('Direction command, sign: ' + m[2]);
						if (m[2] == "+") {
							mStep_direction = 1;
						} else {
							mStep_direction = -1;
						}

					} else {
						// A position variable assignment, any variable name us supported although I have only seen X used
						//console.log('Variable assignment: ' + m[1] + ' identified, remaining arguments: ' + m[2]);

						pos = parseCoordinateString(rest);
						if (pos != null) {
							//console.log(`Setting mCenter to: (${pos.lat}, ${pos.lng})`);
							mCenter = pos;

						} else {
							// If we cannot parse this as a position, we need to look into this later
							//console.log("parseCommand: Unsupported assignment...");
							//process.exit(1);
						}

					}

				} else {
					// We did not find anything useful in the arugument string after the name

					//console.log("parseCommand: Variable argument parsing error");
				}
				break;

			case "DA":
				// Draw Arc Command
				// Pattern matches three comma separated integer aruments

				//console.log("parseCommand: Draw Arc command");

				var threeArgsPattern = /([\d]+)\s*\,\s*([\d]+)\s*\,\s*([\d]+)/g;
				m = threeArgsPattern.exec(rest);

				if (m != null) {
					radius = parseInt(m[1]) * 1852;
					fromDeg = parseInt(m[2]);
					toDeg = parseInt(m[3]);
					drawArcFromTo(radius, fromDeg, toDeg);
				} else {
					// We did not find the expected three integers in the argument string
					//console.log("parseCommand: Draw arc parameters not recognized");
				}
				break;

			case "DP":
				// Define Point Command
				// Pattern matches a potential coordinate string

				//console.log("parseCommand: Draw Point Commannd");

				var coordPattern = /([\d\:\. \w]+)/g;
				m = coordPattern.exec(rest);
				if (m != null) {
					pos = parseCoordinateString(m[1]);
					addPosToCoordList(pos);

					//console.log(`Got a coordinate: (${pos.lat}, ${pos.lng})`);
				} else {
					//console.log("parseCommand: Problem parsing DP argument");
					//process.exit(1);
				}
				break;

			case "DB":
				// Draw Between Command
				//console.log("parseCommand: Draw between command");

				// Pattern matches two possible coordinates separated by a comma
				betweenPattern = /([\d\:\. \w]+) *, *([\d\:\. \w]+)/g;
				m = betweenPattern.exec(rest);

				if (m != null) {
					var pos1 = parseCoordinateString(m[1]);
					var pos2 = parseCoordinateString(m[2]);
					//console.log(`parseCommand: Got two coordinates : \n  (${pos1.lat}, ${pos1.lng}) and\n  (${pos2.lat}, ${pos2.lng})`);

					if (pos1 != null && pos2 != null) {
						fromDeg = (computeHeading(mCenter, pos1) + 360) % 360;
						toDeg = (computeHeading(mCenter, pos2) + 360) % 360;
						radius = computeDistanceBetween(mCenter, pos1);
						drawArcFromTo(radius, fromDeg, toDeg);
					}
				} else {
					//console.log("parseCommand: Problem parsing draw between arguments");
					//process.exit(1);
				}
				break;

			default:
				//console.log("parseCommand: not recognized");
				//process.exit(1);
				break;


		} // Switch ending here

	} else {
		//console.log('problems parsing command');
		//process.exit(1);
	}
}



/**
 * Parse coordinates in the String 'openAir format.
 *
 * Uses a Regular Expression to parse the components of a coordinate string, convert into double
 * and create a LatLng object that can be used in Google Maps.
 *
 * @param coordString for example "39:29.9 N 119:46.1W" or "39 : 29:9 N 119:46 :1W" for KRNO airport
 * @return LatLng object
 */
function parseCoordinateString(coord) {
	var myRegexp =
		/([\d]+) *: *([\d]+) *[:.] *([\d])+ *([NS]) *([\d]+) *: *([\d]+) *[:.] *([\d]+) *([EW])/g;
	var m = myRegexp.exec(coord);
	var lat = 0;
	var lng = 0;

	if (m.length == 9) {

		// Given a string like "39:29.9 N 119:46.1W" we will get 8 matches:
		// "39", "29", "9", "N" and "119", "46", "1", "W" starting at index 1

		lat = parseFloat(m[1]) + parseFloat(m[2]) / 60. + parseFloat(m[3]) / 3600;
		lng = parseFloat(m[5]) + parseFloat(m[6]) / 60. + parseFloat(m[7]) / 3600;
		if (m[4].toUpperCase() == "S") lat *= -1;
		if (m[8].toUpperCase() == "W") lng *= -1;

	} else {
		//console.log("parseCoordinateString: Cannot parse coordinate String: " + coord);
		exit - 1;
	}

	return {
		lat: lat,
		lng: lng
	};
}


function addPosToCoordList(pos) {
	mCoordList.push(pos);
}

function addPolyDetails(key, value) {
	polyDetails[key] = value;
}


/**
 * Utility function producing Arc coodinates with a given radius between to headings.
 *
 * Requires a center point to be in place - will ignore command if not defined.
 *
 * @param int radius
 * @param int fromDeg
 * @param int toDeg
 */
function drawArcFromTo(radius, fromDeg, toDeg) {
	if (mCenter != null) {
		var x = 0;
		var y = 0;
		var newPos = {};
		var degrees = fromDeg;
		var step = mStep_direction * STEP_SIZE;
		do {
			newPos = computeOffset(mCenter, radius, degrees);
			addPosToCoordList(newPos);
			degrees += step;
			if (Math.abs(((degrees + 360) % 360) - toDeg) < STEP_SIZE)
				break;
		} while (true);
	}
}


/**
 * Utility function converting navigation headings to normal math angle notation.
 *
 * For example in Navigation 270 degrees is West, but in a coordinate system this is more like south.
 * Though i would need this, but will just leave it here anyway...
 *
 * @param compass navigational degrees
 * @return corodinate system degrees
 */
function compasToMathDegrees(compass) {
	return (((90 - compass) + 360) % 360);
}