// src/server/controllers/gamePageController.ts

/**
 * Builds the SSR render state for the `/game/:id/:color?` page: the client `gamePageData`
 * channel ({ id, isLive, role, viewColor }) and a display-ready view-model of the static
 * game-meta info, so the side bar paints many game info on first request without a
 * socket/HTTP round-trip.
 */

import type { Request } from 'express';
import type { GameRules } from '../../shared/chess/util/gamerules.js';
import type { SpeedCategory } from '../../shared/chess/util/clockutil.js';
import type { GlobalGameState } from '../../shared/chess/logic/state.js';
import type { Player, PlayerGroup } from '../../shared/chess/util/typeutil.js';
import type { GamePageData, StaticGameSetup, StaticGameState } from '../../shared/domain.js';

import gameurl from '../../shared/util/gameurl.js';
import timeutil from '../../shared/util/timeutil.js';
import clockutil from '../../shared/chess/util/clockutil.js';
import icnimport from '../../shared/chess/logic/icn/icnimport.js';
import metadatautil from '../../shared/chess/util/metadatautil.js';
import variantcache from '../../shared/chess/variants/variantcache.js';
import icnconverter from '../../shared/chess/logic/icn/icnconverter.js';
import gameresultutil from '../../shared/chess/util/gameresultutil.js';
import variantpreviewer from '../../shared/chess/variants/variantpreviewer.js';
import { players as p } from '../../shared/chess/util/typeutil.js';
import { summarizeGameRules } from '../../shared/chess/variants/gamerulesummary.js';
import variantregistry, { VariantCode } from '../../shared/chess/variants/variantregistry.js';

import tconfig from '../config/translationconfig.js';
import { getManifest } from '../config/manifest.js';
import { getPieceSVG } from '../config/piecesvgcache.js';
import { decodeGameId } from '../database/gamesManager.js';
import { memberInfoEqPartial } from '../utility/memberInfoUtil.js';
import { produceStaticGameState } from '../game/gamemanager/gamemanager.js';
import {
	produceDeadStaticGameState,
	resolveDeadParticipantColor,
} from '../game/gamemanager/deadgamestate.js';

// Types -----------------------------------------------------------------------------

/** The full render context for `game.njk`. */
interface GamePageState {
	/** Includes all static info about the game. */
	gamePageData: GamePageData;
	/** Link to this game's analysis page, carrying the perspective it's currently viewed from. */
	analysisUrl: string;
	meta: GameMetaViewModel;
}

/** Display-ready static game-meta fields, precomputed since Nunjucks can't call the shared utils. */
export interface GameMetaViewModel {
	/** Variant group icon id + display name (custom games fall back to a generic icon/name). */
	variant: { iconId: string; name: string };
	/**
	 * How this game's rules depart from the standard ones. Empty when it plays entirely
	 * by the defaults, in which case the page omits the row. Matches, line for line, what
	 * the variant preview tooltip showed on the seek this game was created from.
	 */
	rules: RuleLineViewModel[];
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

/**
 * One line of the gamerule summary, ready to print. A promotion
 * line's pieces arrive as the raw `<svg>` markup to inline.
 */
type RuleLineViewModel =
	| { kind: 'text'; text: string }
	| { kind: 'promotion'; prefix: string; svgs: string[]; suffix: string };

// Functions -------------------------------------------------------------------------

/**
 * Resolves the render state for `/game/:id`, or `undefined`
 * if the id is malformed or names no existing game.
 * @throws If a database error occurs.
 */
function getGamePageState(req: Request): GamePageState | undefined {
	const id = decodeGameId(req.params['id']!);
	if (id === undefined) return undefined; // Malformed id

	const memberInfo = req.memberInfo!;

	const resolved = produceStaticGameState(id);
	if (resolved === undefined) return undefined; // Game doesn't exist
	const { state, game, ratingChanges, moveCount } = resolved; // game is defined if live
	let { engineGame } = resolved; // Gains the client's engine asset URLs below, if live

	// Resolve the viewer's role in the game; undefined => spectator.
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

	const viewColor = resolveViewColor(req, role);

	return {
		gamePageData: {
			// The client channel carries the whole setup; the rest of the state feeds `meta`.
			...state.setup,
			id,
			isLive: !!game,
			role,
			viewColor,
			engineGame,
		},
		analysisUrl: gameurl.getAnalysisUrl(id, viewColor),
		meta: buildGameMetaViewModel(state, resolved.icn, ratingChanges, role, viewColor, moveCount, req), // prettier-ignore
	};
}

/**
 * Resolves which side of the board the viewer sees it from: the URL's color segment if it
 * carries one, else the side they played on, else white's (spectators and non-participants).
 */
function resolveViewColor(req: Request, role: Player | undefined): Player {
	return gameurl.parseViewColorCode(req.params['color']) ?? role ?? p.WHITE;
}

/**
 * Resolves the viewer-facing SSR state (board perspective + meta) for a concluded game straight
 * from the database, or `undefined` if no such game row exists. Unlike {@link getGamePageState}
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
	const dead = produceDeadStaticGameState(id);
	if (dead === undefined) return undefined; // Game not in the database

	// Dead guests aren't identifiable.
	const memberInfo = req.memberInfo!;
	const role = memberInfo.signedIn
		? resolveDeadParticipantColor(id, memberInfo.user_id)
		: undefined;
	const viewColor = resolveViewColor(req, role);

	return {
		viewColor,
		meta: buildGameMetaViewModel(
			dead.state,
			dead.icn,
			dead.ratingChanges,
			role,
			viewColor,
			dead.moveCount,
			req,
		),
	};
}

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

	const top = viewColor === p.WHITE ? p.BLACK : p.WHITE;

	const locale = tconfig.getDateLocale(req.lang);

	return {
		variant,
		rules: buildRuleLines(setup, deadIcn, req),
		bars: { top, bottom: viewColor },
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

// Gamerule summary ------------------------------------------------------------------

/**
 * Summarizes how a game's rules depart from the standard ones, resolving
 * each promotion piece to the SVG markup the page inlines for it.
 */
function buildRuleLines(
	setup: StaticGameSetup,
	deadIcn: string | undefined,
	req: Request,
): RuleLineViewModel[] {
	const { gameRules, state_global } = resolveGameRules(setup, deadIcn);
	const variantCode = setup.variant.kind === 'preset' ? setup.variant.code : undefined;
	const items = summarizeGameRules(gameRules, state_global, variantCode, setup.modifiers, req.t.shared); // prettier-ignore

	return items.map((item): RuleLineViewModel => {
		if (item.kind === 'text') return item;
		const { prefix, pieces, suffix } = item;
		return { kind: 'promotion', prefix, svgs: pieces.map(getPieceSVG), suffix };
	});
}

/**
 * Resolves the rules a game is played by, the same way game construction does: a preset
 * variant rebuilds them from its module, a custom position reads them off its ICN.
 * @param icn - The custom game's ICN. Ignored for a preset, which carries its own rules.
 */
function resolveGameRules(
	setup: StaticGameSetup,
	deadIcn: string | undefined,
): { gameRules: GameRules; state_global: GlobalGameState | undefined } {
	if (setup.variant.kind === 'preset') {
		const loaded = {
			code: setup.variant.code,
			mod: variantcache.getModule(setup.variant.code), // Every module is preloaded at startup
			dateTimestamp: setup.timeCreated,
		};
		// A preset always starts clean, so it has no global state worth summarizing.
		return {
			gameRules: variantpreviewer.getGameRulesOfVariant(loaded),
			state_global: undefined,
		};
	}
	// A live game carries its start position in its setup; a concluded
	// one's is the database record. One of the two is always present.
	const icn = setup.variant.position ?? deadIcn;
	if (icn === undefined) throw new Error('Custom game has no ICN to read its rules from.');

	const longFormat = icnconverter.ShortToLong_Format(icn);
	const { gameRules, state_global } = icnimport.variantOptionsFromLongFormat(longFormat);
	return { gameRules, state_global };
}

// Exports ---------------------------------------------------------------------------

export { getGamePageState, getDeadGameViewState };
