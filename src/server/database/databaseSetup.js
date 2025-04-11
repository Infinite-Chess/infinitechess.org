import { startPeriodicIntegrityCheck } from "./databaseIntegrity.js";
import { generateTables } from "./databaseTables.js";
import { startPeriodicRefreshTokenCleanup } from "./deleteExpiredRefreshTokens.js";
import { startPeriodicDeleteUnverifiedMembers } from "./deleteUnverifiedMembers.js";
import { migrateUsers, migrateMembersToPlayerStatsAndRatingsTables } from "./migrateMembers.js";
import gamelogger from '../game/gamemanager/gamelogger.js';
import ensureCheckmatesBeatenColumn from "./ensureCheckmatesBeatenColumn.js";


function initDatabase() {
	generateTables();
	startPeriodicIntegrityCheck();
	// migrateUsers();
	migrateMembersToPlayerStatsAndRatingsTables();
	gamelogger.migrateGameLogsToDatabase();
	startPeriodicDeleteUnverifiedMembers();
	startPeriodicRefreshTokenCleanup();
}

export {
	initDatabase,
};