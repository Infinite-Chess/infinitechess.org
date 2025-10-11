
// src/globals.d.ts

/* eslint-disable no-unused-vars */

import type { MemberInfo } from "./server/types";

declare global {

	// Add "translations" as a global object (for client)
    const translations: {
        [key: string]: any; // Allows other dynamic keys if needed
    };

    // Our Custom Events
	interface DocumentEventMap {
		ping: CustomEvent<number>;
		'socket-closed': CustomEvent<void>;
		'premoves-toggle': CustomEvent<boolean>;
		'lingering-annotations-toggle': CustomEvent<boolean>;
		'starfield-toggle': CustomEvent<boolean>;
		'advanced-effects-toggle': CustomEvent<boolean>;
		'ray-count-change': CustomEvent<number>;
	}

	// Add an optional 'memberInfo' to the global Express Request interface
	namespace Express {
		export interface Request {
			memberInfo?: MemberInfo;
		}
	}
}
