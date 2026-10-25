// src/client/scripts/util/fetchretrier.ts

/**
 * A wrapper around fetch that provides retry logic, with exponential backoff,
 * for network errors and 5xx server errors.
 */

import { serverfetch } from './serverfetch.js';

/** Options for {@link retryFetch} */
export interface RetryFetchOptions {
	/**
	 * Maximum number of fetch attempts (e.g., 1 means one attempt, no retries).
	 * Assumed to be 1 or greater. Defaults to 3.
	 */
	maxAttempts?: number;
	/**
	 * Initial delay in milliseconds *before the first retry* (i.e., after the first attempt fails).
	 * Defaults to 1000ms.
	 */
	initialDelayMs?: number;
	/**
	 * Factor by which the delay increases after each retry (e.g., 2 for exponential, 1 for linear).
	 * Defaults to 2.
	 */
	backoffFactor?: number;
}

/** Default options for {@link retryFetch} */
const defaultRetryFetchOptions: Required<RetryFetchOptions> = {
	maxAttempts: 3,
	initialDelayMs: 1000,
	backoffFactor: 2,
};

/**
 * A wrapper around fetch that provides retry logic.
 * Retries on network errors and 5xx server errors.
 * Terminates on client errors 4xx.
 * @param url The URL to fetch. Can be a string, URL object, or Request object.
 * @param fetchInit The init object for the fetch call (method, headers, body, etc.).
 * @param retryOptions Configuration for the retry behavior.
 * @returns A Promise that resolves with the Response if:
 *          - The request is successful (e.g., 2xx).
 *          - The request results in a non-retryable error (e.g., 4xx).
 *          - Retries are exhausted, and the last attempt resulted in a retryable server error (5xx response).
 * @throws An Error if:
 *         - Retries are exhausted, and the last attempt resulted in a network error.
 */
async function retryFetch(
	url: string | URL | Request,
	fetchInit?: RequestInit,
	retryOptions?: RetryFetchOptions,
): Promise<Response> {
	const options: Required<RetryFetchOptions> = {
		...defaultRetryFetchOptions,
		...retryOptions,
	};

	let currentDelayMs = options.initialDelayMs;
	for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
		const isLastAttempt = attempt === options.maxAttempts;

		try {
			const response = await serverfetch(url, fetchInit);
			// Only a 5xx is retried, and the last one is returned as is.
			if (response.status < 500 || response.status > 599 || isLastAttempt) return response;
		} catch (error) {
			if (isLastAttempt) throw error; // The final network error
		}

		await new Promise<void>((resolve) => setTimeout(() => resolve(), currentDelayMs));
		currentDelayMs *= options.backoffFactor;
	}

	// Only reached when maxAttempts < 1: otherwise the final attempt returns or throws.
	throw new Error(`retryFetch: maxAttempts must be at least 1, got ${options.maxAttempts}.`);
}

export { retryFetch };
