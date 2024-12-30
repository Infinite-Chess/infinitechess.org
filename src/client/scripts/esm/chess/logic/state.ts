// @ts-ignore
import type { Move } from "../util/moveutil.js";
// @ts-ignore
import type gamefile from "./gamefile.js";

// This is oh so very cursed, however it works

/**
 * A statechange contains the changes in gamefile from one turn to another
 * When a statechange is applied gamefile variables are set directly
 */
interface StateChange {
	[path: string]: any
}

/**
 * Contains the statechanges for the turn before and after a move is made
 * 
 * Local statechanges are unique to the position you're viewing, and are always applied.
 * 
 * Global statechanges are a property of the game as a whole, not unique to the move,
 * and are not applied when VIEWING a move.
 * However, they are applied only when we make a new move, or rewind a simulated one.
 * 
 * Local state change examples: (check, attackers, enpassant, specialrights)
 * Global state change examples: (moverule state, running check counter)
 */
interface MoveState {
	local: {
		current: StateChange,
		future: StateChange,
	},
	global: {
		current: StateChange,
		future: StateChange,
	}
}

/**
 * Initialises state objects in move for generation
 * @param move the move
 */
function initMoveStates(move: Move) {
	move.state = move.state || {};
	move.state.local = move.state.local || {};
	move.state.local.current = move.state.local.current || {};
	move.state.local.future = move.state.local.future || {};

	move.state.global = move.state.global || {};
	move.state.global.current = move.state.global.current || {};
	move.state.global.future = move.state.global.future || {};
}

/**
 * ads the statechanges to the moves state
 * @param move
 * @param path 
 * @param currentState
 * @param futureState 
 */
function addToState(move: Move, path: string, currentState: any, futureState: any, { global = false } = {}) {
	const states = global ? move.state.global : move.state.local;

	if (path in states.current && states.future[path] === currentState) {
		states.future[path] = futureState;
		return;
	}

	states.current[path] = currentState;
	states.future[path] = futureState;
}

/**
 * Applies a single change to the gamefile
 * Traverses the gamefile to assign a s
 * It will delete a varable when value is `undefined`
 * @param gamefile the gamefile
 * @param path the path to the variable
 * @param value 
 */
function setPath(gamefile: gamefile, path: string, value: any) {
	let traversal = gamefile;
	const pathSteps = path.split(".");
	for (const idx in pathSteps) {
		if (Number(idx) !== pathSteps.length - 1) {
			if (!(pathSteps[idx]! in traversal)) throw Error("Can't alter state of non-existant gamefile variable");
			traversal = traversal[pathSteps[idx]];
		} else {
			if ( value === undefined ) {
				delete traversal[pathSteps[idx]];
				return;
			}
			traversal[pathSteps[idx]] = value;
		}
	}
}
/**
 * traverse along the string path and returns the value present
 * @param gamefile the gamefile
 * @param path the varaible path
 * @returns the value of the variable
 */
function getPath(gamefile: gamefile, path: string): any {
	let traversal = gamefile;
	const pathSteps = path.split(".");
	for (const idx in pathSteps) {
		if (Number(idx) !== pathSteps.length - 1) {
			if (!(pathSteps[idx]! in traversal)) throw Error("Can't access state of non-existant gamefile variable");
			traversal = traversal[pathSteps[idx]];
		} else {
			return traversal[pathSteps[idx]];
		}
	}
}

function applyState(gamefile: gamefile, state: StateChange) {
	for (const path in state) {
		setPath(gamefile, path, state[path]);
	}
}

/**
 * Applies the moves states to the gamefile
 * @param gamefile the gamefile
 * @param move the move
 * @param forward if we need to apply the current or next state
 */
function applyMove(gamefile: gamefile, move: Move, forward: boolean, { globalChange = false } = {}) {
	const state = forward ? "future" : "current";
	applyState(gamefile, move.state.local[state]);
	if (globalChange) applyState(gamefile, move.state.global[state]);
}

/**
 * Used when generating moves. Adds state changes to movestate
 * @param gamefile 
 * @param move 
 * @param path 
 * @param value 
 * @returns if a change is needed
 */
function queueSetState(gamefile: gamefile, move: Move, path: string, value: any, { global = false } = {}): boolean {
	const curState = getPath(gamefile, path);
	if (curState === value) return false;
	addToState(move, path, curState, value, { global });
	return true;
}

/**
 * Sets the gamefile variable and adds it to the state.
 * This is used after the move is generated
 * @param gamefile 
 * @param move 
 * @param path 
 * @param value  
 */
function setState(gamefile: gamefile, move: Move, path: string, value: any, { global = false } = {}) {
	const similar = queueSetState(gamefile, move, path, value, { global });
	if (similar) setPath(gamefile, path, value);
}

// Commented out unused methods for now

// /**
//  * Merges the previous moves state and the current moves state for this turn
//  * @param previous previous moves state
//  * @param current current moves state
//  * @returns the merged state
//  */
// function mergeStates(previous: StateChange, current: StateChange, { validate = false } = {}): StateChange {
// 	const newState: StateChange = {};
// 	for (const key in previous) {
// 		newState[key] = previous[key]!;
// 	}
// 	for (const key in current) {
// 		if ((key in newState)) {
// 			if (validate && (JSON.stringify(newState[key]!) !== JSON.stringify(current[key]!))) {
// 				throw Error("Cannot merge states: states do not match");
// 			}
// 			continue;
// 		}
// 		newState[key] = current[key]!;
// 	}
// 	return newState;
// }

// /**
//  * Merges two moves states and sets both to the same state
//  * This can be done to save memory as they both have states for the same turn.
//  * @param previous 
//  * @param current 
//  */
// function mergeMoveStates(previous: Move, current: Move) {
// 	previous.state.local.future = current.state.local.current = mergeStates(previous.state.local.future, current.state.local.current);
// 	previous.state.global.future = current.state.global.current = mergeStates(previous.state.global.future, current.state.global.current);
// }

// function unmergeState(current: StateChange, future: StateChange, forwardLink: boolean = true): StateChange {
// 	const ref = forwardLink ? current : future;
// 	const mergedState = forwardLink ? future : current;
// 	const newState: StateChange = {};
// 	for (const path in ref) {
// 		if (!(path in mergedState)) continue;
// 		if (JSON.stringify(ref[path]) === JSON.stringify(mergedState[path])) continue;
// 		newState[path] = mergedState[path];
// 	}
// 	return newState;
// }

// function unmergeMoveStates(move: Move, forwardLink: boolean = true) {
// 	const mergedState = forwardLink ? "future" : "current";
// 	move.state.global[mergedState] = unmergeState(move.state.global.future, move.state.global.current, forwardLink);
// 	move.state.local[mergedState] = unmergeState(move.state.local.future, move.state.local.current, forwardLink);
// }

export type { MoveState };

export default {
	initMoveStates,
	queueSetState,
	applyMove,
	setState,
	// mergeMoveStates, Not using them yet cause they can slow down move simulation
	// unmergeMoveStates,
};