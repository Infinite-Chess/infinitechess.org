// src/client/scripts/esm/util/fetchDeduplicator.ts

/**
 * This script keeps a record of all active fetch requests, and if we
 * send out a duplicate fetch request for the same url, this will
 * detect that and skip sending a duplicate fetch, returning
 * the promise for the first fetch.
 */

interface InProgressRequests {
	[url: string]: Promise<Response> | undefined;
}

type RequestOptions = {
	/** GET / POST / ... */
	method?: string;
	headers?: Record<string, string>;
	/** Stringified JSON */
	body?: string;
};

const inProgressRequests: InProgressRequests = {};

/**
 * Fetch with deduplication to prevent multiple requests to the same URL.
 * @param url - The relative URL to fetch (e.g., "/api/data").
 * @param options - Optional fetch options.
 * @returns A promise resolving to the fetch response.
 */
function fetchWithDeduplication(url: string, options?: RequestOptions): Promise<Response> {
	const baseURL = window.location.origin;
	const fullURL = new URL(url, baseURL).toString();

	const { origin, pathname, search } = new URL(fullURL);
	const requestKey = `${origin}${pathname}${search}`;

	if (inProgressRequests[requestKey]) {
		console.log(`Request already in progress for: ${url}. Skipping this request.`);
		return inProgressRequests[requestKey];
	}

	inProgressRequests[requestKey] = fetch(url, options)
		.then((response: Response) => {
			delete inProgressRequests[requestKey];
			return response;
		})
		.catch((error: unknown) => {
			delete inProgressRequests[requestKey];
			throw error;
		});

	return inProgressRequests[requestKey];
}

export { fetchWithDeduplication };
