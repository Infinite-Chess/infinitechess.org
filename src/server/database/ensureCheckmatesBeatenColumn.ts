
/**
 * THIS SCRIPT MAY BE DELETED AFTER THE NEXT update!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * 
 * This makes sure the member table has the new checkmates_beaten column.
 */

// @ts-ignore
import database from "./database.js";

// Use synchronous query execution since better-sqlite3 doesn't use callbacks
const rows = database.all(`PRAGMA table_info(members);`);

const columnExists = rows.some((row: { name: string }) => row.name === 'checkmates_beaten');

if (!columnExists) {
	try {
		database.run(`ALTER TABLE members ADD COLUMN checkmates_beaten TEXT NOT NULL DEFAULT '';`);
		console.log('Column checkmates_beaten added successfully.');
	} catch (err: any) {
		// console.error('Error adding checkmates_beaten column:', err.message);
	}
} else {
	// console.log('Column checkmates_beaten already exists.');
}

export default {};