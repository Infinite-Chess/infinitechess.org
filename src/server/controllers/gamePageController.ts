// src/server/controllers/gamePageController.ts

/**
 * Builds the SSR render state for the `/game/:id` page: the client `gamePageData`
 * channel ({ id, isLive, youAreColor }) and a display-ready view-model of the static
 * game-meta info, so the side bar paints many game info on first request without a
 * socket/HTTP round-trip.
 */

import type { Request } from 'express';
import type { SpeedCategory } from '../../shared/chess/util/clockutil.js';
import type { Player, PlayerGroup } from '../../shared/chess/util/typeutil.js';
import type { StaticGameState, TimeControl } from '../../shared/types.js';

import clockutil from '../../shared/chess/util/clockutil.js';
import metadatautil from '../../shared/chess/util/metadatautil.js';
import variantregistry, { VariantCode } from '../../shared/chess/variants/variantregistry.js';

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
	/** Raw time control text, e.g. `"10+4"` or `"-"`. */
	timeControl: TimeControl;
	/** Whether to render clock placeholders. */
	isTimed: boolean;
	rated: boolean;
	/** Epoch ms the game was created; the client formats the (ticking) relative string. */
	timeCreated: number;
	/** Name + formatted elo per color (fixed white/black order; bars orient by youAreColor). */
	players: PlayerGroup<{ name: string; elo?: string }>;
}

/** The full render context for `game.njk`. */
interface GamePageState {
	gamePageData: { id: number; isLive: boolean; youAreColor?: Player };
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
	let youAreColor: Player | undefined;
	if (game) {
		for (const [strColor, { identifier }] of Object.entries(game.match.playerData)) {
			if (memberInfoEqPartial(identifier, memberInfo)) {
				youAreColor = Number(strColor) as Player;
				break;
			}
		}
	} else if (memberInfo.signedIn) {
		// Dead games match members only (dead guests aren't identifiable).
		youAreColor = resolveDeadParticipantColor(id, memberInfo.user_id);
	}

	return {
		gamePageData: { id, isLive: !!game, youAreColor },
		meta: buildGameMetaViewModel(state, req),
	};
}

/** Derives the display-ready {@link GameMetaViewModel} from a {@link StaticGameState}. */
function buildGameMetaViewModel(state: StaticGameState, req: Request): GameMetaViewModel {
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
	for (const [color, container] of Object.entries(state.players)) {
		players[Number(color) as Player] = {
			name: container.username,
			...(container.rating && { elo: metadatautil.getFormattedElo(container.rating) }),
		};
	}

	return {
		variant,
		speed: {
			iconId: clockutil.getSpeedIconId(state.timeControl),
			category: clockutil.getSpeedCategory(state.timeControl),
		},
		timeControl: state.timeControl,
		isTimed: state.timeControl !== '-',
		rated: state.rated,
		timeCreated: state.timeCreated,
		players,
	};
}
