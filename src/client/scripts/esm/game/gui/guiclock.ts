// src/client/scripts/esm/game/gui/guiclock.ts

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { ClockData } from '../../../../../shared/chess/logic/clock.js';
import type { Player, PlayerGroup } from '../../../../../shared/chess/util/typeutil.js';

import clock from '../../../../../shared/chess/logic/clock.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import clockutil from '../../../../../shared/chess/util/clockutil.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import gamesound from '../misc/gamesound.js';
import gameloader from '../chess/gameloader.js';
import { GameBus } from '../GameBus.js';

const element_timers: PlayerGroup<{ timer: HTMLElement }> = {
	[p.WHITE]: {
		timer: document.getElementById('timer-white')!,
	},
	[p.BLACK]: {
		timer: document.getElementById('timer-black')!,
	},
};

/** Whether the low-time sound has already been played this game.. */
let hasPlayedLowtimeSound = false;
/** Timeout ID for the scheduled low-time sound. */
let lowtimeTimeoutID: number | undefined;

// Events ---------------------------------------------------------------------------

GameBus.addEventListener('game-unloaded', () => {
	stopClocks();
});

// Functions -----------------------------------------------------------------------

/** Hides both clock elements from view. */
function hideClocks(): void {
	for (const clockElements of Object.values(element_timers)) {
		clockElements.timer.classList.add('hidden');
	}
}

/** Shows both clock elements. */
function showClocks(): void {
	for (const clockElements of Object.values(element_timers)) {
		clockElements.timer.classList.remove('hidden');
	}
}

/** Stops clock sound and resets low-time state. */
function stopClocks(basegame?: GameFile): void {
	clearTimeout(lowtimeTimeoutID);
	lowtimeTimeoutID = undefined;
	hasPlayedLowtimeSound = false;

	if (basegame && !basegame.untimed) updateTextContent(basegame.clocks); // Ensures clock shows 0
	for (const clockElements of Object.values(element_timers)) {
		removeLowTimeState(clockElements.timer);
	}
}

/** Updates clock text content each frame for timed, ongoing games. */
function update(basegame: GameFile): void {
	if (basegame.untimed || basegame.gameConclusion || !moveutil.isGameResignable(basegame)) return;
	const clocks = basegame.clocks!;

	updateTextContent(clocks);
}

/** Refreshes clock text and reschedules the low-time sound after a move is edited or navigated. */
function edit(basegame: GameFile): void {
	if (basegame.untimed) return;
	updateTextContent(basegame.clocks);

	for (const [playerStr, clockElements] of Object.entries(element_timers)) {
		const player = Number(playerStr) as Player;
		if (player === basegame.clocks.colorTicking) continue;
		removeLowTimeState(clockElements.timer);
	}

	rescheduleLowtime(basegame.clocks);
}

/** Called when a move is pushed; removes the border from the clock that just stopped ticking and reschedules the low-time sound. */
function push(clocks: ClockData): void {
	for (const [color, clockElements] of Object.entries(element_timers)) {
		const player = Number(color) as Player;
		if (player === clocks.colorTicking) continue;
		removeLowTimeState(clockElements.timer);
	}

	rescheduleLowtime(clocks);
}

/** Initializes the clock display when a game is loaded. */
function set(basegame: GameFile): void {
	if (basegame.untimed) return hideClocks();
	else showClocks();
	updateTextContent(basegame.clocks);
}

/**
 * Schedules the low-time sound to play exactly when our clock hits 10 seconds.
 * Plays immediately if we're already under 10 seconds. No-ops if already played this game.
 */
function rescheduleLowtime(clocks: ClockData): void {
	clearTimeout(lowtimeTimeoutID);
	lowtimeTimeoutID = undefined;
	if (hasPlayedLowtimeSound) return;
	if (clocks.colorTicking === undefined) return;
	if (clocks.colorTicking !== gameloader.getOurColor()) return;

	const timeRemaining = clock.getColorTickingTrueTimeRemaining(clocks);
	if (timeRemaining === null || timeRemaining === undefined) return;

	const timeUntilLowtime = timeRemaining - 10000;
	if (timeUntilLowtime <= 0) playLowtimeSound();
	else lowtimeTimeoutID = window.setTimeout(playLowtimeSound, timeUntilLowtime);
}

/** Plays the low-time sound and applies the low-time visual to our clock. */
function playLowtimeSound(): void {
	hasPlayedLowtimeSound = true;
	lowtimeTimeoutID = undefined;
	const ourColor = gameloader.getOurColor();
	if (ourColor !== undefined) element_timers[ourColor]!.timer.classList.add('low-time');
	gamesound.playLowtime();
}

/** Removes the low-time visual from a clock element. */
function removeLowTimeState(element: HTMLElement): void {
	element.classList.remove('low-time');
}

/** Updates the displayed time for both clocks. */
function updateTextContent(clocks: ClockData): void {
	for (const [playerStr, clockElements] of Object.entries(element_timers)) {
		const player = Number(playerStr) as Player;
		const text = clockutil.getTextContentFromTimeRemain(clocks.currentTime[player]!);
		clockElements.timer.textContent = text;
	}
}

export default {
	hideClocks,
	showClocks,
	set,
	stopClocks,
	edit,
	push,
	update,
};
