
/**
 * This script sets the preferences cookie on any request to an HTML file.
 * And it has an API for setting your preferences in the database.
 */

import themes from "../../client/scripts/esm/components/header/themes.js";
import jsutil from "../../client/scripts/esm/util/jsutil.js";
import { getMemberDataByCriteria, updateMemberColumns } from "../database/memberManager.js";
import { logEventsAndPrint } from "../middleware/logEvents.js";


// Variables -------------------------------------------------------------


const lifetimeOfPrefsCookieMillis = 1000 * 10; // 10 seconds

const validPrefs = ['theme', 'legal_moves', 'animations', 'lingering_annotations'];
const legal_move_shapes = ['squares', 'dots'];


// Functions -------------------------------------------------------------


/**
 * Middleware to set the preferences cookie for logged-in users based on their memberInfo cookie.
 * Only sets the preferences cookie on HTML requests (requests without an origin header).
 * 
 * It is possible for the memberInfo cookie to be tampered with, but preferences can be public information anyway.
 * We are reading the memberInfo cookie instead of verifying their session token
 * because that could take a little bit longer as it requires a database look up.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The Express next middleware function.
 */
function setPrefsCookie(req, res, next) {
	if (!req.cookies) {
		logEventsAndPrint("req.cookies must be parsed before setting preferences cookie!", 'errLog.txt');
		return next();
	}

	// We don't have to worry about the request being for a resource because those have already been served.
	// The only scenario this request could be for now is an HTML or fetch API request
	// The 'is-fetch-request' header is a custom header we add on all fetch requests to let us know is is a fetch request.
	if (req.headers['is-fetch-request'] === 'true' || !req.accepts('html')) return next(); // Not an HTML request (but a fetch), don't set the cookie

	// We give everyone this cookie as soon as they login.
	// Since it is modifiable by JavaScript it's possible for them to
	// grab preferences of other users this way, but there's no harm in that.
	const memberInfoCookieStringified = req.cookies.memberInfo;
	if (memberInfoCookieStringified === undefined) return next(); // No cookie is present, not logged in

	let memberInfoCookie; // { user_id, username }
	try {
		memberInfoCookie = JSON.parse(memberInfoCookieStringified);
	} catch (error) {
		logEventsAndPrint(`memberInfo cookie was not JSON parse-able when attempting to set preferences cookie. Maybe it was tampered? The cookie: "${jsutil.ensureJSONString(memberInfoCookieStringified)}" The error: ${error.stack}`, 'errLog.txt');
		return next(); // Don't set the preferences cookie, but allow their request to continue as normal
	}

	if (typeof memberInfoCookie !== "object") {
		logEventsAndPrint(`memberInfo cookie did not parse into an object when attempting to set preferences cookie. Maybe it was tampered? The cookie: "${jsutil.ensureJSONString(memberInfoCookieStringified)}"`, 'errLog.txt');
		return next(); // Don't set the preferences cookie, but allow their request to continue as normal
	}

	const user_id = memberInfoCookie.user_id;
	if (typeof user_id !== 'number') {
		logEventsAndPrint(`memberInfo cookie user_id property was not a number when attempting to set preferences cookie. Maybe it was tampered? The cookie: "${jsutil.ensureJSONString(memberInfoCookieStringified)}"`, 'errLog.txt');
		return next(); // Don't set the preferences cookie, but allow their request to continue as normal
	}

	const preferences = getPrefs(user_id); // Fetch their preferences from the database
	if (!preferences) return next(); // No preferences set for this user, or the user doesn't exist.

	createPrefsCookie(res, preferences);
	
	// console.log(`Set preferences cookie for member "${ensureJSONString(memberInfoCookie.username)}" for url: ` + req.url);

	next();
}

/**
 * Sets the preferences cookie for the user.
 * @param {Object} res - The Express response object.
 * @param {Object} preferences - The preferences object to be saved in the cookie.
 */
function createPrefsCookie(res, preferences) {
	// Set or update the preferences cookie
	res.cookie('preferences', JSON.stringify(preferences), {
		httpOnly: false,
		secure: true,
		maxAge: lifetimeOfPrefsCookieMillis,
	});
}

/**
 * Deletes the preferences cookie for the user.
 * Typically called when they log out.
 * Even though the cookie only lasts 10 seconds, this is still helpful
 * @param {Object} res - The Express response object.
 */
function deletePreferencesCookie(res) {
	res.clearCookie('preferences', {
		httpOnly: false,
		secure: true,
	});
}

/**
 * Fetches the preferences for a given user from the database.
 * @param {number} userId - The ID of the user whose preferences are to be fetched.
 * @returns {Object|undefined} - Returns the preferences object if found, otherwise undefined.
 */
function getPrefs(userId) {
	const { preferences } = getMemberDataByCriteria(['preferences'], 'user_id', userId, { skipErrorLogging: true });
	if (preferences === undefined) return;
	const prefs = JSON.parse(preferences);
	if (prefs === null) return;
	return prefs;
}

/**
 * Route that Handles a POST request to update user preferences in the database.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function postPrefs(req, res) {
	if (!req.memberInfo) { // { user_id, username, roles }
		logEventsAndPrint("Can't save user preferences when req.memberInfo is not defined yet! Move this route below verifyJWT.", 'errLog.txt');
		return res.status(500).json({ message: "Server Error: No Authorization"});
	}

	if (!req.memberInfo.signedIn) {
		logEventsAndPrint("User tried to save preferences when they weren't signed in!", 'errLog.txt');
		return res.status(401).json({ message: "Can't save preferences, not signed in."});
	}

	const { user_id, username } = req.memberInfo;

	const preferences = req.body.preferences;

	if (!arePrefsValid(preferences)) {
		logEventsAndPrint(`Member "${username}" of id "${user_id}" tried to save invalid preferences to the database! The preferences: "${jsutil.ensureJSONString(preferences)}"`, 'errLog.txt');
		return res.status(400).json({ message: "Preferences not valid, cannot save on the server."});
	}

	// Update the preferences column in the database
	const updateSuccess = updateMemberColumns(user_id, { preferences });

	// Send appropriate response
	if (updateSuccess) {
		console.log(`Successfully saved member "${username}" of id "${user_id}"s user preferences.`);
		res.status(200).json({ message: 'Preferences updated successfully' });
	} else {
		logEventsAndPrint(`Failed to save preferences for member "${username}" id "${user_id}". No lines changed. Do they exist?`, 'errLog.txt');
		res.status(500).json({ message: 'Failed to update preferences: user_id not found' });
	}
}

/**
 * Tests if the user provided preferences are valid and OK to be saved in the database
 * @param {*} preferences - The preferences object to validate
 * @returns {boolean} - Returns true if preferences are valid, otherwise false
 */
function arePrefsValid(preferences) {
	// 1. Ensure preferences is defined, of type object, and not an array
	if (preferences === undefined || typeof preferences !== 'object' || Array.isArray(preferences)) return false;
	if (preferences === null) return true; // We can save null values.

	for (const [key, value] of Object.entries(preferences)) {
		// 2. Validate that all keys are valid preferences
		if (!validPrefs.includes(key)) return false;

		// 3. Check if the theme property is valid
		if (key === 'theme' && !themes.isThemeValid(value)) return false;

		// 4. Validate legal_moves property
		if (key === 'legal_moves' && !legal_move_shapes.includes(value)) return false;

		// 5. Check the animations property is a boolean
		if (key === 'animations' && typeof value !== 'boolean') return false;

		// 6. Check the lingering_annotations property is a boolean
		if (key === 'lingering_annotations' && typeof value !== 'boolean') return false;
	}

	// If all checks pass, preferences are valid
	return true;
}



export {
	setPrefsCookie,
	postPrefs,
	deletePreferencesCookie,
};