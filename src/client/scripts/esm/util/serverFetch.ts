// src/client/scripts/esm/util/serverFetch.ts

/**
 * A thin, drop-in replacement for the browser `fetch()` that guarantees the
 * custom `is-fetch-request: 'true'` header is present.
 *
 * Several server middlewares (assignOrRenewBrowserID, setPrefsCookie,
 * setPracticeProgressCookie) renew cookies on real HTML page loads but skip
 * that side-effect when the request is a fetch, detected via this header.
 * Sending it on every client fetch avoids unwanted cookie churn on API
 * responses.
 */

/** The custom header that flags a request as a fetch, as opposed to an HTML page load. */
const IS_FETCH_REQUEST_HEADER = 'is-fetch-request';

/**
 * Drop-in replacement for `fetch()` that injects the `is-fetch-request`
 * header, without clobbering any caller-provided headers.
 * @param input - The resource to fetch (URL or Request), same as native fetch.
 * @param init - Optional fetch options, same as native fetch.
 * @returns A promise resolving to the fetch response.
 */
function serverFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const headers = new Headers(init?.headers);
	headers.set(IS_FETCH_REQUEST_HEADER, 'true');
	return fetch(input, { ...init, headers });
}

export { serverFetch };
