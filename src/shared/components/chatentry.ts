// src/shared/components/chatentry.ts

/**
 * Turns one chat log entry into its display parts: the CSS class, the sender label,
 * and the line's text.
 */

import type { ChatEntry } from '../transport/clientbound.js';
import type { ScriptTranslations } from '../types/script-translations.js';
import type { Player, PlayerGroup } from '../chess/util/typeutil.js';

// Types -----------------------------------------------------------------------

/** One chat log entry, ready for a template or the DOM. */
export type ChatEntryParts =
	| {
			cssClass: 'chat-message';
			/** The sender's name and colon, ending in the space before the message. */
			prefix: string;
			/** The typed message. */
			body: string;
	  }
	| {
			cssClass: 'chat-notice';
			/** The notice's sentence. */
			body: string;
	  };

// Functions -------------------------------------------------------------------

/**
 * Resolves how one entry reads for one viewer.
 * @param readerRole - The viewer's color, deciding which side of a notice's wording they see.
 * @param playerNames - The display name of each color, resolved at render time so a renamed
 *   player's old messages carry their new name.
 * @param gameT - The game page's translations, holding every notice's wording. A bare string
 *   reads the same for BOTH players; a pair is worded for the player it's about, and the other.
 */
function toParts(
	entry: ChatEntry,
	readerRole: Player | undefined,
	playerNames: PlayerGroup<string>,
	gameT: ScriptTranslations['game'],
): ChatEntryParts {
	if (entry.kind === 'message') {
		return {
			cssClass: 'chat-message',
			prefix: `${playerNames[entry.player]!}: `,
			body: entry.text,
		};
	} else {
		const wording = gameT.chat.notices[entry.code];
		const body = typeof wording === 'string' ? wording : entry.player === readerRole ? wording.self : wording.other; // prettier-ignore
		return { cssClass: 'chat-notice', body };
	}
}

// Exports ---------------------------------------------------------------------

export default { toParts };
