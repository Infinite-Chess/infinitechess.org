
/**
 * This script creates, queues, and applies gamefile states
 * to the gamefile when a Move is created, and executed.
 */


import type { Coords } from "./movesets.js";
import type { CoordsKey } from "../util/coordutil.js";
import type { Move, NullMove, path } from "./movepiece.js";


// Type Definitions ------------------------------------------------------------------------------------


/** The state of a game holds variables that change over the duration of it. */
interface GameState {
	local: LocalGameState
	global: GlobalGameState
}

/** State of a specific move your are VIEWING. */
interface LocalGameState {
	/** Index of the move we're currently viewing in the moves list. -1 means we're looking at the very beginning of the game. */
	moveIndex: number
	/** If the currently-viewed move is in check, this will be a list of coordinates
     * of all the royal pieces in check: `[[5,1],[10,1]]`, otherwise *false*. @type {} */
	inCheck: Coords[] | false
	/** List of maximum 2 pieces currently checking whoever's turn is next,
     * with their coords and slidingCheck property. ONLY USED with `checkmate` wincondition!!
     * Only used to calculate legal moves, and checkmate. @type {}*/
	attackers: Attacker[]
}

/**
 * State of a game that DOESN'T change depending on what move your VIEWING,
 * but DO change when new moves are made, or rewound (deleted).
 * 
 * They represent the state of the game at the FRONT.
 */
interface GlobalGameState {
	/** An object containing the information if each individual piece has its special move rights. */
	specialRights: Set<CoordsKey>
	/** If enpassant is allowed at the front of the game, this defines the coordinates. */
	enpassant?: EnPassant
	/** The number of half-moves played since the last capture or pawn push. */
	moveRuleState?: number
}



// TODO: Move to gamefile type definition (right now it's not in typescript)
type inCheck = false | Coords[];

/**
 * 
 * Local statechanges are unique to the move you're viewing, and are always applied. Those include:
 * 
 * check, attackers
 * 
 * Global statechanges are a property of the game as a whole, not unique to the move,
 * and are not applied when VIEWING a move.
 * However, they are applied only when we make a new move, or rewind a simulated one. Those include:
 * 
 * enpassant, specialrights, moverulestate
 */

/**
 * Contains the statechanges for the turn before and after a move is made
 * 
 * Local state change examples: (check, attackers)
 * Global state change examples: (enpassant, specialrights, moverule state, running check counter)
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
	type: 'check',
	/* The gamefile's property of this type BEFORE this move was made, used to restore them when the move is rewinded. */
	current: inCheck,
	/* The gamefile's property of this type AFTER this move was made, used to restore them when the move is replayed. */
	future: inCheck
} | {
	type: 'attackers',
	current: Attacker[],
	future: Attacker[]
} | {
	type: 'enpassant',
	current?: EnPassant,
	future?: EnPassant
} | {
	type: 'specialrights'
	current: boolean,
	future: boolean
	/** The coordsKey of what square was affected by this specialrights state change. */
	coordsKey: CoordsKey
} | {
	type: 'moverulestate'
	current: number,
	future: number
}

/** A single piece attacking/checking a royal */
type Attacker = {
	/** The coordinates of the attacker */
	coords: Coords
	/** Whether the check is from a sliding movement (not individual, NOR special with a `path` attribute) */
	slidingCheck: boolean,
} & ({
	slidingCheck: true
} | {
	slidingCheck: false,
	/** Optionally, if it's an individual (non-slidingCheck), the path this piece takes to check the royal (e.g. Rose piece) */
	path?: path
})

interface EnPassant {
	/** The enpassant square. */
	square: Coords,
	/**
	 * The square the pawn that doubled pushed is on. 
	 * 
	 * We need this info, because otherwise in the 5D variant, 
	 * you can't tell where the pawn is that double pushed.
	 * It could be 1 square away, or 10.
	 */
	pawn: Coords
}


// Creating Local State Changes --------------------------------------------------------------------



/** Creates a check local StateChange, adding it to the Move and immediately applying it to the gamefile. */
function createCheckState(move: Move | NullMove, current: inCheck, future: inCheck, gamestate: GameState) {
	const newStateChange: StateChange = { type: 'check', current, future };
	move.state.local.push(newStateChange); // Check is a local state
	// Check states are immediately applied to the gamefile
	applyLocalState(gamestate.local, newStateChange, true);
}

/** Creates an attackers local StateChange, adding it to the Move and immediately applying it to the gamefile. */
function createAttackersState(move: Move | NullMove, current: Attacker[], future: Attacker[], gamestate: GameState) {
	const newStateChange: StateChange = { type: 'attackers', current, future };
	move.state.local.push(newStateChange); // Attackers is a local state
	// Attackers states are immediately applied to the gamefile
	applyLocalState(gamestate.local, newStateChange, true);
}


// Creating Global State Changes --------------------------------------------------------------------


/** Creates an enpassant global StateChange, queueing it by adding it to the Move. */
function createEnPassantState(move: Move | NullMove, current?: EnPassant, future?: EnPassant) {
	if (current === future) return; // If the current and future values are identical, we can skip queueing this state.
	const newStateChange: StateChange = { type: 'enpassant', current, future };
	// Check to make sure there isn't already an enpassant state change,
	// If so, we need to overwrite that one's future value, instead of queueing a new one.
	const preExistingEnPassantState = move.state.global.find(state => state.type === 'enpassant');
	if (preExistingEnPassantState !== undefined) preExistingEnPassantState.future = future;
	else move.state.global.push(newStateChange); // EnPassant is a global state
}

/** Creates a specialrights global StateChange, queueing it by adding it to the Move. */
function createSpecialRightsState(move: Move, coordsKey: CoordsKey, current: boolean, future: boolean) {
	if (current === future) return; // If the current and future values are identical, we can skip queueing this state.
	const newStateChange: StateChange = { type: 'specialrights', current, future, coordsKey };
	move.state.global.push(newStateChange); // Special Rights is a global state
}

/** Creates a moverule global StateChange, queueing it by adding it to the Move. */
function createMoveRuleState(move: Move | NullMove, current: number, future: number) {
	if (current === future) return; // If the current and future values are identical, we can skip queueing this state.
	const newStateChange: StateChange = { type: 'moverulestate', current, future };
	move.state.global.push(newStateChange); // Special Rights is a global state
}


// Applying State Changes ----------------------------------------------------------------------------


/**
 * Applies all the StateChanges of a Move, in order, to the gamefile,
 * whether forward or backward, local or global.
 */
function applyMove(
	gamestate: GameState,
	moveState: MoveState,
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
	applyLocalStateChanges(gamestate.local, moveState.local, forward);
	if (globalChange) applyGlobalStateChanges(gamestate.global, moveState.global, forward);
}

function applyLocalStateChanges(gamestate: LocalGameState, changes: Array<StateChange>, forward: boolean) {
	for (const state of changes) {
		applyLocalState(gamestate, state, forward);
	}
}

function applyGlobalStateChanges(gamestate: GlobalGameState, changes: Array<StateChange>, forward: boolean) { /** The reason we don't include the whole gamefile is so that {@link gamecompressor.GameToPosition} can also use applyMove(). */
	for (const state of changes) {
		applyGlobalState(gamestate, state, forward);
	}
}

/** Applies a move's local state change to the gamefile, forward or backward. */
function applyLocalState(gamestate: LocalGameState, state: StateChange, forward: boolean) {
	const noNewValue = (forward ? state.future : state.current) === undefined;
	switch (state.type) {
		case 'check':
			gamestate.inCheck = forward ? state.future : state.current;
			break;
		case 'attackers':
			if (noNewValue) gamestate.attackers = [];
			else gamestate.attackers = forward ? state.future : state.current;
			break;
		default:
			throw new Error(`State ${state.type} is not a local state change.`);
	}
}

/** Applies a move's global state change to the gamefile, forward or backward. */
function applyGlobalState(gamestate: GlobalGameState, state: StateChange, forward: boolean) {
	const noNewValue = (forward ? state.future : state.current) === undefined;
	switch (state.type) {
		case 'specialrights':
			if (!(forward ? state.future : state.current)) gamestate.specialRights.delete(state.coordsKey);
			else gamestate.specialRights.add(state.coordsKey);	
			break;
		case 'enpassant': 
			if (noNewValue) delete gamestate.enpassant;
			else gamestate.enpassant = forward ? state.future : state.current;
			break;
		case 'moverulestate':
			gamestate.moveRuleState = forward ? state.future : state.current;
			break;
		default:
			throw new Error(`State ${state.type} is not a global state change.`);
	}
}


// Exports --------------------------------------------------------------------------


export default {
	applyMove,
	applyGlobalStateChanges,
	createCheckState,
	createAttackersState,
	createEnPassantState,
	createSpecialRightsState,
	createMoveRuleState,
};

export type {
	GameState,
	MoveState,
	StateChange,
	Attacker,
	EnPassant,
};