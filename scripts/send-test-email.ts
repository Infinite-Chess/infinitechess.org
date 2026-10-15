// scripts/send-test-email.ts

/**
 * Sends one of the user-facing emails to any address, for checking its templates in a real
 * inbox. Uses the .env's SES credentials, so it really sends. Its links carry a placeholder
 * token: they render like real ones but lead nowhere, and nothing is written to the database.
 *
 * Usage:
 *   npx tsx scripts/send-test-email.ts <verify|reset|changed> <to> [lang]
 */

import urlUtils from '../src/server/utility/urlUtils.js';
import emailService from '../src/server/utility/emailService.js';
import translationLoader from '../src/server/config/translationLoader.js';

// Constants -------------------------------------------------------------------

const PLACEHOLDER_TOKEN = 'test-email-placeholder-token';
const RESET_URL = `${urlUtils.getAppBase()}/reset-password/${PLACEHOLDER_TOKEN}`;

/** Sends each email kind to `to`, in `lang`. */
const SENDERS: Record<string, (to: string, lang: string) => Promise<void>> = {
	verify: (to, lang) =>
		emailService.sendEmailConfirmation(to, 'TestUser', PLACEHOLDER_TOKEN, lang),
	reset: (to, lang) => emailService.sendPasswordResetEmail(to, RESET_URL, lang),
	changed: (to, lang) => emailService.sendPasswordChangedEmail(to, lang),
};

// Arguments -------------------------------------------------------------------

const [kind, to, lang = 'en-US'] = process.argv.slice(2);
const sender = kind !== undefined && Object.hasOwn(SENDERS, kind) ? SENDERS[kind] : undefined;
if (sender === undefined || to === undefined) {
	console.error('Usage: npx tsx scripts/send-test-email.ts <verify|reset|changed> <to> [lang]');
	process.exit(1);
}

// Send ------------------------------------------------------------------------

translationLoader.load();
await sender(to, lang);
// emailService prints any failure itself; only a sent email is logged with SES's message id.
console.log(`Done. If sent, the ${kind} email has a line in logs/sentEmailsLog.txt.`);
