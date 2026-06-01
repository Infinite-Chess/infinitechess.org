// dev-utils/scripts/wsRateLimiter.ts

/**
 * Factory for creating per-socket in-process rate limiters for websocket actions.
 *
 * Usage:
 *   const checkRateLimit = createWsRateLimiter(10_000, 10);
 *   if (!checkRateLimit(ws.metadata.id)) return; // drop over-limit request
 */

/**
 * Creates a stateful rate-limit checker.
 * Each returned function independently tracks request counts per socket ID
 * using a sliding window.
 * @param windowMs - The length of the rate-limit window in milliseconds.
 * @param max - The maximum number of requests allowed within the window.
 * @returns A function that accepts a socket ID and returns `true` if the
 *          request is within the limit, or `false` if it should be dropped.
 */
function createWsRateLimiter(windowMs: number, max: number): (socketId: string) => boolean {
	const tracker = new Map<string, { windowStart: number; count: number }>();

	return function checkRateLimit(socketId: string): boolean {
		const now = Date.now();
		const entry = tracker.get(socketId);

		if (entry === undefined || now - entry.windowStart >= windowMs) {
			tracker.set(socketId, { windowStart: now, count: 1 });
			return true;
		}

		if (entry.count >= max) return false;

		entry.count++;
		return true;
	};
}

export { createWsRateLimiter };
