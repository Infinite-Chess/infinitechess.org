// src/server/game/updateServerRestart.ts

/**
 * This script keeps track of the time the server will be restarting, if it is going to be.
 * This is determined by database/allowinvites.json. Whenever an invite is attempted to be
 * created, the game reads this file to see if we've made a change to it. And if so, inits a server restart.
 * The actual reading is done in src/server/game/invitesmanager
 */

import fs from 'fs';
import path from 'path';

import { readFile, writeFile } from '../utility/lockFile.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';
import { broadCastGameRestarting } from './gamemanager/gamemanager.js';
import { cancelServerRestart, setTimeServerRestarting } from './timeServerRestarts.js';

//--------------------------------------------------------------------------------------------------------

/** The path to the allowinvites.json file in the "database" */
const allowinvitesPath = path.resolve('database/allowinvites.json');
/**
 * Generates the allowinvites.json file inside the "database", on
 * initial startup, if it isn't alread
 */
(function ensureAllowInvitesFileExists(): void {
	if (fs.existsSync(allowinvitesPath)) return; // Already exists

	const content = JSON.stringify(
		{
			allowinvites: true,
			restartIn: false,
		},
		null,
		2,
	);

	fs.mkdirSync(path.dirname(allowinvitesPath), { recursive: true });
	fs.writeFileSync(allowinvitesPath, content);

	console.log('Generated allowinvites file');
})();

interface AllowInvites {
	/** Whether invites are currently allowed to be created. */
	allowinvites: boolean;
	/**
	 * If when read, this is a number, and allowinvites is false,
	 * then the server initiates a restart in that many minutes
	 * then saves the file with this value as false.
	 */
	restartIn: number | false;
}

/**
 * The allowinvites.json file in the "database". This needs to periodically be re-read
 * in order to see our changes made to it. This is typcailly
 * done when a new invite is attempted to be created.
 */
let allowinvites: AllowInvites;
try {
	allowinvites = await readFile(allowinvitesPath);
} catch (e) {
	const errMsg =
		'Unable to read allowinvites.json on startup.' +
		(e instanceof Error ? e.message : String(e));
	throw new Error(errMsg);
}
/**
 * The minimum time required between new reads of allowinvites.json.
 *
 * Typically this file is re-read every time someone generates an invite.
 */
const intervalToReadAllowinviteMillis = 5000; // 5 seconds

//--------------------------------------------------------------------------------------------------------

/**
 * Returns true if the server is about to restart.
 * This will re-read allowinvites.json if it's
 * been a little bit since it was last read.
 * @returns true if invite creation is allowed
 */
async function isServerRestarting(): Promise<boolean> {
	await updateAllowInvites();
	return !allowinvites.allowinvites;
}

/** Makes sure {@link allowinvites} is up-to-date with any changes the computer user has made. */
const updateAllowInvites = (function (): () => Promise<void> {
	/**
	 * The time, in millis since the Unix Epoch, we last read allowinvites.json to see if
	 * we've modified it to disallow new invite creation or init a server restart.
	 *
	 * Typically this file is re-read every time someone generates an invite, but we
	 * will not read it again if it has been read in the last {@link intervalToReadAllowinviteMillis}
	 */
	let timeLastReadAllowInvites = Date.now();

	return async (): Promise<void> => {
		// How long has it been since the last read?
		const timePassedMillis = Date.now() - timeLastReadAllowInvites;
		const isTimeToReadAgain = timePassedMillis >= intervalToReadAllowinviteMillis;
		if (!isTimeToReadAgain) return; // Hasn't been over 5 seconds since last read

		// console.log("Reading allowinvites.json!")

		// If this is not called with 'await', it returns a promise.
		try {
			allowinvites = await readFile(allowinvitesPath);
		} catch (e) {
			const errMsg =
				`Error locking & reading allowinvites.json after receiving a created invite: ` +
				(e instanceof Error ? e.message : String(e));
			logEventsAndPrint(errMsg, 'errLog.txt');
			console.error(
				`There was an error reading allowinvites.json. Not updating it in memory.`,
			);
			return;
		}

		timeLastReadAllowInvites = Date.now();

		// Stop server restarting if we're allowing invites again!
		if (allowinvites.allowinvites) cancelServerRestart();
		else initServerRestart(allowinvites);
	};
})();

/**
 * Call when we've read allowinvites.json and it's `allowInvites` property is false.
 * This will, if it's `restartIn` property is a number of minutes, init a server
 * restart, calculate the time the server should restart (even though we restart it manually),
 * and broadcast to all clients in a game that the server's about to restart. We only broadcast once,
 * then the clients remember the time it will restart
 * periodically informing the user when it gets closer.
 * @param {Object} newAllowInvitesValue - The newly read allowinvites.json file.
 */
async function initServerRestart(newAllowInvitesValue: AllowInvites): Promise<void> {
	// { allowInvites, restartIn: minutes }
	if (!newAllowInvitesValue.restartIn) return; // We have not changed the value to indicate we're restarting. Return.

	const now = Date.now(); // Current time in milliseconds
	// restartIn is in minutes, convert to milliseconds!
	const millisecondsUntilRestart = newAllowInvitesValue.restartIn * 60 * 1000;

	const value = now + millisecondsUntilRestart;
	setTimeServerRestarting(value);

	console.log(`Will be restarting the server in ${newAllowInvitesValue.restartIn} minutes!`);

	// Set our restartIn variable to false, so we don't repeat this next time we load the file!
	newAllowInvitesValue.restartIn = false;

	// Save the file
	try {
		await writeFile(allowinvitesPath, newAllowInvitesValue);
	} catch (e) {
		const errMsg =
			`Error locking & writing allowinvites.json after receiving a created invite! Didn't save. Retrying after at least 5 seconds when the next invite created. ` +
			(e instanceof Error ? e.message : String(e));
		logEventsAndPrint(errMsg, 'errLog.txt');
	}

	// Alert all people on the invite screen that we will be restarting soon
	// ...

	// Alert all people in a game that we will be restarting soon
	broadCastGameRestarting();
}

export { isServerRestarting };
