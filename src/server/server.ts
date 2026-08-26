// src/server/server.ts

/**
 * The entry point: wires up global error handlers, initializes the database and dev
 * environment, starts the HTTP/HTTPS servers and websocket server, and handles
 * graceful shutdown on SIGINT/SIGTERM/SIGUSR2.
 */

import https from 'https';

import jsutil from '../shared/util/jsutil.js';
import variantcache from '../shared/chess/variants/variantcache.js';

import db from './database/database.js';
import app from './app.js';
import logEvents from './utility/logEvents.js';
import gameRestart from './game/gamemanager/gameRestart.js';
import certOptions from './config/certOptions.js';
import socketServer from './socket/socketServer.js';
import databaseInit from './database/databaseInit.js';
import startupLogger from './utility/startupLogger.js';
import { initDevEnvironment } from './setupDev.js';

import 'dotenv/config'; // Imports all properties of process.env, if it exists

// Global Error Handlers -------------------------------------------------------

// Last-resort global handlers for errors that slipped past every local handler.
// By this point, state is broken. Can't ensure responses are sent.

// A rejected promise with no .catch (e.g. an un-awaited async
// fn call in a request handler). Logged, then we keep serving.
process.on('unhandledRejection', (reason: unknown) => {
	const detail = jsutil.getErrorStack(reason);
	logEvents.addAndPrint(`Unhandled promise rejection: ${detail}`, 'errLog');
});
// A synchronous throw outside any try/catch (e.g. inside a setTimeout callback).
// It leaves the process in an undefined state, so we log and exit;
// PM2 restarts us and live games restore from the database.
process.on('uncaughtException', (error: unknown) => {
	const detail = jsutil.getErrorStack(error);
	logEvents
		.addAndPrint(`Exiting from uncaught exception: ${detail}`, 'errLog')
		.finally(() => process.exit(1));
});

// Startup ---------------------------------------------------------------------

databaseInit.init();
// Ensure our workspace is ready for the dev environment
initDevEnvironment();
logEvents.startPeriodicLogCleanup();

const httpsServer = https.createServer(certOptions.get(), app);

// Keep the origin's keep-alive window above the Cloudflare tunnel's (cloudflared's default
// originRequest.keepAliveTimeout is 90s) so the origin never closes a pooled connection out from
// under the proxy just as it reuses it. Node's 5s default loses that race, surfacing as
// "Data after `Connection: close`" HTTP parse errors in errLog.txt.
// The underlying principle is the origin's keep-alive should outlast the proxy's.
httpsServer.keepAliveTimeout = 95000;

await variantcache.loadAllVariants();

// Restore live games from the database into memory before accepting new connections.
gameRestart.restoreLiveGames();

// Start the server
const DEV_BUILD = process.env['NODE_ENV'] === 'development';
const HTTPPORT = DEV_BUILD ? process.env['HTTPPORT_LOCAL'] : process.env['HTTPPORT'];
const HTTPSPORT = DEV_BUILD ? process.env['HTTPSPORT_LOCAL'] : process.env['HTTPSPORT'];
app.listen(HTTPPORT, () => console.log(`HTTP listening on port ${HTTPPORT}`));
httpsServer.listen(HTTPSPORT, () => {
	console.log(`HTTPS listening on port ${HTTPSPORT}`);
	startupLogger.started();
});

// WebSocket server
socketServer.start(httpsServer);

// Closing ---------------------------------------------------------------------

let cleanupDone = false;

process.on('SIGUSR2', () => handleCleanup('SIGUSR2')); // A file was saved (nodemon auto restarts)
process.on('SIGINT', () => handleCleanup('SIGINT')); // Ctrl>C was pressed (force terminates nodemon)
process.on('SIGTERM', () => handleCleanup('SIGTERM')); // PM2 graceful shutdown

/** Stops timers, persists/closes games and the database, then exits. Idempotent. */
function handleCleanup(signal: string): void {
	if (cleanupDone) return; // Sometimes this is called twice
	cleanupDone = true;
	console.log('Closing...');

	startupLogger.stopped(signal);

	gameRestart.prepForShutdown();

	db.close(); // Close the database when the server is shutting down.

	process.exit(0);
}
