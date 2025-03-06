// Disabling this  cause will be using func types lots
/* eslint-disable no-unused-vars */

import type gamefile from "./gamefile";

type ExtractArr<T extends any[]> = T extends (infer U)[] ? U : never
 
interface Eventlist {
	[eventName: string]: ((...args: any[]) => boolean)[]
}

function runEvent<E extends Eventlist, N extends keyof E, A extends Parameters<ExtractArr<E[N]>>>(eventlist: E, event: N, ...args: A): boolean {
	const funcs = eventlist[event];
	if (funcs === undefined) return false;
	for (const f of funcs) {
		// @ts-ignore ts thinks that the paramters of the function "could" not match the parameters of the function
		if (f(...args)) {
			return true;
		}
	}
	return false;
}

function addEventListener<E extends Eventlist, N extends keyof E, L extends ExtractArr<E[N]>>(eventlist: E, event: N, listener: L): void {
	const listeners = eventlist[event];
	if (listeners === undefined) {
		// @ts-ignore it should work but ts thinks there could be a specific subtype where this errors
		// IT WILL ONLY BE AN ARRAY OF FUNCTIONS NO SUBTYPES NEEDED
		eventlist[event] = [listener];
		return;
	}
	listeners.push(listener);
	return;
}

function removeEventListener<E extends Eventlist, N extends keyof E, L extends ExtractArr<E[N]>>(eventlist: E, event: N, listener: L): boolean {
	const listeners = eventlist[event];
	if (listeners === undefined) {
		return false;
	}
	for (let i = 0; i <= listeners.length; i++ ) {
		if (listeners[i] !== listener) continue;
		listeners.splice(i, 1);
		return true;
	}
	return false;
}

interface GameEvents extends Eventlist {
	// Runs when organizedPieces regenerate, DO NOT INTERRUPT.
	regenerateLists: ((gamefile: gamefile) => false)[]
}

export type {
	Eventlist,

	GameEvents
};

export default {
	addEventListener,
	removeEventListener,
	
	runEvent,
};