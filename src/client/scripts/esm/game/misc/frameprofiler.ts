// src/client/scripts/esm/game/misc/frameprofiler.ts

/**
 * This script keeps track of our runTime, deltaTime, FPS, and estimated monitor refresh rate.
 */

import jsutil from '../../../../../shared/util/jsutil.js';

import deltatime from './deltatime.js';

// Variables -------------------------------------------------------------

/** In millis since the start of the program (updated at the beginning of each frame). */
let runTime: number;

/** Milliseconds to average the fps over */
const fpsWindow = 1000;
/** Contains an ordered array of the timestamps of all frames over the last second */
const frames: number[] = [];
let fps = 0;
/** Estimation of the monitor's refresh rate. */
let monitorRefreshRate = 0;

// Functions ------------------------------------------------------------

function update(runtime: number): void {
	// milliseconds
	runTime = runtime;
	deltatime.update(runtime);

	frames.push(runTime);
	trimFrames();

	updateFPS();

	updateMonitorRefreshRate();
}

// Deletes frame timestamps from our list over 1 second ago
function trimFrames(): void {
	// What time was it 1 second ago
	const splitPoint = runTime - fpsWindow;

	// Use binary search to find the split point.
	const indexToSplit = jsutil.findIndexOfPointInOrganizedArray(frames, splitPoint);

	// This will not delete a timestamp if it falls exactly on the split point.
	frames.splice(0, indexToSplit);
}

function updateFPS(): void {
	fps = (frames.length * 1000) / fpsWindow;
}

// Our highest-ever fps will be the monitor's refresh rate!
function updateMonitorRefreshRate(): void {
	if (fps <= monitorRefreshRate) return;
	monitorRefreshRate = fps;
}

// Exports --------------------------------------------------------------------

export default { update };
