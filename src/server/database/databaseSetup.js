import { startPeriodicIntegrityCheck } from "./databaseIntegrity.js";
import { generateTables } from "./databaseTables.js";


function initDatabase() {
	generateTables();
	startPeriodicIntegrityCheck();
	startPeriodicDeleteUnverifiedMembers();
}

export {
	initDatabase,
};