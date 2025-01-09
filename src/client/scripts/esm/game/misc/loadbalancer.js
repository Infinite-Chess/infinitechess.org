
// Import Start
import websocket from '../websocket.js';
import invites from './invites.js';
import stats from '../gui/stats.js';
import input from '../input.js';
import onlinegame from './onlinegame.js';
import jsutil from '../../util/jsutil.js';
import config from '../config.js';
// Import End

'use strict';

/**
 * This script keeps track of our deltaTime, FPS
 * and decides how many milliseconds per frame
 * large tasks like mesh generation receive.
 * 
 * This currently does NOT decrease dedicated ms when MULTIPLE long tasks are running.
 * Currently the only long task is the mesh generation of all the pieces
 * (the checkmate algorithm is no longer asynchronious)
 */

let runTime; // In millis since the start of the program (updated at the beginning of each frame)
let deltaTime; // Time in millis since last animation frame
let lastFrameTime = 0;

let lastAnimationLength = 0; // Time in millis last frame loop took to execute (Should be LESS than deltaTime if computer is able to keep up with monitor frefresh rate)

const fpsWindow = 1000; // Milliseconds to average the fps over
const frames = []; // Contains an ordered array of the timestamps of all frames over the last second
let fps = 0;
let monitorRefreshRate = 0;
let idealTimePerFrame = 0;

let timeForLongTasks = 0;
const minLongTaskRatio = 1; // Minimum ratio of longTaskDedicatedTime : renderTime. 1 will give them equal time. 0.5 will give long tasks half as much time as rendering.
const damping = 1; // Amount of millis to subtract from the calculate timeForLongTasks to allow for the extra time between functions to allow 60fps


// Amount of time lapsed between connections to the server.  Lower = Less lag but greater server cost.
const refreshPeriod = 1000; // Milliseconds
const stayConnectedPeriod = 5000;
const refreshPeriodAFK = 5000; // 5_000 = 5 seconds

let isAFK = false;
const timeUntilAFK = { normal: 30000, dev: 2000 }; // Seconds of inactivity to pause title screen animation, saving cpu   default: 30
let AFKTimeoutID;

let isHibernating = false;
const timeUntilHibernation = 1000 * 60 * 30; // 30 minutes
// const timeUntilHibernation = 10000; // 10s for dev testing
let hibernateTimeoutID; // ID of the timer to declare we are hibernating!

let windowIsVisible = true;

const timeToDeleteInviteAfterPageHiddenMillis = 1000 * 60 * 30; // 30 minutes
// const timeToDeleteInviteAfterPageHiddenMillis = 1000 * 10; // 10 seconds
let timeToDeleteInviteTimeoutID;

// Set to true when you need to force-calculate the mesh or legal move searching.
// This will stop spreading it accross multiple frames and instead do it as fast as possible.
let forceCalc = false;



// Millis since the start of the program
function getRunTime() {
	return runTime;
}

function getDeltaTime() {
	return deltaTime;
}

function getTimeUntilAFK() {
	return config.DEV_BUILD ? timeUntilAFK.dev : timeUntilAFK.normal;
}

function gisAFK() {
	return isAFK;
}

function gisHibernating() {
	return isHibernating;
}

function isPageHidden() {
	return !windowIsVisible;
}

function update(runtime) { // milliseconds
	updateDeltaTime(runtime);

	frames.push(runTime);
	trimFrames();

	updateFPS();

	updateMonitorRefreshRate();

	updateAFK();
}

function updateDeltaTime(runtime) {
	runTime = runtime;
	deltaTime = (runTime - lastFrameTime) / 1000;
	lastFrameTime = runTime;
}

// Deletes frame timestamps from out list over 1 second ago
function trimFrames() {
	// What time was it 1 second ago
	const splitPoint = runTime - fpsWindow;

	// Use binary search to find the split point.
	const indexToSplit = jsutil.binarySearch_findValue(frames, splitPoint);

	// This will not delete a timestamp if it falls exactly on the split point.
	frames.splice(0, indexToSplit);
}

function updateFPS() {
	fps = frames.length * 1000 / fpsWindow;
	stats.updateFPS(fps);
}

// Our highest-ever fps will be the monitor's refresh rate!
function updateMonitorRefreshRate() {
	if (fps <= monitorRefreshRate) return;

	monitorRefreshRate = fps;
	recalcIdealTimePerFrame();
}

function recalcIdealTimePerFrame() {
	idealTimePerFrame = 1000 / monitorRefreshRate;
}

function getLongTaskTime() {
	return timeForLongTasks;
}

// Calculates the amount of time this frame took to render.
function timeAnimationFrame() {
	// How much time did this frame take?
	lastAnimationLength = performance.now() - runTime; // Update before calling updateTimeForLongTasks()

	updateTimeForLongTasks(); // Call after updating lastAnimationLength
}

function updateTimeForLongTasks() {

	// How much time should we dedicate to long tasks?

	// What I WANT to do, is try to obtain 60fps (or our refresh rate),
	// but make sure we're atleast spending as much time on long tasks as we are rendering!

	// How much time do we have left this frame after rendering until the next animation frame?
	timeForLongTasks = idealTimePerFrame - lastAnimationLength - damping;

	// Atleast spend as much time on long tasks as rendering
	const minTime = lastAnimationLength * minLongTaskRatio;
	timeForLongTasks = Math.max(timeForLongTasks, minTime);
	timeForLongTasks = Math.min(timeForLongTasks, idealTimePerFrame); // The time should never exceed a threshold

	// console.log(`This frame took ${lastAnimationLength} ms`)
	// console.log(`Reserving ${timeForLongTasks} ms for long tasks!`)
}

function updateAFK() {
	if (activityThisFrame()) onReturnFromAFK();
}

// Returns true if there's been an user input this frame
function activityThisFrame() {
	return input.atleast1InputThisFrame();
}

function onReturnFromAFK() {
	isAFK = false;
	isHibernating = false;
	restartAFKTimer();
	restartHibernateTimer();

	// Make sure we're subbed to invites list if we're on the play page!
	invites.subscribeToInvites();
}

function restartAFKTimer() {
	clearTimeout(AFKTimeoutID);
	AFKTimeoutID = setTimeout(onAFK, getTimeUntilAFK());
}

function restartHibernateTimer() {
	clearTimeout(hibernateTimeoutID);
	hibernateTimeoutID = setTimeout(onHibernate, timeUntilHibernation);
}

function onAFK() {
	isAFK = true;
	AFKTimeoutID = undefined;
	//console.log("Set AFK to true!")
}

function onHibernate() {
	if (invites.doWeHave()) return restartHibernateTimer(); // Don't hibernate if we have an open invite AND the page is visible!
	isHibernating = true;
	hibernateTimeoutID = undefined;
	//console.log("Set hibernating to true!")

	// Unsub from invites list
	websocket.unsubFromInvites();
}


// The 'focus' and 'blur' event listeners fire the MOST common, when you so much as click a different window on-screen,
// EVEN though the game is still visible on screen, it just means it lost focus!


// This fires the next most commonly, whenever
// the page becomes NOT visible on the screen no more!
// It's at the same time this fires when animation frames are no longer rendered.
// Use this listener as a giveaway that we have disconnected!

document.addEventListener("visibilitychange", function() {
	if (document.hidden) {
		windowIsVisible = false;

		// Unsub from invites list if we don't have an invite!
		// invitesweb.unsubIfWeNotHave();

		// Set a timer to delete our invite after not returning to the page!
		// THIS ALSO UNSUBS US
		// timeToDeleteInviteTimeoutID = setTimeout(websocket.unsubFromInvites, timeToDeleteInviteAfterPageHiddenMillis)
		// This ONLY cancels our invite if we have one
		timeToDeleteInviteTimeoutID = setTimeout(invites.cancel, timeToDeleteInviteAfterPageHiddenMillis);

	} else {
		windowIsVisible = true;

		// Resub to invites list if we are on the play page and aren't already!
		// invitesweb.subscribeToInvites();

		// Cancel the timer to delete our invite after not returning to the page
		cancelTimerToDeleteInviteAfterLeavingPage();

		onlinegame.cancelMoveSound();
	}
});

// Cancel the timer to delete our invite after not returning to the page
function cancelTimerToDeleteInviteAfterLeavingPage() {
	clearTimeout(timeToDeleteInviteTimeoutID);
	timeToDeleteInviteTimeoutID = undefined;
}

function getForceCalc() {
	return forceCalc;
}

function setForceCalc(value) {
	forceCalc = value;
}

export default {
	getRunTime,
	getDeltaTime,
	update,
	getLongTaskTime,
	timeAnimationFrame,
	refreshPeriod,
	refreshPeriodAFK,
	stayConnectedPeriod,
	gisAFK,
	gisHibernating,
	isPageHidden,
	getForceCalc,
	setForceCalc,
};