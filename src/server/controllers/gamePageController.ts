// src/server/controllers/gamePageController.ts

/**
 * Builds the SSR render state for the `/game/:id` page: the client `gamePageData`
 * channel ({ id, isLive, role }) and a display-ready view-model of the static
 * game-meta info, so the side bar paints many game info on first request without a
 * socket/HTTP round-trip.
 */

import type { Request } from 'express';
import type { MemberInfo } from '../types.js';
import type { SpeedCategory } from '../../shared/chess/util/clockutil.js';
import type { Player, PlayerGroup } from '../../shared/chess/util/typeutil.js';
import type { EngineGamePageInfo, StaticGameSetup, StaticGameState } from '../../shared/types.js';

import timeutil from '../../shared/util/timeutil.js';
import moveutil from '../../shared/chess/util/moveutil.js';
import clockutil from '../../shared/chess/util/clockutil.js';
import metadatautil from '../../shared/chess/util/metadatautil.js';
import gameresultutil from '../../shared/chess/util/gameresultutil.js';
import { players as p } from '../../shared/chess/util/typeutil.js';
import variantregistry, { VariantCode } from '../../shared/chess/variants/variantregistry.js';

import tconfig from '../config/translationconfig.js';
import { decodeGameId } from '../database/gamesManager.js';
import { memberInfoEqPartial } from '../utility/memberInfoUtil.js';
import { produceStaticGameState } from '../game/gamemanager/gamemanager.js';
import {
	produceDeadStaticGameState,
	resolveDeadParticipantColor,
} from '../game/gamemanager/deadgamestate.js';
import {
	getLiveEngineGame,
	isEngineGameOwner,
	produceEngineGameStaticState,
	resolveDeadEngineGameParticipantColor,
} from '../game/gamemanager/enginegames.js';

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
	/**
	 * Whether the game is resignable (2+ plies played). Drives whether the offer
	 * draw button is enabled, and whether the abort or resign button is visible.
	 */
	resignable: boolean;
}

/** The full render context for `game.njk`. */
interface GamePageState {
	/** Includes all static info about the game. */
	gamePageData: {
		id: number;
		isLive: boolean;
		role?: Player;
		/** Present only for a live engine (vs computer) game — played locally by the owner. */
		engineGame?: EngineGamePageInfo;
	} & StaticGameSetup;
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
	if (resolved === undefined) return getLiveEngineGamePageState(id, memberInfo, req); // Not a PvP/logged game — maybe a live engine game.
	const { state, game, ratingChanges } = resolved; // game is defined if live

	// Resolve the viewer's color (board orientation + role); undefined => spectator (white POV).
	let role: Player | undefined;
	let resignable: boolean = false;
	if (game) {
		for (const [strColor, { identifier }] of Object.entries(game.match.playerData)) {
			if (memberInfoEqPartial(identifier, memberInfo)) {
				role = Number(strColor) as Player;
				break;
			}
		}
		resignable = moveutil.isGameResignable(game);
	} else if (memberInfo.signedIn) {
		// Dead games match members only (dead guests aren't identifiable) —
		// except engine games, whose record retains the guest owner's browser id.
		role = resolveDeadParticipantColor(id, memberInfo.user_id);
	} else {
		role = resolveDeadEngineGameParticipantColor(id, memberInfo);
	}

	return {
		gamePageData: {
			id,
			isLive: !!game,
			role,
			variant: state.variant,
			timeControl: state.timeControl,
			timeCreated: state.timeCreated,
		},
		meta: buildGameMetaViewModel(state, ratingChanges, role, resignable, req),
	};
}

/**
 * Resolves the render state for a LIVE engine (vs computer) game, or `undefined` if the id
 * names none — or the viewer isn't its owner (only the owner can open a live engine game;
 * once concluded it's a normal dead game anyone can view).
 * @throws If a database error occurs.
 */
function getLiveEngineGamePageState(
	id: number,
	memberInfo: MemberInfo,
	req: Request,
): GamePageState | undefined {
	const row = getLiveEngineGame(id);
	if (row === undefined) return undefined;
	if (!isEngineGameOwner(row, memberInfo)) return undefined;

	const { state, engineGame, resignable } = produceEngineGameStaticState(row);
	const role = row.player_color as Player;

	return {
		gamePageData: {
			id,
			isLive: false, // No socket — the game runs locally in the owner's browser.
			role,
			engineGame,
			variant: state.variant,
			timeControl: state.timeControl,
			timeCreated: state.timeCreated,
		},
		meta: buildGameMetaViewModel(state, undefined, role, resignable, req),
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

	// Resolve the viewer's color for board orientation; dead guests aren't
	// identifiable — except engine-game owners (their browser id is retained).
	const memberInfo = req.memberInfo!;
	const role = memberInfo.signedIn
		? resolveDeadParticipantColor(id, memberInfo.user_id)
		: resolveDeadEngineGameParticipantColor(id, memberInfo);

	return {
		...(role !== undefined && { role }),
		meta: buildGameMetaViewModel(dead.state, dead.ratingChanges, role, false, req),
	};
}

/** Derives the display-ready {@link GameMetaViewModel} from a {@link StaticGameState}. */
function buildGameMetaViewModel(
	state: StaticGameState,
	ratingChanges: PlayerGroup<number> | undefined,
	role: Player | undefined,
	resignable: boolean,
	req: Request,
): GameMetaViewModel {
	const variantGroup =
		state.variant.kind === 'preset'
			? variantregistry.getVariantGroup(state.variant.code)
			: 'custom';
	const variantCode: VariantCode | null =
		state.variant.kind === 'preset' ? state.variant.code : null;
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
			iconId: clockutil.getSpeedIconId(state.timeControl),
			category: clockutil.getSpeedCategory(state.timeControl),
		},
		timed: !clockutil.isClockValueInfinite(state.timeControl),
		timeControl: clockutil.getTimeControlLabel(state.timeControl),
		rated: state.rated,
		timeCreated: state.timeCreated,
		startedAgo: timeutil.getRelativeTimeString(state.timeCreated, locale),
		...(state.gameConclusion && {
			result: gameresultutil.getResultDisplay(state.gameConclusion, req.t.shared),
		}),
		players,
		resignable,
	};
}
