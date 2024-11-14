
/**
 * This script saves and sends a user's preferences when requested
 */

import themes from "../../client/scripts/esm/components/header/themes.js";
import { getMemberDataByCriteria, updateMemberColumns } from "../database/controllers/memberController.js";
import { logEvents } from "../middleware/logEvents.js";
import { ensureJSONString } from "../utility/JSONUtils.js";


// Variables -------------------------------------------------------------


const lifetimeOfPrefsCookieMillis = 1000 * 10; // 10 sconds

const validPrefs = ['theme', 'legal_moves'];
const legal_move_shapes = ['squares', 'dots'];


// Functions -------------------------------------------------------------


function setPrefsCookie(req, res, next) {
	if (!req.cookies) {
		logEvents("req.cookies must be parsed before setting preferences cookie!", 'errLog.txt', { print: true });
		return next();
	}

	if (req.headers.origin !== undefined || !req.accepts('html')) return next(); // A fetch request, but we only want to set the preferences cookie on HTML requests. HTML requests will have an origin of undefined

	// We give everyone this cookie as soon as they login.
	// Since it is modifiable by JavaScript it's possible for them to
	// grab preferences of other users this way, but there's no harm in that.
	const memberInfoCookieStringified = req.cookies.memberInfo;
	if (memberInfoCookieStringified === undefined) return next(); // No cookie is present, not logged in

	let memberInfoCookie; // { user_id, username }
	try {
		memberInfoCookie = JSON.parse(memberInfoCookieStringified);
	} catch (error) {
		logEvents(`memberInfo cookie was not JSON parse-able when attempting to set preferences cookie. Maybe it was tampered? The cookie: "${ensureJSONString(memberInfoCookieStringified)}" The error: ${error.stack}`, 'errLog.txt', { print: true });
		return next(); // Don't set the preferences cookie, but allow their request to continue as normal
	}

	if (typeof memberInfoCookie !== "object") {
		logEvents(`memberInfo cookie did not parse into an object when attempting to set preferences cookie. Maybe it was tampered? The cookie: "${ensureJSONString(memberInfoCookieStringified)}"`, 'errLog.txt', { print: true });
		return next(); // Don't set the preferences cookie, but allow their request to continue as normal
	}

	const user_id = memberInfoCookie.user_id;
	if (typeof user_id !== 'number') {
		logEvents(`memberInfo cookie user_id property was not a number when attempting to set preferences cookie. Maybe it was tampered? The cookie: "${ensureJSONString(memberInfoCookieStringified)}"`, 'errLog.txt', { print: true });
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
	const row = getMemberDataByCriteria(['preferences'], 'user_id', userId, { skipErrorLogging: true });
	if (row === undefined) return;
	const prefs = JSON.parse(row.preferences);
	if (prefs === null) return;
	return prefs;
}

/**
 * Route that Handles a POST request to update user preferences in the database.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function postPrefs(req, res) {
	if (!req.memberInfo) { // { user_id, username, roles }
		logEvents("Can't save user preferences when req.memberInfo is not defined yet! Move this route below verifyJWT.", 'errLog.txt', { print: true });
		return res.status(500).json({ message: "Server Error: No Authorization"});
	}

	if (!req.memberInfo.signedIn) return res.status(401).json({ message: "Can't save preferences, not signed in. "});

	const { user_id, username } = req.memberInfo;

	const preferences = req.body.preferences;

	if (!arePrefsValid(preferences)) {
		logEvents(`User "${username}" tried to save invalid preferences to the database! The preferences: "${ensureJSONString(preferences)}"`, 'errLog.txt', { print: true });
		return res.status(400).json({ message: "Preferences not valid, cannot save on the server."});
	}

	// Update the preferences column in the database
	const updateSuccess = updateMemberColumns(user_id, { preferences });

	// Send appropriate response
	if (updateSuccess) {
		console.log("Successfully saved user preferences");
		res.status(200).json({ message: 'Preferences updated successfully' });
	} else {
		logEvents(`Failed to save preferences for member "${username}" id "${user_id}". No lines changed. Do they exist?`, 'errLog.txt', { print: true });
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

	for (const key in preferences) {
		// 2. Validate that all keys are valid preferences
		if (!validPrefs.includes(key)) return false;

		// 3. Check if the theme property is valid
		if (key === 'theme' && !themes.isThemeValid(preferences[key])) return false;

		// 4. Validate legal_moves property
		if (key === 'legal_moves' && !legal_move_shapes.includes(preferences[key])) return false;
	}

	// If all checks pass, preferences are valid
	return true;
}



export {
	setPrefsCookie,
	postPrefs,
	deletePreferencesCookie,
};