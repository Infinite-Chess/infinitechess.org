// src/server/middleware/requestContext.ts

/**
 * Provides the correlation ID that logEvents tags every log line with,
 * identifying the trigger — one HTTP request or websocket upgrade
 * ('R' prefix) or one incoming websocket message ('W' prefix) — that
 * caused the line.
 *
 * Built on AsyncLocalStorage: an in-memory store scoped to an async call
 * chain, synchronously readable anywhere downstream (surviving awaits)
 * without passing `req` around. Context is created at exactly two entry
 * points: assignRequestID middleware, and runWithRequestID (wrapping
 * the ws upgrade handshake and each incoming ws message).
 *
 * Context follows the causal chain ONLY, so an ID is never wrong:
 * - Timers created during processing carry the scheduler's ID into their
 *   later firings — intentional; deferred effects attribute to their cause.
 * - Unrelated chains can never see each other's IDs.
 * - Chains with no request upstream (startup, intervals,
 *   network-initiated closes) read undefined, logging without an ID.
 */

import type { Request, Response, NextFunction } from 'express';

import { AsyncLocalStorage } from 'node:async_hooks';

import uuid from '../../shared/util/uuid.js';

/** Length of request IDs' random portion, excluding the trigger prefix ('R'/'W'). */
const ID_LENGTH = 8;

/** Total width of a request ID: the random portion plus the 1-char trigger prefix ('R'/'W'). */
const REQUEST_ID_WIDTH = ID_LENGTH + 1;

/**
 * Placeholder logged in place of an ID when a line has no request upstream.
 * Must be the same width as a real ID to keep log columns aligned.
 */
const REQUEST_ID_PLACEHOLDER = '-'.repeat(REQUEST_ID_WIDTH);

/** Holds the current async call chain's request ID, from creation at an entry point until the chain ends. */
const storage = new AsyncLocalStorage<{ requestID: string }>();

/**
 * Generates a fresh request ID. The prefix tells, at a glance in the logs,
 * what kind of trigger the ID belongs to: 'R' = HTTP request or websocket
 * upgrade handshake, 'W' = incoming websocket message.
 */
function generateRequestID(prefix: 'R' | 'W'): string {
	return prefix + uuid.generateID_Base62(ID_LENGTH);
}

/** Middleware that runs the rest of the request pipeline inside a context holding a fresh request ID. */
function assignRequestID(_req: Request, _res: Response, next: NextFunction): void {
	storage.run({ requestID: generateRequestID('R') }, next);
}

/**
 * Runs the callback inside a context holding a fresh request ID. Used for the
 * websocket upgrade handshake ('R') and each incoming websocket message ('W').
 */
function runWithRequestID<T>(callback: () => T, prefix: 'R' | 'W'): T {
	return storage.run({ requestID: generateRequestID(prefix) }, callback);
}

/**
 * Returns the request ID of the call chain we're currently executing in,
 * or undefined when not triggered by a request (startup, connection handshakes, etc.).
 */
function getRequestID(): string | undefined {
	return storage.getStore()?.requestID;
}

export { REQUEST_ID_PLACEHOLDER, ID_LENGTH, assignRequestID, runWithRequestID, getRequestID };
