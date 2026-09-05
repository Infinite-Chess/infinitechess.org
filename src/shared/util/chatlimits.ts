// src/shared/util/chatlimits.ts

/**
 * Every limit on what a player may send in the game chat: a message's maximum length, and the
 * two send rules — a rolling rate-limit window and an exact-duplicate check, both read off a
 * short history of the sender's own messages in one game.
 */

// Types -----------------------------------------------------------------------

/** One of a sender's own recent messages, as the history holds it. */
export interface ChatHistoryEntry {
	/** When it was sent, in the clock of whichever side holds this history. */
	sentAt: number;
	text: string;
}

/** Why a send was rejected. */
export type ChatRejection = 'window' | 'duplicate';

// Constants -------------------------------------------------------------------

/** The longest message a player may send. */
const MAX_CHAT_MESSAGE_LENGTH = 140;

/** How many of the sender's own most recent messages the history keeps. */
const HISTORY_LENGTH = 5;

/**
 * A send is rejected when all {@link HISTORY_LENGTH} previous messages landed
 * within this, making it also the longest a sender can ever be held off.
 */
const WINDOW_MS = 10_000;

/** How many of the most recent messages an exact duplicate is tested against. */
const DUPLICATE_LOOKBACK = 2;

// Functions -------------------------------------------------------------------

/**
 * Tests a send against both rules.
 * @param history - The sender's own recent messages in this game, oldest first.
 * @param now - The current time, in the same clock as the history's `sentAt`s.
 * @returns Why to reject it, or undefined to allow it.
 */
function check(history: ChatHistoryEntry[], text: string, now: number): ChatRejection | undefined {
	const oldest = history[history.length - HISTORY_LENGTH];
	if (oldest !== undefined && now - oldest.sentAt < WINDOW_MS) return 'window';
	if (history.slice(-DUPLICATE_LOOKBACK).some((entry) => entry.text === text)) return 'duplicate';
	return undefined;
}

/** Records an accepted send, trimming the history back to {@link HISTORY_LENGTH}. */
function record(history: ChatHistoryEntry[], text: string, now: number): void {
	history.push({ sentAt: now, text });
	if (history.length > HISTORY_LENGTH) history.splice(0, history.length - HISTORY_LENGTH);
}

// Exports ---------------------------------------------------------------------

export default {
	// Constants
	MAX_CHAT_MESSAGE_LENGTH,
	WINDOW_MS,
	// Functions
	check,
	record,
};
