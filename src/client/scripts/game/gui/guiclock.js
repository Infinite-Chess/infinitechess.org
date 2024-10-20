import game from "../chess/game";
import style from "./style";


const element_timerWhite = document.getElementById('timer-white');
const element_timerBlack = document.getElementById('timer-black');
const element_timerContainerWhite = document.getElementById('timer-container-white');
const element_timerContainerBlack = document.getElementById('timer-container-black');

// TODO: clock gui
/** All variables related to the lowtime tick notification at 1 minute remaining. */
const lowtimeNotif = {
	/** True if white's clock has reached 1 minute or less and the ticking sound effect has been played. */
	whiteNotified: false,
	/** True if black's clock has reached 1 minute or less and the ticking sound effect has been played. */
	blackNotified: false,
	/** The timer that, when ends, will play the lowtime ticking audio cue. */
	timeoutID: undefined,
	/** The amount of milliseconds before losing on time at which the lowtime tick notification will be played. */
	timeToStartFromEnd: 65615,
	/** The minimum start time required to give a lowtime notification at 1 minute remaining. */
	clockMinsRequiredToUse: 2,
};
// TODO: clock gui
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

// TODO: clock gui
function hideClocks() {
	style.hideElement(element_timerContainerWhite);
	style.hideElement(element_timerContainerBlack);
}
// TODO: clock gui
function showClocks() {
	style.revealElement(element_timerContainerWhite);
	style.revealElement(element_timerContainerBlack);
}

// TODO: clock gui
function stop() {
	clearTimeout(lowtimeNotif.timeoutID);
	clearTimeout(countdown.ticking.timeoutID);
	clearTimeout(countdown.tick.timeoutID);
	clearTimeout(countdown.drum.timeoutID);
	countdown.ticking.sound?.fadeOut(countdown.ticking.fadeOutDuration);
	countdown.tick.sound?.fadeOut(countdown.tick.fadeOutDuration);
}

function reset() {
	lowtimeNotif.whiteNotified = false;
	lowtimeNotif.blackNotified = false;
	countdown.drum.timeoutID = undefined;
	countdown.tick.sound = undefined;
	countdown.ticking.sound = undefined;
	countdown.tick.timeoutID = undefined;
	countdown.ticking.timeoutID = undefined;
	removeBorder(element_timerWhite);
	removeBorder(element_timerBlack);
}

function edit(gamefile, newTimeWhite, newTimeBlack, timeNextPlayerLoses) {

	updateTextContent();

	// Remove colored border
	if (gamefile.colorTicking === 'white') removeBorder(element_timerBlack);
	else removeBorder(element_timerWhite);

	if (!movesscript.isGameResignable(gamefile) || gamefile.gameConclusion) return;
	rescheduleMinuteTick(); // Lowtime notif at 1 minute left
	rescheduleCountdown(); // Schedule 10s drum countdown
}

// TODO: clock gui
function removeBorder(element) {
	element.style.outline = '';
}

// TODO clock gui
/** Changes the border color gradually */
function updateBorderColor(element, currentTimeRemain) {
	const percRemain = currentTimeRemain / (startTime.minutes * 60 * 1000);

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
// TODO: clock gui
/** Updates the clocks' text content in the document. */
function updateTextContent() {
	const whiteText = getTextContentFromTimeRemain(currentTime.white);
	const blackText = getTextContentFromTimeRemain(currentTime.black);
	element_timerWhite.textContent = whiteText;
	element_timerBlack.textContent = blackText;
}


// The lowtime notification...

// TODO: clock gui?
/** Reschedules the timer to play the ticking sound effect at 1 minute remaining. */
function rescheduleMinuteTick() {
	if (startTime.minutes < lowtimeNotif.clockMinsRequiredToUse) return; // 1 minute lowtime notif is not used in bullet games.
	clearTimeout(lowtimeNotif.timeoutID);
	if (onlinegame.areInOnlineGame() && colorTicking !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
	if (colorTicking === 'white' && lowtimeNotif.whiteNotified || colorTicking === 'black' && lowtimeNotif.blackNotified) return;
	const timeRemain = timeRemainAtTurnStart - lowtimeNotif.timeToStartFromEnd;
	lowtimeNotif.timeoutID = setTimeout(playMinuteTick, timeRemain);
}
// TODO: clock gui?
function playMinuteTick() {
	sound.playSound_tick({ volume: 0.07 });
	if (colorTicking === 'white') lowtimeNotif.whiteNotified = true;
	else if (colorTicking === 'black') lowtimeNotif.blackNotified = true;
	else console.error("Cannot set white/lowtimeNotif.blackNotified when colorTicking is undefined");
}

function set() {
	// TODO: clock gui
	if (untimed) return hideClocks();
	else showClocks();

	updateTextContent();
}

// The 10s drum countdown...
// TODO: clock gui?
/** Reschedules the timer to play the 10-second countdown effect. */
function rescheduleCountdown() {
	const now = Date.now();
	rescheduleDrum(now);
	rescheduleTicking(now);
	rescheduleTick(now);
}

// TODO: clock logic/gui?
function getTextContentFromTimeRemain(time) {
	let seconds = Math.ceil(time / 1000);
	let minutes = 0;
	while (seconds >= 60) {
		seconds -= 60;
		minutes++;
	}
	if (seconds < 0) seconds = 0;

	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function push() {
	rescheduleMinuteTick(); // Lowtime notif at 1 minute left
	rescheduleCountdown(); // Schedule 10s drum countdown

	// Remove colored border
	if (colorTicking === 'white') removeBorder(element_timerBlack);
	else removeBorder(element_timerWhite);
}

// TODO: clock gui?
function rescheduleDrum(now) {
	clearTimeout(countdown.drum.timeoutID);
	if (onlinegame.areInOnlineGame() && colorTicking !== onlinegame.getOurColor() || !timeNextPlayerLosesAt) return; // Don't play the sound effect for our opponent.
	const timeUntil10SecsRemain = timeNextPlayerLosesAt - now - 10000;
	let timeNextDrum = timeUntil10SecsRemain;
	let secsRemaining = 10;
	if (timeNextDrum < 0) {
		const addTimeNextDrum = -Math.floor(timeNextDrum / 1000) * 1000;
		timeNextDrum += addTimeNextDrum;
		secsRemaining -= addTimeNextDrum / 1000;
	}
	countdown.drum.timeoutID = setTimeout(playDrumAndQueueNext, timeNextDrum, secsRemaining);
}
// TODO: clock gui?
function rescheduleTicking(now) {
	clearTimeout(countdown.ticking.timeoutID);
	countdown.ticking.sound?.fadeOut(countdown.ticking.fadeOutDuration);
	if (onlinegame.areInOnlineGame() && colorTicking !== onlinegame.getOurColor() || !timeNextPlayerLosesAt) return; // Don't play the sound effect for our opponent.
	if (timeAtTurnStart < 10000) return;
	const timeToStartTicking = timeNextPlayerLosesAt - countdown.ticking.timeToStartFromEnd;
	const timeRemain = timeToStartTicking - now;
	if (timeRemain > 0) countdown.ticking.timeoutID = setTimeout(playTickingEffect, timeRemain);
	else {
		const offset = -timeRemain;
		playTickingEffect(offset);
	}
}
// TODO: clock gui?
// Tick sound effect right BEFORE 10 seconds is hit
function rescheduleTick(now) {
	clearTimeout(countdown.tick.timeoutID);
	countdown.tick.sound?.fadeOut(countdown.tick.fadeOutDuration);
	if (onlinegame.areInOnlineGame() && colorTicking !== onlinegame.getOurColor() || !timeNextPlayerLosesAt) return; // Don't play the sound effect for our opponent.
	const timeToStartTick = timeNextPlayerLosesAt - countdown.tick.timeToStartFromEnd;
	const timeRemain = timeToStartTick - now;
	if (timeRemain > 0) countdown.tick.timeoutID = setTimeout(playTickEffect, timeRemain);
	else {
		const offset = -timeRemain;
		playTickEffect(offset);
	}
}
// TODO: clock gui?
function playDrumAndQueueNext(secsRemaining) {
	if (!secsRemaining) return console.error("Cannot play drum without secsRemaining");
	sound.playSound_drum();

	const timeRemain = timeNextPlayerLosesAt - Date.now();
	if (timeRemain < 1500) return;

	// Schedule next drum...
	const newSecsRemaining = secsRemaining - 1;
	if (newSecsRemaining === 0) return; // Stop
	const timeUntilNextDrum = timeNextPlayerLosesAt - Date.now() - newSecsRemaining * 1000;
	countdown.drum.timeoutID = setTimeout(playDrumAndQueueNext, timeUntilNextDrum, newSecsRemaining);
}
// TODO: clock gui?
function playTickingEffect(offset) {
	countdown.ticking.sound = sound.playSound_ticking({ fadeInDuration: countdown.ticking.fadeInDuration, offset });
}
// TODO: clock gui?
function playTickEffect(offset) {
	countdown.tick.sound = sound.playSound_tick({ volume: 0.07, fadeInDuration: countdown.tick.fadeInDuration, offset });
}


export default {
	hideClocks,
	showClocks,
};