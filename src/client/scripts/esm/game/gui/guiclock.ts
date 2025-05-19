
import moveutil from "../../chess/util/moveutil.js";
import onlinegame from "../misc/onlinegame/onlinegame.js";
import sound from "../misc/sound.js";
import clockutil from "../../chess/util/clockutil.js";
import gamefileutility from "../../chess/util/gamefileutility.js";
import { players } from "../../chess/util/typeutil.js";
import clock from "../../chess/logic/clock.js";

import type { SoundObject } from "../misc/sound.js";
import type { Player, PlayerGroup } from "../../chess/util/typeutil.js";
// @ts-ignore
import type gamefile from "../../chess/logic/gamefile.js";

const element_timers: PlayerGroup<{ timer: HTMLElement }> = {
	[players.WHITE]: {
		timer: document.getElementById('timer-white')!,
	},
	[players.BLACK]: {
		timer: document.getElementById('timer-black')!,
	}
};

/** All variables related to the lowtime tick notification at 1 minute remaining. */
const lowtimeNotif: {
	playersNotified: Set<Player>,
	timeoutID?: ReturnType<typeof setTimeout>
	timeToStartFromEnd: number
	clockMinsRequiredToUse: number
} = {
	/** Contains the players that have had the ticking sound play */
	playersNotified: new Set(),
	/** The timer that, when ends, will play the lowtime ticking audio cue. */
	timeoutID: undefined,
	/** The amount of milliseconds before losing on time at which the lowtime tick notification will be played. */
	timeToStartFromEnd: 65615,
	/** The minimum start time required to give a lowtime notification at 1 minute remaining. */
	clockMinsRequiredToUse: 2,
};
/** All variables related to the 10s countdown when you're almost out of time. */
const countdown: {
	drum: {
		timeoutID?: ReturnType<typeof setTimeout>
	},
	tick: {
		timeoutID?: ReturnType<typeof setTimeout>
		sound?: SoundObject
		timeToStartFromEnd: number
		fadeInDuration: number
		fadeOutDuration: number
	}
	ticking: {
		timeoutID?: ReturnType<typeof setTimeout>
		sound?: SoundObject
		timeToStartFromEnd: number
		fadeInDuration: number
		fadeOutDuration: number
	}
} = {
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
	for (const clockElements of Object.values(element_timers)) {
		clockElements.timer.classList.add('hidden');
	}
}

function showClocks() {
	for (const clockElements of Object.values(element_timers)) {
		clockElements.timer.classList.remove('hidden');
	}
}

/**
 * Stops clock sounds and removes all borders
 */
function stopClocks(gamefile?: gamefile) {
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
	for (const clockElements of Object.values(element_timers)) {
		removeBorder(clockElements.timer);
	}
}

/**
 * Resets all data so a new game can be loaded
 */
function resetClocks() {
	stopClocks();
	lowtimeNotif.playersNotified = new Set();
}

function update(gamefile: gamefile) {
	
	if (gamefile.untimed || gamefile.gameConclusion || !moveutil.isGameResignable(gamefile)) return;
	const clocks = gamefile.clocks!;
	if (clocks.timeAtTurnStart === undefined) return;
	// Update border color
	if (clocks.colorTicking !== undefined) {
		updateBorderColor(gamefile, element_timers[clocks.colorTicking as Player]!.timer, clocks.currentTime[clocks.colorTicking]!);
	}
	updateTextContent(gamefile);
}

function edit(gamefile: gamefile) {
	if (gamefile.untimed) return;
	updateTextContent(gamefile);

	// Remove colored border
	for (const [playerStr, clockElements] of Object.entries(element_timers)) {
		const player = Number(playerStr) as Player;
		if (player === gamefile.clocks!.colorTicking) continue;
		removeBorder(clockElements.timer);
	}

	rescheduleSoundEffects(gamefile);
}

function rescheduleSoundEffects(gamefile: gamefile) {
	if (gamefile.untimed || !moveutil.isGameResignable(gamefile) || gamefileutility.isGameOver(gamefile) || gamefile.clocks!.timeRemainAtTurnStart === undefined) return; // Don't plenty of sound if the game is over several clock values are reset when the game ends.
	rescheduleMinuteTick(gamefile); // Lowtime notif at 1 minute left
	rescheduleCountdown(gamefile); // Schedule 10s drum countdown
}

function removeBorder(element: HTMLElement) {
	element.style.outline = '';
}

/**
 * Changes the border color gradually
 * @param gamefile 
 * @param element 
 * @param currentTimeRemain 
 */
function updateBorderColor(gamefile: gamefile, element: HTMLElement, currentTimeRemain: number) {
	const percRemain = currentTimeRemain / (gamefile.clocks!.startTime.minutes * 60 * 1000);

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
function updateTextContent(gamefile: gamefile) {
	if (gamefile.untimed) return;
	for (const [playerStr, clockElements] of Object.entries(element_timers)) {
		const player = Number(playerStr) as Player;
		const text = clockutil.getTextContentFromTimeRemain(gamefile.clocks!.currentTime[player]!);
		clockElements.timer.textContent = text;
	}
}

// The lowtime notification...
/** 
 * Reschedules the timer to play the ticking sound effect at 1 minute remaining.
 * @param {gamefile} gamefile 
 */
function rescheduleMinuteTick(gamefile: gamefile) {
	if (gamefile.clocks!.startTime.minutes < lowtimeNotif.clockMinsRequiredToUse) return; // 1 minute lowtime notif is not used in bullet games.
	clearTimeout(lowtimeNotif.timeoutID);
	if (onlinegame.areInOnlineGame() && gamefile.clocks!.colorTicking! !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
	if (lowtimeNotif.playersNotified.has(gamefile.clocks!.colorTicking!)) return;
	const timeRemainAtTurnStart = gamefile.clocks!.timeRemainAtTurnStart!;
	const timeRemain = timeRemainAtTurnStart - lowtimeNotif.timeToStartFromEnd; // Time remaining until sound it should start playing
	if (timeRemain < 0) return;
	lowtimeNotif.timeoutID = setTimeout(() => playMinuteTick(gamefile.clocks!.colorTicking!), timeRemain);}

function playMinuteTick(color: Player) {
	sound.playSound_tick({ volume: 0.07 });
	lowtimeNotif.playersNotified.add(color);
}

function set(gamefile: gamefile) {
	if (gamefile.untimed) return hideClocks();
	else showClocks();
	updateTextContent(gamefile);
	// We need this here because otherwise if we reconnect to the page after refreshing, the sound effects don't play
	rescheduleSoundEffects(gamefile);
}

// The 10s drum countdown...
/** Reschedules the timer to play the 10-second countdown effect. */
function rescheduleCountdown(gamefile: gamefile) {
	rescheduleDrum(gamefile);
	rescheduleTicking(gamefile);
	rescheduleTick(gamefile);
}

/**
 * 
 * @param {gamefile} gamefile 
 */
function push(gamefile: gamefile) {

	// Dont update if no clocks are ticking
	if (gamefile.untimed || gamefileutility.isGameOver(gamefile) || !moveutil.isGameResignable(gamefile)) return;
	const clocks = gamefile.clocks!;
	if (clocks.timeAtTurnStart === undefined) return;
	rescheduleSoundEffects(gamefile);

	// Remove colored border
	for (const [color, clockElements] of Object.entries(element_timers)) {
		const player = Number(color) as Player;
		if (player === clocks.colorTicking) continue;
		removeBorder(clockElements.timer);
	}
}

function rescheduleDrum(gamefile: gamefile) {
	clearTimeout(countdown.drum.timeoutID);
	if (onlinegame.areInOnlineGame() && gamefile.clocks!.colorTicking !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
	// We have to use this instead of reading the current clock values
	// because those aren't updated every frame when the page isn't focused!!
	const playerTrueTimeRemaining = clock.getColorTickingTrueTimeRemaining(gamefile)!;
	const timeUntil10SecsRemain = playerTrueTimeRemaining - 10000;
	let timeNextDrum = timeUntil10SecsRemain;
	let secsRemaining = 10;
	if (timeNextDrum < 0) {
		const addTimeNextDrum = -Math.floor(timeNextDrum / 1000) * 1000;
		timeNextDrum += addTimeNextDrum;
		secsRemaining -= addTimeNextDrum / 1000;
	}
	console.log("Rescheduling drum countdown in ", timeNextDrum, "ms");
	countdown.drum.timeoutID = setTimeout(() => playDrumAndQueueNext(gamefile, secsRemaining), timeNextDrum);
}

function rescheduleTicking(gamefile: gamefile) {
	clearTimeout(countdown.ticking.timeoutID);
	countdown.ticking.sound?.fadeOut(countdown.ticking.fadeOutDuration);
	if (onlinegame.areInOnlineGame() && gamefile.clocks!.colorTicking !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
	if (gamefile.clocks!.timeAtTurnStart! < 10000) return;
	// We have to use this instead of reading the current clock values
	// because those aren't updated every frame when the page isn't focused!!
	const playerTrueTimeRemaining = clock.getColorTickingTrueTimeRemaining(gamefile)!;
	const timeRemain = playerTrueTimeRemaining - countdown.ticking.timeToStartFromEnd;
	if (timeRemain > 0) countdown.ticking.timeoutID = setTimeout(() => playTickingEffect(0), timeRemain);
	else {
		const offset = -timeRemain;
		playTickingEffect(offset);
	}
}

// Tick sound effect right BEFORE 10 seconds is hit
function rescheduleTick(gamefile: gamefile) {
	clearTimeout(countdown.tick.timeoutID);
	countdown.tick.sound?.fadeOut(countdown.tick.fadeOutDuration);
	if (onlinegame.areInOnlineGame() && gamefile.clocks!.colorTicking !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
	// We have to use this instead of reading the current clock values
	// because those aren't updated every frame when the page isn't focused!!
	const playerTrueTimeRemaining = clock.getColorTickingTrueTimeRemaining(gamefile)!;
	const timeRemain = playerTrueTimeRemaining - countdown.tick.timeToStartFromEnd;
	if (timeRemain > 0) countdown.tick.timeoutID = setTimeout(() => playTickEffect(0), timeRemain);
	else {
		const offset = -timeRemain;
		playTickEffect(offset);
	}
}

function playDrumAndQueueNext(gamefile: gamefile, secsRemaining: number) {
	if (secsRemaining === undefined) return console.error("Cannot play drum without secsRemaining");
	sound.playSound_drum();

	// We have to use this instead of reading the current clock values
	// because those aren't updated every frame when the page isn't focused!!
	const playerTrueTimeRemaining = clock.getColorTickingTrueTimeRemaining(gamefile)!;

	if (playerTrueTimeRemaining < 1500) return;

	// Schedule next drum...
	const newSecsRemaining = secsRemaining - 1;
	if (newSecsRemaining === 0) return; // Stop
	const timeUntilNextDrum = playerTrueTimeRemaining - newSecsRemaining * 1000;
	countdown.drum.timeoutID = setTimeout(() => playDrumAndQueueNext(gamefile, newSecsRemaining), timeUntilNextDrum);
}

function playTickingEffect(offset: number) {
	countdown.ticking.sound = sound.playSound_ticking({ fadeInDuration: countdown.ticking.fadeInDuration, offset });
}

function playTickEffect(offset: number) {
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