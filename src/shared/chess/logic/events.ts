
/**
 * A script that was intended for managing gamefile events for games
 * on both client and server ends.
 * 
 * @author Idontuse
 */

// Disabling this  cause will be using func types lots
/* eslint-disable no-unused-vars */

type ExtractArr<T> = T extends (infer U)[] ? U : never
 
interface Eventlist {
	[eventName: string]: ((...args: any[]) => boolean)[] | undefined
}

function runEvent<E extends Eventlist, N extends keyof E & EventName, A extends Parameters<ExtractArr<E[N]>>>(eventlist: E, event: N, ...args: A): boolean {
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

function addEventListener<E extends Eventlist, N extends keyof E & EventName, L extends ExtractArr<E[N]>>(eventlist: E, event: N, listener: L): void {
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

function removeEventListener<E extends Eventlist, N extends keyof E & EventName, L extends ExtractArr<E[N]>>(eventlist: E, event: N, listener: L): boolean {
	const listeners = eventlist[event];
	if (listeners === undefined) {
		return false;
	}
	const precount = listeners.length;
	eventlist[event] = listeners.filter(l => l !== listener) as E[N];
	return precount !== eventlist[event]!.length;
}

function removeEvent<E extends Eventlist, N extends keyof E & EventName>(eventlist: E, event: N): void {
	delete eventlist[event];
}

import type { Move } from "./movepiece";
import type { Game } from "./gamefile";
import type { Board } from "./gamefile";

type EventName = 'draftmoves' | 'renderbelowpieces' | 'renderabovepieces' | 'fullyloaded' | 'gameloaded' | 'boardloaded';

interface GameEvents<G> extends Eventlist {
	draftmoves?: ((gamefile: G, move: Move) => boolean)[],
	renderbelowpieces?: ((gamefile: G) => false)[],
	renderabovepieces?: ((gamefile: G) => false)[],
}

interface LoadingEvents<T> extends Eventlist {
	gameloaded?: ((gamefile: T, basegame: Game) => false)[],
	boardloaded?: ((gamefile: T, boardsim: Board) => false)[]
}

export type {
	GameEvents,
	LoadingEvents
};

export default {
	addEventListener,
	removeEventListener,

	removeEvent,
	runEvent,
};