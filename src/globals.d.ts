// src/globals.d.ts

import type { MemberInfo } from './server/types';

declare global {
	// Add "translations" as a global object (for client)
	const translations: {
		[key: string]: any; // Allows other dynamic keys if needed
	};

	/** Main script that starts the game loop. Called from htmlscript.js */
	const main: {
		start: () => void;
	};

	// Our Custom Events
	interface DocumentEventMap {
		ping: CustomEvent<number>;
		'socket-closed': CustomEvent<void>;
		'premoves-toggle': CustomEvent<boolean>;
		'lingering-annotations-toggle': CustomEvent<boolean>;
		'starfield-toggle': CustomEvent<boolean>;
		'master-volume-change': CustomEvent<number>;
		'ambience-toggle': CustomEvent<boolean>;
		'ray-count-change': CustomEvent<number>;
		canvas_resize: CustomEvent<{ width: number; height: number }>;
	}

	// Add an optional 'memberInfo' to the global Express Request interface
	namespace Express {
		export interface Request {
			memberInfo?: MemberInfo;
		}
	}
}
