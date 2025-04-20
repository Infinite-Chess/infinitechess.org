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

	/** The sound script global variables. */
	let sound: {
		/** Returns our Audio Context */
		getAudioContext: () => AudioContext,
		/**
		 * Sets our audio context and decodedBuffer. This is called from our in-line javascript inside the html.
		 * 
		 * The sound spritesheet is loaded using javascript instead of an element
		 * inside the document, because I need to grab the buffer.
		 * And we put the javascript inline in the html to start it loading quicker,
		 * because otherwise our sound only starts loading AFTER everything single script has loaded.
		 * @param audioCtx 
		 * @param decodedBuffer 
		 */
		initAudioContext: (audioCtx: AudioContext, decodedBuffer: AudioBuffer) => void
	};

	/** The htmlscript placed inline in the html of the Play page. */
	let htmlscript: {
		hasUserGesturedAtleastOnce: () => boolean,
	};
}

export {}; // Ensures this file is treated as a module