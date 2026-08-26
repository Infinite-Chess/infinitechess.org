// src/server/middleware/rateLimiters.ts

/**
 * Stores rate limiting rules for various endpoints.
 */

import type { Request, Response } from 'express';
import type { ScriptTranslations } from '../../shared/types/script-translations.js';

import rateLimit from 'express-rate-limit';

// Options ---------------------------------------------------------------------

/** Produces a rate-limit handler that responds with the given translation key. */
function makeHandler(key: keyof ScriptTranslations['responses']['rate_limiting']) {
	return (req: Request, res: Response): Response =>
		res.status(429).json({
			message: req.t.responses.rate_limiting[key],
		});
}

/** Default options for all rate limiters. */
const DEFAULT_OPTIONS = {
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the outdated `X-RateLimit-*` headers
	// Integration tests share one IP and blow past per-IP caps,
	// so all limiters are inert under vitest.
	skip: (): boolean => process.env['NODE_ENV'] === 'test',
	handler: makeHandler('generic'),
};

// Limiters --------------------------------------------------------------------

/**
 * Account Creation Limiter (successful registrations only)
 * Guards against spamming new accounts, and emails.
 */
const createAccount = rateLimit({
	windowMs: 1000 * 60 * 60 * 24, // 1 day
	max: 6,
	skipFailedRequests: true, // Only counts if a pending registration was created (email sent)
	...DEFAULT_OPTIONS,
	handler: makeHandler('account_creations'),
});

/**
 * Account Creation Attempt Limiter (failed registrations only)
 * Guards against email enumeration, spamming DNS/MX lookups, DB queries against.
 */
const createAccountAttempt = rateLimit({
	windowMs: 1000 * 60 * 5, // 5 minutes
	max: 20,
	skipSuccessfulRequests: true, // Only counts if no pending registration was made (no email)
	...DEFAULT_OPTIONS,
});

/**
 * Username Availability Limiter (the register form's blur-triggered username check).
 * Generous. Cap only helps prevent rapid username enumeration.
 */
const usernameAvailability = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 30,
	...DEFAULT_OPTIONS,
});

/** Verification Email Limiter (pending registration email change) */
const verificationEmail = rateLimit({
	windowMs: 1000 * 60 * 60, // 1 hour
	max: 8,
	...DEFAULT_OPTIONS,
	handler: makeHandler('email_requests'),
});

/**
 * Login Attempt Limiter
 * A per-IP cap that complements the per-username+IP limiter in authRatelimiter.ts:
 * that one bounds brute-forcing a single account, this one bounds cross-account credential stuffing.
 */
const authAttempt = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 20,
	...DEFAULT_OPTIONS,
});

/** Forgot Password Email Limiter */
const forgotPassword = rateLimit({
	windowMs: 1000 * 60 * 60, // 1 hour
	max: 8,
	...DEFAULT_OPTIONS,
	handler: makeHandler('email_requests'),
});

/** Editor Save Limiter */
const editorSave = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 10,
	...DEFAULT_OPTIONS,
});

/** Editor Load Limiter */
const editorLoad = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 30,
	...DEFAULT_OPTIONS,
});

/** Seek Preview Limiter */
const seekPreview = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 20,
	...DEFAULT_OPTIONS,
});

/** Dead-game state fetch limiter. Game states can be large. */
const gameState = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 30,
	...DEFAULT_OPTIONS,
});

// Exports ---------------------------------------------------------------------

export default {
	createAccount,
	createAccountAttempt,
	usernameAvailability,
	verificationEmail,
	authAttempt,
	forgotPassword,
	editorSave,
	editorLoad,
	seekPreview,
	gameState,
};
