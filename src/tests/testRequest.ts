// src/tests/testRequest.ts

import { once } from 'node:events';
import { afterAll } from 'vitest';
import request, { Test } from 'supertest';

import app from '../server/app.js';

// Setup -----------------------------------------------------------------------

/**
 * One server per test file. Bound to 127.0.0.1 explicitly: supertest's own `listen(0)` binds
 * all interfaces, so macOS may hand it a port another process holds on 127.0.0.1, and the
 * request (sent to 127.0.0.1) then reaches that process instead.
 */
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
afterAll(() => server.close());

// Functions -------------------------------------------------------------------

/**
 * A wrapper around supertest to automatically set common headers
 * required by the application (e.g. to bypass HTTPS redirects and 404s).
 */
export function testRequest(): {
	get: (url: string) => Test;
	post: (url: string) => Test;
	put: (url: string) => Test;
	patch: (url: string) => Test;
	delete: (url: string) => Test;
} {
	const req = request(server);
	const commonHeaders = {
		'X-Forwarded-Proto': 'https', // Fakes HTTPS to bypass middleware redirect
		'User-Agent': 'supertest', // Required: the rate limiter rejects requests without one
	};

	return {
		get: (url: string) => req.get(url).set(commonHeaders),
		post: (url: string) => req.post(url).set(commonHeaders),
		put: (url: string) => req.put(url).set(commonHeaders),
		patch: (url: string) => req.patch(url).set(commonHeaders),
		delete: (url: string) => req.delete(url).set(commonHeaders),
	};
}
