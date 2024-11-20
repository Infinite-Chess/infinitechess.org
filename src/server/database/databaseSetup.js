import { startPeriodicIntegrityCheck } from "./databaseIntegrity.js";
import { generateTables } from "./databaseTables.js";
import copy from "./copyMembersJson.js";


function initDatabase() {
	generateTables();
	startPeriodicIntegrityCheck();
	copy.migrateUsers();
}

export {
	initDatabase,
};