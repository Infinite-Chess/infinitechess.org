import type { Change } from "./boardchanges.js";
// @ts-ignore
import type { Move } from "../util/moveutil.js";
// @ts-ignore
import type gamefile from "./gamefile.js";

// This is oh so very cursed, however it works

interface StateChange {
	action: "stateChange",
	path: string
	currentState: any
	futureState: any
	global: boolean // Whether it can be reverted by viewing moves
}

interface State {
	[path: string]: any
}

/**
 * Sets the state by queueing it in the changelist
 * @param gamefile the gamefile
 * @param changes the changelist
 * @param path the path of variable to change in the format of `a.b.c.d` can be indicies of arrays
 * @param futureState what the variable is set to
 * @param global // See StateChange.global
 */
function queueSetState(gamefile: gamefile, changes: Array<Change | StateChange>, path: string, futureState: any, global: boolean = false) {
	const currentState = getPath(gamefile, path);
	if (currentState === futureState) return changes; // Nothing has changed
	changes.push({action: "stateChange", path: path, currentState: currentState, futureState: futureState, global: global});
	return changes;
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
 * Collects every StateChange into move states
 * Removes all StateChanges from the change list
 * @param move move
 */
function collectState(move: Move) {
	const changes = move.changes.filter((c: Change) => {return c.action === "stateChange";});

	for (const change of changes) {
		addToState(move, change.path, change.currentState, change.futureState, {global: change.global});
	}

	move.changes = move.changes.filter((c: Change) => {return c.action !== "stateChange";});
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

function applyState(gamefile: gamefile, state: State) {
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
 * Sets the gamefile variable and adds it to the state.
 * This is used after the move is generated
 * @param gamefile 
 * @param move 
 * @param path 
 * @param value  
 */
function setState(gamefile: gamefile, move: Move, path: string, value: any, { global = false } = {}) {
	const curState = getPath(gamefile, path);
	if (curState === value) return;
	setPath(gamefile, path, value);
	addToState(move, path, curState, value, {global: global});
}

/**
 * Merges the previous moves state and the current moves state for this turn
 * @param previous previous moves state
 * @param current current moves state
 * @returns the merged state
 */
function mergeStates(previous: State, current: State, { validate = false } = {}): State {
	const newState: State = {};
	for (const key in previous) {
		newState[key] = previous[key]!;
	}
	for (const key in current) {
		if ((key in newState)) {
			if (validate && (JSON.stringify(newState[key]!) !== JSON.stringify(current[key]!))) {
				throw Error("Cannot merge states: states do not match");
			}
			continue;
		}
		newState[key] = current[key]!;
	}
	return newState;
}

/**
 * Merges two moves states and sets both to the same state
 * This can be done to save memory as they both have states for the same turn.
 * @param previous 
 * @param current 
 */
function mergeMoveStates(previous: Move, current: Move) {
	previous.state.local.future = current.state.local.current = mergeStates(previous.state.local.future, current.state.local.current);
	previous.state.global.future = current.state.global.current = mergeStates(previous.state.global.future, current.state.global.current);
}

function unmergeState(current: State, future: State, forwardLink: boolean = true): State {
	const ref = forwardLink ? current : future;
	const mergedState = forwardLink ? future : current;
	const newState: State = {};
	for (const path in ref) {
		if (!(path in mergedState)) continue;
		if (JSON.stringify(ref[path]) === JSON.stringify(mergedState[path])) continue;
		newState[path] = mergedState[path];
	}
	return newState;
}

function unmergeMoveStates(move: Move, forwardLink: boolean = true) {
	const mergedState = forwardLink ? "future" : "current";
	move.state.global[mergedState] = unmergeState(move.state.global.future, move.state.global.current, forwardLink);
	move.state.local[mergedState] = unmergeState(move.state.local.future, move.state.local.current, forwardLink);
}

export default {
	initMoveStates,
	queueSetState,
	collectState,
	applyMove,
	setState,
	// mergeMoveStates, Not using them yet cause they can slow down move simulation
	// unmergeMoveStates,
};