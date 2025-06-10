import { logEventsAndPrint } from '../middleware/logEvents.js';
import db from './database.js';
import { addUserToPlayerStatsTable } from './playerStatsManager.js';

'use strict';


/**
 * Get a list of all user_ids from the members table
 * Then for each of them, check if they already exist in the player_stats table
 * If not, then add them to it
 */
function migrateMembersToPlayerStatsTable() {
	let migrated_player_stats = 0;

	const user_ids_members = db.all('SELECT user_id FROM members').map(user => user.user_id);
	const user_ids_player_stats = db.all('SELECT user_id FROM player_stats').map(user => user.user_id);

	for (const user_id of user_ids_members) {
		if (!user_ids_player_stats.includes(user_id)) {
			const playerStatsResult = addUserToPlayerStatsTable(user_id);
			if (!playerStatsResult.success) {
				logEventsAndPrint(`Failed to add user ID "${user_id}" to player_stats table: ${playerStatsResult.reason}`, 'errLog.txt');
			} else migrated_player_stats++;
		}
	}

	console.log(`Migration of ${migrated_player_stats} members to player_stats table is completed.`);
}

export {
	migrateMembersToPlayerStatsTable
};