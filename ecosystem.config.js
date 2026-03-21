// ecosystem.config.js

/*
 * PM2 process configuration for the Infinite Chess production server.
 */

module.exports = {
	apps: [
		{
			name: 'infinitechess',
			script: 'dist/server/server.js',
			max_restarts: 10,
			min_uptime: '10s',
		},
	],
};
