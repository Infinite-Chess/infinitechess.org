// src/server/game/gamemanager/liveGameRestore.ts

/**
 * This script restores live games from the database on server startup.
 *
 * It reads all live game and participant rows, reconstructs the full
 * ServerGame objects (clocks, boardsim, player identities),
 * and determines which pending timers (auto time loss, disconnect,
 * delete) need to be reinstated.
 *
 * Only ongoing games are ever restored — a concluded game's row is
 * dropped the instant it's logged — so it has no conclusion.
 *
 * See docs/systems/LIVE_GAME_PERSISTENCE.md for the schema and restoration details.
 */

import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { VariantCode } from '../../../shared/chess/util/variantcodes.js';
import type { ValidEngine } from '../../../shared/chess/engines/engine.js';
import type { SeekVariant } from '../../../shared/chess/variants/variantselection.js';
import type { AuthMemberInfo } from '../../types.js';
import type { LiveGamesRecord } from '../../database/liveGamesManager.js';
import type { SlideLimitValue } from '../../../shared/util/gameconfig.js';
import type { Player, PlayerGroup } from '../../../shared/util/typeutil.js';
import type { LivePlayerGamesRecord } from '../../database/livePlayerGamesManager.js';
import type { LiveEngineGamesRecord } from '../../database/liveEngineGamesManager.js';
import type { ClockValues, TimeControl } from '../../../shared/chess/util/clockutil.js';
import type { MatchInfo, PlayerData, ServerGame } from './servergametypes.js';

import jsutil from '../../../shared/util/jsutil.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';

import gameutility from './gameutility.js';
import { logEventsAndPrint } from '../../utility/logEvents.js';
import { getAllLivePlayerGames } from '../../database/livePlayerGamesManager.js';
import { getAllLiveEngineGames } from '../../database/liveEngineGamesManager.js';
import { getMemberDataByCriteria } from '../../database/memberManager.js';
import { getAllLiveGames, deleteLiveGame } from '../../database/liveGamesManager.js';

// Types --------------------------------------------------------------------------------------

/**
 * Result of restoring games. The caller is responsible for adding them
 * to activeGames and setting up their event connections.
 */
interface RestoredGame {
	servergame: ServerGame;
	/** Timers that need to be started after adding to activeGames. */
	pendingTimers: PendingTimers;
}

/** Timers that may need to be started for a restored game, based on its state at the time of server shutdown. */
interface PendingTimers {
	/** Per-player disconnect state to restore. */
	disconnectTimers: PlayerGroup<DisconnectTimerState>;
	/**
	 * If defined, the auto time loss timer for the current player's
	 * turn should fire after this many ms. 0 means immediately.
	 */
	autoTimeLossMs?: number;
	/**
	 * If defined, the epoch-ms deadline of the persisted both-disconnected timer to
	 * revive exactly (fires immediately if already past). Undefined if none was persisted.
	 */
	bothDisconnectedEndTime?: number;
}

/** Represents the disconnect state of a player that needs to be restored. */
interface DisconnectTimerState {
	/** 'cushion' = still in 5s cushion, 'timer' = opponent's claim window was set, 'fresh' = was connected before restart */
	type: 'cushion' | 'timer' | 'fresh';
	/**
	 * For 'cushion', ms remaining until the claim window opens. For 'timer',
	 * ms remaining until claimable (0 or negative = already claimable).
	 */
	remainingMs: number;
	/** Whether the disconnect was by choice. */
	voluntary: boolean;
}

// Restoration --------------------------------------------------------------------------------

/**
 * Restores all live games from the database.
 * Called once during server startup, after initDatabase() and before accepting connections.
 *
 * @returns An array of restored ServerGame objects with their pending timers.
 * The caller is responsible for integrating these into the active game system.
 */
function restoreAll(): RestoredGame[] {
	let liveGameRows: LiveGamesRecord[];
	let playerRowsByGame: Map<number, LivePlayerGamesRecord[]>;
	let engineRowsByGame: Map<number, LiveEngineGamesRecord[]>;
	try {
		liveGameRows = getAllLiveGames();
		playerRowsByGame = groupRowsByGame(getAllLivePlayerGames());
		engineRowsByGame = groupRowsByGame(getAllLiveEngineGames());
	} catch {
		// Already logged
		return [];
	}
	if (liveGameRows.length === 0) return [];

	console.log(`Restoring ${liveGameRows.length} live game(s) from database.`);

	const restored: RestoredGame[] = [];

	for (const gameRow of liveGameRows) {
		try {
			const playerRows = playerRowsByGame.get(gameRow.game_id) ?? [];
			const engineRows = engineRowsByGame.get(gameRow.game_id) ?? [];
			if (playerRows.length + engineRows.length !== 2 || engineRows.length > 1) {
				logEventsAndPrint(
					`Live game ${gameRow.game_id} has invalid participant rows. Skipping restoration.`,
					'errLog',
				);
				deleteLiveGame(gameRow.game_id);
				continue;
			}

			const result = restoreSingleGame(gameRow, playerRows, engineRows[0]);
			restored.push(result);
		} catch (error: unknown) {
			const message = jsutil.getErrorMessage(error);
			logEventsAndPrint(
				`Failed to restore live game ${gameRow.game_id}: ${message}`,
				'errLog',
			);
			// Delete the corrupt game from the database so it doesn't block future restarts.
			deleteLiveGame(gameRow.game_id);
		}
	}

	return restored;
}

/** Buckets participant rows by their game_id. Games with no rows get no entry. */
function groupRowsByGame<T extends { game_id: number }>(rows: T[]): Map<number, T[]> {
	const grouped = new Map<number, T[]>();
	for (const row of rows) {
		const gameRows = grouped.get(row.game_id) ?? [];
		gameRows.push(row);
		grouped.set(row.game_id, gameRows);
	}
	return grouped;
}

/** Restores a single live game from its database rows. */
function restoreSingleGame(
	gameRow: LiveGamesRecord,
	playerRows: LivePlayerGamesRecord[],
	engineRow: LiveEngineGamesRecord | undefined,
): RestoredGame {
	// 1. Reconstruct AuthMemberInfo for each player
	const playerIdentities = reconstructPlayerIdentities(playerRows);

	// 2. Reconstruct clock values for timed games
	const clockValues = reconstructClockValues(gameRow, playerRows, engineRow);

	// 3. Create the game (also computes gameRules).
	const variant = reconstructVariant(gameRow);
	const construction = gameutility.resolveGameConstruction(
		variant,
		gameRow.time_created,
		gameRow.mod_slide_limit ?? undefined,
		engineRow !== undefined,
	);
	// The column wins over what the variant resolves to now: a game keeps the
	// mode it started under, even if the threshold deciding it has moved since.
	construction.validateMoves = Boolean(gameRow.validate_moves);

	const game = gamefile.initGame(
		gameRow.clock as TimeControl,
		gameRow.time_created,
		construction.gameRules,
		undefined,
		clockValues,
	);

	// Note: clock state (ticking color, timeAtTurnStart) is already set correctly
	// by clock.edit() inside initGame() via the clockValues we pass in.

	// 4. Reconstruct MatchInfo
	const match = reconstructMatchInfo(gameRow, variant, playerRows, playerIdentities, engineRow);

	// 5. Parse & replay moves, conditionally constructing the board state
	const moves: MoveRecord[] = parseMoves(gameRow.moves);

	const servergame: ServerGame = gameutility.initServerGame(game, construction, match, moves);

	// 6. Compute pending timers
	const pendingTimers = computePendingTimers(gameRow, playerRows, servergame);

	return { servergame, pendingTimers };
}

// Reconstruction -----------------------------------------------------------------------------

/** Reconstructs AuthMemberInfo for each player from the database rows. */
function reconstructPlayerIdentities(
	playerRows: LivePlayerGamesRecord[],
): PlayerGroup<AuthMemberInfo> {
	const identities: PlayerGroup<AuthMemberInfo> = {};

	for (const row of playerRows) {
		const player = row.player_number as Player;

		if (row.user_id !== null) {
			// Signed-in player: look up username and roles from members table
			const memberData = getMemberDataByCriteria(
				['username', 'roles'],
				'user_id',
				row.user_id,
			);

			if (memberData) {
				let roles = null;
				try {
					roles = memberData.roles ? JSON.parse(memberData.roles) : null;
				} catch {
					logEventsAndPrint(
						`Failed to parse roles for user_id ${row.user_id} during game restoration.`,
						'errLog',
					);
				}
				identities[player] = {
					signedIn: true,
					user_id: row.user_id,
					username: memberData.username,
					roles,
					browser_id: row.browser_id,
				};
			} else {
				// User was deleted since the game started. Treat as guest.
				identities[player] = {
					signedIn: false,
					browser_id: row.browser_id,
				};
			}
		} else {
			// Guest player
			identities[player] = {
				signedIn: false,
				browser_id: row.browser_id,
			};
		}
	}

	return identities;
}

/** Reconstructs ClockValues from stored per-player times. */
function reconstructClockValues(
	gameRow: LiveGamesRecord,
	playerRows: LivePlayerGamesRecord[],
	engineRow: LiveEngineGamesRecord | undefined,
): ClockValues | undefined {
	// Untimed games don't have clock values
	if (gameRow.clock === '-') return undefined;

	const clocks: PlayerGroup<number> = {};
	for (const row of playerRows) {
		if (row.time_remaining_ms !== null) {
			clocks[row.player_number as Player] = row.time_remaining_ms;
		}
	}
	if (engineRow && engineRow.time_remaining_ms !== null)
		clocks[engineRow.player_number as Player] = engineRow.time_remaining_ms;

	// The engine's ticking state is restored verbatim: a restart doesn't close the client's
	// tab, so an engine that was thinking kept thinking, and is charged for the downtime.
	const colorTicking =
		gameRow.color_ticking === null ? undefined : (gameRow.color_ticking as Player);
	const timeColorTickingLosesAt =
		colorTicking !== undefined
			? gameRow.clock_snapshot_time! + clocks[colorTicking]!
			: undefined;

	return {
		clocks,
		colorTicking,
		timeColorTickingLosesAt,
	};
}

/**
 * Reads a live game's variant back off its complementary `variant` / `position` columns.
 * @throws If the row carries neither (a corrupt row — the caller drops the game).
 */
function reconstructVariant(gameRow: LiveGamesRecord): SeekVariant {
	if (gameRow.variant !== null) return { kind: 'preset', code: gameRow.variant as VariantCode };
	if (gameRow.position === null)
		throw new Error('Live game row carries neither a variant nor a position.');
	return { kind: 'custom', position: gameRow.position };
}

/** Reconstructs the MatchInfo from stored values. */
function reconstructMatchInfo(
	gameRow: LiveGamesRecord,
	variant: SeekVariant,
	playerRows: LivePlayerGamesRecord[],
	playerIdentities: PlayerGroup<AuthMemberInfo>,
	engineRow: LiveEngineGamesRecord | undefined,
): MatchInfo {
	const playerData: PlayerGroup<PlayerData> = {};

	for (const row of playerRows) {
		const identity = playerIdentities[row.player_number as Player]!;

		playerData[row.player_number as Player] = {
			identifier: identity,
			lastOfferPly: row.last_draw_offer_ply ?? undefined,
			disconnect: {
				startID: undefined,
				startTime: row.disconnect_cushion_end_time ?? undefined,
				timeOpponentMayClaim: undefined,
				voluntary: undefined,
			},
		};
	}

	return {
		id: gameRow.game_id,
		variant,
		timeCreated: gameRow.time_created,
		timeEnded: undefined, // Only ongoing games are restored — none have ended.
		rated: gameRow.rated === 1,
		modifiers:
			gameRow.mod_slide_limit !== null
				? [{ kind: 'slide-limit', value: gameRow.mod_slide_limit as SlideLimitValue }]
				: undefined,
		clock: gameRow.clock as TimeControl,
		playerData,
		engineParticipant: engineRow
			? {
					color: engineRow.player_number as Player,
					engine: engineRow.engine as ValidEngine,
					version: engineRow.engine_version,
					strengthLevel: engineRow.strength_level,
				}
			: undefined,
		drawOfferState:
			gameRow.draw_offer_state === null ? undefined : (gameRow.draw_offer_state as Player),
		// Only ongoing games are ever restored: a concluded game's row is dropped
		// the instant it's logged, so a restored game is never freed nor finalized.
		freed: false,
		finalized: false,
		rematchOffers: new Set(), // Ephemeral — rematch offers never survive a restart.
	};
}

/** Parses the moves string back into move objects. */
function parseMoves(movesString: string): MoveRecord[] {
	if (movesString === '') return [];
	return icnconverter.parseShortFormMoves(movesString);
}

// Pending Timers -----------------------------------------------------------------------------

/** Computes which timers need to be started after restoration. */
function computePendingTimers(
	gameRow: LiveGamesRecord,
	playerRows: LivePlayerGamesRecord[],
	servergame: ServerGame,
): PendingTimers {
	const now = Date.now();

	const timers: PendingTimers = {
		disconnectTimers: {},
	};

	// Auto time loss timer for timed, ongoing games
	if (!servergame.untimed && servergame.clocks.colorTicking !== undefined) {
		const tickingTime = servergame.clocks.currentTime[servergame.clocks.colorTicking]!;
		timers.autoTimeLossMs = Math.max(tickingTime, 0);
	}

	// Both-disconnected timer deadline (game-level), if one was persisted.
	if (gameRow.both_disconnected_end_time !== null) {
		timers.bothDisconnectedEndTime = gameRow.both_disconnected_end_time;
	}

	// Per-player disconnect state
	for (const row of playerRows) {
		const player = row.player_number as Player;

		if (row.disconnect_claim_time !== null) {
			// Case 1: The opponent's claim window was already set
			const remaining = row.disconnect_claim_time - now;
			timers.disconnectTimers[player] = {
				type: 'timer',
				remainingMs: Math.max(remaining, 0),
				voluntary: row.disconnect_voluntary === 1,
			};
		} else if (row.disconnect_cushion_end_time !== null) {
			// Case 2: Still in the 5-second cushion period
			const remaining = row.disconnect_cushion_end_time - now;
			timers.disconnectTimers[player] = {
				type: 'cushion',
				remainingMs: Math.max(remaining, 0),
				voluntary: row.disconnect_voluntary === 1,
			};
		} else {
			// Case 3: Was connected before restart. Give them a fresh disconnect timer
			// (not by choice, since the server restart caused the disconnection).
			timers.disconnectTimers[player] = {
				type: 'fresh',
				remainingMs: -1, // Signal that a fresh timer should be started
				voluntary: false,
			};
		}
	}

	return timers;
}

// Exports ------------------------------------------------------------------------------------

export default { restoreAll };
