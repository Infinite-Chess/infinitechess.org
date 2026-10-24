// src/server/game/gamemanager/gameLogger.int.test.ts

/**
 * Logs real games into the in-memory database, checking what becomes permanent: each player's
 * pre-game rating snapshot, a rated game's rating changes, the ICN's Elo and RatingDiff tags,
 * and a private game's privacy.
 */

import type { MoveRecord } from '../../../shared/chess/logic/movepiece.js';
import type { SeekVariant } from '../../../shared/chess/util/variantselection.js';
import type { AuthMemberInfo } from '../../types.js';
import type { GameConclusion } from '../../../shared/chess/util/typeschemas.js';
import type { GameSetup, ServerGame } from './serverGameTypes.js';

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import gamefile from '../../../shared/chess/logic/gamefile.js';
import metadatautil from '../../../shared/chess/util/metadatautil.js';
import variantcache from '../../../shared/chess/variants/variantcache.js';
import leaderboardregistry from '../../../shared/chess/variants/leaderboardregistry.js';

import gameLogger from './gameLogger.js';
import gameUtility from './gameUtility.js';
import gamesManager from '../../database/gamesManager.js';
import databaseInit from '../../database/databaseInit.js';
import memberManager from '../../database/memberManager.js';
import databaseTables from '../../database/databaseTables.js';
import ratingCalculation from '../../utility/ratingCalculation.js';
import playerGamesManager from '../../database/playerGamesManager.js';
import playerStatsManager from '../../database/playerStatsManager.js';
import leaderboardsManager from '../../database/leaderboardsManager.js';

type Member = { user_id: number; identity: AuthMemberInfo };
/** A player's rating going into a game, and the Elo tag it gives their color in the ICN. */
type PlayerRating = { elo: number; rd: number; tag: string };

const CLASSICAL: SeekVariant = { kind: 'preset', code: 'Classical' };
/** Has no leaderboard of its own, so its ratings come from INFINITY. */
const CHESS: SeekVariant = { kind: 'preset', code: 'Chess' };
const INFINITY = leaderboardregistry.IDS.INFINITY;

/** Alice's INFINITY rating, as White. Must stay above Bob's, so a rated draw costs her and pays him. */
const ALICE_RATING = buildPlayerRating('White', 1800, 100);
/** Bob's rating, as Black: the default, as he's on no leaderboard. */
const BOB_RATING = buildPlayerRating('Black', ratingCalculation.DEFAULT_LEADERBOARD_ELO, ratingCalculation.DEFAULT_LEADERBOARD_RD); // prettier-ignore

/** Two legal opening pawn moves in both variants above. */
const MOVES: MoveRecord[] = [
	{ token: '1,2>1,4', startCoords: [1n, 2n], endCoords: [1n, 4n] },
	{ token: '1,7>1,5', startCoords: [1n, 7n], endCoords: [1n, 5n] },
];

const GUEST: AuthMemberInfo = { signedIn: false, browser_id: 'guest' };

let alice: Member;
let bob: Member;
let nextGameId = 1;

/** Builds a {@link PlayerRating} for a player of the given color. */
function buildPlayerRating(color: 'White' | 'Black', elo: number, rd: number): PlayerRating {
	const rating = ratingCalculation.toRating(elo, rd);
	return { elo, rd, tag: `[${color}Elo "${metadatautil.getFormattedElo(rating)}"]` };
}

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
	isPrivate = false,
): ServerGame {
	const setup: GameSetup = { variant, time: '600+5', rated, private: isPrivate };
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

/** The logged rating columns of a player whose rating the game left unchanged. */
function buildUnchangedRow(rating: PlayerRating): object {
	return { elo_at_game: rating.elo, rating_deviation_at_game: rating.rd, elo_change_from_game: null, rating_deviation_after_game: null }; // prettier-ignore
}

/** A logged game's ICN. */
function getICN(game_id: number): string {
	return gamesManager.getData(game_id, ['icn'])!.icn;
}

/** The Elo and RatingDiff tags of a logged game's ICN. */
function getRatingTags(game_id: number): string[] {
	return getICN(game_id).match(/\[(White|Black)(Elo|RatingDiff) "[^"]*"\]/g) ?? [];
}

/**
 * Asserts each player's logged rating change has the expected sign (1 gained, -1 lost),
 * and agrees with their ICN RatingDiff tag and their new leaderboard rating.
 * Deliberately not the exact amounts: those belong to the rating math, not to logging.
 */
function expectRatingsChanged(game_id: number, signs: Record<number, 1 | -1>): void {
	const rows = playerGamesManager.getOfGame(game_id, ['player_number', 'user_id', 'elo_at_game', 'elo_change_from_game']); // prettier-ignore
	const tags = getRatingTags(game_id);
	expect(rows).toHaveLength(2);
	for (const row of rows) {
		const change = row.elo_change_from_game!;
		expect(Math.sign(change)).toBe(signs[row.player_number]);
		const color = row.player_number === 1 ? 'White' : 'Black';
		const diff = metadatautil.getWhiteBlackRatingDiff(change);
		expect(tags).toContain(`[${color}RatingDiff "${diff}"]`);
		const newRating = leaderboardsManager.getPlayerRating(row.user_id, INFINITY)!;
		expect(newRating.elo).toBeCloseTo(row.elo_at_game + change);
	}
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
		leaderboardsManager.addUser(alice.user_id, INFINITY, ALICE_RATING.elo, ALICE_RATING.rd);
	});

	it('snapshots the ratings of an unrated game, changing none', () => {
		const game = buildGame(CLASSICAL, false, alice.identity, bob.identity, { condition: 'resignation', victor: 1 }); // prettier-ignore

		expect(gameLogger.log(game)).toBeUndefined();
		expect(getRatingRows(game.match.id)).toEqual({
			1: buildUnchangedRow(ALICE_RATING),
			2: buildUnchangedRow(BOB_RATING),
		});
		expect(getRatingTags(game.match.id)).toEqual([ALICE_RATING.tag, BOB_RATING.tag]);
		expect(leaderboardsManager.isPlayerIn(bob.user_id, INFINITY)).toBe(false);
	});

	it('snapshots the ratings of an aborted rated game, changing none', () => {
		const game = buildGame(CLASSICAL, true, alice.identity, bob.identity, { condition: 'aborted' }); // prettier-ignore

		expect(gameLogger.log(game)).toBeUndefined();
		expect(getRatingRows(game.match.id)).toEqual({
			1: buildUnchangedRow(ALICE_RATING),
			2: buildUnchangedRow(BOB_RATING),
		});
		expect(getRatingTags(game.match.id)).toEqual([ALICE_RATING.tag, BOB_RATING.tag]);
		const aliceNow = leaderboardsManager.getPlayerRating(alice.user_id, INFINITY)!;
		expect(aliceNow.elo).toBe(ALICE_RATING.elo);
		expect(leaderboardsManager.isPlayerIn(bob.user_id, INFINITY)).toBe(false);
	});

	it('reads a no-leaderboard variant from INFINITY, and gives a guest no rating', () => {
		const game = buildGame(CHESS, false, alice.identity, GUEST, { condition: 'resignation', victor: 2 }); // prettier-ignore

		gameLogger.log(game);
		expect(getRatingRows(game.match.id)).toEqual({
			1: buildUnchangedRow(ALICE_RATING),
		});
		expect(getRatingTags(game.match.id)).toEqual([ALICE_RATING.tag]);
	});

	it('changes the ratings of a decisive rated game, logging pre-game ratings and the changes', () => {
		const game = buildGame(CLASSICAL, true, alice.identity, bob.identity, { condition: 'resignation', victor: 2 }); // prettier-ignore

		expect(Object.keys(gameLogger.log(game)!)).toEqual(['1', '2']);
		const rows = getRatingRows(game.match.id);
		expect(rows[1]).toMatchObject({ elo_at_game: ALICE_RATING.elo, rating_deviation_at_game: ALICE_RATING.rd }); // prettier-ignore
		expect(rows[2]).toMatchObject({ elo_at_game: BOB_RATING.elo, rating_deviation_at_game: BOB_RATING.rd }); // prettier-ignore
		expectRatingsChanged(game.match.id, { 1: -1, 2: 1 });
		// Bob's first rated game adds him to the leaderboard, dated.
		expect(leaderboardsManager.getPlayerRating(bob.user_id, INFINITY)!.rd_last_update_date).not.toBeNull(); // prettier-ignore
	});

	it('changes the ratings of a drawn rated game, whose victor is null', () => {
		const game = buildGame(CLASSICAL, true, alice.identity, bob.identity, { condition: 'agreement', victor: null }); // prettier-ignore

		expect(gameLogger.log(game)).toBeDefined();
		// The lower-rated player gains from a draw.
		expectRatingsChanged(game.match.id, { 1: -1, 2: 1 });
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
		expect(getRatingTags(game.match.id)).toEqual([ALICE_RATING.tag, BOB_RATING.tag]);
		expect(icn).toContain('[Result "*"]');
		expect(icn).toContain('[Termination "Aborted"]');
		expect(icn).not.toContain('1,7>1,5');
	});

	it("counts a private game as private, in its record and both players' stats", () => {
		const original: GameConclusion = { condition: 'resignation', victor: 1 };
		const game = buildGame(CLASSICAL, false, alice.identity, bob.identity, original, true);
		const getPublicity = (member: Member): object | undefined =>
			playerStatsManager.getData(member.user_id, ['game_count_public', 'game_count_private']);

		gameLogger.log(game);
		expect(gamesManager.getData(game.match.id, ['private'])).toEqual({ private: 1 });
		expect(getPublicity(alice)).toEqual({ game_count_public: 0, game_count_private: 1 });
		expect(getPublicity(bob)).toEqual({ game_count_public: 0, game_count_private: 1 });

		// Overturning it un-counts it from the private tally.
		game.gameConclusion = { condition: 'aborted' };
		gameLogger.updateOverturned(game, original, 2);
		expect(getPublicity(alice)).toEqual({ game_count_public: 0, game_count_private: 0 });
	});
});
