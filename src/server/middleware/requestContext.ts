// src/server/middleware/requestContext.ts

/**
 * Provides the correlation ID that logEvents tags every log line with,
 * identifying the trigger — one HTTP request ('R' prefix) or one incoming
 * websocket message ('W' prefix) — that caused the line.
 *
 * Built on AsyncLocalStorage: an in-memory store scoped to an async call
 * chain, synchronously readable anywhere downstream (surviving awaits)
 * without passing `req` around. Context is created at exactly two entry
 * points: assignRequestID (first middleware in the Express pipeline) and
 * runWithRequestID (wrapping each ws message dispatch in openSocket).
 *
 * Context follows the causal chain ONLY, so an ID is never wrong:
 * - Timers created during processing carry the scheduler's ID into their
 *   later firings — intentional; deferred effects attribute to their cause.
 * - Unrelated chains can never see each other's IDs.
 * - Chains with no request upstream (startup, intervals, ws handshakes,
 *   network-initiated closes) read undefined, logging without an ID.
 */

import type { Request, Response, NextFunction } from 'express';

import { AsyncLocalStorage } from 'node:async_hooks';

import uuid from '../../shared/util/uuid.js';

/** IDs only need uniqueness within a log window, not security, so 8 base62 chars is plenty. */
const ID_LENGTH = 8;

/** Holds the current async call chain's request ID, from creation at an entry point until the chain ends. */
const storage = new AsyncLocalStorage<{ requestID: string }>();

/**
 * Generates a fresh request ID. The prefix tells, at a glance in the logs,
 * what kind of trigger the ID belongs to: 'R' = HTTP request, 'W' = websocket message.
 */
function generateRequestID(prefix: 'R' | 'W'): string {
	return prefix + uuid.generateID_Base62(ID_LENGTH);
}

/** Middleware that runs the rest of the request pipeline inside a context holding a fresh request ID. */
function assignRequestID(_req: Request, _res: Response, next: NextFunction): void {
	storage.run({ requestID: generateRequestID('R') }, next);
}

/** Runs the callback inside a context holding a fresh request ID, for incoming websocket messages. */
function runWithRequestID<T>(callback: () => T): T {
	return storage.run({ requestID: generateRequestID('W') }, callback);
}

/**
 * Returns the request ID of the call chain we're currently executing in,
 * or undefined when not triggered by a request (startup, connection handshakes, etc.).
 */
function getRequestID(): string | undefined {
	return storage.getStore()?.requestID;
}

export { assignRequestID, runWithRequestID, getRequestID };
