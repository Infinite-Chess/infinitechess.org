// src/client/scripts/esm/game/websocket/socketutil.ts

/**
 * Shared types, constants, and utility functions for the client websocket system.
 */

import toast from '../gui/toast.js';
import docutil from '../../util/docutil.js';

// Types -----------------------------------------------------------------------

type WebsocketMessageValue = MessageEvent['data'];

/** Information about the last hard refresh we attempted. */
type HardRefreshInfo = {
	timeLastHardRefreshed: number;
	expectedVersion: string;
	refreshFailed?: boolean;
};

/**
 * An incoming websocket server message.
 */
export interface WebsocketMessage {
	/** What subscription the message should be forwarded to (e.g. "general", "invites", "game"). */
	sub: string;
	/** What action to perform with this message's data. */
	action: string;
	/** The message contents. */
	value: WebsocketMessageValue;
	/** The ID of the message to echo, so the server knows we've received it. */
	id: number;
	/** The ID of the message this message is the reply to, if specified. */
	replyto: number;
}

export type { WebsocketMessageValue, HardRefreshInfo };

// Constants -------------------------------------------------------------------

/** Time to wait for HTTP connection before assuming lost connection. */
export const TIME_TO_WAIT_FOR_HTTP_MILLIS = 5000;

/** Time to wait for echo before assuming disconnection. */
export const TIME_TO_WAIT_FOR_ECHO_MILLIS = 5000;

/** Time before attempting resub after network loss. */
export const TIME_TO_RESUB_AFTER_NETWORK_LOSS_MILLIS = 5000;

/** Time before attempting resub after too many requests. */
export const TIME_TO_RESUB_AFTER_TOO_MANY_REQUESTS_MILLIS = 10000;

/** Time before attempting resub after message too big. */
export const TIME_TO_RESUB_AFTER_MESSAGE_TOO_BIG_MILLIS = TIME_TO_RESUB_AFTER_NETWORK_LOSS_MILLIS;

/** Time the websocket remains open without subscriptions. */
export const CUSHION_BEFORE_AUTO_CLOSE_MILLIS = 10000;

/** Simulated websocket latency in debug mode. */
export const SIMULATED_WEBSOCKET_LATENCY_MILLIS_DEBUG = 1000;

// Debug -----------------------------------------------------------------------

/** Enables simulated websocket latency and prints all sent and received messages. */
let DEBUG = false;
/** Whether to also print incoming echos in debug mode. */
export const ALSO_PRINT_INCOMING_ECHOS = false;

/** Returns whether debug mode is enabled. */
export function isDebugEnabled(): boolean {
	return DEBUG;
}

/** Toggles debug mode on or off, showing a toast notification. */
export function toggleDebug(): void {
	if (!docutil.isLocalEnvironment()) toast.show("Can't enable websocket latency in production.");
	DEBUG = !DEBUG;
	toast.show(`Toggled websocket latency: ${DEBUG}`);
}

// Custom Events ---------------------------------------------------------------

/** Dispatches a custom event indicating that websocket connection was lost. */
export function dispatchLostConnectionCustomEvent(): void {
	document.dispatchEvent(new CustomEvent('connection-lost'));
}

/** Dispatches a custom event indicating that a socket connection is being opened. */
export function dispatchOpeningSocketCustomEvent(): void {
	document.dispatchEvent(new CustomEvent('socket-opening'));
}
