// src/server/controllers/gamePageController.ts

/**
 * Builds the SSR render state for the `/game/:id` page: the client `gamePageData`
 * channel ({ id, isLive, role }) and a display-ready view-model of the static
 * game-meta info, so the side bar paints many game info on first request without a
 * socket/HTTP round-trip.
 */

import type { Request } from 'express';
import type { SpeedCategory } from '../../shared/chess/util/clockutil.js';
import type { StaticGameState } from '../../shared/types.js';
import type { Player, PlayerGroup } from '../../shared/chess/util/typeutil.js';

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
import { resolveDeadParticipantColor } from '../game/gamemanager/deadgamestate.js';

/** Display-ready static game-meta fields, precomputed since Nunjucks can't call the shared utils. */
interface GameMetaViewModel {
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
	players: PlayerGroup<{ name: string; elo?: string }>;
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
	gamePageData: { id: number; isLive: boolean; role?: Player };
	meta: GameMetaViewModel;
}

/**
 * Resolves the render state for `/game/:id`, or `undefined`
 * if the id is malformed or names no existing game.
 * @throws If a database error occurs (from the underlying producers).
 */
export function getGamePageState(req: Request): GamePageState | undefined {
	const id = decodeGameId(req.params['id']!);
	if (id === undefined) return undefined; // Malformed id

	const resolved = produceStaticGameState(id);
	if (resolved === undefined) return undefined; // Game doesn't exist
	const { state, game } = resolved; // game is defined if live

	// Resolve the viewer's color (board orientation + role); undefined => spectator (white POV).
	const memberInfo = req.memberInfo!;
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
		// Dead games match members only (dead guests aren't identifiable).
		role = resolveDeadParticipantColor(id, memberInfo.user_id);
	}

	return {
		gamePageData: { id, isLive: !!game, role },
		meta: buildGameMetaViewModel(state, role, resignable, req),
	};
}

/** Derives the display-ready {@link GameMetaViewModel} from a {@link StaticGameState}. */
function buildGameMetaViewModel(
	state: StaticGameState,
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
		players[color] = {
			name: isYouGuest ? req.t.shared.user_status.you_indicator : container.username,
			...(container.rating && { elo: metadatautil.getFormattedElo(container.rating) }),
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
