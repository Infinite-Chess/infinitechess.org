import { startPeriodicIntegrityCheck } from "./databaseIntegrity.js";
import { generateTables } from "./databaseTables.js";
import { migrateUsers } from "./migrateMembers.js";


function initDatabase() {
	generateTables();
	startPeriodicIntegrityCheck();
	// migrateUsers();
}

export {
	initDatabase,
};