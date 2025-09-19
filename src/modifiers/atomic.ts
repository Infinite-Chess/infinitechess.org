import type { FullGame } from "../chess/logic/gamefile.js";
import type { Move } from "../chess/logic/movepiece.js";
import type { Coords } from "../chess/util/coordutil.js";
import type { Change } from "../chess/logic/boardchanges.js";

import boardutil from "../chess/util/boardutil.js";
import boardchanges from "../chess/logic/boardchanges.js";
import coordutil from "../chess/util/coordutil.js";
import events from "../chess/logic/events.js";

const NukeRange = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1], [0, 0]] as Coords[];

class SimulatedChangeStack {
	#changes: Change[];
	#gamefile: FullGame;

	constructor(gamefile: FullGame) {
		this.#changes = [];
		this.#gamefile = gamefile;
	}

	push(c: Change) {
		this.#changes.push(c);
		boardchanges.changeFuncs.forward[c.action]!(this.#gamefile, c);
	}

	pop() {
		const c = this.#changes.pop();
		if (c?.action! in boardchanges.changeFuncs.backward) boardchanges.changeFuncs.backward[c!.action]!(this.#gamefile, c!);
		return c;
	}

	get changes() {
		return [...this.#changes];
	}
}

function draftHook(gamefile: FullGame, move: Move) {

	// Better compositor please? lol no
	const newChanges = new SimulatedChangeStack(gamefile);
	const nukeSites: (Change & {action: "capture"})[] = [];
	for (let i = 0; i < move.changes.length; i++) {
		const c = move.changes[i]!;

		newChanges.push(c);

		if (c.action === "capture") {
			nukeSites.push(c);
		} else if (c.action === "move") {
			while (nukeSites.length !== 0) {
				const cap = nukeSites.pop()!;
				let hasMovedBeenNuked = false;
				newChanges.pop();
				for (const nukePos of NukeRange) {
					const a = coordutil.addCoordinates(cap.piece.coords, nukePos);

					const isMovedPiece = coordutil.areCoordsEqual(a, c.piece.coords);
					hasMovedBeenNuked = hasMovedBeenNuked || coordutil.areCoordsEqual(a, c.endCoords);
					
					const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, a);
					if (piece === undefined || isMovedPiece) continue;
					// @ts-ignore
					boardchanges.queueCapture(newChanges, cap.main, piece, cap.order);
				}
				newChanges.push(c);
				if (hasMovedBeenNuked) {
					// @ts-ignore
					boardchanges.queueDeletePiece(newChanges, true, {coords: c.endCoords, type: c.piece.type, index: c.piece.index});

				}
			}
		}
	}
	move.changes = newChanges.changes;
	boardchanges.runChanges(gamefile, move.changes, boardchanges.changeFuncs, false);
	return false;
}

function setup(gamefile: FullGame) {
	events.addEventListener(gamefile.boardsim.events, "draftMoves", draftHook);
}

export default setup;