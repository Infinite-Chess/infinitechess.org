
/**
 * This script contains http/fetch utility methods.
 */

/** Options for {@link retryFetch} */
interface RetryFetchOptions {
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
	retryOptions?: RetryFetchOptions
): Promise<Response> {
	const options: Required<RetryFetchOptions> = {
		...defaultRetryFetchOptions,
		...retryOptions,
	};

	let currentDelayMs = options.initialDelayMs;
	// Helper for logging the URL
	const getUrlString = (targetUrl: typeof url): string => {
		if (typeof targetUrl === 'string') return targetUrl;
		if (targetUrl instanceof URL) return targetUrl.href;
		if (targetUrl instanceof Request) return targetUrl.url;
		return 'Unknown URL';
	};
	const urlString = getUrlString(url);


	for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
		const isLastAttempt = (attempt === options.maxAttempts);

		try {
			console.log(`retryFetch: Attempt ${attempt}/${options.maxAttempts} for ${urlString}...`);
			const response = await fetch(url, fetchInit);

			// Check for retryable server errors (5xx)
			if (response.status >= 500 && response.status <= 599) {
				if (isLastAttempt) {
					console.warn(`retryFetch: Max attempts reached. Last attempt for ${urlString} resulted in status ${response.status}.`);
					return response; // Return the final 5xx response
				}
				// Not the last attempt, so log and prepare for retry
				console.warn(`retryFetch: Attempt ${attempt} for ${urlString} failed with status ${response.status}. Retrying...`);
				// Fall through to wait and retry
			} else {
				// Not a 5xx error. Could be 2xx (success), 4xx (client error), or other.
				// No retry for these based on the hardcoded logic.
				return response;
			}
		} catch (error) { // Network error occurred
			if (isLastAttempt) {
				console.error(`retryFetch: Max attempts reached. Last attempt for ${urlString} failed with network error:`, error);
				throw error; // Re-throw the final network error
			}
			// Not the last attempt, so log and prepare for retry
			console.warn(`retryFetch: Attempt ${attempt} for ${urlString} failed with network error: ${(error as Error).message}. Retrying...`);
			// Fall through to wait and retry
		}

		// If we reach here, a retry is scheduled (and it's not the last attempt)
		await new Promise(resolve => setTimeout(resolve, currentDelayMs));
		currentDelayMs *= options.backoffFactor;
	}

	// This line should be theoretically unreachable if options.maxAttempts >= 1,
	// as the loop will always return or throw on its final iteration.
	// It's included for defensive programming in case of unexpected state.
	throw new Error(`retryFetch: Exited retry loop unexpectedly for ${urlString}. This should not happen if maxAttempts >= 1.`);
}

export {
	retryFetch,
};

export type {
	RetryFetchOptions,
};