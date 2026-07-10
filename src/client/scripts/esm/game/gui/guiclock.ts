// src/client/scripts/esm/game/gui/guiclock.ts

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { ClockData } from '../../../../../shared/chess/logic/clock.js';
import type { Player, PlayerGroup } from '../../../../../shared/chess/util/typeutil.js';

import clock from '../../../../../shared/chess/logic/clock.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import clockutil from '../../../../../shared/chess/util/clockutil.js';
import gamerules from '../../../../../shared/chess/util/gamerules.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import gameslot from '../chess/gameslot.js';
import gamesound from '../misc/gamesound.js';
import gamesession from '../chess/gamesession.js';
import { GameBus } from '../GameBus.js';

/** A player bar and the `.clock` it hosts. SSR'd by the game page, keyed by board POV. */
type BarElements = { bar: HTMLElement; timer: HTMLElement };

/** The two SSR'd player bars by board position. Bottom = you (or white for spectators). */
const bars: { top: BarElements; bottom: BarElements } = {
	top: {
		bar: document.getElementById('player-bar-top')!,
		timer: document.querySelector('#player-bar-top .clock')!,
	},
	bottom: {
		bar: document.getElementById('player-bar-bottom')!,
		timer: document.querySelector('#player-bar-bottom .clock')!,
	},
};

/** Player → bar elements for the loaded game, resolved by perspective in {@link set}. */
let element_timers: PlayerGroup<BarElements> = {};

/** Whether the low-time sound has already been played this game.. */
let hasPlayedLowtimeSound = false;
/** Timeout ID for the scheduled low-time sound. */
let lowtimeTimeoutID: number | undefined;

// Events ---------------------------------------------------------------------------

GameBus.addEventListener('game-unloaded', () => {
	stopClocks();
});

// Re-highlight whoever's turn it is on every committed move.
GameBus.addEventListener('moves-changed', () => {
	const basegame = gameslot.getGamefile()!;
	updateTempo(basegame);
});

// Functions -----------------------------------------------------------------------

/** Stops clock sound and resets low-time state. */
function stopClocks(basegame?: GameFile): void {
	clearTimeout(lowtimeTimeoutID);
	lowtimeTimeoutID = undefined;
	hasPlayedLowtimeSound = false;

	if (basegame && !basegame.untimed) updateTextContent(basegame.clocks); // Ensures clock shows 0
	for (const clockElements of Object.values(element_timers)) {
		clockElements.bar.classList.remove('tempo'); // No side is on the move once stopped.
	}
}

/** Updates clock text content each frame for timed, ongoing games. */
function update(basegame: GameFile): void {
	if (
		basegame.untimed ||
		basegame.gameConclusion ||
		!moveutil.isGameResignable(basegame) ||
		gamesession.getGameType() === 'analysis'
	)
		return;

	updateTextContent(basegame.clocks);
}

/** Refreshes clock text and reschedules the low-time sound after a move is edited or navigated. */
function edit(basegame: GameFile): void {
	if (basegame.untimed) return;
	updateTextContent(basegame.clocks);
	rescheduleLowtime(basegame.clocks);
	updateTempo(basegame);
}

/** Called when a move is pushed in a timed engine game; reschedules the low-time sound. */
function push(clocks: ClockData): void {
	rescheduleLowtime(clocks);
}

/** Initializes the clock display when a game is loaded. */
function set(basegame: GameFile): void {
	// Map each player to a bar by perspective: bottom = our POV (or white for spectators).
	const bottomPlayer = gameslot.areViewingWhite() ? p.WHITE : p.BLACK;
	const topPlayer = bottomPlayer === p.WHITE ? p.BLACK : p.WHITE;
	element_timers = { [bottomPlayer]: bars.bottom, [topPlayer]: bars.top };

	if (gamesession.getGameType() !== 'analysis') updateTempo(basegame); // Highlight whoever's turn it is, even in untimed games.
	if (basegame.untimed) return;
	updateTextContent(basegame.clocks);
}

/** Shows the static clock values stored on moves for the currently viewed analysis position. */
function showViewedMoveClockStamps(basegame: GameFile): void {
	if (basegame.untimed) return;

	// A time forfeit at the final position zeroes the flagged player (the one who was to move).
	const viewingFinalForfeit =
		basegame.gameConclusion?.condition === 'time' && moveutil.areWeViewingLatestMove(basegame);
	const flaggedPlayer = viewingFinalForfeit
		? moveutil.getWhosTurnAtMoveIndex(basegame, basegame.moves.length - 1)
		: undefined;

	// For each player, walk backwards from the viewed move to their most recent move.
	const turnOrder = basegame.gameRules.turnOrder;
	const currentTime: PlayerGroup<number> = {};
	for (const player of gamerules.getUniquePlayersInTurnOrder(turnOrder)) {
		if (currentTime[player] !== undefined) continue; // Already set (duplicate in turn order)
		if (player === flaggedPlayer) {
			// They lost on time, and we're viewing the final move
			currentTime[player] = 0;
			continue;
		}
		currentTime[player] = basegame.clocks.startTime.millis; // Fallback if they never moved.
		for (let i = basegame.state.local.moveIndex; i >= 0; i--) {
			if (moveutil.getColorThatPlayedMoveIndex(basegame, i) !== player) continue;
			const stamp = basegame.moves[i]?.clockStamp;
			// Analysis moves added on the board carry no clock; skip past them so the clock keeps
			// this variation's last real value instead of dropping to 0.
			if (stamp === undefined) continue;
			currentTime[player] = stamp;
			break;
		}
	}

	updateTextContent({ startTime: basegame.clocks.startTime, currentTime });
}

/** Highlights the bar of the player whose turn it is via `.tempo`. */
function updateTempo(basegame: GameFile): void {
	for (const [playerStr, clockElements] of Object.entries(element_timers)) {
		const player = Number(playerStr) as Player;
		clockElements.bar.classList.toggle(
			'tempo',
			player === (basegame.clocks?.colorTicking ?? basegame.whosTurn),
		);
	}
}

/**
 * Schedules the low-time sound to play exactly when our clock first hits 1/8th of our starting time.
 * Plays immediately if we're already below that. No-ops if already played this game.
 */
function rescheduleLowtime(clocks: ClockData): void {
	clearTimeout(lowtimeTimeoutID);
	lowtimeTimeoutID = undefined;
	if (hasPlayedLowtimeSound) return;
	if (clocks.colorTicking === undefined) return;
	if (clocks.colorTicking !== gamesession.getRole()) return;

	const timeRemaining = clock.getColorTickingTrueTimeRemaining(clocks);
	if (timeRemaining === null || timeRemaining === undefined) return;

	const timeUntilLowtime = timeRemaining - clocks.startTime.millis / 8;
	if (timeUntilLowtime <= 0) playLowtimeSound();
	else lowtimeTimeoutID = window.setTimeout(playLowtimeSound, timeUntilLowtime);
}

/** Plays the low-time sound and applies the low-time visual to our clock. */
function playLowtimeSound(): void {
	hasPlayedLowtimeSound = true;
	lowtimeTimeoutID = undefined;
	gamesound.playLowtime();
}

/** Updates the displayed time for both clocks, flagging any below the low-time threshold. */
function updateTextContent(clocks: Pick<ClockData, 'startTime' | 'currentTime'>): void {
	const lowtimeThreshold = clocks.startTime.millis / 8;
	for (const [playerStr, clockElements] of Object.entries(element_timers)) {
		const player = Number(playerStr) as Player;
		const timeRemaining = clocks.currentTime[player]!;
		clockElements.timer.textContent = clockutil.getTextContentFromTimeRemain(timeRemaining);
		clockElements.bar.classList.toggle('lowtime', timeRemaining < lowtimeThreshold);
	}
}

export default {
	set,
	stopClocks,
	edit,
	push,
	update,
	showViewedMoveClockStamps,
};
