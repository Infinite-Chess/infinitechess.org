import { startPeriodicIntegrityCheck } from "./databaseIntegrity.js";
import { generateTables } from "./databaseTables.js";
import { startPeriodicRefreshTokenCleanup } from "./deleteExpiredRefreshTokens.js";
import { startPeriodicDeleteUnverifiedMembers } from "./deleteUnverifiedMembers.js";
import { migrateUsers } from "./migrateMembers.js";


function initDatabase() {
	generateTables();
	startPeriodicIntegrityCheck();
	// migrateUsers();
	startPeriodicDeleteUnverifiedMembers();
	startPeriodicRefreshTokenCleanup();
}

export {
	initDatabase,
};