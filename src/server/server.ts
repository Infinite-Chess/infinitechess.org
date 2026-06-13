// src/server/server.ts

import { initDatabase } from './database/databaseTables.js';
import { initDevEnvironment } from './config/setupDev.js';
import { logEventsAndPrint, startPeriodicLogCleanup } from './middleware/logEvents.js';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

// Last-resort global handlers for errors that slipped past every local handler.
// By this point, state is broken. Can't ensure responses are sent.

// A rejected promise with no .catch (e.g. an un-awaited async
// fn call in a request handler). Logged, then we keep serving.
process.on('unhandledRejection', (reason: unknown) => {
	const detail = reason instanceof Error ? reason.stack : String(reason);
	logEventsAndPrint(`Unhandled promise rejection: ${detail}`, 'errLog.txt');
});
// A synchronous throw outside any try/catch (e.g. inside a setTimeout callback).
// It leaves the process in an undefined state, so we log and exit;
// PM2 restarts us and live games restore from the database.
process.on('uncaughtException', (error: unknown) => {
	const detail = error instanceof Error ? error.stack : String(error);
	logEventsAndPrint(`Exiting from uncaught exception: ${detail}`, 'errLog.txt').finally(() =>
		process.exit(1),
	);
});

initDatabase();
// Ensure our workspace is ready for the dev environment
initDevEnvironment();
startPeriodicLogCleanup();

// Dependancy/built-in imports
import https from 'https';
// Other imports
import app from './app.js';
import db from './database/database.js';
import socketServer from './socket/socketServer.js';
import { prepGamesForShutdown, restoreLiveGames } from './game/gamemanager/gamemanager.js';
import { getCertOptions } from './config/certOptions.js';
import { logServerStarted, logServerStopped } from './utility/startupLogger.js';
import variantcache from '../shared/chess/variants/variantcache.js';

const httpsServer = https.createServer(getCertOptions(), app);

// Keep the origin's keep-alive window above the Cloudflare tunnel's (cloudflared's default
// originRequest.keepAliveTimeout is 90s) so the origin never closes a pooled connection out from
// under the proxy just as it reuses it. Node's 5s default loses that race, surfacing as
// "Data after `Connection: close`" HTTP parse errors in errLog.txt.
// The underlying principle is the origin's keep-alive should outlast the proxy's.
httpsServer.keepAliveTimeout = 95000;

await variantcache.loadAllVariants();

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
