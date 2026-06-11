// src/client/scripts/esm/util/serverFetch.ts

/**
 * A drop-in `fetch()` that defaults `Accept` to JSON, so the server can tell an
 * API call from an HTML page load (browsers otherwise default fetch to any type).
 */

/**
 * Drop-in replacement for `fetch()` that defaults the `Accept`
 * header to JSON, without clobbering any caller-provided headers.
 * @param input - The resource to fetch (URL or Request), same as native fetch.
 * @param init - Optional fetch options, same as native fetch.
 * @returns A promise resolving to the fetch response.
 */
function serverFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const headers = new Headers(init?.headers);
	if (!headers.has('Accept')) headers.set('Accept', 'application/json');
	return fetch(input, { ...init, headers });
}

export { serverFetch };
