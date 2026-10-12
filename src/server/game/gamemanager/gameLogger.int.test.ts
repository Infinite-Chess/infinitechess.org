// src/server/game/gamemanager/gameLogger.int.test.ts

/**
 * Logs real games into the in-memory database, pinning what becomes permanent: each player's
 * pre-game rating snapshot, a rated game's rating changes, and the ICN's Elo and RatingDiff tags.
 */

import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { SeekVariant } from '../../../shared/chess/util/variantselection.js';
import type { AuthMemberInfo } from '../../types.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';
import type { GameSetup, ServerGame } from './serverGameTypes.js';

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import gamefile from '../../../shared/chess/logic/gamefile.js';
import variantcache from '../../../shared/chess/variants/variantcache.js';
import leaderboardregistry from '../../../shared/chess/variants/leaderboardregistry.js';

import gameLogger from './gameLogger.js';
import gameUtility from './gameUtility.js';
import gamesManager from '../../database/gamesManager.js';
import databaseInit from '../../database/databaseInit.js';
import memberManager from '../../database/memberManager.js';
import databaseTables from '../../database/databaseTables.js';
import playerGamesManager from '../../database/playerGamesManager.js';
import leaderboardsManager from '../../database/leaderboardsManager.js';

type Member = { user_id: number; identity: AuthMemberInfo };

const CLASSICAL: SeekVariant = { kind: 'preset', code: 'Classical' };
/** Has no leaderboard of its own, so its ratings come from INFINITY. */
const CHESS: SeekVariant = { kind: 'preset', code: 'Chess' };
const INFINITY = leaderboardregistry.IDS.INFINITY;

/** Two legal opening pawn moves in both variants above. */
const MOVES: MoveRecord[] = [
	{ token: '1,2>1,4', startCoords: [1n, 2n], endCoords: [1n, 4n] },
	{ token: '1,7>1,5', startCoords: [1n, 7n], endCoords: [1n, 5n] },
];

const GUEST: AuthMemberInfo = { signedIn: false, browser_id: 'guest' };

/** Holds a confident INFINITY rating. */
let alice: Member;
/** Is on no leaderboard. */
let bob: Member;
let nextGameId = 1;

/** Creates a member account. */
function createMember(username: string): Member {
	const user_id = memberManager.add(username, `${username}@example.com`, 'hash');
	const identity: AuthMemberInfo = { signedIn: true, user_id, username, roles: null, browser_id: username }; // prettier-ignore
	return { user_id, identity };
}

/** Builds a concluded game between the two players, ready to log. */
function buildGame(
	variant: SeekVariant,
	rated: boolean,
	white: AuthMemberInfo,
	black: AuthMemberInfo,
	conclusion: GameConclusion,
): ServerGame {
	const setup: GameSetup = { variant, time: '600+5', rated, private: false };
	const now = Date.now();
	const construction = gameUtility.resolveGameConstruction(variant, now, undefined, false);
	const game = gamefile.initGame(setup.time, now, construction.gameRules);
	const players = { 1: { identifier: white }, 2: { identifier: black } };
	const match = gameUtility.initMatch(setup, nextGameId++, players);
	const servergame = gameUtility.initServerGame(game, construction, match, [...MOVES]);
	servergame.gameConclusion = conclusion;
	match.timeEnded = now;
	return servergame;
}

/** A logged game's rating columns, by player number. */
function getRatingRows(game_id: number): Record<number, object> {
	const rows = playerGamesManager.getOfGame(game_id, ['player_number', 'elo_at_game', 'rating_deviation_at_game', 'elo_change_from_game', 'rating_deviation_after_game']); // prettier-ignore
	return Object.fromEntries(
		rows.map(({ player_number, ...columns }) => [player_number, columns]),
	);
}

/** A logged game's ICN. */
function getICN(game_id: number): string {
	return gamesManager.getData(game_id, ['icn'])!.icn;
}

/** The Elo and RatingDiff tags of a logged game's ICN. */
function getRatingTags(game_id: number): string[] {
	return getICN(game_id).match(/\[(White|Black)(Elo|RatingDiff) "[^"]*"\]/g) ?? [];
}

describe('gameLogger', () => {
	beforeAll(async () => {
		databaseInit.buildSchema();
		await variantcache.loadAllVariants();
	});

	beforeEach(() => {
		databaseTables.clear();
		alice = createMember('alice');
		bob = createMember('bob');
		leaderboardsManager.addUser(alice.user_id, INFINITY, 1800, 100);
	});

	it('snapshots the ratings of an unrated game, changing none', () => {
		const game = buildGame(CLASSICAL, false, alice.identity, bob.identity, { condition: 'resignation', victor: 1 }); // prettier-ignore

		expect(gameLogger.log(game)).toBeUndefined();
		expect(getRatingRows(game.match.id)).toEqual({
			1: { elo_at_game: 1800, rating_deviation_at_game: 100, elo_change_from_game: null, rating_deviation_after_game: null }, // prettier-ignore
			2: { elo_at_game: 1500, rating_deviation_at_game: 350, elo_change_from_game: null, rating_deviation_after_game: null }, // prettier-ignore
		});
		expect(getRatingTags(game.match.id)).toEqual(['[WhiteElo "1800"]', '[BlackElo "1500?"]']);
		expect(leaderboardsManager.isPlayerIn(bob.user_id, INFINITY)).toBe(false);
	});

	it('snapshots the ratings of an aborted rated game, changing none', () => {
		const game = buildGame(CLASSICAL, true, alice.identity, bob.identity, { condition: 'aborted' }); // prettier-ignore

		expect(gameLogger.log(game)).toBeUndefined();
		expect(getRatingRows(game.match.id)).toEqual({
			1: { elo_at_game: 1800, rating_deviation_at_game: 100, elo_change_from_game: null, rating_deviation_after_game: null }, // prettier-ignore
			2: { elo_at_game: 1500, rating_deviation_at_game: 350, elo_change_from_game: null, rating_deviation_after_game: null }, // prettier-ignore
		});
		expect(getRatingTags(game.match.id)).toEqual(['[WhiteElo "1800"]', '[BlackElo "1500?"]']);
		expect(leaderboardsManager.getPlayerRating(alice.user_id, INFINITY)?.elo).toBe(1800);
		expect(leaderboardsManager.isPlayerIn(bob.user_id, INFINITY)).toBe(false);
	});

	it('reads a no-leaderboard variant from INFINITY, and gives a guest no rating', () => {
		const game = buildGame(CHESS, false, alice.identity, GUEST, { condition: 'resignation', victor: 2 }); // prettier-ignore

		gameLogger.log(game);
		expect(getRatingRows(game.match.id)).toEqual({
			1: { elo_at_game: 1800, rating_deviation_at_game: 100, elo_change_from_game: null, rating_deviation_after_game: null }, // prettier-ignore
		});
		expect(getRatingTags(game.match.id)).toEqual(['[WhiteElo "1800"]']);
	});

	it('changes the ratings of a decisive rated game, logging pre-game ratings and the changes', () => {
		const game = buildGame(CLASSICAL, true, alice.identity, bob.identity, { condition: 'resignation', victor: 2 }); // prettier-ignore

		expect(Object.keys(gameLogger.log(game)!)).toEqual(['1', '2']);
		const rows = getRatingRows(game.match.id);
		expect(rows[1]).toMatchObject({ elo_at_game: 1800, rating_deviation_at_game: 100 });
		expect(rows[2]).toMatchObject({ elo_at_game: 1500, rating_deviation_at_game: 350 });
		expect(rows[1]).toHaveProperty('elo_change_from_game', expect.closeTo(-28.52, 2));
		expect(rows[2]).toHaveProperty('elo_change_from_game', expect.closeTo(375.71, 2));
		expect(getRatingTags(game.match.id)).toEqual(['[WhiteElo "1800"]', '[BlackElo "1500?"]', '[WhiteRatingDiff "-29"]', '[BlackRatingDiff "+376"]']); // prettier-ignore

		// Bob's first rated game adds him to the leaderboard, dated.
		const bobRating = leaderboardsManager.getPlayerRating(bob.user_id, INFINITY)!;
		expect(bobRating.elo).toBeCloseTo(1875.71, 2);
		expect(bobRating.rd_last_update_date).not.toBeNull();
	});

	it("rebuilds an overturned game's ICN from its logged ratings, not current ones", () => {
		const original: GameConclusion = { condition: 'checkmate', victor: 1 };
		const game = buildGame(CLASSICAL, false, alice.identity, bob.identity, original);
		gameLogger.log(game);

		leaderboardsManager.updatePlayerRating(alice.user_id, INFINITY, 2400, 60);
		game.moves.pop();
		game.gameConclusion = { condition: 'aborted' };
		gameLogger.updateOverturned(game, original, 2);

		const icn = getICN(game.match.id);
		expect(getRatingTags(game.match.id)).toEqual(['[WhiteElo "1800"]', '[BlackElo "1500?"]']);
		expect(icn).toContain('[Result "*"]');
		expect(icn).toContain('[Termination "Aborted"]');
		expect(icn).not.toContain('1,7>1,5');
	});
});
