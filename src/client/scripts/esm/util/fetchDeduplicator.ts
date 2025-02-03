
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
	// Resolve the full URL using the current origin
	const baseURL = window.location.origin; // Use the current page's origin as the base
	const fullURL = new URL(url, baseURL).toString();

	// Construct a unique key for deduplication
	const { origin, pathname, search } = new URL(fullURL);
	const requestKey = `${origin}${pathname}${search}`;
  
	// Check if there's already an ongoing request for the same URL
	if (inProgressRequests[requestKey]) {
	  console.log(`Request already in progress for: ${url}. Skipping this request.`);
	  return inProgressRequests[requestKey]; // Return the cached promise so they can perform a then() func on it.
	}
  
	// If not, initiate the request and store the promise
	inProgressRequests[requestKey] = fetch(url, options)
	  .then((response: Response) => {
		// If the response is successful, remove it from the in-progress list
			delete inProgressRequests[requestKey];
			return response;
	  })
	  .catch((error: any) => {
		// If the request fails, remove it from the in-progress list
			delete inProgressRequests[requestKey];
			throw error;  // Re-throw the error to allow error handling in the caller
	  });
  
	// Return the promise that will eventually resolve with the response,
	// which you can then use `await response.json()` on or something.
	return inProgressRequests[requestKey];
}

/*
// Example usage
/etchWithDeduplication('/api/data?param=1')
	.then((response: Response) => response.json())
	.then((data: any) => console.log('Response 1:', data))
	.catch((error: any) => console.error('Error 1:', error));
  
fetchWithDeduplication('/api/data?param=1')  // This will be skipped if the first request is still in progress
	.then((response: Response) => response.json())
	.then((data: any) => console.log('Response 2:', data))
	.catch((error: any) => console.error('Error 2:', error));
  
fetchWithDeduplication('/api/data?param=2')  // This will not be skipped
	.then((response: Response) => response.json())
	.then((data: any) => console.log('Response 3:', data))
	.catch((error: any) => console.error('Error 3:', error));
*/
  

export { fetchWithDeduplication };