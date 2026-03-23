// src/server/server.ts

import { initDatabase } from './database/databaseTables.js';
import { initDevEnvironment } from './config/setupDev.js';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

initDatabase();
// Ensure our workspace is ready for the dev environment
initDevEnvironment();

// Dependancy/built-in imports
import https from 'https';
// Other imports
import app from './app.js';
import db from './database/database.js';
import socketServer from './socket/socketServer.js';
import { prepGamesForShutdown, restoreLiveGames } from './game/gamemanager/gamemanager.js';
import { getCertOptions } from './config/certOptions.js';
import { logServerStarted, logServerStopped } from './utility/startupLogger.js';

const httpsServer = https.createServer(getCertOptions(), app);

// Restore live games from the database into memory before accepting new connections.
restoreLiveGames();

// Start the server
const DEV_BUILD = process.env['NODE_ENV'] === 'development';
const HTTPPORT = DEV_BUILD ? process.env['HTTPPORT_LOCAL'] : process.env['HTTPPORT'];
const HTTPSPORT = DEV_BUILD ? process.env['HTTPSPORT_LOCAL'] : process.env['HTTPSPORT'];
app.listen(HTTPPORT, () => console.log(`HTTP listening on port ${HTTPPORT}`));
httpsServer.listen(HTTPSPORT, () => {
	console.log(`HTTPS listening on port ${HTTPSPORT}`);
	logServerStarted();
});

// WebSocket server
socketServer.start(httpsServer);

// On closing...

let cleanupDone = false;
process.on('SIGUSR2', () => handleCleanup('SIGUSR2')); // A file was saved (nodemon auto restarts)
process.on('SIGINT', () => handleCleanup('SIGINT')); // Ctrl>C was pressed (force terminates nodemon)
process.on('SIGTERM', () => handleCleanup('SIGTERM')); // PM2 graceful shutdown
function handleCleanup(signal: string): void {
	if (cleanupDone) return; // Sometimes this is called twice
	cleanupDone = true;
	// console.log(`\nReceived ${signal}. Cleaning up...`);
	console.log('Closing...');

	logServerStopped(signal);

	prepGamesForShutdown();

	db.close(); // Close the database when the server is shutting down.

	process.exit(0);
}
