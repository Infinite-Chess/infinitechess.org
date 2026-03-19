// src/server/game/gamemanager/liveGameRestore.ts

/**
 * This script restores live games from the database on server startup.
 *
 * It reads all rows from live_games and live_player_games, reconstructs
 * the full ServerGame objects (metadata, clocks, boardsim, player identities),
 * and determines which pending timers (AFK resign, auto time loss, disconnect,
 * delete) need to be reinstated.
 *
 * See dev-utils/live-game-persistence.md for the schema and restoration details.
 */

import type { MetaData } from '../../../shared/chess/util/metadatautil.js';
import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { ClockValues } from '../../../shared/chess/logic/clock.js';
import type { VariantCode } from '../../../shared/chess/variants/variantdictionary.js';
import type { TimeControl } from '../../../shared/chess/util/clockutil.js';
import type { AuthMemberInfo } from '../../types.js';
import type { GameConclusion } from '../../../shared/chess/logic/gamefile.js';
import type { LiveGamesRecord } from '../../database/liveGamesManager.js';
import type { Player, PlayerGroup } from '../../../shared/chess/util/typeutil.js';
import type { LivePlayerGamesRecord } from '../../database/livePlayerGamesManager.js';
import type { MatchInfo, PlayerData, ServerGame } from './gameutility.js';
import type {
	Condition,
	DrawCondition,
	WinCondition,
} from '../../../shared/chess/util/winconutil.js';

import jsutil from '../../../shared/util/jsutil.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';
import movepiece from '../../../shared/chess/logic/movepiece.js';
import icnconverter from '../../../shared/chess/logic/icn/icnconverter.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';

import servermetadatautil from '../servermetadatautil.js';
import { logEventsAndPrint } from '../../middleware/logEvents.js';
import { getMemberDataByCriteria } from '../../database/memberManager.js';
import { getLivePlayerGamesForGame } from '../../database/livePlayerGamesManager.js';
import { getAllLiveGames, deleteLiveGame } from '../../database/liveGamesManager.js';

// Types -----------------------------------------------------------------------------------------

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
	/** If defined, the delete game timer should fire after this many ms. 0 means immediately. */
	deleteTimerMs?: number;
	/** If defined, the AFK resign timer should fire after this many ms. 0 means immediately. */
	afkResignTimerMs?: number;
	/** Per-player disconnect state to restore. */
	disconnectTimers: PlayerGroup<DisconnectTimerState>;
	/**
	 * If defined, the auto time loss timer for the current player's
	 * turn should fire after this many ms. 0 means immediately.
	 */
	autoTimeLossMs?: number;
}

/** Represents the state of a player's disconnect timer that needs to be restored. */
interface DisconnectTimerState {
	/** 'cushion' = still in 5s cushion, 'timer' = auto-resign timer active, 'fresh' = was connected before restart */
	type: 'cushion' | 'timer' | 'fresh';
	/** Milliseconds remaining until the timer fires. 0 or negative means immediately. */
	remainingMs: number;
	/** Whether the disconnect was by choice. */
	byChoice: boolean;
}

// Restoration ------------------------------------------------------------------------------------

/**
 * Restores all live games from the database.
 * Called once during server startup, after initDatabase() and before accepting connections.
 *
 * @returns An array of restored ServerGame objects with their pending timers.
 * The caller is responsible for integrating these into the active game system.
 */
function restoreAllLiveGames(): RestoredGame[] {
	const liveGameRows = getAllLiveGames();
	if (liveGameRows.length === 0) return [];

	console.log(`Restoring ${liveGameRows.length} live game(s) from database.`);

	const restored: RestoredGame[] = [];

	for (const gameRow of liveGameRows) {
		try {
			const playerRows = getLivePlayerGamesForGame(gameRow.game_id);
			if (playerRows.length !== 2) {
				logEventsAndPrint(
					`Live game ${gameRow.game_id} has ${playerRows.length} player rows, expected 2. Skipping restoration of this game.`,
					'errLog.txt',
				);
				deleteLiveGame(gameRow.game_id);
				continue;
			}

			const result = restoreSingleGame(gameRow, playerRows);
			restored.push(result);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logEventsAndPrint(
				`Failed to restore live game ${gameRow.game_id}: ${message}`,
				'errLog.txt',
			);
			// Delete the corrupt game from the database so it doesn't block future restarts.
			deleteLiveGame(gameRow.game_id);
		}
	}

	return restored;
}

/**
 * Restores a single live game from its database rows.
 */
function restoreSingleGame(
	gameRow: LiveGamesRecord,
	playerRows: LivePlayerGamesRecord[],
): RestoredGame {
	// 1. Reconstruct AuthMemberInfo for each player
	const playerIdentities = reconstructPlayerIdentities(playerRows);

	// 2. Reconstruct MetaData
	const gameMetadata = reconstructMetadata(gameRow, playerRows, playerIdentities);

	// 3. Reconstruct clock values for timed games
	const clockValues = reconstructClockValues(gameRow, playerRows);

	// 4. Reconstruct game conclusion
	const gameConclusion = reconstructConclusion(gameRow);

	// 8. Reconstruct MatchInfo
	const matchInfo = reconstructMatchInfo(gameRow, playerRows, playerIdentities);

	// 5. Create the basegame
	const basegame = gamefile.initGame(
		gameMetadata,
		gameRow.time_created,
		matchInfo.variant,
		gameConclusion,
		clockValues,
	);

	// Note: clock state (ticking color, timeAtTurnStart) is already set correctly
	// by clock.edit() inside initGame() via the clockValues we pass in.

	const servergame: ServerGame = { match: matchInfo, basegame };

	// 6. Parse & replay moves, conditionally constructing boardsim
	const moves: MoveRecord[] = parseMoves(gameRow.moves);

	if (gameRow.validate_moves) {
		const boardsim = gamefile.initBoard(
			basegame.gameRules,
			matchInfo.variant,
			basegame.dateTimestamp,
		);
		servergame.boardsim = boardsim;
		// Pushes moves to BOTH the basegame and boardsim
		movepiece.makeAllMovesInGame({ basegame, boardsim }, moves);
	} else {
		// Push all the moves to JUST the basegame
		for (const move of moves) {
			basegame.moves.push(jsutil.deepCopyObject(move));
		}

		// Update whosTurn based on move count
		basegame.whosTurn =
			basegame.gameRules.turnOrder[
				basegame.moves.length % basegame.gameRules.turnOrder.length
			]!;
	}

	// 9. Compute pending timers
	const pendingTimers = computePendingTimers(gameRow, playerRows, servergame);

	return { servergame, pendingTimers };
}

// Helper functions ---------------------------------------------------------------------------------

/**
 * Reconstructs AuthMemberInfo for each player from the database rows.
 */
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
						'errLog.txt',
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

/**
 * Reconstructs MetaData from the stored atomic values.
 */
function reconstructMetadata(
	gameRow: LiveGamesRecord,
	playerRows: LivePlayerGamesRecord[],
	playerIdentities: PlayerGroup<AuthMemberInfo>,
): MetaData {
	const white = playerIdentities[p.WHITE]!;
	const black = playerIdentities[p.BLACK]!;

	// Find per-player rows for signed-in identity lookup
	const whiteRow = playerRows.find((r) => r.player_number === p.WHITE)!;
	const blackRow = playerRows.find((r) => r.player_number === p.BLACK)!;

	return servermetadatautil.buildGameMetadata(
		Boolean(gameRow.rated),
		gameRow.variant as VariantCode,
		gameRow.clock as TimeControl,
		gameRow.time_created,
		{
			name: white.signedIn ? white.username : metadatautil.GUEST_NAME_ICN_METADATA, // Protect browser's browser-id cookie
			id: white.signedIn ? white.user_id : undefined,
			elo: whiteRow.elo ?? undefined,
		},
		{
			name: black.signedIn ? black.username : metadatautil.GUEST_NAME_ICN_METADATA, // Protect browser's browser-id cookie
			id: black.signedIn ? black.user_id : undefined,
			elo: blackRow.elo ?? undefined,
		},
	);
}

/**
 * Reconstructs ClockValues from stored per-player times.
 */
function reconstructClockValues(
	gameRow: LiveGamesRecord,
	playerRows: LivePlayerGamesRecord[],
): ClockValues | undefined {
	// Untimed games don't have clock values
	if (gameRow.clock === '-') return undefined;

	const clocks: PlayerGroup<number> = {};
	for (const row of playerRows) {
		if (row.time_remaining_ms !== null) {
			clocks[row.player_number as Player] = row.time_remaining_ms;
		}
	}

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
 * Reconstructs GameConclusion from stored values.
 */
function reconstructConclusion(gameRow: LiveGamesRecord): GameConclusion | undefined {
	if (gameRow.conclusion_condition === null) return undefined; // Game is ongoing still

	const condition = gameRow.conclusion_condition as Condition;

	if (gameRow.conclusion_victor !== null) {
		// Decisive result — someone won
		return {
			condition: condition as WinCondition,
			victor: gameRow.conclusion_victor as Player,
		};
	} else if (condition === 'aborted') {
		// Aborted — victor is undefined
		return { condition: 'aborted' };
	} else {
		// Draw — victor is null
		return {
			condition: condition as DrawCondition,
			victor: null,
		};
	}
}

/**
 * Reconstructs the MatchInfo from stored values.
 */
function reconstructMatchInfo(
	gameRow: LiveGamesRecord,
	playerRows: LivePlayerGamesRecord[],
	playerIdentities: PlayerGroup<AuthMemberInfo>,
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
				timeoutID: undefined,
				timeToAutoLoss: undefined,
				wasByChoice: undefined,
			},
		};
	}

	return {
		id: gameRow.game_id,
		variant: gameRow.variant as VariantCode,
		timeCreated: gameRow.time_created,
		timeEnded: gameRow.time_ended ?? undefined,
		publicity: gameRow.private === 1 ? 'private' : 'public',
		rated: gameRow.rated === 1,
		clock: gameRow.clock as TimeControl,
		playerData,
		drawOfferState:
			gameRow.draw_offer_state === null ? undefined : (gameRow.draw_offer_state as Player),
		autoAFKResignTime: gameRow.afk_resign_time ?? undefined,
		positionPasted: gameRow.position_pasted === 1,
	};
}

/**
 * Parses the moves string back into move objects.
 */
function parseMoves(movesString: string): MoveRecord[] {
	if (movesString === '') return [];
	return icnconverter.parseShortFormMoves(movesString);
}

/**
 * Computes which timers need to be started after restoration.
 */
function computePendingTimers(
	gameRow: LiveGamesRecord,
	playerRows: LivePlayerGamesRecord[],
	servergame: ServerGame,
): PendingTimers {
	const now = Date.now();

	const timers: PendingTimers = {
		disconnectTimers: {},
	};

	// Delete timer for concluded games
	if (gameRow.delete_time !== null) {
		const remaining = gameRow.delete_time - now;
		timers.deleteTimerMs = Math.max(remaining, 0);
	}

	// AFK resign timer
	if (gameRow.afk_resign_time !== null) {
		const remaining = gameRow.afk_resign_time - now;
		timers.afkResignTimerMs = Math.max(remaining, 0);
	}

	// Auto time loss timer for timed, ongoing games
	if (!servergame.basegame.untimed && gameRow.color_ticking !== null) {
		const tickingTime =
			servergame.basegame.clocks.currentTime[gameRow.color_ticking as Player]!;
		timers.autoTimeLossMs = Math.max(tickingTime, 0);
	}

	// Per-player disconnect timers
	for (const row of playerRows) {
		const player = row.player_number as Player;

		if (row.disconnect_resign_time !== null) {
			// Case 1: Auto-resign timer was already active
			const remaining = row.disconnect_resign_time - now;
			timers.disconnectTimers[player] = {
				type: 'timer',
				remainingMs: Math.max(remaining, 0),
				byChoice: row.disconnect_by_choice === 1,
			};
		} else if (row.disconnect_cushion_end_time !== null) {
			// Case 2: Still in the 5-second cushion period
			const remaining = row.disconnect_cushion_end_time - now;
			timers.disconnectTimers[player] = {
				type: 'cushion',
				remainingMs: Math.max(remaining, 0),
				byChoice: row.disconnect_by_choice === 1,
			};
		} else {
			// Case 3: Was connected before restart. Give them a fresh disconnect timer
			// (not by choice, since the server restart caused the disconnection).
			timers.disconnectTimers[player] = {
				type: 'fresh',
				remainingMs: -1, // Signal that a fresh timer should be started
				byChoice: false,
			};
		}
	}

	return timers;
}

// Exports --------------------------------------------------------------------------------------------

export { restoreAllLiveGames };
