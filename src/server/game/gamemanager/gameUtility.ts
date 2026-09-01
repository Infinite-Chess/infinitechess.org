// src/server/game/gamemanager/gameUtility.ts

/**
 * Builds a single server-side game, and answers simple questions about one.
 *
 * A dependency-free leaf: everything here reads or constructs a {@link ServerGame} and
 * nothing more. Sending lives in `gameSockets.ts`, outward projections in
 * `gameStateBuilder.ts`, and the life cycle in `gameManager.ts` / `gameLifecycle.ts`.
 */

import type { GameRules } from '../../../shared/chess/util/gamerules.js';
import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { VariantCode } from '../../../shared/chess/util/variantcodes.js';
import type { SeekVariant } from '../../../shared/chess/util/variantselection.js';
import type { ClockValues } from '../../../shared/chess/util/clockutil.js';
import type { AuthMemberInfo } from '../../types.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { Game, LoadedVariant, VariantOptions } from '../../../shared/chess/logic/gamefile.js';
import type {
	EngineInfo,
	GameConstruction,
	GameSetup,
	MatchInfo,
	ServerGame,
} from './serverGameTypes.js';

import uuid from '../../../shared/util/uuid.js';
import clock from '../../../shared/chess/logic/clock.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';
import timeutil from '../../../shared/util/timeutil.js';
import moveutil from '../../../shared/chess/logic/moveutil.js';
import boardinit from '../../../shared/chess/logic/boardinit.js';
import variantcache from '../../../shared/chess/variants/variantcache.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import variantrules from '../../../shared/chess/logic/variantrules.js';
import apeironborder from '../../../shared/chess/logic/apeironborder.js';
import gameformulator from '../../../shared/chess/game/gameformulator.js';
import gamefileutility from '../../../shared/chess/logic/gamefileutility.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';
import servervalidation from '../../../shared/chess/variants/servervalidation.js';

import logEvents from '../../utility/logEvents.js';

// Construction ----------------------------------------------------------------

/**
 * The registry code of the variant a game is played with, or `null` if it's a custom position —
 * the shape both the `variant` columns and `variantregistry.getVariantName` take.
 */
function getVariantCode(variant: SeekVariant): VariantCode | null {
	return variant.kind === 'preset' ? variant.code : null;
}

/**
 * Resolves what a game's board is built from: a preset variant's own position, or the explicit
 * one a custom game's ICN carries. Custom positions go through the very resolver the client loads
 * them with ({@link gameformulator.constructionOptionsFromLongFormat}), so the two can't disagree
 * on the board — which they must not, since every move is validated against ours.
 * @param dateTimestamp - The game's start time, pinning a PRESET variant's revision. A custom
 *   position pins its own with the source-variant tags in its ICN.
 * @param slideLimit - The value of the Slide Limit modifier, if it's active.
 * @param engineGame - Whether the engine is a participant. A preset carries no world border over
 *   the wire, so an engine game's is resolved here; a custom position's arrives in its ICN.
 */
function resolveGameConstruction(
	variant: SeekVariant,
	dateTimestamp: number,
	slideLimit: number | undefined,
	engineGame: boolean,
): GameConstruction {
	let loaded: LoadedVariant | undefined;
	let gameRules: GameRules;
	let variantOptions: VariantOptions | undefined;

	if (variant.kind === 'preset') {
		loaded = {
			code: variant.code,
			mod: variantcache.getModule(variant.code),
			dateTimestamp,
		};
		gameRules = variantrules.getGameRulesOfVariant(loaded); // Already a fresh copy
		// The board an engine game is played on.
		if (engineGame && gameRules.worldBorder === undefined) {
			gameRules.worldBorder = apeironborder.forVariant(loaded);
		}
	} else {
		// The ICN is the source of truth for the position, the gamerules, and which variant
		// revision it's a position of. Parsing can't fail here — a position only becomes a
		// game's after seek validation has already parsed it.
		const longFormat = icnconverter.ShortToLong_Format(variant.position);
		const resolved = gameformulator.constructionOptionsFromLongFormat(longFormat);
		variantOptions = resolved.additional.variantOptions;
		loaded = resolved.variant && {
			...resolved.variant,
			mod: variantcache.getModule(resolved.variant.code), // Every module is preloaded at startup
		};
		gameRules = variantOptions.gameRules;
	}

	const construction: GameConstruction = {
		variant: loaded,
		gameRules,
		variantOptions,
		validateMoves: servervalidation.isGameValidated(variant, loaded),
	};

	// Slide Limit modifier override. Must precede boardinit.init(),
	// which reads gameRules.slideLimit to narrow the sliding movesets.
	if (slideLimit !== undefined) construction.gameRules.slideLimit = BigInt(slideLimit);

	return construction;
}

/**
 * Construct the match object based on the game setup and how players have been assigned
 */
function initMatch(
	setup: GameSetup,
	id: number,
	assignedPlayers: PlayerGroup<{ identifier: AuthMemberInfo }>,
): MatchInfo {
	const playerData: MatchInfo['playerData'] = {};

	for (const [c, { identifier }] of Object.entries(assignedPlayers)) {
		playerData[Number(c) as Player] = {
			identifier,
			disconnect: {
				timeOpponentMayClaim: undefined,
				voluntary: undefined,
			},
		};
	}

	return {
		id,
		variant: setup.variant,
		playerData,
		engineParticipant: setup.engineParticipant,
		timeCreated: Date.now(),
		rated: setup.rated,
		modifiers: setup.modifiers,
		clock: setup.time,
		freed: false,
		finalized: false,
		rematchOffers: new Set(),
	};
}

/**
 * Constructs a ServerGame from an initialized game and match.
 * Handles both validated (board-tracked) and non-validated variants.
 * Pass an existing moves list to replay them (e.g. on server restore); omit for a fresh game.
 */
function initServerGame(
	game: Game,
	construction: GameConstruction,
	match: MatchInfo,
	moves: MoveRecord[] = [],
): ServerGame {
	const { variant, gameRules, variantOptions, validateMoves } = construction;
	if (validateMoves) {
		const boardsim = boardinit.init(gameRules, variant, { variantOptions });
		// The same load the client runs, so both ends settle on identical
		// win conditions and starting check state. Spread last, so the servergame's
		// rules are the board's own copy — never a second one.
		const loaded = gamefile.loadGameWithBoard(game, boardsim, moves);
		return { ...loaded, match, spectators: new Set(), validateMoves: true };
	} else {
		return {
			...game,
			gameRules,
			match,
			whosTurn: gameRules.turnOrder[moves.length % gameRules.turnOrder.length]!,
			moves,
			spectators: new Set(),
			validateMoves: false,
		};
	}
}

/**
 * Assigns which player is what color, depending on the `color` property of the seek.
 *
 * WE MUST EXPLICITLY have arguments for each player, as otherwise a bug is introduced
 * if this is called with only 1 player!! And type safety doesn't catch it.
 * @param seekColor - The color property of the seek. "Random" / "White" / "Black"
 * @param player1 - The first player (the seek owner).
 * @param player2 - The second player (the seek accepter).
 * @returns An object mapping player color to player info.
 */
function assignWhiteBlackPlayersFromSeek(
	seekColor: Player | null,
	player1: AuthMemberInfo,
	player2: AuthMemberInfo,
): PlayerGroup<AuthMemberInfo> {
	// { id, owner, variant, clock, color, rated }
	const colorData: PlayerGroup<AuthMemberInfo> = {};
	if (seekColor === p.WHITE) {
		colorData[p.WHITE] = player1;
		colorData[p.BLACK] = player2;
	} else if (seekColor === p.BLACK) {
		colorData[p.WHITE] = player2;
		colorData[p.BLACK] = player1;
	} else if (seekColor === null) {
		// Random
		if (Math.random() > 0.5) {
			colorData[p.WHITE] = player1;
			colorData[p.BLACK] = player2;
		} else {
			colorData[p.WHITE] = player2;
			colorData[p.BLACK] = player1;
		}
	} else throw Error(`Unsupported color ${seekColor} when assigning players to game.`);

	return colorData;
}

// Predicates ------------------------------------------------------------------

/** Returns true if the game is against an engine opponent. */
function isEngineGame(servergame: ServerGame): boolean {
	return servergame.match.engineParticipant !== undefined;
}

/**
 * Returns true if the provided color's opponent has been told they can claim
 * victory/draw against them (i.e. the claim-window timestamp is set, whether or
 * not it has elapsed yet). NOT whether the 5-second reconnection cushion has started.
 */
function isClaimWindowSetForColor(match: MatchInfo, role: Player): boolean {
	return match.playerData[role]!.disconnect.timeOpponentMayClaim !== undefined;
}

/**
 * Returns true if the provided color is currently disconnected — either still in the
 * reconnection cushion, or with their opponent's claim window set.
 */
function isColorDisconnected(match: MatchInfo, role: Player): boolean {
	const { startTime, timeOpponentMayClaim } = match.playerData[role]!.disconnect;
	return startTime !== undefined || timeOpponentMayClaim !== undefined;
}

/**
 * Tests if the game has just become resignable with the latest move (exactly 2 moves have been played).
 * @returns *true* if the game has just become resignable after the last move.
 */
function isGameBorderlineResignable(servergame: ServerGame): boolean {
	return servergame.moves.length === 2;
}

// Clocks ----------------------------------------------------------------------

/**
 * Return the clock values of the servergame that can be sent to a client or logged.
 * It also includes who's clock is currently counting down, if one is.
 * This also updates the clocks, as the players current time should not be the same as when their turn first started.
 */
function getClockValues(servergame: ServerGame & { untimed: false }): ClockValues {
	updateClockValues(servergame);
	return clock.createEdit(servergame.clocks);
}

/**
 * Update the games clock values. This is NOT called after the clocks are pushed,
 * This is called right before we send clock information to the client, so that
 * it's as accurate as possible.
 */
function updateClockValues(servergame: ServerGame & { untimed: false }): void {
	const now = Date.now();
	if (!moveutil.isGameResignable(servergame) || gamefileutility.isGameOver(servergame)) return;
	if (servergame.clocks.colorTicking === undefined) return;
	if (servergame.clocks.timeAtTurnStart === undefined)
		throw new Error('cannot update clock values when timeAtTurnStart is not defined!');

	const timeElapsedSinceTurnStart = now - servergame.clocks.timeAtTurnStart;
	const newTime = servergame.clocks.timeRemainAtTurnStart! - timeElapsedSinceTurnStart;
	const playerdata = servergame.clocks.currentTime;
	if (playerdata[servergame.whosTurn] === undefined) {
		logEvents.addAndPrint(
			`Cannot update games clock values when whose turn doesn't have a clock! "${servergame.whosTurn}"`,
			'errLog',
		);
		return;
	}
	playerdata[servergame.whosTurn] = newTime;
}

// Debug Printing --------------------------------------------------------------

/**
 * Safely prints a game to the console. Temporarily stringifies the
 * player sockets to remove self-referencing, and removes Node timers.
 */
function printGame(servergame: ServerGame): void {
	const stringifiedGame = getSimplifiedGameString(servergame);
	console.log(JSON.parse(stringifiedGame)); // Turning it back into an object gives it a special formatting in the console, instead of just printing a string.
}

/**
 * Stringifies a game, by removing any recursion or Node timers from within, so it's JSON.stringify()'able.
 * Only meant for eye-balling games in the console, not used as source of truth.
 * @returns The simplified game string
 */
function getSimplifiedGameString(servergame: ServerGame): string {
	// Only transfer interesting information.
	const players: PlayerGroup<AuthMemberInfo | EngineInfo> = {};
	for (const [c, data] of Object.entries(servergame.match.playerData)) {
		players[Number(c) as Player] = data.identifier;
	}
	if (servergame.match.engineParticipant) {
		const { color, ...engineInfo } = servergame.match.engineParticipant;
		players[color] = engineInfo;
	}

	let moves: undefined | string[];
	if (servergame.moves.length > 0) moves = servergame.moves.map((m) => m.token);
	const simplifiedGame = {
		id: `${servergame.match.id} (${uuid.base10ToBase62(servergame.match.id)})`,
		timeCreated: timeutil.timestampToISO(servergame.match.timeCreated),
		timeEnded:
			servergame.match.timeEnded !== undefined
				? timeutil.timestampToISO(servergame.match.timeEnded)
				: undefined,
		variant: getVariantCode(servergame.match.variant) ?? 'Custom',
		clock: servergame.match.clock,
		rated: servergame.match.rated,
		players,
		moves,
	};

	return JSON.stringify(simplifiedGame);
}

// Exports ---------------------------------------------------------------------

export default {
	// Construction
	getVariantCode,
	resolveGameConstruction,
	initMatch,
	initServerGame,
	assignWhiteBlackPlayersFromSeek,
	// Predicates
	isEngineGame,
	isClaimWindowSetForColor,
	isColorDisconnected,
	isGameBorderlineResignable,
	// Clocks
	getClockValues,
	// Debug Printing
	printGame,
	getSimplifiedGameString,
};
