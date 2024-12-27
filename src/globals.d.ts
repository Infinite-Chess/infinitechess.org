/* eslint-disable no-unused-vars */

declare global {
	// Add "translations" as a global object (for client)
    const translations: {
        [key: string]: any; // Allows other dynamic keys if needed
    };
}

export {}; // Ensures this file is treated as a module