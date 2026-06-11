// src/server/middleware/rateLimiters.ts

/**
 * Stores rate limiting rules for various endpoints.
 */

import type { Request, Response } from 'express';
import type { ScriptTranslations } from '../../shared/types/script-translations.js';

import rateLimit from 'express-rate-limit';

// Options -------------------------------------------------------------

/** Produces a rate-limit handler that responds with the given translation key. */
function make_handler(key: keyof ScriptTranslations['responses']['rate_limiting']) {
	return (req: Request, res: Response): Response =>
		res.status(429).json({
			message: req.t.responses.rate_limiting[key],
		});
}

/** Default options for all rate limiters. */
const default_options = {
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the outdated `X-RateLimit-*` headers
	// Integration tests share one IP and blow past per-IP caps,
	// so all limiters are inert under vitest.
	skip: (): boolean => process.env['NODE_ENV'] === 'test',
	handler: make_handler('generic'),
};

// Limiters -------------------------------------------------------------

/**
 * Account Creation Limiter (successful registrations only)
 * Guards against spamming new accounts, and emails.
 */
export const createAccountLimiter = rateLimit({
	windowMs: 1000 * 60 * 60 * 24, // 1 day
	max: 6,
	skipFailedRequests: true, // Only counts if a pending registration was created (email sent)
	...default_options,
	handler: make_handler('account_creations'),
});

/**
 * Account Creation Attempt Limiter (failed registrations only)
 * Guards against spamming DNS/MX lookups, DB queries against.
 */
export const createAccountAttemptLimiter = rateLimit({
	windowMs: 1000 * 60 * 5, // 5 minutes
	max: 20,
	skipSuccessfulRequests: true, // Only counts if no pending registration was made (no email)
	...default_options,
});

/**
 * Login Attempt Limiter
 * A per-IP cap that complements the per-username+IP limiter in authRatelimiter.ts:
 * that one bounds brute-forcing a single account, this one bounds cross-account credential stuffing.
 */
export const loginAttemptLimiter = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 15,
	...default_options,
});

/**
 * Username Availability Limiter (the register form's blur-triggered username check).
 * Generous. Cap only helps prevent rapid username enumeration.
 */
export const usernameAvailabilityLimiter = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 30,
	...default_options,
});

/** Verification Email Limiter (pending registration email change) */
export const verificationEmailLimiter = rateLimit({
	windowMs: 1000 * 60 * 60, // 1 hour
	max: 8,
	...default_options,
	handler: make_handler('verify_emails'),
});

/** Forgot Password Email Limiter */
export const forgotPasswordLimiter = rateLimit({
	windowMs: 1000 * 60 * 60, // 1 hour
	max: 8,
	...default_options,
	handler: make_handler('verify_emails'),
});

/** Editor Save Limiter */
export const editorSaveLimiter = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 10,
	...default_options,
});

/** Editor Load Limiter */
export const editorLoadLimiter = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 30,
	...default_options,
});

/** Seek Preview Limiter */
export const seekPreviewLimiter = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 20,
	...default_options,
});
