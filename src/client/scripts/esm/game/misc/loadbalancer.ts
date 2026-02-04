// src/client/scripts/esm/game/misc/loadbalancer.ts

/**
 * This script keeps track of our deltaTime, FPS, AFK status, and hibernation status.
 */

import stats from '../gui/stats.js';
import jsutil from '../../../../../shared/util/jsutil.js';
import config from '../config.js';
import invites from './invites.js';
import tabnameflash from './onlinegame/tabnameflash.js';
import { listener_document, listener_overlay } from '../chess/game.js';

// Variables -------------------------------------------------------------

/** In millis since the start of the program (updated at the beginning of each frame). */
let runTime: number;
/** Time in seconds since last animation frame */
let deltaTime: number;
let lastFrameTime: number = 0;

/** Milliseconds to average the fps over */
const fpsWindow = 1000;
/** Contains an ordered array of the timestamps of all frames over the last second */
const frames: number[] = [];
let fps = 0;
/** Estimation of the monitor's refresh rate. */
let monitorRefreshRate = 0;

let isAFK = false;
/** Milliseconds of inactivity to pause title screen animation, saving cpu. */
const timeUntilAFK = { normal: 30_000, dev: 2_000 }; // Default: 30_000
let AFKTimeoutID: number | undefined;

let isHibernating = false;
const timeUntilHibernation = 1000 * 60 * 30; // 30 minutes
// const timeUntilHibernation = 10000; // 10s for dev testing
/** ID of the timer to declare we are hibernating! */
let hibernateTimeoutID: number | undefined;

let windowIsVisible = true;

const timeToDeleteInviteAfterPageHiddenMillis = 1000 * 60 * 30; // 30 minutes
// const timeToDeleteInviteAfterPageHiddenMillis = 1000 * 10; // 10 seconds
let timeToDeleteInviteTimeoutID: number | undefined;

// Functions -------------------------------------------------------------

/** Millis since the start of the program. */
function getRunTime(): number {
	return runTime;
}

/** Returns the amount of seconds that have passed since last frame. */
function getDeltaTime(): number {
	return deltaTime;
}

function getTimeUntilAFK(): number {
	return config.DEV_BUILD ? timeUntilAFK.dev : timeUntilAFK.normal;
}

function areWeAFK(): boolean {
	return isAFK;
}

function areWeHibernating(): boolean {
	return isHibernating;
}

function isPageHidden(): boolean {
	return !windowIsVisible;
}

function update(runtime: number): void {
	// milliseconds
	updateDeltaTime(runtime);

	frames.push(runTime);
	trimFrames();

	updateFPS();

	updateMonitorRefreshRate();

	updateAFK();
}

function updateDeltaTime(runtime: number): void {
	runTime = runtime;
	deltaTime = (runTime - lastFrameTime) / 1000;
	lastFrameTime = runTime;
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
	stats.updateFPS(fps);
}

// Our highest-ever fps will be the monitor's refresh rate!
function updateMonitorRefreshRate(): void {
	if (fps <= monitorRefreshRate) return;
	monitorRefreshRate = fps;
}

function updateAFK(): void {
	if (listener_overlay.atleastOneInput() || listener_document.atleastOneInput())
		onReturnFromAFK();
}

function onReturnFromAFK(): void {
	isAFK = false;
	isHibernating = false;
	restartAFKTimer();
	restartHibernateTimer();

	// Make sure we're subbed to invites list if we're on the play page!
	invites.subscribeToInvites();
}

function restartAFKTimer(): void {
	clearTimeout(AFKTimeoutID);
	AFKTimeoutID = window.setTimeout(onAFK, getTimeUntilAFK());
}

function restartHibernateTimer(): void {
	clearTimeout(hibernateTimeoutID);
	hibernateTimeoutID = window.setTimeout(onHibernate, timeUntilHibernation);
}

function onAFK(): void {
	isAFK = true;
	AFKTimeoutID = undefined;
	//console.log("Set AFK to true!")
}

function onHibernate(): void {
	if (invites.doWeHave()) return restartHibernateTimer(); // Don't hibernate if we have an open invite AND the page is visible!
	isHibernating = true;
	hibernateTimeoutID = undefined;
	// console.log("Set hibernating to true!")

	// Unsub from invites list
	invites.unsubFromInvites();
}

// The 'focus' and 'blur' event listeners fire the MOST common, when you so much as click a different window on-screen,
// EVEN though the game is still visible on screen, it just means it lost focus!

// This fires the next most commonly, whenever
// the page becomes NOT visible on the screen no more!
// It's at the same time this fires when animation frames are no longer rendered.
// Use this listener as a giveaway that we have disconnected!

document.addEventListener('visibilitychange', function () {
	if (document.hidden) {
		windowIsVisible = false;

		// Unsub from invites list if we don't have an invite!
		// invitesweb.unsubIfWeNotHave();

		// Set a timer to delete our invite after not returning to the page!
		// THIS ALSO UNSUBS US
		// timeToDeleteInviteTimeoutID = setTimeout(websocket.unsubFromInvites, timeToDeleteInviteAfterPageHiddenMillis)
		// This ONLY cancels our invite if we have one
		timeToDeleteInviteTimeoutID = window.setTimeout(
			invites.cancel,
			timeToDeleteInviteAfterPageHiddenMillis,
		);
	} else {
		windowIsVisible = true;

		// Resub to invites list if we are on the play page and aren't already!
		// invitesweb.subscribeToInvites();

		// Cancel the timer to delete our invite after not returning to the page
		cancelTimerToDeleteInviteAfterLeavingPage();

		tabnameflash.cancelMoveSound();
	}
});

// Cancel the timer to delete our invite after not returning to the page
function cancelTimerToDeleteInviteAfterLeavingPage(): void {
	clearTimeout(timeToDeleteInviteTimeoutID);
	timeToDeleteInviteTimeoutID = undefined;
}

// Exports --------------------------------------------------------------------

export default {
	getRunTime,
	getDeltaTime,
	update,
	areWeAFK,
	areWeHibernating,
	isPageHidden,
	restartAFKTimer,
};
