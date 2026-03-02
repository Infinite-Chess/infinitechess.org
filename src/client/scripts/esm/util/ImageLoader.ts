// src/client/scripts/esm/util/ImageLoader.ts

import { retryFetch, RetryFetchOptions } from './httputils';

class ImageLoader {
	/** Default retry options if none are provided. */
	private static defaultRetryOptions: RetryFetchOptions = { maxAttempts: 1 }; // No retries by default

	/**
	 * Requests an image from the server with retry logic and returns a promise
	 * that resolves to an HTMLImageElement.
	 * @param url The URL of the image to request.
	 * @param retryOptions Optional configuration for the retry behavior.
	 * @returns A promise that resolves with the loaded HTMLImageElement.
	 */
	public static loadImage(
		url: string,
		retryOptions: RetryFetchOptions = this.defaultRetryOptions,
	): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			retryFetch(url, undefined, retryOptions)
				.then((response) => {
					if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
					return response.blob();
				})
				.then((blob) => {
					const image = new Image();
					const objectURL = URL.createObjectURL(blob);

					image.onload = () => {
						// Revoke the object URL after the image has been loaded to free up memory
						URL.revokeObjectURL(objectURL);
						resolve(image);
					};

					image.onerror = () => {
						// Revoke the object URL on error as well
						URL.revokeObjectURL(objectURL);
						reject(new Error(`Failed to load image at ${url}`));
					};

					image.src = objectURL;
				})
				.catch((error) => {
					reject(error);
				});
		});
	}
}

export default ImageLoader;
