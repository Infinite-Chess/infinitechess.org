// src/client/scripts/esm/views/game/gui/guichat.ts

/**
 * Manages the `.chat` panel on the game page: the collapse toggle, the log, and the input.
 *
 * Every element here may be absent. SSR omits the whole panel for anyone who isn't a
 * participant of a non-engine game, and omits the input once the game can no longer
 * be chatted in.
 */

import type { ChatEntry, ChatLogEntry } from '../../../../../../shared/transport/clientbound.js';
import type { ChatHistoryEntry, ChatRejection } from '../../../../../../shared/util/chatlimits.js';

import chatentry from '../../../../../../shared/components/chatentry.js';
import chatlimits from '../../../../../../shared/util/chatlimits.js';

import socketsend from '../../../socket/socketsend.js';
import pingmanager from '../pingmanager.js';
import guidisconnect from './guidisconnect.js';

// Constants -------------------------------------------------------------------

/** The error shown above the input for each reason a send is refused. */
const ERROR_TEXTS: Record<ChatRejection | 'disconnected', string> = {
	window: 'Slow down, too many messages.',
	duplicate: 'You just said that.',
	disconnected: 'You are disconnected.',
};

// Elements --------------------------------------------------------------------

const element_Chat = document.querySelector('.chat');
const element_ChatBar = document.querySelector('.chat-bar');
const element_ChatLog = document.querySelector('.chat-log');
const element_ChatError = document.querySelector('.chat-error');
// Absent when the page loaded a game already over.
const element_ChatInput = document.getElementById('chat-input') as HTMLInputElement | null;
const element_Report = document.getElementById('btn-report');

// State -----------------------------------------------------------------------

/**
 * Our own recent messages this game, the send rules are checked against.
 * Its `sentAt`s are in OUR clock, converted at receipt.
 */
const sentHistory: ChatHistoryEntry[] = [];

/**
 * Whether the log should follow its own bottom. Sampled on every scroll,
 * since a resize has already moved the numbers it would otherwise be read from.
 */
let stickToBottom: boolean = true;

/**
 * How many entries of the game's log we have rendered — so the next one to render is the entry
 * at exactly this index. Seeded from what SSR painted, which is always a true prefix of the log.
 */
let renderedCount: number = element_ChatLog?.children.length ?? 0;

/** The hide timer's id, while a refusal notice is showing. */
let errorTimeoutID: number | undefined;

// The Log ---------------------------------------------------------------------

/** Renders every entry of a full log we don't hold yet. A stale log renders nothing. */
function reconcile(entries: ChatEntry[]): void {
	for (let i = renderedCount; i < entries.length; i++) append(entries[i]!);
}

/**
 * Renders one entry at the end of the log.
 * KEEP IN SYNC with `game.njk`'s chat loop, which builds the identical tag skeleton.
 */
function append(entry: ChatEntry): void {
	if (!element_ChatLog) return; // Not a participant: panel absent.
	if (entry.index !== renderedCount) return; // Already held, or past a gap we haven't filled.
	renderedCount++;

	const parts = chatentry.toParts(entry, window.gamePageData.role, window.gamePageData.playerNames); // prettier-ignore
	const div = document.createElement('div');
	div.className = parts.cssClass;
	// A notice has no sender. Everything goes on as text — never `innerHTML`, since it's user input.
	if (parts.prefix !== undefined) {
		const sender = document.createElement('span');
		sender.className = 'chat-sender';
		sender.textContent = parts.prefix; // Carries its own trailing space.
		div.append(sender);
	}
	div.append(parts.body);
	element_ChatLog.append(div);

	if (stickToBottom) scrollToBottom();
}

/** Whether the log is scrolled to its bottom, and so should follow whatever moves next. */
function isScrolledToBottom(): boolean {
	if (!element_ChatLog) return false;
	// Sub-pixel layout means the three never land exactly equal, so allow a pixel of slack.
	const distance =
		element_ChatLog.scrollHeight - element_ChatLog.scrollTop - element_ChatLog.clientHeight;
	return distance <= 1;
}

/** Scrolls the log as far down as possible. */
function scrollToBottom(): void {
	if (element_ChatLog) element_ChatLog.scrollTop = element_ChatLog.scrollHeight;
}

// The Send History ------------------------------------------------------------

/**
 * Rebuilds our message history from a full log, so a page refresh doesn't lose it.
 * Safe to clear first because every `gamestate` carries the WHOLE log, never a delta.
 */
function rebuildHistory(entries: ChatLogEntry[]): void {
	sentHistory.length = 0;
	for (const entry of entries) recordEntry(entry, receiptInstant() - entry.millisAgo);
}

/**
 * Records one entry into our history, if it is a message of ours.
 * @param sentAt - When the server recorded it, in OUR clock.
 */
function recordEntry(entry: ChatEntry, sentAt: number): void {
	if (entry.kind !== 'message' || entry.player !== window.gamePageData.role) return;
	chatlimits.record(sentHistory, entry.text, sentAt);
}

/** When something arriving right now was sent, in OUR clock. Half the ping is its inbound transit. */
function receiptInstant(): number {
	return Date.now() - pingmanager.getHalfPing();
}

// Sending ---------------------------------------------------------------------

/**
 * Sends the typed message, unless we predict a refusal — in
 * which case an error shows and the text is left in the box.
 */
function submit(): void {
	if (!element_ChatInput) return;
	const text = element_ChatInput.value.trim();
	if (text === '') return; // Nothing to send.

	// Refused for the same reason the match panel reads "You have disconnected."
	if (guidisconnect.isSelfDisconnected()) return showError('disconnected');

	const rejection = chatlimits.check(sentHistory, text, Date.now());
	if (rejection !== undefined) return showError(rejection);

	// Bypasses socketintents deliberately: a held intent REPLACES the previous one and an
	// outstanding one swallows the next, both of which silently drop a distinct message.
	void socketsend.send('game', 'submitchatmessage', text);
	// It renders only when the server's delta arrives — no optimistic rendering. The typed
	// text is lost only here, where we approved the send; a predicted refusal leaves it.
	element_ChatInput.value = '';
	hideError();
}

/** Shows why the send was refused, above the input. It hides itself after the rate-limit window. */
function showError(reason: ChatRejection | 'disconnected'): void {
	if (!element_ChatError) return;
	element_ChatError.textContent = ERROR_TEXTS[reason];
	element_ChatError.classList.remove('hidden');
	clearTimeout(errorTimeoutID); // A fresh refusal restarts the wait.
	errorTimeoutID = window.setTimeout(() => hideError(), chatlimits.WINDOW_MS);
}

/** Clears the refusal notice, and whatever wait was left on it. */
function hideError(): void {
	clearTimeout(errorTimeoutID);
	errorTimeoutID = undefined;
	element_ChatError?.classList.add('hidden');
}

// Life Cycle ------------------------------------------------------------------

/**
 * The server detached us from the game, so it can no longer be chatted in — hide the input
 * entirely, matching what SSR does for a game that loads already detached. The log stays.
 */
function onDetached(): void {
	if (element_ChatInput) {
		element_ChatInput.value = '';
		element_ChatInput.classList.add('hidden');
	}
	hideError();
}

// Listeners -------------------------------------------------------------------

// Clicking the bar anywhere but the report button collapses/expands the panel.
element_ChatBar?.addEventListener('click', (e) => {
	if (element_Report?.contains(e.target as Node)) return;
	element_Chat?.classList.toggle('collapsed');
});

// Enter sends. A single-line input has no newline to suppress, so it needs no shiftKey guard.
element_ChatInput?.addEventListener('keydown', (e) => {
	if (e.key !== 'Enter') return;
	e.preventDefault();
	submit();
});
element_ChatInput?.addEventListener('input', () => hideError());

// The reader's own scrolling is the only thing that decides whether the log follows its bottom.
element_ChatLog?.addEventListener('scroll', () => {
	stickToBottom = isScrolledToBottom();
});

// The log absorbs whatever side-bar height the other panels leave it, so ANY of them changing
// height shrinks it — and a shrink alone slides the bottom away from an unchanged scrollTop.
if (element_ChatLog) {
	new ResizeObserver(() => {
		if (stickToBottom) scrollToBottom();
	}).observe(element_ChatLog);
}

// The SSR'd log paints scrolled to its top; the latest lines are what matter.
scrollToBottom();

// Exports ---------------------------------------------------------------------

export default {
	// The Log
	reconcile,
	append,
	// The Send History
	rebuildHistory,
	recordEntry,
	receiptInstant,
	// Life Cycle
	onDetached,
};
