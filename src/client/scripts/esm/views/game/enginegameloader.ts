// src/client/scripts/esm/views/game/enginegameloader.ts

/**
 * The engine-game load path of the game page: fetches the game's resumable state over
 * HTTP (no socket — the engine runs locally in a wasm worker), loads the gamefile
 * (fresh, or mid-game with the synced moves + clocks), spins up the engine worker,
 * and starts the server-record syncing.
 */

import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { EngineGameState, MovePacket } from '../../../../../shared/types.js';
import type {
	Additional,
	GameFile,
	VariantOptions,
} from '../../../../../shared/chess/logic/gamefile.js';

import uuid from '../../../../../shared/util/uuid.js';
import clock from '../../../../../shared/chess/logic/clock.js';
import moveutil from '../../../../../shared/chess/util/moveutil.js';
import icnimport from '../../../../../shared/chess/logic/icn/icnimport.js';
import icnconverter from '../../../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';
import { engineDictionary } from '../../../../../shared/chess/engines/engine.js';

import toast from '../../components/toast.js';
import gameslot from '../../game/chess/gameslot.js';
import enginegame from '../../game/misc/enginegame.js';
import gamesession from '../../game/chess/gamesession.js';
import enginegamesync from './enginegamesync.js';
import { serverFetch } from '../../util/serverFetch.js';

// Functions ------------------------------------------------------------------------

/** Fetches and loads the engine game named by the page URL. */
async function loadEngineGame(): Promise<void> {
	try {
		const state: EngineGameState = await fetchEngineGameState();
		loadGameFromState(state);
	} catch (e: unknown) {
		console.error('Failed to fetch engine game state:', e);
		toast.show('Failed to load game. Please refresh.', { error: true });
	}
}

/**
 * Fetches the {@link EngineGameState}.
 * @throws If the fetch fails, or the server returns
 * a non-OK response, or the JSON body is malformed.
 */
async function fetchEngineGameState(): Promise<EngineGameState> {
	const response = await serverFetch(
		`/api/engine-game/${uuid.base10ToBase62(window.gamePageData.id)}`,
	);
	if (!response.ok) throw new Error(`Engine game fetch failed (${response.status})`);
	return await response.json();
}

/** Loads the game onto the board and sets up the engine-game session. */
function loadGameFromState(state: EngineGameState): void {
	// The static setup (variant/time control/creation time) and the
	// engine info + our color are SSR'd; only the owner reaches here.
	const { variant, timeControl, timeCreated, engineGame, role } = window.gamePageData;

	gamesession.setSessionGame({ type: 'engine', role: role! });

	const moves: MovePacket[] =
		state.moves === ''
			? []
			: icnimport.movePacketsFromParsed(icnconverter.parseShortFormMoves(state.moves));

	// Custom games rebuild their start position from the recorded ICN.
	let variantOptions: VariantOptions | undefined;
	if (variant.kind === 'custom') {
		const longformOut = icnconverter.ShortToLong_Format(state.position!);
		variantOptions = icnimport.variantOptionsFromLongFormat(longformOut);
	}

	const additional: Additional = {
		moves,
		variantOptions,
		// Engine games get a world border so the position stays in the engine's safe range.
		worldBorderDist: engineDictionary[engineGame!.engine].worldBorder,
	};
	if (state.clocks) additional.clockValues = { clocks: state.clocks };

	gameslot
		.loadGamefile({
			timeControl,
			variant: variant.kind === 'preset' ? variant.code : undefined,
			dateTimestamp: timeCreated,
			viewWhitePerspective: role !== p.BLACK,
			additional,
			// Corrects the clock before the first paint (guiclock.set() reads it during the
			// graphical load right after), so resuming mid-turn never flashes the stale value.
			onLogicalLoaded: (gamefile) => {
				if (!gamefile.gameConclusion) resumeClockTicking(gamefile, state, role!);
			},
		})
		.then(async ({ graphical }) => {
			// Logical loaded, return graphical promise
			const gamefile = gameslot.getGamefile()!;

			// A refresh can race the conclusion post — the replayed moves may already
			// end the game (e.g. checkmate). Conclude locally, then re-post it below.
			gamesession.concludeGameIfOver();

			if (!gamefile.gameConclusion) {
				/** A promise that resolves when the engine script has been fetched. */
				await enginegame.initEngineGame({
					youAreColor: role!,
					currentEngine: engineGame!.engine,
					engineConfig: {
						engineTimeLimitPerMoveMillis:
							engineDictionary[engineGame!.engine].defaultTimeLimitPerMoveMillis,
						strengthLevel: engineGame!.strengthLevel,
					},
					workerUrl: window.gamePageData.engineWorkerUrl,
					engineUrl: window.gamePageData.engineUrl,
				});
			}

			// Sync starts AFTER the load, so the move replay doesn't fire redundant posts.
			enginegamesync.init();
			if (gamefile.gameConclusion) enginegamesync.postConclusion();

			return graphical;
		})
		.then(() => gamesession.markLoadingDone()) // Both the engine and graphical promises have resolved
		.catch((err: Error) => gamesession.onCatchLoadingError(err));
}

/**
 * Resumes the clock ticking for whoever's turn it is on a resumed timed game.
 * The load applied the synced values un-ticking (time didn't run while away).
 *
 * On the human's own turn we deduct the real time elapsed since their turn began
 * (they're accountable for it, even while away). On the engine's turn we don't: it
 * restarts its search from scratch on reload, so its clock resets to the move's start.
 */
function resumeClockTicking(gamefile: GameFile, state: EngineGameState, youAreColor: Player): void {
	if (gamefile.untimed || !state.clocks) return;
	if (!moveutil.isGameResignable(gamefile)) return; // Clocks only tick from ply 2 onward.

	const clocks = { ...gamefile.clocks.currentTime };
	if (gamefile.whosTurn === youAreColor && state.turnStartTime !== undefined)
		clocks[youAreColor] = Math.max(
			0,
			clocks[youAreColor]! - (Date.now() - state.turnStartTime),
		);

	clock.edit(gamefile.clocks, {
		clocks,
		colorTicking: gamefile.whosTurn,
		timeColorTickingLosesAt: Date.now() + clocks[gamefile.whosTurn]!,
	});
}

export default { loadEngineGame };
