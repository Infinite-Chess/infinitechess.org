// src/server/game/gamemanager/chat.ts

/**
 * The game chat: accepting a player's typed message, appending a static event notice,
 * writing either as a permanent row, and broadcasting it to the two participants.
 */

import type { Player } from '../../../shared/chess/util/typeutil.js';
import type { ServerGame } from './serverGameTypes.js';
import type { ChatEntryData } from '../../database/chatEntriesManager.js';
import type { ChatNoticeCode } from '../../../shared/transport/clientbound.js';

import typeutil from '../../../shared/chess/util/typeutil.js';
import chatlimits from '../../../shared/util/chatlimits.js';

import logEvents from '../../utility/logEvents.js';
import gameSockets from './gameSockets.js';
import gameUtility from './gameUtility.js';
import chatEntryMapper from './chatEntryMapper.js';
import chatEntriesManager from '../../database/chatEntriesManager.js';

// Constants -------------------------------------------------------------------

/**
 * Every C0/C1 control character except U+0009 (tab). A tab is deliberately allowed: pasting one
 * into a text input is legitimate, since the HTML spec strips only line breaks.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000A-\u001F\u007F-\u009F]/;

// Incoming Messages -----------------------------------------------------------

/**
 * Handles a player's `submitchatmessage` - validates and rate-limits, then stores and broadcasts it.
 * @param text - Straight off the wire, untrimmed.
 */
function submitMessage(servergame: ServerGame, ourRole: Player, text: string): void {
	// An engine game's chat panel is never rendered, so nothing it wrote could ever be read.
	if (gameUtility.isEngineGame(servergame)) return reject(servergame, ourRole, 'engine game', text); // prettier-ignore

	const playerdata = servergame.match.playerData[ourRole]!;
	// A guest can't be punished for abuse, so they may only chat with a friend they invited.
	if (!playerdata.identifier.signedIn && !servergame.match.private)
		return reject(servergame, ourRole, 'guest in a public game', text);

	const trimmed = text.trim();
	const fault = findTextFault(trimmed);
	if (fault !== undefined) return reject(servergame, ourRole, fault, text);

	const now = Date.now();
	const rejection = chatlimits.check(playerdata.chatHistory, trimmed, now);
	if (rejection !== undefined) return reject(servergame, ourRole, `${rejection} rule`, text);

	chatlimits.record(playerdata.chatHistory, trimmed, now);
	append(servergame, {
		game_id: servergame.match.id,
		player_number: ourRole,
		message: trimmed,
		notice: null,
		sent_at: now,
	});
}

/** What makes the trimmed text unsendable, or undefined if nothing does. */
function findTextFault(text: string): string | undefined {
	if (text === '') return 'empty after trim';
	// UTF-16 units, the same units the input's `maxlength` counts.
	if (text.length > chatlimits.MAX_CHAT_MESSAGE_LENGTH)
		return `over the ${chatlimits.MAX_CHAT_MESSAGE_LENGTH}-character cap`;
	if (CONTROL_CHARACTERS.test(text)) return 'control character';
	return undefined;
}

/** Logs a refused message to hackLog. Nothing is sent back to the client. */
function reject(servergame: ServerGame, ourRole: Player, reason: string, text: string): void {
	logEvents.add(
		`Refused ${typeutil.strcolors[ourRole]}'s chat message in game ${servergame.match.id} (${reason}): "${logEvents.escapeUntrusted(text)}"`,
		'hackLog',
	);
}

// Notices ---------------------------------------------------------------------

/**
 * Appends a static event notice to a game's chat log.
 * @param player - The player the notice is ABOUT, from whom each side's wording is picked.
 */
function appendNotice(servergame: ServerGame, player: Player, code: ChatNoticeCode): void {
	// Load-bearing for the disconnect/reconnect notices, which an engine game's human still
	// triggers. Its panel is never rendered, so those rows could never be read.
	if (gameUtility.isEngineGame(servergame)) return;
	append(servergame, {
		game_id: servergame.match.id,
		player_number: player,
		message: null,
		notice: code,
		sent_at: Date.now(),
	});
}

// Writing ---------------------------------------------------------------------

/** Writes one entry to the permanent table, then broadcasts it. */
function append(servergame: ServerGame, data: ChatEntryData): void {
	let index: number;
	try {
		chatEntriesManager.insert(data);
		// Read back rather than counted in memory, so it can't drift from the table.
		index = chatEntriesManager.countOfGame(data.game_id) - 1;
	} catch {
		return; // Already logged by db.call. Skip the broadcast — the entry doesn't exist.
	}

	// Participants only — spectators must never receive private chat deltas at all.
	const entry = chatEntryMapper.toEntry(data, index);
	gameSockets.broadcastToParticipants(servergame, 'game', 'chatentry', entry);
}

// Exports ---------------------------------------------------------------------

export default {
	// Incoming Messages
	submitMessage,
	// Notices
	appendNotice,
};
