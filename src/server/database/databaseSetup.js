import { startPeriodicIntegrityCheck } from "./databaseIntegrity.js";
import { generateTables } from "./databaseTables.js";
import { startPeriodicDeleteUnverifiedMembers } from "./deleteUnverifiedMembers.js";


function initDatabase() {
	generateTables();
	startPeriodicIntegrityCheck();
	startPeriodicDeleteUnverifiedMembers();
}

export {
	initDatabase,
};