// @ts-ignore
import coordutil from "../util/coordutil.js";

// @ts-ignore
import type { Move } from "../util/moveutil.js";
// @ts-ignore
import type { gamefile } from "./gamefile.js";

/** Contains the local and global gamefile state changes from a Move */
interface MoveState {
	// Local statechanges are unique to the position you're viewing, and are ALWAYS applied.
	local: Array<StateChange>,
	// Global statechanges are a property of the game as a whole, not unique to the move,
	// and are not applied when VIEWING a move.
	// However, they are applied only when we make a new move, or rewind a simulated one.
	global: Array<StateChange>,
}

/** A state change, local or global, that contains enough information to set the gamefile's
 * property whether the move is being rewound or replayed. */
type StateChange = {
	// All valid state change types
	type: StateNames,
	// The gamefile's property of this type BEFORE this move was made, used to restore them when the move is rewinded.
	current: any,
	// The gamefile's property of this type AFTER this move was made, used to restore them when the move is replayed.
	future: any,
	// Additional state change properties, shared across both 'current' and 'future'.
	// For example, the coordinates of a specialrights state change.
	[changeProperty: string]: any
}

const stateTypes = {
	local: ['check', 'attackers', 'enpassant', 'specialrights'],
	global: ['moverulestate']
};

type StateNames = 'specialrights' | 'check' | 'attackers' | 'enpassant' | 'moverulestate';

function initMoveStates(move: Move) {
	move.state = {local: [], global: []};
}

/** Applies the state of a move to the gamefile. */
function applyState(gamefile: gamefile, state: StateChange, forward: boolean) {

	const newValue = forward ? state.future : state.current;
	switch (state.type) {
		case 'specialrights': {
			const coordsKey = coordutil.getKeyFromCoords(state['coords']);
			if (newValue === undefined) delete gamefile.specialRights[coordsKey];
			else gamefile.specialRights[coordsKey] = newValue;	
			break;
		} case 'check':
			gamefile.inCheck = newValue;
			break;
		case 'attackers':
			gamefile.attackers = newValue;
			break;
		case 'enpassant':
			gamefile.enpassant = newValue;
			break;
		case 'moverulestate':
			gamefile.moveRuleState = newValue;
			break;
	}
}

/**
 * 
 * @param gamefile 
 * @param stateType 
 * @param current 
 * @param future 
 * @param param4 An object containing additional state change properties, shared across both 'current' and 'future'. For example, the coordinates of a specialrights state change.
 * @param gamefileToSet The gamefile to set state, if not supplied it will just queue it in move
*/
function createState(
	move: Move,
	stateType: StateNames,
	current: any,
	future: any,
	changeProperties: { [changeProperty: string]: any } = {},
	gamefileToSet: gamefile | undefined = undefined
) {
	const newStateChange = { type: stateType, current, future, ...changeProperties };
	const targetStateChangeList = stateTypes.global.includes(stateType) ? move.state.global : move.state.local;

	targetStateChangeList.push(newStateChange);
	if (gamefileToSet !== undefined) applyState(gamefileToSet, newStateChange, true);
}

function applyMove(gamefile: gamefile, move: Move, forward: boolean, { globalChange = false } = {}) {
	for (const change of move.state.local) {
		applyState(gamefile, change, forward);
	}
	if (!globalChange) return;
	for (const change of move.state.global) {
		applyState(gamefile, change, forward);
	}
}

export type {
	MoveState
};

export default {
	initMoveStates,
	applyState,
	applyMove,
	createState,
};