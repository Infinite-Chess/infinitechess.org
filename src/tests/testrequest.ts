// src/tests/testrequest.ts

import request, { Test } from 'supertest';

import app from '../server/app.js';

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
	const req = request(app);
	const commonHeaders = {
		'X-Forwarded-Proto': 'https', // Fakes HTTPS to bypass middleware redirect
		'User-Agent': 'supertest', // Required to bypass middleware rate limiting
	};

	return {
		get: (url: string) => req.get(url).set(commonHeaders),
		post: (url: string) => req.post(url).set(commonHeaders),
		put: (url: string) => req.put(url).set(commonHeaders),
		patch: (url: string) => req.patch(url).set(commonHeaders),
		delete: (url: string) => req.delete(url).set(commonHeaders),
	};
}
