// src/client/scripts/esm/views/game/enginegamesync.ts

/**
 * Keeps the server's record of the engine game on this page in sync: posts the full
 * move list + clocks after every move, and the conclusion when the game ends, so the
 * game is resumable mid-game and permanently saved once over — like a PvP game.
 */

import type { GameFile } from '../../../../../shared/chess/logic/gamefile.js';
import type { PlayerGroup } from '../../../../../shared/chess/util/typeutil.js';
import type {
	ConcludeEngineGameBody,
	EngineGameProgressBody,
} from '../../../../../shared/types.js';

import uuid from '../../../../../shared/util/uuid.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import toast from '../../components/toast.js';
import gameslot from '../../game/chess/gameslot.js';
import { GameBus } from '../../game/GameBus.js';
import { serverFetch } from '../../util/serverFetch.js';

// Functions ------------------------------------------------------------------------

/**
 * Starts syncing the loaded engine game to the server. Call AFTER the logical load,
 * so the initial move replay doesn't fire redundant progress posts.
 */
function init(): void {
	GameBus.addEventListener('moves-changed', onMovesChanged);
	GameBus.addEventListener('game-concluded', () => postConclusion());
}

function onMovesChanged(): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return;
	if (gamefile.gameConclusion) return; // The conclusion post carries the final state.
	postState('progress', buildProgressBody(gamefile), false);
}

/** Posts the game's conclusion, permanently saving it server-side. */
function postConclusion(): void {
	const gamefile = gameslot.getGamefile()!;
	const body: ConcludeEngineGameBody = {
		...buildProgressBody(gamefile),
		gameConclusion: gamefile.gameConclusion!,
	};
	postState('conclude', body, true);
}

function buildProgressBody(gamefile: GameFile): EngineGameProgressBody {
	const body: EngineGameProgressBody = { moves: serializeMoves(gamefile) };

	if (!gamefile.untimed) {
		const clocks: PlayerGroup<number> = {};
		for (const color of [p.WHITE, p.BLACK]) {
			const time = gamefile.clocks.currentTime[color];
			if (time !== undefined) clocks[color] = Math.max(0, Math.round(time));
		}
		body.clocks = clocks;
		// The ticking turn's start epoch, so a mid-turn refresh can deduct time spent away.
		if (gamefile.clocks.timeAtTurnStart !== undefined)
			body.turnStartTime = gamefile.clocks.timeAtTurnStart;
	}

	return body;
}

/** Serializes the move list compactly, with clock stamps embedded as `[%clk]` comments. */
function serializeMoves(gamefile: GameFile): string {
	if (gamefile.moves.length === 0) return '';
	return icnconverter.getShortFormMovesFromMoves(gamefile.moves, {
		compact: true,
		spaces: false,
		comments: !gamefile.untimed, // Carries the clock stamps.
		move_numbers: false,
		abbrev: true, // Irrelevant here — only applies when compact is false.
	});
}

/**
 * Fire-and-forget state post. `keepalive` lets a small post survive an immediate
 * navigation away (e.g. clicking Analysis right after the game ends), but caps the
 * body at 64KB — larger games fall back to a normal request.
 */
function postState(
	endpoint: 'progress' | 'conclude',
	body: EngineGameProgressBody,
	surfaceFailure: boolean,
): void {
	const json = JSON.stringify(body);
	serverFetch(`/api/engine-game/${uuid.base10ToBase62(window.gamePageData.id)}/${endpoint}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: json,
		keepalive: json.length < 60_000,
	})
		.then((response) => {
			if (response.ok) return;
			console.error(`Engine game ${endpoint} sync failed (${response.status}).`);
			if (surfaceFailure)
				toast.show('Failed to save the game to the server.', { error: true });
		})
		.catch((error) => {
			console.error(`Engine game ${endpoint} sync failed:`, error);
			if (surfaceFailure)
				toast.show('Failed to save the game to the server.', { error: true });
		});
}

export default { init, postConclusion };
