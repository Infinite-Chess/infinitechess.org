// src/server/controllers/gamePageController.ts

/**
 * Builds the SSR render state for the `/game/:id/:color?` page: the client `gamePageData`
 * channel ({ id, isLive, role, viewColor }) and a display-ready view-model of the static
 * game-meta info, so the side bar paints many game info on first request without a
 * socket/HTTP round-trip.
 */

import type { Request } from 'express';
import type { ChatEntryParts } from '../../shared/components/chatentry.js';
import type { SeekPropertiesViewModel } from './seekProperties.js';
import type { GamePageData, StaticGameState } from '../../shared/transport/domain.js';

import gameurl from '../../shared/chess/util/gameurl.js';
import timeutil from '../../shared/util/timeutil.js';
import clockutil from '../../shared/chess/util/clockutil.js';
import chatentry from '../../shared/components/chatentry.js';
import chatlimits from '../../shared/util/chatlimits.js';
import metadatautil from '../../shared/chess/util/metadatautil.js';
import gameresultutil from '../../shared/chess/util/gameresultutil.js';
import { players as p, Player, PlayerGroup } from '../../shared/chess/util/typeutil.js';

import tconfig from '../config/translationConfig.js';
import manifest from '../config/manifest.js';
import chatReport from '../game/gamemanager/chatReport.js';
import gameManager from '../game/gamemanager/gameManager.js';
import gamesManager from '../database/gamesManager.js';
import deadGameState from '../game/gamemanager/deadGameState.js';
import seekProperties from './seekProperties.js';
import chatEntryMapper from '../game/gamemanager/chatEntryMapper.js';
import gameStateBuilder from '../game/gamemanager/gameStateBuilder.js';
import chatEntriesManager from '../database/chatEntriesManager.js';

// Types -----------------------------------------------------------------------

/** The full render context for `game.njk`. */
interface GamePageState {
	/** All static info about the game, serialized into the page as `window.gamePageData`. */
	gamePageData: GamePageData;
	/** Link to this game's analysis page, carrying the perspective it's currently viewed from. */
	analysisUrl: string;
	meta: GameMetaViewModel;
	/** The chat panel. Absent for spectators and engine games. */
	chat?: {
		/** The whole log, already rendered into its display parts. */
		entries: ChatEntryParts[];
		/** The report flag's menu rows. Written once in `chatReport.ts`, looped here. */
		reportReasons: typeof chatReport.REPORT_REASONS;
		/** The chat input's attributes. Absent when the game can no longer be chatted in. */
		input?: {
			/** Its `disabled` attribute — a guest in a public game may read but never send. */
			disabled: boolean;
			/** Its `maxlength`, passed through from the source of truth. */
			maxLength: number;
		};
	};
}

/**
 * Display-ready static game-meta fields, precomputed since Nunjucks can't call the shared
 * utils. Opens with the properties of the seek the game was created from.
 */
export interface GameMetaViewModel extends SeekPropertiesViewModel {
	/** Whether the game is timed. Drives whether the SSR'd `.clock` elements start hidden. */
	timed: boolean;
	/** Epoch ms the game was created; the client re-derives the ticking relative string. */
	timeCreated: number;
	/** SSR'd relative "time ago" string for first paint, e.g. `"2 minutes ago"`. */
	startedAgo: string;
	/** Present only if the game has concluded: the result banner's score + sentence. */
	result?: { score: string; text: string };
	/** Name + formatted elo per color (fixed white/black order; bars orient by {@link bars}). */
	players: PlayerGroup<{
		name: string;
		elo?: string;
		/**
		 * Present only for a finalized rated game — the delta shown
		 * beside the rating in the participant list (not the player bars).
		 */
		eloDiff?: { text: string; positive: boolean };
	}>;
	/** Player-bar orientation; bottom = the side the board is viewed from. */
	bars: { top: Player; bottom: Player };
	/** Plies played. Zero means there's nothing to analyze, so the Analysis button SSRs hidden. */
	moveCount: number;
	/**
	 * Whether the game is resignable (2+ plies played). Drives whether the offer
	 * draw button is enabled, and whether the abort or resign button is visible.
	 */
	resignable: boolean;
}

// Page State ------------------------------------------------------------------

/**
 * Resolves the render state for `/game/:id`, or `undefined`
 * if the id is malformed or names no existing game.
 * @throws If a database error occurs.
 */
function getPageState(req: Request): GamePageState | undefined {
	const id = gamesManager.decodeID(req.params['id']!);
	if (id === undefined) return undefined; // Malformed id

	const memberInfo = req.memberInfo!;

	const resolved = gameManager.produceStaticGameState(id);
	if (resolved === undefined) return undefined; // Game doesn't exist
	const { state, game, ratingChanges, moveCount } = resolved; // game is defined if live
	let { engineGame } = resolved; // Gains the client's engine asset URLs below, if live

	const role = gameManager.resolveParticipantRole(id, resolved, memberInfo); // undefined => spectator

	// Only a live engine game still needs the assets to run the engine client-side.
	if (engineGame && game) {
		const assets = manifest.get();
		const workerUrl = assets[`scripts/esm/game/chess/engines/${engineGame.engine}.worker.ts`];
		const engineUrl = assets['engine'];
		if (!workerUrl || !engineUrl) throw new Error('Engine assets missing from asset manifest.');
		engineGame = { ...engineGame, engineAssets: { workerUrl, engineUrl } };
	}

	const viewColor = resolveViewColor(req, role);
	const playerNames = gameStateBuilder.resolvePlayerNames(state, role, req.t.shared);

	return {
		gamePageData: {
			// The client channel carries the whole setup; the rest of the state feeds `meta`.
			...state.setup,
			id,
			isLive: !!game,
			role,
			viewColor,
			playerNames,
			engineGame,
		},
		analysisUrl: gameurl.getAnalysisUrl(id, viewColor),
		meta: buildGameMetaViewModel(state, resolved.icn, ratingChanges, role, viewColor, moveCount, req), // prettier-ignore
		// The chat exists only for a participant of a non-engine game
		chat:
			role !== undefined && engineGame === undefined
				? {
						entries: renderChatLog(id, role, playerNames),
						reportReasons: chatReport.REPORT_REASONS,
						// Only a live game can still be typed in, and only there is `private` knowable.
						input: game
							? {
									// A guest can't be punished for chat abuse, so they
									// may only send in a game they were invited to.
									disabled: !memberInfo.signedIn && !game.match.private,
									maxLength: chatlimits.MAX_CHAT_MESSAGE_LENGTH,
								}
							: undefined,
					}
				: undefined,
	};
}

/**
 * Resolves the viewer-facing SSR state (board perspective + meta) for a concluded game straight
 * from the database, or `undefined` if no such game row exists. Unlike {@link getPageState}
 * this ignores live games — the analysis page only ever loads a game from the DB, never a live one.
 * @throws If a database error occurs.
 */
function getDeadGameViewState(
	req: Request,
	id: number,
):
	| {
			/** The side of the board the viewer sees it from. */
			viewColor: Player;
			meta: GameMetaViewModel;
	  }
	| undefined {
	const dead = deadGameState.produceStaticState(id);
	if (dead === undefined) return undefined; // Game not in the database

	// Dead guests aren't identifiable.
	const memberInfo = req.memberInfo!;
	const role = memberInfo.signedIn
		? deadGameState.resolveParticipantColor(id, memberInfo.user_id)
		: undefined;
	const viewColor = resolveViewColor(req, role);

	return {
		viewColor,
		meta: buildGameMetaViewModel(dead.state, dead.icn, dead.ratingChanges, role, viewColor, dead.moveCount, req), // prettier-ignore
	};
}

// Page Helpers ----------------------------------------------------------------

/**
 * Resolves which side of the board the viewer sees it from: the URL's color segment if it
 * carries one, else the side they played on, else white's (spectators and non-participants).
 */
function resolveViewColor(req: Request, role: Player | undefined): Player {
	return gameurl.parseViewColorCode(req.params['color']) ?? role ?? p.WHITE;
}

/**
 * Reads a game's whole chat log and renders it for `game.njk`.
 * @throws If a database error occurs.
 */
function renderChatLog(
	id: number,
	role: Player,
	playerNames: PlayerGroup<string>,
): ChatEntryParts[] {
	return chatEntriesManager.getOfGame(id).map((record, i) => {
		const entry = chatEntryMapper.toEntry(record, i);
		return chatentry.toParts(entry, role, playerNames);
	});
}

// Game Meta -------------------------------------------------------------------

/** Derives the display-ready {@link GameMetaViewModel} from a {@link StaticGameState}. */
function buildGameMetaViewModel(
	state: StaticGameState,
	deadIcn: string | undefined,
	ratingChanges: PlayerGroup<number> | undefined,
	role: Player | undefined,
	viewColor: Player,
	moveCount: number,
	req: Request,
): GameMetaViewModel {
	const { setup } = state;

	const names = gameStateBuilder.resolvePlayerNames(state, role, req.t.shared);
	const players: GameMetaViewModel['players'] = {};
	for (const [strColor, container] of Object.entries(state.players)) {
		const color = Number(strColor) as Player;
		const change = ratingChanges?.[color];
		players[color] = {
			name: names[color]!,
			elo: container.rating ? metadatautil.getFormattedElo(container.rating) : undefined,
			eloDiff:
				change !== undefined
					? {
							text: metadatautil.getWhiteBlackRatingDiff(change),
							positive: change >= 0,
						}
					: undefined,
		};
	}

	const top = viewColor === p.WHITE ? p.BLACK : p.WHITE;

	const locale = tconfig.getDateLocale(req.lang);

	return {
		...seekProperties.build(setup, state.rated, deadIcn, req),
		bars: { top, bottom: viewColor },
		timed: !clockutil.isClockValueInfinite(setup.timeControl),
		timeCreated: setup.timeCreated,
		startedAgo: timeutil.getRelativeTimeString(setup.timeCreated, locale),
		result: state.gameConclusion
			? gameresultutil.getDisplay(state.gameConclusion, req.t.shared)
			: undefined,
		players,
		moveCount,
		resignable: moveCount > 1,
	};
}

// Exports ---------------------------------------------------------------------

export default { getPageState, getDeadGameViewState };
