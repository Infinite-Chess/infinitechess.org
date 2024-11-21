import { startPeriodicIntegrityCheck } from "./databaseIntegrity.js";
import { generateTables } from "./databaseTables.js";
import { startPeriodicDeleteUnverifiedMembers } from "./deleteUnverifiedMembers.js";
import { migrateUsers } from "./migrateMembers.js";


function initDatabase() {
	generateTables();
	startPeriodicIntegrityCheck();
	startPeriodicDeleteUnverifiedMembers();
	// migrateUsers();
}

export {
	initDatabase,
};