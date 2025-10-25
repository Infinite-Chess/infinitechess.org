// src/server/controllers/createAccountController.test.ts

/**
 * Tests for the profanity filter used in account creation.
 * 
 * This test suite verifies that the obscenity package correctly identifies
 * profane content in usernames during account creation.
 */

import { describe, it, expect } from 'vitest';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

// Initialize the same profanity matcher used in createAccountController
const profanityMatcher = new RegExpMatcher({
	...englishDataset.build(),
	...englishRecommendedTransformers,
});

/**
 * Helper function to check profanity (same logic as in createAccountController)
 */
function checkProfanity(string: string): boolean {
	return profanityMatcher.hasMatch(string);
}

describe('Profanity Filter', () => {
	describe('Basic profanity detection', () => {
		it('should detect common profane words', () => {
			expect(checkProfanity('fuck')).toBe(true);
			expect(checkProfanity('shit')).toBe(true);
			expect(checkProfanity('bitch')).toBe(true);
			expect(checkProfanity('ass')).toBe(true);
		});

		it('should detect profanity regardless of case', () => {
			expect(checkProfanity('FUCK')).toBe(true);
			expect(checkProfanity('FuCk')).toBe(true);
			expect(checkProfanity('sHiT')).toBe(true);
		});

		it('should detect profanity within usernames', () => {
			expect(checkProfanity('userfuck123')).toBe(true);
			expect(checkProfanity('shit4brains')).toBe(true);
			expect(checkProfanity('mybitch')).toBe(true);
		});
	});

	describe('Variant detection', () => {
		it('should detect common profanity variants', () => {
			// Obscenity package handles these with its transformers
			expect(checkProfanity('f*ck')).toBe(true);
			expect(checkProfanity('sh!t')).toBe(true);
			expect(checkProfanity('b1tch')).toBe(true);
		});

		it('should detect leetspeak variants', () => {
			expect(checkProfanity('fuk')).toBe(true);
			expect(checkProfanity('fvck')).toBe(true);
		});
	});

	describe('Clean usernames', () => {
		it('should allow clean usernames', () => {
			expect(checkProfanity('john123')).toBe(false);
			expect(checkProfanity('player1')).toBe(false);
			expect(checkProfanity('cooluser')).toBe(false);
			expect(checkProfanity('chessmaster')).toBe(false);
		});

		it('should allow usernames with words that contain profanity substrings but are not profane', () => {
			// The obscenity package is smart enough to handle these cases
			expect(checkProfanity('password')).toBe(false);
			expect(checkProfanity('classic')).toBe(false);
			expect(checkProfanity('assassin')).toBe(false);
		});

		it('should allow numbers and alphanumeric combinations', () => {
			expect(checkProfanity('user123')).toBe(false);
			expect(checkProfanity('abc123xyz')).toBe(false);
			expect(checkProfanity('player9000')).toBe(false);
		});
	});

	describe('Edge cases', () => {
		it('should handle empty strings', () => {
			expect(checkProfanity('')).toBe(false);
		});

		it('should handle single characters', () => {
			expect(checkProfanity('a')).toBe(false);
			expect(checkProfanity('1')).toBe(false);
		});

		it('should handle special characters only', () => {
			expect(checkProfanity('!@#$%')).toBe(false);
		});

		it('should handle long usernames with profanity', () => {
			expect(checkProfanity('verylongusernamewithfuckprofanity')).toBe(true);
		});
	});

	describe('Specific words from old filter', () => {
		// Testing words that were in the old profainWords array
		it('should detect words from the old hardcoded list', () => {
			expect(checkProfanity('fuck')).toBe(true);
			expect(checkProfanity('fuk')).toBe(true);
			expect(checkProfanity('shit')).toBe(true);
			expect(checkProfanity('piss')).toBe(true);
			expect(checkProfanity('bitch')).toBe(true);
			expect(checkProfanity('bastard')).toBe(true);
			expect(checkProfanity('cunt')).toBe(true);
		});

		it('should handle the "ass" case properly', () => {
			// The old filter couldn't block "ass" because it would block "pass"
			// Obscenity should handle this better with word boundaries
			expect(checkProfanity('ass')).toBe(true);
			expect(checkProfanity('pass')).toBe(false);
			expect(checkProfanity('password')).toBe(false);
			expect(checkProfanity('classic')).toBe(false);
		});
	});

	describe('Case insensitivity (username convention)', () => {
		it('should detect profanity after converting to lowercase', () => {
			// This mimics what happens in the actual code
			const testUsername = (username: string): boolean => {
				const usernameLowercase = username.toLowerCase();
				return checkProfanity(usernameLowercase);
			};

			expect(testUsername('FUCK123')).toBe(true);
			expect(testUsername('ShItTyUser')).toBe(true);
			expect(testUsername('BiTcH')).toBe(true);
			expect(testUsername('ChessPlayer')).toBe(false);
		});
	});

	describe('Performance', () => {
		it('should handle multiple checks efficiently', () => {
			const testUsernames = [
				'user1', 'user2', 'user3', 'cleanuser', 'chessplayer',
				'john123', 'jane456', 'player789', 'gamer1000', 'testuser'
			];

			const startTime = Date.now();
			testUsernames.forEach(username => {
				checkProfanity(username);
			});
			const endTime = Date.now();

			// Should complete in a reasonable time (less than 100ms for 10 checks)
			expect(endTime - startTime).toBeLessThan(100);
		});
	});
});
