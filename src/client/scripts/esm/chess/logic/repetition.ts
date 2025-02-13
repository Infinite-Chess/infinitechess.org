
/**
 * This script contains our algorithm for detecting draw by repetition.
 * 
 * It is compatible with the enpassant state, as if 2 positions differ only
 * by the enpassant state, they are considered different.
 * 
 * It also takes into account special rights.
 */

// @ts-ignore
import type gamefile from "./gamefile.js";

import boardchanges from "./boardchanges.js";
import { StateChange } from "./state.js";

/** Either a surplus/deficit, on an exact coordinate. This may include a piece type, or an enpassant state. */
type Flux = `${string},${string},${string}`; // `x,y,type` | `x,y,enpassant`

/**
 * Tests if the provided gamefile has had a repetition draw.
 * 
 * Complexity O(m) where m is the move count since the last pawn push or capture or special right loss!
 * @param gamefile - The gamefile
 * @returns Whether there is a three fold repetition present.
 */
function detectRepetitionDraw(gamefile: gamefile): 'draw repetition' | false {
	const moveList = gamefile.moves;

	/** When compared to our current position, this is a running set of surpluses of previous positions, preventing them from being equivalent to the current position. */
	const surplus = new Set<Flux>;
	/** When compared to our current position, this is a running set of deficits of previous positions, preventing them from being equivalent to the current position. */
	const deficit = new Set<Flux>; 

	let equalPositionsFound: number = 0;

	let index: number = moveList.length - 1;
	let indexOfLastEqualPositionFound: number = index + 1; // We need +1 because the first move we observe is the move that brought us to this move index.
	outer: while (index >= 0) {
		const move = moveList[index];

		// Did this move include a one-way action? Pawn push, special right loss..
		// If so, no further equal positions, terminate the loop.
		// 'capture' move changes are handled lower down, they are one-way too.
		if (move.type.startsWith('pawns')) break; // Pawn pushes reset the repetition alg because we know they can't move back to their previous position.
		if (move.state.global.some((stateChange: StateChange) => stateChange.type === 'specialrights' && stateChange.future === undefined)) break; // specialright was lost, no way its equal to the current position, unless in the future it's possible to add specialrights mid-game.

		// Iterate through all move changes, adding the fluxes.
		for (let i = 0; i < move.changes.length; i++) {
			const change = move.changes[i];
			// Did this move change a one-way action? If so, no further equal positions, terminate the loop.
			if (boardchanges.oneWayActions.includes(change.action)) break outer; // One-way action (capture/deletion), can't be undone, no further equal positions.
			// The remaining actions are two-way, so we need to create fluxes for them..
			if (change.action === 'move') {
				// If this change was undo'd, there would be a DEFICIT on its endCoords
				addDeficit(`${change.endCoords[0]},${change.endCoords[1]},${change.piece.type}`);
				// There would also be a SURPLUS on its startCoords
				addSurplus(`${change.piece.coords[0]},${change.piece.coords[1]},${move.type}`);
			} else if (change.action === 'add') {
				// If this change was undo'd, there would be a DEFICIT on its coords
				addDeficit(`${change.piece.coords[0]},${change.piece.coords[1]},${change.piece.type}`);
			}
		}

		// Next, iterate through all enpassant state changes and add fluxes for them
		move.state.global.forEach((state: StateChange) => {
			if (state.type !== 'enpassant') return false; // Filter out non-enpassant states
			/**
			 * If we reverse applied this enpassant state,
			 * there would be a DEFICIT on the future value,
			 * and a SURPLUS on the current value.
			 */
			if (state.future !== undefined) addDeficit(`${state.future[0]},${state.future[1]},enpassant`);
			if (state.current !== undefined) addSurplus(`${state.current[0]},${state.current[1]},enpassant`);
			return; // typescript needs this to not complain
		});

		function addSurplus(flux: Flux) {
			// If there is a DEFICIT with this exact same key, delete that instead! It's been canceled-out.
			if (deficit.has(flux)) deficit.delete(flux);
			else surplus.add(flux);
		}

		function addDeficit(flux: Flux) {
			// If there is a SURPLUS with this exact same key, delete that instead! It's been canceled-out.
			if (surplus.has(flux)) surplus.delete(flux);
			else deficit.add(flux);
		}

		checkEqualPosition: {
			// Has a full turn cycle ocurred since the last increment of equalPositionsFound?
			// If so, we can't count this as an equal position, because it will break it in multiplayer games,
			// or if we have multiple turns in a row.
			const indexDiff = indexOfLastEqualPositionFound - index;
			if (indexDiff < gamefile.gameRules.turnOrder.length) break checkEqualPosition; // Hasn't been a full turn cycle yet, don't increment the counter

			// If both the deficit and surplus objects are EMPTY, this position is equal to our current position!
			if (surplus.size === 0 && deficit.size === 0) {
				equalPositionsFound++;
				indexOfLastEqualPositionFound = index;
				if (equalPositionsFound === 2) break; // Enough to confirm a repetition draw!
			}
		}

		// Prep for next iteration, decrement index.
		// WILL BE -1 if we've reached the beginning of the game!
		index--;
	}

	// Loop is finished. How many equal positions did we find?
	if (equalPositionsFound === 2) return 'draw repetition';
	else return false;
}

export { detectRepetitionDraw };