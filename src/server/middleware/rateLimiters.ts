/**
 * Stores rate limiting rules for various endpoints.
 */

import type { Request, Response } from 'express';

import rateLimit from 'express-rate-limit';

import { getTranslationForReq } from '../utility/translate.js';

// Options -------------------------------------------------------------

/** A handler that returns a generic rate-limiting message. */
function generic_handler(req: Request, res: Response): Response {
	const msg = getTranslationForReq('rate-limiting.generic', req);
	return res.status(429).json({ message: msg });
}

/** Default options for all rate limiters. */
const default_options = {
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the outdated `X-RateLimit-*` headers
	handler: generic_handler,
};

// Limiters -------------------------------------------------------------

/**
 * Account Creation Limiter
 * Rule: Max 6 account creations per day per IP
 */
export const createAccountLimiter = rateLimit({
	windowMs: 1000 * 60 * 60 * 24,
	max: 6,
	...default_options,
});

/**
 * Resend Account Verification Email Limiter
 * Rule: Max 4 verification email resends per hour per IP
 */
export const resendAccountVerificationLimiter = rateLimit({
	windowMs: 1000 * 60 * 60,
	max: 4,
	...default_options,
});

/**
 * Forgot Password Email Limiter
 * Rule: Max 8 password reset requests per 20 minutes per IP
 */
export const forgotPasswordLimiter = rateLimit({
	windowMs: 1000 * 60 * 20,
	max: 8,
	...default_options,
});
