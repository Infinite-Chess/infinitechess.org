// src/server/controllers/accountValidation.unit.test.ts

/**
 * Tests for accountValidation's profanity filter (`checkProfanity`).
 *
 * Verifies that the obscenity package correctly identifies profane content in usernames.
 */

import { describe, it, expect } from 'vitest';

import accountValidation from './accountValidation';

describe('Profanity Filter', () => {
	describe('Basic profanity detection', () => {
		it('should detect common profane words', () => {
			expect(accountValidation.checkProfanity('fuck')).toBe(true);
			expect(accountValidation.checkProfanity('shit')).toBe(true);
			expect(accountValidation.checkProfanity('bitch')).toBe(true);
			expect(accountValidation.checkProfanity('ass')).toBe(true);
		});

		it('should detect profanity regardless of case', () => {
			expect(accountValidation.checkProfanity('FUCK')).toBe(true);
			expect(accountValidation.checkProfanity('FuCk')).toBe(true);
			expect(accountValidation.checkProfanity('sHiT')).toBe(true);
		});

		it('should detect profanity within usernames', () => {
			expect(accountValidation.checkProfanity('userfuck123')).toBe(true);
			expect(accountValidation.checkProfanity('shit4brains')).toBe(true);
			expect(accountValidation.checkProfanity('mybitch')).toBe(true);
		});
	});

	describe('Variant detection', () => {
		it('should detect common profanity variants', () => {
			// Obscenity package handles these with its transformers
			// Note: symbols are currently not allowed in usernames.
			expect(accountValidation.checkProfanity('f*ck')).toBe(true);
			expect(accountValidation.checkProfanity('sh!t')).toBe(true);
			expect(accountValidation.checkProfanity('b1tch')).toBe(true);
		});

		it('should detect leetspeak variants', () => {
			expect(accountValidation.checkProfanity('fuk')).toBe(true);
			expect(accountValidation.checkProfanity('fvck')).toBe(true);
		});
	});

	describe('Clean usernames', () => {
		it('should allow clean usernames', () => {
			expect(accountValidation.checkProfanity('john123')).toBe(false);
			expect(accountValidation.checkProfanity('player1')).toBe(false);
			expect(accountValidation.checkProfanity('cooluser')).toBe(false);
			expect(accountValidation.checkProfanity('chessmaster')).toBe(false);
		});

		it('should allow usernames with words that contain profanity substrings but are not profane', () => {
			// The obscenity package is smart enough to handle these cases
			expect(accountValidation.checkProfanity('password')).toBe(false);
			expect(accountValidation.checkProfanity('classic')).toBe(false);
			expect(accountValidation.checkProfanity('assassin')).toBe(false);
		});

		it('should allow numbers and alphanumeric combinations', () => {
			expect(accountValidation.checkProfanity('user123')).toBe(false);
			expect(accountValidation.checkProfanity('abc123xyz')).toBe(false);
			expect(accountValidation.checkProfanity('player9000')).toBe(false);
		});

		it('should allow usernames with profaine substrings in non-profane words', () => {
			expect(accountValidation.checkProfanity('passage')).toBe(false);
			expect(accountValidation.checkProfanity('classical')).toBe(false);
			expect(accountValidation.checkProfanity('assistant')).toBe(false);
		});
	});

	describe('Edge cases', () => {
		it('should handle empty strings', () => {
			expect(accountValidation.checkProfanity('')).toBe(false);
		});

		it('should handle single characters', () => {
			expect(accountValidation.checkProfanity('a')).toBe(false);
			expect(accountValidation.checkProfanity('1')).toBe(false);
		});

		it('should handle special characters only', () => {
			expect(accountValidation.checkProfanity('!@#$%')).toBe(false);
		});

		it('should handle long usernames with profanity', () => {
			expect(accountValidation.checkProfanity('verylongusernamewithfuckprofanity')).toBe(
				true,
			);
		});
	});

	describe('Performance', () => {
		it('should handle multiple checks efficiently', () => {
			const testUsernames = [
				'user1',
				'user2',
				'user3',
				'cleanuser',
				'chessplayer',
				'john123',
				'jane456',
				'player789',
				'gamer1000',
				'testuser',
			];

			const startTime = Date.now();
			testUsernames.forEach((username) => {
				accountValidation.checkProfanity(username);
			});
			const endTime = Date.now();

			// Should complete quickly
			expect(endTime - startTime).toBeLessThan(10);
		});
	});
});
