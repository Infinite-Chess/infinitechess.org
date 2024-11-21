import style from "./style.js";
import moveutil from "../../chess/util/moveutil.js";
import onlinegame from "../misc/onlinegame.js";
import sound from "../misc/sound.js";
import clockutil from "../../chess/util/clockutil.js";
import gamefileutility from "../../chess/util/gamefileutility.js";

/**
 * @typedef {import('../../chess/logic/gamefile.js').gamefile} gamefile
 */

const element_timers = {
	white: {
		timer: document.getElementById('timer-white'),
		container: document.getElementById('timer-container-white'),
	},
	black: {
		timer: document.getElementById('timer-black'),
		container: document.getElementById('timer-container-black')
	}
};

/** All variables related to the lowtime tick notification at 1 minute remaining. */
const lowtimeNotif = {
	/** Contains the colors that have had the ticking sound play */
	colorsNotified: new Set(),
	/** The timer that, when ends, will play the lowtime ticking audio cue. */
	timeoutID: undefined,
	/** The amount of milliseconds before losing on time at which the lowtime tick notification will be played. */
	timeToStartFromEnd: 65615,
	/** The minimum start time required to give a lowtime notification at 1 minute remaining. */
	clockMinsRequiredToUse: 2,
};
/** All variables related to the 10s countdown when you're almost out of time. */
const countdown = {
	drum: {
		timeoutID: undefined,
	},
	tick: {
		/**
         * The current sound object, if specified, that is playing our tick sound effects right before the 10s countdown.
         * This can be used to stop the sound from playing.
         */
		sound: undefined,
		timeoutID: undefined,
		timeToStartFromEnd: 15625,
		fadeInDuration: 300,
		fadeOutDuration: 100,
	},
	ticking: {
		/**
         * The current sound object, if specified, that is playing our ticking sound effects during the 10s countdown.
         * This can be used to stop the sound from playing.
         */
		sound: undefined,
		timeoutID: undefined,
		timeToStartFromEnd: 10380,
		fadeInDuration: 300,
		fadeOutDuration: 100,
	},
};


function hideClocks() {
	for (const color in element_timers) {
		style.hideElement(element_timers[color].container);
	}
}

function showClocks() {
	for (const color in element_timers) {
		style.revealElement(element_timers[color].container);
	}
}

/**
 * Stops clock sounds and removes all borders
 */
function stopClocks(gamefile) {
	clearTimeout(lowtimeNotif.timeoutID);
	clearTimeout(countdown.ticking.timeoutID);
	clearTimeout(countdown.tick.timeoutID);
	clearTimeout(countdown.drum.timeoutID);
	countdown.ticking.sound?.fadeOut(countdown.ticking.fadeOutDuration);
	countdown.tick.sound?.fadeOut(countdown.tick.fadeOutDuration);
	countdown.drum.timeoutID = undefined;
	countdown.tick.sound = undefined;
	countdown.ticking.sound = undefined;
	countdown.tick.timeoutID = undefined;
	countdown.ticking.timeoutID = undefined;

	if (gamefile) updateTextContent(gamefile); // Do this one last time so that when we lose on time, the clock doesn't freeze at one second remaining.
	for (const color in element_timers) {
		removeBorder(element_timers[color].timer);
	}
}

/**
 * Resets all data so a new game can be loaded
 */
function resetClocks() {
	stopClocks();
	lowtimeNotif.colorsNotified = new Set();
}

/**
 * 
 * @param {gamefile} gamefile 
 */
function update(gamefile) {
	const clocks = gamefile.clocks;
	if (clocks.untimed || gamefile.gameConclusion || !moveutil.isGameResignable(gamefile) || clocks.timeAtTurnStart === undefined) return;

	// Update border color
	if (clocks.colorTicking !== undefined) {
		updateBorderColor(gamefile, element_timers[clocks.colorTicking].timer, clocks.currentTime[clocks.colorTicking]);
	}
	updateTextContent(gamefile);
}

function edit(gamefile) {

	updateTextContent(gamefile);

	// Remove colored border
	for (const color in element_timers) {
		if (color === gamefile.clocks.colorTicking) continue;
		removeBorder(element_timers[color].timer);
	}

	if (!moveutil.isGameResignable(gamefile) || gamefile.gameConclusion) return;
	rescheduleSoundEffects(gamefile);
}

function rescheduleSoundEffects(gamefile) {
	if (!moveutil.isGameResignable(gamefile) || gamefileutility.isGameOver(gamefile)) return; // Don't plenty of sound if the game is over several clock values are reset when the game ends.
	rescheduleMinuteTick(gamefile); // Lowtime notif at 1 minute left
	rescheduleCountdown(gamefile); // Schedule 10s drum countdown
}

function removeBorder(element) {
	element.style.outline = '';
}

/**
 * Changes the border color gradually
 * @param {gamefile} gamefile 
 * @param {Element} element 
 * @param {Number} currentTimeRemain 
 */
function updateBorderColor(gamefile, element, currentTimeRemain) {
	const percRemain = currentTimeRemain / (gamefile.clocks.startTime.minutes * 60 * 1000);

	// Green => Yellow => Orange => Red
	const perc = 1 - percRemain;
	let r = 0, g = 0, b = 0;
	if (percRemain > 1 + 1 / 3) {
		g = 1;
		b = 1;
	} else if (percRemain > 1) {
		const localPerc = (percRemain - 1) * 3;
		g = 1;
		b = localPerc;
	} else if (perc < 0.5) { // Green => Yellow
		const localPerc = perc * 2;
		r = localPerc;
		g = 1;
	} else if (perc < 0.75) { // Yellow => Orange
		const localPerc = (perc - 0.5) * 4;
		r = 1;
		g = 1 - localPerc * 0.5;
	} else { // Orange => Red
		const localPerc = (perc - 0.75) * 4;
		r = 1;
		g = 0.5 - localPerc * 0.5;
	}

	element.style.outline = `3px solid rgb(${r * 255},${g * 255},${b * 255})`;
}

/** 
 * Updates the clocks' text content in the document.
 * @param {gamefile} gamefile 
 */
function updateTextContent(gamefile) {
	for (const color in element_timers) {
		const text = clockutil.getTextContentFromTimeRemain(gamefile.clocks.currentTime[color]);
		element_timers[color].timer.textContent = text;
	}
}

// The lowtime notification...
/** 
 * Reschedules the timer to play the ticking sound effect at 1 minute remaining.
 * @param {gamefile} gamefile 
 */
function rescheduleMinuteTick(gamefile) {
	if (gamefile.clocks.startTime.minutes < lowtimeNotif.clockMinsRequiredToUse) return; // 1 minute lowtime notif is not used in bullet games.
	clearTimeout(lowtimeNotif.timeoutID);
	if (onlinegame.areInOnlineGame() && gamefile.clocks.colorTicking !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
	if (lowtimeNotif.colorsNotified.has(gamefile.clocks.colorTicking)) return;
	const timeRemainAtTurnStart = gamefile.clocks.timeRemainAtTurnStart;
	const timeRemain = timeRemainAtTurnStart - lowtimeNotif.timeToStartFromEnd; // Time remaining until sound it should start playing
	if (timeRemain < 0) return;
	lowtimeNotif.timeoutID = setTimeout(playMinuteTick, timeRemain, gamefile.clocks.colorTicking);
}

function playMinuteTick(color) {
	sound.playSound_tick({ volume: 0.07 });
	lowtimeNotif.colorsNotified.add(color);
}

function set(gamefile) {
	if (gamefile.clocks.untimed) return hideClocks();
	else showClocks();
	updateTextContent(gamefile);
	// We need this here because otherwise if we reconnect to the page after refreshing, the sound effects don't play
	rescheduleSoundEffects(gamefile);
}

// The 10s drum countdown...
/** Reschedules the timer to play the 10-second countdown effect. */
function rescheduleCountdown(gamefile) {
	const now = Date.now();
	rescheduleDrum(gamefile, now);
	rescheduleTicking(gamefile, now);
	rescheduleTick(gamefile, now);
}

/**
 * 
 * @param {gamefile} gamefile 
 */
function push(gamefile) {
	const clocks = gamefile.clocks;
	// Dont update if no clocks are ticking
	if (clocks.untimed || gamefileutility.isGameOver(gamefile) || !moveutil.isGameResignable(gamefile) || clocks.timeAtTurnStart === undefined) return;

	rescheduleSoundEffects(gamefile);

	// Remove colored border
	for (const color in element_timers) {
		if (color === gamefile.clocks.colorTicking) continue;
		removeBorder(element_timers[color].timer);
	}
}

function rescheduleDrum(gamefile, now) {
	clearTimeout(countdown.drum.timeoutID);
	if (onlinegame.areInOnlineGame() && gamefile.clocks.colorTicking !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
	const timeUntil10SecsRemain = gamefile.clocks.currentTime[gamefile.clocks.colorTicking] - 10000;
	let timeNextDrum = timeUntil10SecsRemain;
	let secsRemaining = 10;
	if (timeNextDrum < 0) {
		const addTimeNextDrum = -Math.floor(timeNextDrum / 1000) * 1000;
		timeNextDrum += addTimeNextDrum;
		secsRemaining -= addTimeNextDrum / 1000;
	}
	countdown.drum.timeoutID = setTimeout(playDrumAndQueueNext, timeNextDrum, gamefile, secsRemaining);
}

function rescheduleTicking(gamefile, now) {
	clearTimeout(countdown.ticking.timeoutID);
	countdown.ticking.sound?.fadeOut(countdown.ticking.fadeOutDuration);
	if (onlinegame.areInOnlineGame() && gamefile.clocks.colorTicking !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
	if (gamefile.clocks.timeAtTurnStart < 10000) return;
	const timeRemain = gamefile.clocks.currentTime[gamefile.clocks.colorTicking] - countdown.ticking.timeToStartFromEnd;
	if (timeRemain > 0) countdown.ticking.timeoutID = setTimeout(playTickingEffect, timeRemain);
	else {
		const offset = -timeRemain;
		playTickingEffect(offset);
	}
}

// Tick sound effect right BEFORE 10 seconds is hit
function rescheduleTick(gamefile, now) {
	clearTimeout(countdown.tick.timeoutID);
	countdown.tick.sound?.fadeOut(countdown.tick.fadeOutDuration);
	if (onlinegame.areInOnlineGame() && gamefile.clocks.colorTicking !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
	const timeRemain = gamefile.clocks.currentTime[gamefile.clocks.colorTicking] - countdown.tick.timeToStartFromEnd;;
	if (timeRemain > 0) countdown.tick.timeoutID = setTimeout(playTickEffect, timeRemain);
	else {
		const offset = -timeRemain;
		playTickEffect(offset);
	}
}

function playDrumAndQueueNext(gamefile, secsRemaining) {
	if (secsRemaining === undefined) return console.error("Cannot play drum without secsRemaining");
	sound.playSound_drum();

	const timeRemain = gamefile.clocks.currentTime[gamefile.clocks.colorTicking];
	if (timeRemain < 1500) return;

	// Schedule next drum...
	const newSecsRemaining = secsRemaining - 1;
	if (newSecsRemaining === 0) return; // Stop
	const timeUntilNextDrum = gamefile.clocks.currentTime[gamefile.clocks.colorTicking] - newSecsRemaining * 1000;
	countdown.drum.timeoutID = setTimeout(playDrumAndQueueNext, timeUntilNextDrum, gamefile, newSecsRemaining);
}

function playTickingEffect(offset) {
	countdown.ticking.sound = sound.playSound_ticking({ fadeInDuration: countdown.ticking.fadeInDuration, offset });
}

function playTickEffect(offset) {
	countdown.tick.sound = sound.playSound_tick({ volume: 0.07, fadeInDuration: countdown.tick.fadeInDuration, offset });
}

export default {
	hideClocks,
	showClocks,
	set,
	resetClocks,
	stopClocks,
	edit,
	push,
	update,
};