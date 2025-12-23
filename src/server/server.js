// src/server/server.js

import 'dotenv/config'; // Imports all properties of process.env, if it exists

import { initDatabase } from './database/databaseTables.js';
initDatabase();
// Ensure our workspace is ready for the dev environment
import { initDevEnvironment } from './config/setupDev.js';
initDevEnvironment();

// Dependancy/built-in imports
import express from 'express';
import https from 'https';
import ejs from 'ejs';
// Other imports
import configureMiddleware from './middleware/middleware.js';
import db from './database/database.js';
import getCertOptions from './config/certOptions.js';
import { initTranslations } from './config/setupTranslations.js';
import { logAllGames } from './game/gamemanager/gamemanager.js';
import socketServer from './socket/socketServer.js';

const app = express();

// This ensures that req.ip will give us the real user's IP instead of the Cloudflare proxy's IP.
app.set('trust proxy', 1); // '1' means trust the first proxy hop (Cloudflare)

// Initiate translations
initTranslations();

// Set EJS as the view engine
app.engine('html', ejs.renderFile);
app.set('view engine', 'html');

const httpsServer = https.createServer(getCertOptions(), app);
app.disable('x-powered-by'); // This removes the 'x-powered-by' header from all responses.
configureMiddleware(app); // Setup the middleware waterfall

// Start the server
const DEV_BUILD = process.env.NODE_ENV === 'development';
const HTTPPORT = DEV_BUILD ? process.env.HTTPPORT_LOCAL : process.env.HTTPPORT;
const HTTPSPORT = DEV_BUILD ? process.env.HTTPSPORT_LOCAL : process.env.HTTPSPORT;
app.listen(HTTPPORT, () => console.log(`HTTP listening on port ${HTTPPORT}`));
httpsServer.listen(HTTPSPORT, () => console.log(`HTTPS listening on port ${HTTPSPORT}`));

// WebSocket server
socketServer.start(httpsServer);

// On closing...

let cleanupDone = false;
process.on('SIGUSR2', async () => {
	await handleCleanup('SIGUSR2');
}); // A file was saved (nodemon auto restarts)
process.on('SIGINT', async () => {
	await handleCleanup('SIGINT');
}); // Ctrl>C was pressed (force terminates nodemon)
async function handleCleanup(_signal) {
	if (cleanupDone) return; // Sometimes this is called twice
	cleanupDone = true;
	// console.log(`\nReceived ${signal}. Cleaning up...`);
	console.log('Closing...');

	await logAllGames();

	db.close(); // Close the database when the server is shutting down.

	process.exit(0);
}
