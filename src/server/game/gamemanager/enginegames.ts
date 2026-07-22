// src/server/game/gamemanager/enginegames.ts

/**
 * Server-side lifecycle of engine (vs computer) games. The engine runs locally in the
 * owner's browser — the server never validates moves or runs clocks. It only:
 *
 * * records the game at creation (engine_games table),
 * * stores per-move progress syncs so a mid-game refresh can resume,
 * * on conclusion, logs the finished game to the permanent games/player_games
 *   tables exactly like a PvP game (casual, no ratings/stats).
 */

import type { CoordsKey } from '../../../shared/chess/util/coordutil.js';
import type { GameRules } from '../../../shared/chess/util/gamerules.js';
import type { MemberInfo } from '../../types.js';
import type { MoveParsed } from '../../../shared/chess/logic/icn/icnconverter.js';
import type { VariantCode } from '../../../shared/chess/variants/variantregistry.js';
import type { GlobalGameState } from '../../../shared/chess/logic/state.js';
import type { MetaData, Rating } from '../../../shared/types.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type {
	AuthSeekVariant,
	ConcludeEngineGameBody,
	EngineGamePageInfo,
	EngineGameProgressBody,
	EngineGameState,
	ServerUsernameContainer,
	StaticGameState,
	TimeControl,
} from '../../../shared/types.js';

import uuid from '../../../shared/util/uuid.js';
import timeutil from '../../../shared/util/timeutil.js';
import compression from '../../../shared/util/compression.js';
import { countEngineGamePlies } from '../../../shared/types.js';
import clockutil from '../../../shared/chess/util/clockutil.js';
import icnimport from '../../../shared/chess/logic/icn/icnimport.js';
import winconutil from '../../../shared/chess/util/winconutil.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import variantcache from '../../../shared/chess/variants/variantcache.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import variantregistry from '../../../shared/chess/variants/variantregistry.js';
import typeutil, { players as p } from '../../../shared/chess/util/typeutil.js';
import gamefile, { LoadedVariant } from '../../../shared/chess/logic/gamefile.js';
import { getFormattedEngineName, ValidEngine } from '../../../shared/chess/engine.js';
import {
	VariantLeaderboards,
	Leaderboards,
} from '../../../shared/chess/variants/validleaderboard.js';

import db from '../../database/database.js';
import tconfig from '../../config/translationconfig.js';
import { isGameIdTaken } from '../../database/gamesManager.js';
import { getScriptTranslations } from '../../config/componentTranslationLoader.js';
import { getMemberDataByCriteria } from '../../database/memberManager.js';
import { getEloOfPlayerInLeaderboard } from '../../database/leaderboardsManager.js';
import {
	EngineGamesRecord,
	insertEngineGame,
	getEngineGameData,
	updateEngineGame,
	deleteEngineGame,
} from '../../database/engineGamesManager.js';

/** Display name for a player whose account was deleted (mirrors deadgamestate.ts). */
const DELETED_USER_DISPLAY_NAME = '(Deleted User)';

/** Conclusion conditions that can't occur in an engine game (they require a second human). */
const IMPOSSIBLE_ENGINE_CONDITIONS = ['agreement', 'disconnect', 'abandonment'];

// Creation ------------------------------------------------------------------------------------------

/**
 * Creates a new engine game record under the given (already issued, unique) game id.
 * @throws If a database error occurs.
 */
export function createEngineGame(
	game_id: number,
	owner: MemberInfo,
	options: {
		variant: AuthSeekVariant;
		timeControl: TimeControl;
		/** The color the human plays. */
		color: Player;
		engine: ValidEngine;
		strengthLevel: number;
	},
): void {
	const now = Date.now();

	// Both colors start with the base time (null clock columns = untimed).
	const clockParts = clockutil.getMinutesAndIncrementFromClock(options.timeControl);
	const startMillis = clockParts !== null ? timeutil.minutesToMillis(clockParts.minutes) : null;

	insertEngineGame({
		game_id,
		time_created: now,
		user_id: owner.signedIn ? owner.user_id : null,
		browser_id: owner.browser_id ?? '',
		player_color: options.color,
		engine: options.engine,
		strength_level: options.strengthLevel,
		variant: options.variant.kind === 'preset' ? options.variant.code : null,
		position: options.variant.kind === 'custom' ? options.variant.position : null,
		clock: options.timeControl,
		moves: '',
		clock_white: startMillis,
		clock_black: startMillis,
		turn_start_time: null, // No clock ticks until ply 2.
		last_updated: now,
	});
}

// Reads ---------------------------------------------------------------------------------------------

/**
 * Returns the full engine_games row of a LIVE (not yet concluded) engine
 * game, or `undefined` if the id names no engine game or a concluded one.
 * @throws If a database error occurs.
 */
export function getLiveEngineGame(game_id: number): EngineGamesRecord | undefined {
	// prettier-ignore
	const row = getEngineGameData(game_id, ['game_id', 'time_created', 'user_id', 'browser_id', 'player_color', 'engine', 'strength_level', 'variant', 'position', 'clock', 'moves', 'clock_white', 'clock_black', 'turn_start_time', 'last_updated']);
	if (row === undefined) return undefined;
	if (isGameIdTaken(game_id)) return undefined; // Concluded — the dead-game path owns it now.
	return row;
}

/** Whether the given viewer identity owns (is the human participant of) the engine game. */
export function isEngineGameOwner(row: EngineGamesRecord, memberInfo: MemberInfo): boolean {
	if (memberInfo.signedIn) return row.user_id === memberInfo.user_id;
	return memberInfo.browser_id !== undefined && row.browser_id === memberInfo.browser_id;
}

/** The number of moves currently synced for the game. */
function getMoveCount(row: EngineGamesRecord): number {
	return countEngineGamePlies(row.moves);
}

/** The engine participant's username container. */
function buildEngineUsernameContainer(
	engine: string,
	strengthLevel: number,
): ServerUsernameContainer {
	return {
		type: 'engine',
		username: getFormattedEngineName(engine as ValidEngine, strengthLevel),
	};
}

/**
 * Builds the {@link StaticGameState} of a live engine game for the game page's SSR,
 * plus whether it's resignable (2+ plies) and the engine info for `gamePageData`.
 * @throws If a database error occurs.
 */
export function produceEngineGameStaticState(row: EngineGamesRecord): {
	state: StaticGameState;
	engineGame: EngineGamePageInfo;
	resignable: boolean;
} {
	// The human's container: username + live rating for members, guest label otherwise.
	let humanContainer: ServerUsernameContainer;
	if (row.user_id !== null) {
		const member = getMemberDataByCriteria(['username'], 'user_id', row.user_id);
		humanContainer = {
			type: 'player',
			username: member?.username ?? DELETED_USER_DISPLAY_NAME,
		};
		const leaderboardId =
			row.variant !== null
				? (VariantLeaderboards[row.variant as VariantCode] ?? Leaderboards.INFINITY)
				: Leaderboards.INFINITY;
		const rating: Rating | undefined = getEloOfPlayerInLeaderboard(row.user_id, leaderboardId);
		if (rating) humanContainer.rating = rating;
	} else {
		humanContainer = { type: 'guest', username: metadatautil.GUEST_NAME_ICN_METADATA };
	}

	const humanColor = row.player_color as Player;
	const players: PlayerGroup<ServerUsernameContainer> = {
		[humanColor]: humanContainer,
		[typeutil.invertPlayer(humanColor)]: buildEngineUsernameContainer(row.engine, row.strength_level), // prettier-ignore
	};

	return {
		state: {
			rated: false,
			variant:
				row.variant !== null
					? { kind: 'preset', code: row.variant as VariantCode }
					: { kind: 'custom' },
			timeControl: row.clock as TimeControl,
			timeCreated: row.time_created,
			players,
		},
		engineGame: {
			engine: row.engine as ValidEngine,
			strengthLevel: row.strength_level,
		},
		resignable: getMoveCount(row) >= 2,
	};
}

/** Builds the owner's resumable {@link EngineGameState} (the `GET /api/engine-game/:id` payload). */
export function produceEngineGameResumeState(row: EngineGamesRecord): EngineGameState {
	const state: EngineGameState = { moves: row.moves };
	if (row.position !== null) state.position = row.position;
	if (row.clock_white !== null && row.clock_black !== null)
		state.clocks = { [p.WHITE]: row.clock_white, [p.BLACK]: row.clock_black };
	if (row.turn_start_time !== null) state.turnStartTime = row.turn_start_time;
	return state;
}

// Progress & Conclusion -------------------------------------------------------------------------------

/**
 * Records a mid-game state sync from the owner's client.
 * @throws If a database error occurs.
 */
export function recordEngineGameProgress(game_id: number, body: EngineGameProgressBody): void {
	updateEngineGame(game_id, {
		moves: body.moves,
		clock_white: body.clocks?.[p.WHITE] ?? null,
		clock_black: body.clocks?.[p.BLACK] ?? null,
		turn_start_time: body.turnStartTime ?? null,
		last_updated: Date.now(),
	});
}

/**
 * Concludes an engine game: logs it to the permanent games/player_games tables (casual —
 * no ratings, leaderboards, or player stats), then blanks the live-state columns. A game
 * concluded with zero moves is never stored — its record is deleted entirely instead.
 * @returns Whether the game was logged (false = zero moves, record deleted).
 * @throws If the conclusion is impossible for an engine game, the moves/position fail to
 * parse, or a database error occurs (rolled back).
 */
export async function concludeEngineGame(
	row: EngineGamesRecord,
	body: ConcludeEngineGameBody,
): Promise<boolean> {
	if (IMPOSSIBLE_ENGINE_CONDITIONS.includes(body.gameConclusion.condition))
		throw Error(`Impossible engine game conclusion: ${body.gameConclusion.condition}`);

	const moves: MoveParsed[] = icnconverter.parseShortFormMoves(body.moves);
	// An unparseable non-empty moves string must not masquerade as a zero-move abort.
	if (body.moves !== '' && moves.length === 0)
		throw Error('Engine game conclusion moves string failed to parse.');
	if (moves.length === 0) {
		deleteEngineGame(row.game_id); // Zero-move games are never stored.
		return false;
	}

	const { victor, condition } = body.gameConclusion;
	const now = Date.now();

	// Resolve the game's rules + (for custom games) start position.
	let gameRules: GameRules;
	let fullMove = 1;
	let position: Map<CoordsKey, number> | undefined;
	let state_global: Partial<GlobalGameState>;
	if (row.variant !== null) {
		const variant: LoadedVariant = {
			code: row.variant as VariantCode,
			mod: variantcache.getModule(row.variant as VariantCode),
			dateTimestamp: row.time_created,
		};
		gameRules = gamefile.initGame(row.clock as TimeControl, row.time_created, variant).gameRules; // prettier-ignore
		state_global = { moveRuleState: gameRules.moveRule !== undefined ? 0 : undefined };
	} else {
		const longformOut = icnconverter.ShortToLong_Format(row.position!);
		const variantOptions = icnimport.variantOptionsFromLongFormat(longformOut);
		gameRules = variantOptions.gameRules;
		fullMove = variantOptions.fullMove;
		position = variantOptions.position;
		state_global = variantOptions.state_global;
	}

	// The `games.termination` column stores the raw condition code (e.g. "resignation") — the
	// dead-game reader feeds it straight back as `gameConclusion.condition`. The ICN metadata
	// gets the English display string. (Mirrors the PvP gamelogger split.)
	const terminationEnglish = winconutil.getTerminationInEnglish(gameRules, condition);
	const metadata = buildEngineGameMetadata(row, victor, terminationEnglish);
	const icn = icnconverter.LongToShort_Format(
		{ metadata, gameRules, fullMove, position, moves, state_global },
		{
			skipPosition: row.variant !== null, // Custom games embed their start position.
			compact: true,
			spaces: false,
			comments: true, // Carries the clock stamps.
			make_new_lines: false,
			move_numbers: false,
		},
	);

	// Compress the ICN before the (synchronous) transaction — engine games are the DB's bloat vector.
	const compressed = await compression.compressString(icn);

	const { base_time_seconds, increment_seconds } = clockutil.splitTimeControl(row.clock as TimeControl); // prettier-ignore
	const humanColor = row.player_color as Player;
	const humanClock = body.clocks?.[humanColor];

	const transaction = db.transaction(() => {
		db.run(
			`INSERT INTO games (
				game_id, date, base_time_seconds, increment_seconds, variant, rated,
				leaderboard_id, private, result, termination, move_count,
				time_duration_millis, icn, compression
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				row.game_id,
				timeutil.timestampToSqlite(row.time_created),
				base_time_seconds,
				increment_seconds,
				row.variant,
				0, // Engine games are always casual.
				row.variant !== null ? (VariantLeaderboards[row.variant as VariantCode] ?? null) : null, // prettier-ignore
				0, // Public.
				metadata.Result!,
				condition, // Raw code; the dead-game reader feeds it back as gameConclusion.condition.
				moves.length,
				now - row.time_created,
				compressed.data,
				compressed.compression,
			],
		);

		// The human gets a player_games row if signed in; the engine never does.
		if (row.user_id !== null) {
			db.run(
				`INSERT INTO player_games (
					user_id, game_id, player_number, score, clock_at_end_millis
				) VALUES (?, ?, ?, ?, ?)`,
				[
					row.user_id,
					row.game_id,
					humanColor,
					victor === undefined ? null : victor === humanColor ? 1 : victor === null ? 0.5 : 0, // prettier-ignore
					humanClock ?? null,
				],
			);
		}

		// The row remains as the permanent record of the engine participant + settings;
		// the game state now lives in the games table's ICN.
		updateEngineGame(row.game_id, {
			moves: '',
			clock_white: null,
			clock_black: null,
			turn_start_time: null,
			last_updated: now,
		});
	});
	transaction();

	return true;
}

/** Assembles the ICN {@link MetaData} of a concluded engine game. Always English. */
function buildEngineGameMetadata(
	row: EngineGamesRecord,
	victor: Player | null | undefined,
	termination: string,
): MetaData {
	const scriptT = getScriptTranslations('shared', tconfig.DEFAULT_LANGUAGE); // Game metadata should only ever be in English
	const variantEnglishName = variantregistry.getVariantName(
		row.variant as VariantCode | null,
		scriptT,
	);
	const { UTCDate, UTCTime } = timeutil.convertTimestampToUTCDateUTCTime(row.time_created);

	// The human's display name; the engine's formatted name fills the other color.
	let humanName: string = metadatautil.GUEST_NAME_ICN_METADATA;
	if (row.user_id !== null) {
		const member = getMemberDataByCriteria(['username'], 'user_id', row.user_id);
		humanName = member?.username ?? DELETED_USER_DISPLAY_NAME;
	}
	const engineName = buildEngineUsernameContainer(row.engine, row.strength_level).username;
	const humanIsWhite = row.player_color === p.WHITE;

	const metadata: MetaData = {
		Event: `Casual ${variantEnglishName} infinite chess game against an engine`,
		Site: 'https://www.infinitechess.org/',
		Round: '-',
		White: humanIsWhite ? humanName : engineName,
		Black: humanIsWhite ? engineName : humanName,
		TimeControl: row.clock as TimeControl,
		UTCDate,
		UTCTime,
		Result: metadatautil.getResultFromVictor(victor),
		Termination: termination,
	};
	if (row.variant !== null) metadata.Variant = variantEnglishName;
	if (row.user_id !== null) {
		const idTag = uuid.base10ToBase62(row.user_id);
		if (humanIsWhite) metadata.WhiteID = idTag;
		else metadata.BlackID = idTag;
	}

	return metadata;
}

// Dead-game support -----------------------------------------------------------------------------------

/**
 * Returns the engine participant of an engine game — its color and username container —
 * or `undefined` if the game wasn't an engine game. Lets the dead-game readers name
 * the engine instead of falling back to a guest.
 * @throws If a database error occurs.
 */
export function getEngineParticipant(
	game_id: number,
): { color: Player; container: ServerUsernameContainer } | undefined {
	const row = getEngineGameData(game_id, ['player_color', 'engine', 'strength_level']);
	if (row === undefined) return undefined;
	return {
		color: typeutil.invertPlayer(row.player_color as Player),
		container: buildEngineUsernameContainer(row.engine, row.strength_level),
	};
}

/**
 * Returns the color a viewer played in a concluded engine game, or `undefined` if they
 * weren't its owner. Unlike PvP games, engine games can identify a dead GUEST owner,
 * since the engine_games row retains the browser id.
 * @throws If a database error occurs.
 */
export function resolveDeadEngineGameParticipantColor(
	game_id: number,
	memberInfo: MemberInfo,
): Player | undefined {
	const row = getEngineGameData(game_id, ['user_id', 'browser_id', 'player_color']);
	if (row === undefined) return undefined;
	const isOwner = memberInfo.signedIn
		? row.user_id === memberInfo.user_id
		: memberInfo.browser_id !== undefined && row.browser_id === memberInfo.browser_id;
	return isOwner ? (row.player_color as Player) : undefined;
}
