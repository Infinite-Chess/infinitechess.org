// src/shared/components/chatentry.ts

/**
 * Turns one chat log entry into its display parts: the CSS class, the sender label,
 * and the line's text.
 *
 * TODO: Localize English strings here on the game page's localization pass.
 */

import type { Player, PlayerGroup } from '../chess/util/typeutil.js';
import type { ChatEntry, ChatNoticeCode } from '../transport/clientbound.js';

// Types -----------------------------------------------------------------------

/** One chat log entry, ready for a template or the DOM. */
export interface ChatEntryParts {
	cssClass: 'chat-message' | 'chat-notice';
	/** The sender's name and colon, ending in the space before the message. Absent for a notice. */
	prefix?: string;
	/** The typed message, or the notice's sentence. */
	body: string;
}

/** One sentence written twice: as the player it is about reads it, and as the other player does. */
interface PerspectiveWordings {
	self: string;
	other: string;
}

// Constants -------------------------------------------------------------------

/** Every notice code's English. A bare string reads the same for BOTH players, naming nobody. */
const NOTICE_WORDINGS: Record<ChatNoticeCode, string | PerspectiveWordings> = {
	'draw-offered': { self: 'You offered a draw.', other: 'Opponent offered a draw.' },
	'draw-declined': 'Draw offer declined.',
	'draw-accepted': 'Draw offer accepted.',
	'rematch-offered': { self: 'You offered a rematch.', other: 'Opponent offered a rematch.' },
	'rematch-accepted': 'Rematch accepted.',
	'disconnect-voluntary': { self: 'You disconnected.', other: 'Opponent disconnected.' },
	'disconnect-involuntary': { self: 'You lost connection.', other: 'Opponent lost connection.' },
	reconnected: { self: 'You reconnected.', other: 'Opponent reconnected.' },
	'cheat-detected': 'Illegal move detected. Game aborted.',
};

// Functions -------------------------------------------------------------------

/**
 * Resolves how one entry reads for one viewer.
 * @param readerRole - The viewer's color, deciding which side of a notice's wording they see.
 * @param playerNames - The display name of each color, resolved at render time so a renamed
 *   player's old messages carry their new name.
 */
function toParts(
	entry: ChatEntry,
	readerRole: Player | undefined,
	playerNames: PlayerGroup<string>,
): ChatEntryParts {
	if (entry.kind === 'message') {
		return {
			cssClass: 'chat-message',
			prefix: `${playerNames[entry.player]!}: `,
			body: entry.text,
		};
	} else {
		const wording = NOTICE_WORDINGS[entry.code];
		const body = typeof wording === 'string' ? wording : entry.player === readerRole ? wording.self : wording.other; // prettier-ignore
		return { cssClass: 'chat-notice', body };
	}
}

// Exports ---------------------------------------------------------------------

export default { toParts };
