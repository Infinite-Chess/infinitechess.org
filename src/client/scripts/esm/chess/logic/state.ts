

// @ts-ignore
import type { Move } from "./movepiece.js";
// @ts-ignore
import type { gamefile } from "./gamefile.js";


import coordutil from "../util/coordutil.js";


// Type Definitions ------------------------------------------------------------------------------------


/**
 * Contains the statechanges for the turn before and after a move is made
 * 
 * Local state change examples: (check, attackers)
 * Global state change examples: (enpassant, specialrights, overule state, running check counter)
 */
interface MoveState {
	local: Array<StateChange>,
	global: Array<StateChange>,
}

/**
 * A state change, local or global, that contains enough information to set the gamefile's
 * property whether the move is being rewound or replayed.
 */
type StateChange = {
	/** The type of state this {@link StateChange} is */
	type: StateType,
	/* The gamefile's property of this type BEFORE this move was made, used to restore them when the move is rewinded. */
	current: any,
	/* The gamefile's property of this type AFTER this move was made, used to restore them when the move is replayed. */
	future: any,
	/**
	 * Additional state change properties, shared across both 'current' and 'future'.
	 * For example, the coordinates of a specialrights state change.
	 */
	[changeProperty: string]: any
}

/** A list of all state types there are. */
const stateTypes = {
	/** Local statechanges are unique to the move you're viewing, and are always applied. */
	local: ['check', 'attackers'],
	/**
	 * Global statechanges are a property of the game as a whole, not unique to the move,
	 * and are not applied when VIEWING a move.
	 * However, they are applied only when we make a new move, or rewind a simulated one.
	 */
	global: ['enpassant', 'specialrights', 'moverulestate']
};

/** A type of a {@link StateChange} */
type StateType = 'specialrights' | 'check' | 'attackers' | 'enpassant' | 'moverulestate';


// Functions ---------------------------------------------------------------------------------------------


/**
 * Applies all the StateChanges of a Move, in order, to the gamefile,
 * whether forward or backward, local or global.
 */
function applyMove(
	gamefile: gamefile,
	move: Move,
	/** Whether we're playing this move forward or backward. */
	forward: boolean,
	/**
	 * Specify `globalChange` as true if you are making a physical move in the game,
	 * or rewinding a simulated move.
	 * All other situations, such as rewinding and forwarding the game, should only
	 * be local, so `globalChange` should be false.
	 */
	{ globalChange = false } = {}
) {
	for (const change of move.state.local) {
		applyState(gamefile, change, forward);
	}
	if (!globalChange) return;
	for (const change of move.state.global) {
		applyState(gamefile, change, forward);
	}
}

/** Applies the state of a move to the gamefile, whether forward or backward. */
function applyState(gamefile: gamefile, state: StateChange, forward: boolean) {
	const newValue = forward ? state.future : state.current;
	switch (state.type) {
		case 'specialrights':
			if (newValue === undefined) delete gamefile.specialRights[state['coordsKey']];
			else gamefile.specialRights[state['coordsKey']] = newValue;	
			break;
		case 'check':
			gamefile.inCheck = newValue;
			break;
		case 'attackers':
			if (newValue === undefined) delete gamefile.attackers;
			else gamefile.attackers = newValue;
			break;
		case 'enpassant': 
			if (newValue === undefined) delete gamefile.enpassant;
			else gamefile.enpassant = newValue;
			break;
		case 'moverulestate':
			gamefile.moveRuleState = newValue;
			break;
	}
}

/**
 * Creates a StateChange, queueing it by adding it to the Move,
 * and optionally applying the change immediately to the gamefile.
 */
function createState(
	move: Move,
	/** The type of state this StateChange is for. */
	stateType: StateType,
	/** The current value of this gamefile's property, BEFORE making the move. */
	current: any,
	/** The value of this gamefile's property, AFTER making the move. */
	future: any,
	/** An object containing additional state change properties, shared across both 'current' and 'future'. For example, the coordinates of a specialrights state change. */
	changeProperties: { [changeProperty: string]: any } = {},
	/**
	 * ONLY PROVIDE IF YOU want to immediately apply the state!!!
	 * Do this for the `check` and `attackers` states, as they can only be calculated
	 * AFTER making the move, so they need to be applied immediately.
	 * 
	 * If not supplied, we will only queue the StateChange in the move.
	 */
	gamefileToSet?: gamefile
) {
	const newStateChange = { type: stateType, current, future, ...changeProperties };
	const targetStateChangeList = stateTypes.global.includes(stateType) ? move.state.global
								: stateTypes.local .includes(stateType) ? move.state.local
								: (() => { throw Error(`Cannot create State for invalid state type "${stateType}".`); })();

	let modifiedExistingEnpassantState = false;
	if (stateType === 'enpassant') {
		// Check to make sure there isn't already an enpassant state change,
		// If so, we need to overwrite that one's future value, instead of queueing a new one.
		const preExistingEnpassantState = targetStateChangeList.find(state => state.type === 'enpassant');
		if (preExistingEnpassantState !== undefined) {
			preExistingEnpassantState.future = future;
			modifiedExistingEnpassantState = true;
		}
	}

	// Only queue it if we didn't modify an existing state of this type
	if (!modifiedExistingEnpassantState) targetStateChangeList.push(newStateChange);
	// Only apply it immediately if the gamefile is specified
	if (gamefileToSet !== undefined) applyState(gamefileToSet, newStateChange, true);
}



export type {
	MoveState
};

export default {
	applyState,
	applyMove,
	createState,
};