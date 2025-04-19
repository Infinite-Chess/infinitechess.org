/* eslint-disable no-unused-vars */

declare global {
	// Add "translations" as a global object (for client)
    const translations: {
        [key: string]: any; // Allows other dynamic keys if needed
    };
    // Our Custom Events
	interface DocumentEventMap {
		ping: CustomEvent<number>;
		'socket-closed': CustomEvent<void>;
	}

	let sound: {
		getAudioContext: () => AudioContext,
		initAudioContext: (audioCtx: AudioContext, decodedBuffer: AudioBuffer) => void
	};
}

export {}; // Ensures this file is treated as a module