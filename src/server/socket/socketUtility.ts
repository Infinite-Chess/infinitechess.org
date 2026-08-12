// src/server/socket/socketUtility.ts

// This script contains generalized methods for working with websocket objects.

import type WebSocket from 'ws';
import type { Player } from '../../shared/chess/util/typeutil.js';
import type { ScriptTranslations } from '../../shared/types/script-translations.js';
import type { AuthMemberInfo, ParsedCookies } from '../types.js';

/** The socket object that contains all properties a normal socket has,
 * plus an additional `metadata` property that we define ourselves. */
export interface CustomWebSocket extends WebSocket {
	/**
	 * Contains all translations for the request's resolved language.
	 * Mirrors the server's `req.t` the client's global `t`.
	 */
	t: ScriptTranslations;
	/** Our custom-entered information about this websocket. */
	metadata: {
		/** What subscription lists they are subscribed to. (e.g. 'lobby', 'game', 'spectating'). */
		subscriptions: {
			/** Whether they are subscribed to the lobby (seeks/spectating) list. */
			lobby?: boolean;
			/** Will be defined if they are subscribed to, or in, a game. */
			game?: {
				/** The id of the game they're in. */
				id: number;
				/** The color they are playing as. */
				color: Player;
			};
			/** Will be defined if they are spectating a game (non-participant). */
			spectating?: {
				/** The id of the game they're spectating. */
				id: number;
			};
		};
		/** The parsed cookie object */
		cookies: ParsedCookies;
		/** The user-agent property of the original websocket upgrade's req.headers */
		userAgent: string;
		memberInfo: AuthMemberInfo;
		/** The id of their websocket. */
		id: string;
		/** The socket's IP address. */
		IP: string;
		/** The timeout ID that can be used to cancel the timer that will
		 * expire the socket connection. This is useful if it closes early. */
		clearafter?: NodeJS.Timeout;
		/** The timeout ID to cancel the timer that sends a heartbeat ping to verify the client is alive. */
		heartbeatTimerID?: NodeJS.Timeout;
		/** The timeout IDs to cancel the timers that close this socket
		 * if we never hear an echo back for a message we sent it. */
		echoTimers: { [messageID: number]: NodeJS.Timeout };
	};
}
