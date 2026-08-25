// src/server/controllers/registerController.ts

/**
 * Handles the register form: validates the submission, then stages a pending
 * registration and emails a verification link (no member is created until the
 * link is verified). Also answers username/email availability checks.
 */

import type { PendingRegistrationRecord } from '../database/pendingRegistrationManager.js';

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';

import IP from '../utility/IP.js';
import roles from './roles.js';
import turnstile from './turnstile.js';
import logEvents from '../utility/logEvents.js';
import emailService from '../utility/emailService.js';
import memberManager from '../database/memberManager.js';
import sessionManager from './authenticationTokens/sessionManager.js';
import blacklistManager from '../database/blacklistManager.js';
import accountValidation from './accountValidation.js';
import pendingRegistrationManager from '../database/pendingRegistrationManager.js';

// Constants -------------------------------------------------------------------------

/**
 * Name of the httpOnly cookie that holds a pending registration's `claim_token`,
 * set when the register form is submitted. The poll/resend endpoints
 * read it to scope a request to its own pending registration.
 */
const PENDING_REGISTRATION_COOKIE_NAME = 'pending_registration';

// Functions -------------------------------------------------------------------------

/**
 * `POST /api/register` — validates the submission, stages a pending registration,
 * emails a verification link, and sets the pending cookie. Creates no member.
 */
async function createNewMember(req: Request, res: Response): Promise<void> {
	const formData = verifyBodyHasRegisterFormData(req, res);
	if (!formData) return; // Response already sent

	const { username, email, password, turnstileToken } = formData;

	// Two-tab guard: a single pending cookie can't track two registrations. If this browser
	// already has one in progress, don't create another — report success so the page simply
	// navigates to /register/awaiting for the existing registration.
	if (getOwnActivePendingRegistration(req) !== undefined) {
		res.sendStatus(200);
		return;
	}

	// Run field-level checks first. Consume Turnstile token last.
	// Each of these sends its own specific response on failure.
	if (!accountValidation.doUsernameFormatChecks(username, req, res)) return;
	if (!(await accountValidation.doEmailFormatChecks(email, req, res))) return;
	if (!accountValidation.doPasswordFormatChecks(password, req, res)) return;

	let usernameTaken: boolean;
	let emailTaken: boolean;
	try {
		usernameTaken = memberManager.isUsernameTakenOrPending(username);
		emailTaken = memberManager.isEmailTakenOrPending(email);
	} catch {
		res.status(500).json({ message: req.t.responses.errors.server_error });
		return;
	}

	if (usernameTaken) {
		res.status(409).json({
			field: 'username',
			message: req.t.responses.account.username_taken,
		});
		return;
	}
	if (accountValidation.checkReserved(username)) {
		res.status(409).json({
			field: 'username',
			message: req.t.responses.account.username_reserved,
		});
		return;
	}
	if (emailTaken) {
		res.status(409).json({
			field: 'email',
			message: req.t.responses.account.email_in_use,
		});
		return;
	}

	// Bot gate: verify the Cloudflare Turnstile token. Stops automatic account creation.
	// Isn't intended for strengthening email enumeration (that's already bounded by createAccountAttemptLimiter)
	// From here on the token is spent, so these responses tell the client to re-issue a fresh one.
	const turnstileResult = await turnstile.verify(turnstileToken, req);
	if (turnstileResult === 'failed') {
		logEvents.add(
			`Registration rejected (turnstile failed): ${formatRegistrationLogMeta(req, username, email)}`,
			'newMemberLog',
		);
		res.status(403).json({
			message: req.t.register.verification_failed,
			resetTurnstile: true,
		});
		return;
	} else if (turnstileResult === 'error') {
		// Don't fail open on a network error. Claim it as a generic server error.
		res.status(503).json({
			message: req.t.responses.errors.server_error,
			resetTurnstile: true,
		});
		return;
	}

	// Hash the password now so the plaintext never reaches the pending row.
	const hashedPassword = await bcrypt.hash(password, accountValidation.PASSWORD_SALT_ROUNDS);

	// Two deliberately-separate secrets: the claim_token lives only in the httpOnly cookie
	// (scopes the poll), the verification_token only in the emailed link.
	const claimToken = generateRegistrationToken();
	const verificationToken = generateRegistrationToken();

	try {
		// Clear any expired rows blocking the new username/email UNIQUE constraints.
		pendingRegistrationManager.removeExpiredFor(username, email);
		pendingRegistrationManager.add(claimToken, verificationToken, username, email, hashedPassword); // prettier-ignore
	} catch {
		// The Turnstile token was already spent above; have the client re-issue a fresh one.
		res.status(500).json({
			message: req.t.responses.errors.server_error,
			resetTurnstile: true,
		});
		return;
	}

	// Email the verification link. No `members` row will be created until they verify.
	emailService.sendEmailConfirmation(email, username, verificationToken, req.lang);

	// Scope later poll/change-email requests to this pending registration.
	res.cookie(PENDING_REGISTRATION_COOKIE_NAME, claimToken, {
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		maxAge: pendingRegistrationManager.EXPIRY_MS,
	});

	res.sendStatus(201);
}

/**
 * The single structural gate for the register body: requires `username`, `email`, `password`,
 * and the Turnstile token (`cf-turnstile-response`) all be non-empty strings. Anything else is a
 * hand-crafted request — auto-sends a 400 and returns undefined.
 * @returns The four values, or undefined if the body is malformed (response already sent).
 */
function verifyBodyHasRegisterFormData(
	req: Request,
	res: Response,
): { username: string; email: string; password: string; turnstileToken: string } | undefined {
	const { username, email, password, 'cf-turnstile-response': turnstileToken } = req.body;

	if (
		!username ||
		!email ||
		!password ||
		!turnstileToken ||
		typeof username !== 'string' ||
		typeof email !== 'string' ||
		typeof password !== 'string' ||
		typeof turnstileToken !== 'string'
	) {
		// The page always sends a well-formed body, so this is a clean signal
		// of a naive direct-POST bot that never rendered the Turnstile widget.
		logEvents.add(
			`Registration rejected (malformed body): ${formatRegistrationLogMeta(req, username, email)}`,
			'newMemberLog',
		);
		// Unlocalized as this can only be hit from hand-crafted/malformed requests.
		res.status(400).json({ message: 'Request body malformed.' });
		return undefined;
	}

	return { username, email, password, turnstileToken };
}

/** The metadata tail for a rejected-registration log line: `IP   username   email   userAgent`. */
function formatRegistrationLogMeta(req: Request, username: unknown, email: unknown): string {
	const ip = IP.get(req) ?? 'Unknown ip';
	const agent = req.headers['user-agent']!;
	return logEvents.escapeLogNewlines([ip, username ?? '', email ?? '', agent].join('   '));
}

/** Generates a fresh, URL-safe secret for a pending registration's claim/verification token. */
function generateRegistrationToken(): string {
	return crypto.randomBytes(32).toString('base64url');
}

/**
 * Returns the caller's own active (non-expired, still-unverified) pending registration,
 * identified solely by the httpOnly `claim_token` cookie — or undefined if there is none.
 */
function getOwnActivePendingRegistration(req: Request): PendingRegistrationRecord | undefined {
	const cookieClaimToken: unknown = req.cookies[PENDING_REGISTRATION_COOKIE_NAME];
	if (typeof cookieClaimToken !== 'string' || cookieClaimToken.length === 0) return undefined;
	try {
		const row = pendingRegistrationManager.getByClaimToken(cookieClaimToken);
		if (row !== undefined && row.expires_at > Date.now() && row.member_user_id === null) {
			return row;
		}
	} catch {
		// DB lookup failed; treat as no pending registration.
	}
	return undefined;
}

/**
 * SSR state for the awaiting page (`GET /register/awaiting`) and the `GET /register` redirect,
 * derived from the pending-registration cookie: the active pending registration's email (shown
 * in the change-email field) and whether that address is blacklisted — or `null` if there is no
 * active pending registration.
 */
function getAwaitingPageState(req: Request): { email: string; blacklisted: boolean } | null {
	const pending = getOwnActivePendingRegistration(req);
	if (pending === undefined) return null;
	try {
		return { email: pending.email, blacklisted: blacklistManager.isBlacklisted(pending.email) };
	} catch {
		// DB read failed (already logged). Assume not blacklisted so the awaiting page still renders;
		// a genuinely blacklisted address is re-checked in subsequent polls.
		return { email: pending.email, blacklisted: false };
	}
}

/**
 * `PUT /api/register/awaiting/email` — changes the email on the caller's own pending registration
 * (identified by the httpOnly `claim_token` cookie), re-validates the new address, rotates the
 * verification token, refreshes the expiry, and re-sends the verification email.
 */
async function changePendingEmail(req: Request, res: Response): Promise<void> {
	const pending = getOwnActivePendingRegistration(req);
	if (pending === undefined) {
		res.status(404).json({ message: req.t.responses.account.no_pending_registration });
		return;
	}

	const { email } = req.body;
	if (!email || typeof email !== 'string') {
		// Unlocalized: only a bot or crafted request can trigger this
		res.status(400).json({ message: 'Email is required.' });
		return;
	}

	// Re-validate the new address (format, blacklist, MX) — same checks as registration.
	if (!(await accountValidation.doEmailFormatChecks(email, req, res))) return;

	try {
		// Availability: reject a real member's email or another party's pending email. The caller's
		// own row is excluded, so re-submitting the same address is allowed (it just re-sends).
		const emailTaken =
			memberManager.isEmailTaken(email) ||
			pendingRegistrationManager.isEmailTakenByOther(email, pending.claim_token);

		if (emailTaken) {
			res.status(409).json({
				message: req.t.responses.account.email_in_use,
			});
			return;
		}

		// Rotate the verification token so the new address gets a fresh link and any
		// already-delivered link to the old address stops working.
		// The claim_token cookie does not get refreshed.
		const verificationToken = generateRegistrationToken();

		// Clear any expired row blocking the new email's UNIQUE constraint.
		pendingRegistrationManager.removeExpiredFor(pending.username, email);
		pendingRegistrationManager.updateEmail(pending.claim_token, email, verificationToken);

		emailService.sendEmailConfirmation(email, pending.username, verificationToken, req.lang);
		res.sendStatus(200);
	} catch {
		res.status(500).json({
			message: req.t.responses.errors.server_error,
		});
		return;
	}
}

/**
 * `GET /api/register/awaiting/status` — the register browser's awaiting page polls this while
 * waiting for its emailed link to be verified. It is identified by the httpOnly `claim_token`
 * cookie set at registration. Once the pending registration has been promoted, THIS browser
 * (the only one holding the cookie) is issued a session and the pending cookie is cleared.
 *
 * Responds `{ status: 'expired' | 'pending' | 'blacklisted' | 'verified' }`.
 */
function pollPendingRegistration(req: Request, res: Response): void {
	const claimToken = req.cookies[PENDING_REGISTRATION_COOKIE_NAME];
	if (typeof claimToken !== 'string' || claimToken.length === 0) {
		res.json({ status: 'expired' });
		return;
	}

	try {
		const pending = pendingRegistrationManager.getByClaimToken(claimToken);

		// Unknown cookie (never existed, or already swept).
		if (pending === undefined) {
			res.json({ status: 'expired' });
			return;
		}

		// Not yet verified.
		if (pending.member_user_id === null) {
			if (pending.expires_at <= Date.now()) res.json({ status: 'expired' });
			else if (blacklistManager.isBlacklisted(pending.email))
				res.json({ status: 'blacklisted' });
			else res.json({ status: 'pending' });
			return;
		}

		// Verified and created → issue a session to THIS browser, then clear its pending cookie.
		const member = memberManager.getDataByCriteria(
			['username', 'roles'],
			'user_id',
			pending.member_user_id,
		);
		if (member === undefined) {
			// Should be unreachable: the pending row would never have been promoted if the member_user_id didn't exist.
			logEvents.addAndPrint(
				`Pending registration verified to non-existent member_user_id (${pending.member_user_id})!`,
				'errLog',
			);
			res.json({ status: 'expired' });
			return;
		}

		// roles is a stringified JSON array in the database; parse it.
		const parsedRoles = roles.parse(member.roles);
		sessionManager.create(req, res, pending.member_user_id, member.username, parsedRoles, false); // prettier-ignore

		// Idempotent: do NOT delete the pending row (let the cleanup sweep handle it), so a refreshed
		// or duplicate waiting tab that still holds the cookie and polls again resolves cleanly.
		res.clearCookie(PENDING_REGISTRATION_COOKIE_NAME, {
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
		});

		res.json({ status: 'verified' });
	} catch {
		res.json({ status: 'pending' }); // Allows the client to poll again
	}
}

/**
 * `GET /api/register/availability` — checks whether the `?username=` is free (not taken,
 * reserved, or profane). Responds `{ available: true } | { available: false, reason: string }`.
 */
function isUsernameAvailable(req: Request, res: Response): void {
	const username = req.query['username'];
	if (typeof username !== 'string' || username.length === 0) {
		// Unlocalized because the client always provides this
		res.status(400).json({ message: 'Missing username query parameter.' });
		return;
	}

	try {
		if (memberManager.isUsernameTakenOrPending(username)) {
			res.json({ available: false, reason: req.t.responses.account.username_taken });
			return;
		}
	} catch {
		// DB read failed (already logged)
		res.sendStatus(500);
		return;
	}
	if (accountValidation.checkReserved(username)) {
		res.json({ available: false, reason: req.t.responses.account.username_reserved });
		return;
	}
	if (accountValidation.checkProfanity(username)) {
		res.json({ available: false, reason: req.t.responses.account.username_profane });
		return;
	}

	res.json({ available: true });
}

// Exports ------------------------------------------------------------------------------------

export default {
	createNewMember,
	getAwaitingPageState,
	changePendingEmail,
	pollPendingRegistration,
	isUsernameAvailable,
};
