// src/server/game/cheatdetection/analysisMatcher.int.test.ts

/**
 * Pins how analysis reports become matches on a live rated game in the in-memory database: only
 * a position displayed while the game stood at it counts, however early the display began, on the
 * player the report is tied to by account, browser or network, and a network the opponent is on too
 * is marked shared.
 */

import type { GameSetup, ServerGame } from '../gamemanager/serverGameTypes.js';
import type { AuthMemberInfo, MemberInfo } from '../../types.js';

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

import timeutil from '../../../shared/util/timeutil.js';
import gamefile from '../../../shared/chess/logic/gamefile.js';
import movepiece from '../../../shared/chess/logic/movepiece.js';
import variantcache from '../../../shared/chess/variants/variantcache.js';
import { players as p } from '../../../shared/chess/util/typeutil.js';

import gameUtility from '../gamemanager/gameUtility.js';
import activeGames from '../gamemanager/activeGames.js';
import databaseInit from '../../database/databaseInit.js';
import memberManager from '../../database/memberManager.js';
import databaseTables from '../../database/databaseTables.js';
import analysisMatcher from './analysisMatcher.js';
import refreshTokenManager from '../../database/refreshTokenManager.js';

/** Alice's home network, from which her session was last seen. */
const ALICE_IP = '203.0.113.7';
const BOB_IP = '192.0.2.4';
const STRANGER_IP = '198.51.100.9';
const START = 1_000_000;
/** How long the game has stood at ply 1 when each test's reports arrive. */
const PLY_1_HELD_MS = timeutil.toMillis(5, 'seconds');
/** How long ago a recent display began: well within the game's time at ply 1. */
const RECENT_MS = timeutil.toMillis(1, 'seconds');
const SESSION_LIFETIME_MS = timeutil.toMillis(1, 'days');

/** A member account's signed-in identity. */
type Member = AuthMemberInfo & { signedIn: true };

let alice: Member;
let bob: Member;
let game: ServerGame & { validateMoves: true };

/** Creates a member account, signed in from `ip`. */
function createMember(username: string, ip: string): Member {
	const user_id = memberManager.add(username, `${username}@example.com`, 'hash');
	refreshTokenManager.add(user_id, `${username}-session`, SESSION_LIFETIME_MS, false, ip);
	return { signedIn: true, user_id, username, roles: null, browser_id: `${username}-browser` };
}

/** Starts a live rated Classical game between the two players, watched from its first position. */
function startGame(
	white: AuthMemberInfo,
	black: AuthMemberInfo,
): ServerGame & { validateMoves: true } {
	const setup: GameSetup = { variant: { kind: 'preset', code: 'Classical' }, time: '600+5', rated: true, private: false }; // prettier-ignore
	const construction = gameUtility.resolveGameConstruction(
		setup.variant,
		START,
		undefined,
		false,
	);
	const match = gameUtility.initMatch(setup, 1, { [p.WHITE]: { identifier: white }, [p.BLACK]: { identifier: black } }); // prettier-ignore
	const servergame = gameUtility.initServerGame(gamefile.initGame(setup.time, START, construction.gameRules), construction, match); // prettier-ignore
	if (!servergame.validateMoves) throw Error('Rated games are validated.');
	analysisMatcher.watch(servergame);
	activeGames.add(servergame);
	return servergame;
}

/** Plays a move on the game, `ms` after the last thing that happened. */
function playAfter(ms: number, token: string): void {
	vi.advanceTimersByTime(ms);
	movepiece.calculateAndMakeMove(game, { token });
	analysisMatcher.onMove(game);
}

/** The key of the position the game stood at, at `ply`. */
function keyAt(ply: number): string {
	return game.watchedPositions!.find((p) => p.ply === ply)!.key;
}

/** Reports, now, a display of the position at `ply` from `fromAgeMs` until `toAgeMs` earlier (0: still showing). */
function reportAt(
	memberInfo: MemberInfo,
	ip: string,
	ply: number,
	fromAgeMs: number,
	toAgeMs = 0,
): void {
	analysisMatcher.report({ memberInfo, ip }, [{ key: keyAt(ply), fromAgeMs, toAgeMs }], Date.now()); // prettier-ignore
}

describe('analysisMatcher', () => {
	beforeAll(async () => {
		databaseInit.buildSchema();
		await variantcache.loadAllVariants();
	});

	beforeEach(() => {
		databaseTables.clear();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(START);
		alice = createMember('alice', ALICE_IP);
		bob = createMember('bob', BOB_IP);
		game = startGame(alice, bob);
		playAfter(1000, '5,2>5,4'); // Ply 1 reached 1 s in.
		vi.advanceTimersByTime(PLY_1_HELD_MS);
	});

	afterEach(() => {
		activeGames.remove(game.match.id);
		vi.useRealTimers();
	});

	it('ties a match to the account, browser or network that displayed the position', () => {
		reportAt(alice, STRANGER_IP, 1, RECENT_MS);
		reportAt({ signedIn: false, browser_id: alice.browser_id }, STRANGER_IP, 1, RECENT_MS);
		reportAt({ signedIn: false, browser_id: 'incognito' }, ALICE_IP, 1, RECENT_MS);
		expect(game.match.playerData[p.WHITE]!.interaction.matches).toEqual([
			{ ply: 1, link: 'account' },
			{ ply: 1, link: 'browser' },
			{ ply: 1, link: 'network', sharedWithOpponent: false },
		]);
		expect(game.match.playerData[p.BLACK]!.interaction.matches).toEqual([]);
	});

	it("marks a network match shared when the opponent's sessions are on that network too", () => {
		refreshTokenManager.add(
			bob.user_id,
			'bob-home-session',
			SESSION_LIFETIME_MS,
			false,
			ALICE_IP,
		);
		reportAt({ signedIn: false, browser_id: 'incognito' }, ALICE_IP, 1, RECENT_MS);
		for (const player of [p.WHITE, p.BLACK]) expect(game.match.playerData[player]!.interaction.matches).toEqual([{ ply: 1, link: 'network', sharedWithOpponent: true }]); // prettier-ignore
	});

	it('only counts a position displayed while the game stood at it', () => {
		reportAt(alice, ALICE_IP, 0, RECENT_MS, RECENT_MS / 2); // The start, after the game moved on.
		reportAt(alice, ALICE_IP, 1, PLY_1_HELD_MS + RECENT_MS, PLY_1_HELD_MS + RECENT_MS / 2); // Ply 1, gone before the game reached it.
		expect(game.match.playerData[p.WHITE]!.interaction.matches).toEqual([]);
	});

	it('counts a position put on screen before the game reached it, and still showing once it did', () => {
		reportAt(alice, ALICE_IP, 1, PLY_1_HELD_MS + RECENT_MS);
		expect(game.match.playerData[p.WHITE]!.interaction.matches).toEqual([
			{ ply: 1, link: 'account' },
		]);
	});

	it('ignores a report tied to neither player', () => {
		reportAt({ signedIn: false, browser_id: 'stranger' }, STRANGER_IP, 1, RECENT_MS);
		expect(game.match.playerData[p.WHITE]!.interaction.matches).toEqual([]);
		expect(game.match.playerData[p.BLACK]!.interaction.matches).toEqual([]);
	});
});
