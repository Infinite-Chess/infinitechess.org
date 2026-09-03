// src/server/game/gamemanager/chatEntry.ts

/**
 * Maps a stored `chat_entries` row onto the wire shapes clients receive.
 */

import type { ChatEntryData } from '../../database/chatEntriesManager.js';
import type {
	ChatEntry,
	ChatLogEntry,
	ChatNoticeCode,
} from '../../../shared/transport/clientbound.js';

/**
 * The row as a live delta.
 * @param index - Its 0-based position in this game's log.
 */
export function toChatEntry(data: ChatEntryData, index: number): ChatEntry {
	const base = { index, player: data.player_number };
	// Exactly one of the two columns is non-NULL — a table CHECK enforces it.
	return data.notice !== null
		? { ...base, kind: 'notice', code: data.notice as ChatNoticeCode }
		: { ...base, kind: 'message', text: data.message! };
}

/**
 * The row as one entry of a full log, which must carry its age.
 * @param now - One reading serves a whole log, so its entries share one measuring moment.
 */
export function toChatLogEntry(data: ChatEntryData, index: number, now: number): ChatLogEntry {
	return { ...toChatEntry(data, index), millisAgo: now - data.sent_at };
}
