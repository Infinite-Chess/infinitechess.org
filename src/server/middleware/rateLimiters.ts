// src/server/middleware/rateLimiters.ts

/**
 * Stores rate limiting rules for various endpoints.
 */

import type { Request, Response } from 'express';

import rateLimit from 'express-rate-limit';

import { getScriptTranslationsForReq } from '../config/componentTranslationLoader.js';

// Options -------------------------------------------------------------

/** A handler that returns a generic rate-limiting message. */
function generic_handler(req: Request, res: Response): Response {
	return res.status(429).json({
		message: getScriptTranslationsForReq('responses', req).rate_limiting.generic,
	});
}

/** Default options for all rate limiters. */
const default_options = {
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the outdated `X-RateLimit-*` headers
	handler: generic_handler,
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
	handler: (req: Request, res: Response): Response => {
		return res.status(429).json({
			message: getScriptTranslationsForReq('responses', req).rate_limiting.account_creations,
		});
	},
});

/**
 * Account Creation Attempt Limiter (failed registrations only)
 * Guards against spamming DNS/MX lookups, DB queries against.
 */
export const createAccountAttemptLimiter = rateLimit({
	windowMs: 1000 * 60 * 60, // 1 hour
	max: 30,
	skipSuccessfulRequests: true, // Only counts if no pending registration was made (no email)
	...default_options,
});

/** Verification Email Limiter (prending registration email change) */
export const verificationEmailLimiter = rateLimit({
	windowMs: 1000 * 60 * 60, // 1 hour
	max: 8,
	...default_options,
	handler: (req: Request, res: Response): Response => {
		return res.status(429).json({
			message: getScriptTranslationsForReq('responses', req).rate_limiting.verify_emails,
		});
	},
});

/** Forgot Password Email Limiter */
export const forgotPasswordLimiter = rateLimit({
	windowMs: 1000 * 60 * 60, // 1 hour
	max: 8,
	...default_options,
	handler: (req: Request, res: Response): Response => {
		return res.status(429).json({
			message: getScriptTranslationsForReq('responses', req).rate_limiting.verify_emails,
		});
	},
});

/** Editor Save Limiter */
export const editorSaveLimiter = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 10,
	skip: () => process.env['NODE_ENV'] === 'test',
	...default_options,
});

/** Editor Load Limiter */
export const editorLoadLimiter = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 30,
	skip: () => process.env['NODE_ENV'] === 'test',
	...default_options,
});

/** Seek Preview Limiter */
export const seekPreviewLimiter = rateLimit({
	windowMs: 1000 * 60, // 1 minute
	max: 20,
	...default_options,
});
