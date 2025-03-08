
/**
 * This script sets the preferences cookie on any request to an HTML file.
 * And it has an API for setting your preferences in the database.
 */


import { logEvents } from "../middleware/logEvents.js";
import { updateCheckmatesBeaten } from '../database/memberManager.js';


// Functions -------------------------------------------------------------

/**
 * Route that Handles a POST request to update user checkmates_beaten in the database.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function postCheckmateBeaten(req, res) {
	if (!req.memberInfo) { // { user_id, username, roles }
		logEvents("Can't save user preferences when req.memberInfo is not defined yet! Move this route below verifyJWT.", 'errLog.txt', { print: true });
		return res.status(500).json({ message: "Server Error: No Authorization"});
	}

	if (!req.memberInfo.signedIn) {
		logEvents("User tried to save preferences when they weren't signed in!", 'errLog.txt', { print: true });
		return res.status(401).json({ message: "Can't save preferences, not signed in."});
	}

	const { user_id, username } = req.memberInfo;

	const new_checkmate_beaten = req.body.new_checkmate_beaten;

	// We should probably also check here if the checkmate ID is valid ?

	const updateSuccess = updateCheckmatesBeaten(user_id, new_checkmate_beaten);

	// Send appropriate response
	if (updateSuccess) {
		console.log(`Successfully saved member "${username}" of id "${user_id}"s newly completed practice checkmate.`);
		res.status(200).json({ message: 'Serverside practice checkmate list updated successfully' });
	} else {
		logEvents(`Failed to save practice checkmate for member "${username}" id "${user_id}". No lines changed. Do they exist?`, 'errLog.txt', { print: true });
		res.status(500).json({ message: 'Failed to update serverside practice checkmate: user_id not found' });
	}
}

export {
	postCheckmateBeaten
};