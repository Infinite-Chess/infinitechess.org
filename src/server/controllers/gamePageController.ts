// src/server/controllers/gamePageController.ts

/**
 * Builds the SSR render state for the `/game/:id` page: the client `gamePageData`
 * channel ({ id, isLive, role }) and a display-ready view-model of the static
 * game-meta info, so the side bar paints many game info on first request without a
 * socket/HTTP round-trip.
 */

import type { Request } from 'express';
import type { SpeedCategory } from '../../shared/chess/util/clockutil.js';
import type { Player, PlayerGroup } from '../../shared/chess/util/typeutil.js';
import type { GamePageData, StaticGameState } from '../../shared/types.js';

import timeutil from '../../shared/util/timeutil.js';
import clockutil from '../../shared/chess/util/clockutil.js';
import metadatautil from '../../shared/chess/util/metadatautil.js';
import gameresultutil from '../../shared/chess/util/gameresultutil.js';
import { players as p } from '../../shared/chess/util/typeutil.js';
import variantregistry, { VariantCode } from '../../shared/chess/variants/variantregistry.js';

import tconfig from '../config/translationconfig.js';
import { getManifest } from '../config/manifest.js';
import { decodeGameId } from '../database/gamesManager.js';
import { memberInfoEqPartial } from '../utility/memberInfoUtil.js';
import { produceStaticGameState } from '../game/gamemanager/gamemanager.js';
import {
	produceDeadStaticGameState,
	resolveDeadParticipantColor,
} from '../game/gamemanager/deadgamestate.js';

/** Display-ready static game-meta fields, precomputed since Nunjucks can't call the shared utils. */
export interface GameMetaViewModel {
	/** Variant group icon id + display name (custom games fall back to a generic icon/name). */
	variant: { iconId: string; name: string };
	/** Speed category icon id + category, for the speed badge. */
	speed: { iconId: string; category: SpeedCategory };
	/** User-facing time control label in `m+s` format, e.g. `"10+4"` or `"-"`. */
	timeControl: string;
	rated: boolean;
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
	/** Player-bar orientation from the viewer's role; bottom = you (or white for spectators). */
	bars: { top: Player; bottom: Player };
	/** Plies played. Zero means there's nothing to analyze, so the Analysis button SSRs hidden. */
	moveCount: number;
	/**
	 * Whether the game is resignable (2+ plies played). Drives whether the offer
	 * draw button is enabled, and whether the abort or resign button is visible.
	 */
	resignable: boolean;
}

/** The full render context for `game.njk`. */
interface GamePageState {
	/** Includes all static info about the game. */
	gamePageData: GamePageData;
	meta: GameMetaViewModel;
}

/**
 * Resolves the render state for `/game/:id`, or `undefined`
 * if the id is malformed or names no existing game.
 * @throws If a database error occurs.
 */
export function getGamePageState(req: Request): GamePageState | undefined {
	const id = decodeGameId(req.params['id']!);
	if (id === undefined) return undefined; // Malformed id

	const memberInfo = req.memberInfo!;

	const resolved = produceStaticGameState(id);
	if (resolved === undefined) return undefined; // Game doesn't exist
	const { state, game, ratingChanges, moveCount } = resolved; // game is defined if live
	let { engineGame } = resolved; // Gains the client's engine asset URLs below, if live

	// Resolve the viewer's color (board orientation + role); undefined => spectator (white POV).
	let role: Player | undefined;
	if (game) {
		for (const [strColor, { identifier }] of Object.entries(game.match.playerData)) {
			if (memberInfoEqPartial(identifier, memberInfo)) {
				role = Number(strColor) as Player;
				break;
			}
		}
	} else if (memberInfo.signedIn) {
		// Dead games match members only; dead guests aren't identifiable.
		role = resolveDeadParticipantColor(id, memberInfo.user_id);
	}

	// Only a live engine game still needs the assets to run the engine client-side.
	if (engineGame && game) {
		const manifest = getManifest();
		const workerUrl = manifest[`scripts/esm/game/chess/engines/${engineGame.engine}.worker.ts`];
		const engineUrl = manifest['engine'];
		if (!workerUrl || !engineUrl) throw new Error('Engine assets missing from asset manifest.');
		engineGame = { ...engineGame, workerUrl, engineUrl };
	}

	return {
		gamePageData: {
			// The client channel carries the whole setup; the rest of the state feeds `meta`.
			...state.setup,
			id,
			isLive: !!game,
			role,
			engineGame,
		},
		meta: buildGameMetaViewModel(state, ratingChanges, role, moveCount, req),
	};
}

/**
 * Resolves the viewer-facing SSR state (participant role + meta) for a concluded game straight
 * from the database, or `undefined` if no such game row exists. Unlike {@link getGamePageState}
 * this ignores live games — the analysis page only ever loads a game from the DB, never a live one.
 * @throws If a database error occurs.
 */
export function getDeadGameViewState(
	req: Request,
	id: number,
):
	| {
			/** The viewer's color if they were a participant; undefined => not one (white POV). */
			role?: Player;
			meta: GameMetaViewModel;
	  }
	| undefined {
	const dead = produceDeadStaticGameState(id);
	if (dead === undefined) return undefined; // Game not in the database

	// Dead guests aren't identifiable.
	const memberInfo = req.memberInfo!;
	const role = memberInfo.signedIn
		? resolveDeadParticipantColor(id, memberInfo.user_id)
		: undefined;

	return {
		...(role !== undefined && { role }),
		meta: buildGameMetaViewModel(dead.state, dead.ratingChanges, role, dead.moveCount, req),
	};
}

/** Derives the display-ready {@link GameMetaViewModel} from a {@link StaticGameState}. */
function buildGameMetaViewModel(
	state: StaticGameState,
	ratingChanges: PlayerGroup<number> | undefined,
	role: Player | undefined,
	moveCount: number,
	req: Request,
): GameMetaViewModel {
	const { setup } = state;
	const variantGroup =
		setup.variant.kind === 'preset'
			? variantregistry.getVariantGroup(setup.variant.code)
			: 'custom';
	const variantCode: VariantCode | null =
		setup.variant.kind === 'preset' ? setup.variant.code : null;
	const variant = {
		name: variantregistry.getVariantName(variantCode, req.t.shared),
		iconId: variantregistry.getVariantGroupIconId(variantGroup),
	};

	const players: PlayerGroup<{ name: string; elo?: string }> = {};
	for (const [strColor, container] of Object.entries(state.players)) {
		const color = Number(strColor) as Player;
		// A guest who is the viewer shows "(You)"; every other name is the container's own
		// (members → username, other guests → the hardcoded "(Guest)" ICN name). Mirrors the lobby.
		const isYouGuest = container.type === 'guest' && color === role;
		const change = ratingChanges?.[color];
		players[color] = {
			name: isYouGuest ? req.t.shared.user_status.you_indicator : container.username,
			...(container.rating && { elo: metadatautil.getFormattedElo(container.rating) }),
			...(change !== undefined && {
				eloDiff: {
					text: metadatautil.getWhiteBlackRatingDiff(change),
					positive: change >= 0,
				},
			}),
		};
	}

	const bottom = role ?? p.WHITE;
	const top = bottom === p.WHITE ? p.BLACK : p.WHITE;

	const locale = tconfig.getDateLocale(req.lang);

	return {
		variant,
		bars: { top, bottom },
		speed: {
			iconId: clockutil.getSpeedIconId(setup.timeControl),
			category: clockutil.getSpeedCategory(setup.timeControl),
		},
		timed: !clockutil.isClockValueInfinite(setup.timeControl),
		timeControl: clockutil.getTimeControlLabel(setup.timeControl),
		rated: state.rated,
		timeCreated: setup.timeCreated,
		startedAgo: timeutil.getRelativeTimeString(setup.timeCreated, locale),
		...(state.gameConclusion && {
			result: gameresultutil.getResultDisplay(state.gameConclusion, req.t.shared),
		}),
		players,
		moveCount,
		resignable: moveCount > 1,
	};
}
