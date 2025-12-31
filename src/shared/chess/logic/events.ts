/**
 * A script that was intended for managing gamefile events for games
 * on both client and server ends.
 *
 * @author Idontuse
 */

// Disabling this  cause will be using func types lots
/* eslint-disable no-unused-vars */

type ExtractArr<T> = T extends (infer U)[] ? U : never;
type OmitInitArg<F> = F extends (i: any, ...args: infer P) => any ? P : never;
type ExtractEventArg<F, T> = F extends (i: Event<T, infer N>, ...args: any) => any
	? Event<T, N>
	: never;

type SimpleEvent<N extends EventName> = Event<undefined, N>;

interface Event<T, N extends EventName> extends EventResult<T> {
	target: N;
}

interface EventResult<T> {
	workingvalues: T;
	propagate: boolean;
	default: boolean;
}

interface Eventlist {
	[eventName: string]: ((event: Event<any, any>, ...args: any) => void)[] | undefined;
}

function runEvent<
	L extends Eventlist,
	N extends keyof L & EventName,
	T,
	E extends ExtractEventArg<L[N], T>,
	A extends OmitInitArg<ExtractArr<L[N]>>,
>(eventlist: L, event: E, args: A): EventResult<T> {
	const funcs = eventlist[event.target];
	if (funcs === undefined) return event;
	for (const f of funcs) {
		f(event, ...args);
		if (!event.propagate) break;
	}
	return event;
}

function addEventListener<
	E extends Eventlist,
	N extends keyof E & EventName,
	L extends ExtractArr<E[N]>,
>(eventlist: E, event: N, listener: L): void {
	const listeners = eventlist[event];
	if (listeners === undefined) {
		eventlist[event] = [] as Function[] as E[N];
		return;
	}
	listeners.push(listener);
	return;
}

function removeEventListener<
	E extends Eventlist,
	N extends keyof E & EventName,
	L extends ExtractArr<E[N]>,
>(eventlist: E, event: N, listener: L): boolean {
	const listeners = eventlist[event];
	if (listeners === undefined) {
		return false;
	}
	const precount = listeners.length;
	eventlist[event] = listeners.filter((l) => l !== listener) as E[N];
	return precount !== eventlist[event]!.length;
}

function removeEvent<E extends Eventlist, N extends keyof E & EventName>(
	eventlist: E,
	event: N,
): void {
	delete eventlist[event];
}

import type { Move } from './movepiece';
import type { Game, Board } from './gamefile';
import type { Coords } from '../util/coordutil';
import type { Player } from '../util/typeutil';

type EventName =
	| 'draftmoves'
	| 'renderabovepieces'
	| 'renderbelowpieces'
	| 'fullyloaded'
	| 'gameloaded'
	| 'boardloaded'
	| 'legalmovecheck';
//type EventStage = 'preprocess' | 'postprocess' | 'ontime';

interface GameEvents<G> extends Eventlist {
	draftmoves?: ((e: SimpleEvent<'draftmoves'>, gamefile: G, move: Move) => boolean)[];
	renderbelowpieces?: ((e: SimpleEvent<'renderbelowpieces'>, gamefile: G) => false)[];
	renderabovepieces?: ((e: SimpleEvent<'renderabovepieces'>, gamefile: G) => false)[];
	legalmovecheck?: ((
		e: Event<{ isLegal: boolean }, 'legalmovecheck'>,
		gamefile: G,
		startCoords: Coords,
		endCoords: Coords,
		colorOfFriendly: Player,
	) => void)[];
}

interface LoadingEvents<T> extends Eventlist {
	gameloaded?: ((e: SimpleEvent<'gameloaded'>, gamefile: T, basegame: Game) => false)[];
	boardloaded?: ((e: SimpleEvent<'boardloaded'>, gamefile: T, boardsim: Board) => false)[];
}

export type { GameEvents, LoadingEvents };

export default {
	addEventListener,
	removeEventListener,

	removeEvent,
	runEvent,
};
