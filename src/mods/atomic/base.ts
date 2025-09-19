import type { FullGame } from "../../shared/chess/logic/gamefile.js";
import type { Move } from "../../shared/chess/logic/movepiece.js";
import type { Coords } from "../../shared/chess/util/coordutil.js";
import type { Change } from "../../shared/chess/logic/boardchanges.js";
import type { Construction } from "../modmanager.js";

import boardutil from "../../shared/chess/util/boardutil.js";
import boardchanges from "../../shared/chess/logic/boardchanges.js";
import coordutil from "../../shared/chess/util/coordutil.js";
import events from "../../shared/chess/logic/events.js";

import { rawTypes } from "../../shared/chess/util/typeutil.js";
import movesets from "../../shared/chess/logic/movesets.js";

const NukeRange = [...movesets.getPieceDefaultMovesets()[rawTypes.KING]!.individual!, [0n, 0n]] as Coords[];

class SimulatedChangeStack {
	#changes: Change[];
	#gamefile: FullGame;

	constructor(gamefile: FullGame) {
		this.#changes = [];
		this.#gamefile = gamefile;
	}

	push(c: Change): void {
		this.#changes.push(c);
		boardchanges.changeFuncs.forward[c.action]!(this.#gamefile, c);
	}

	pop(): Change {
		const c = this.#changes.pop();
		if (c?.action! in boardchanges.changeFuncs.backward) boardchanges.changeFuncs.backward[c!.action]!(this.#gamefile, c!);
		if (c === undefined) {
			throw RangeError();
		}
		return c;
	}

	get changes(): Change[] {
		return [...this.#changes];
	}
}

function draftHook(gamefile: FullGame, move: Move): boolean {

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
					const a = coordutil.addCoords(cap.piece.coords, nukePos);

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



function setup(gamefile: Construction<void, FullGame>): void {
	events.addEventListener(gamefile.events, "draftmoves", draftHook);
	if (gamefile.components.has("client")) {
		
		
	}
	if (gamefile.components.has("game")) {
		function swapCheckmateForRoyalCapture(gamefile: FullGame): false {
			for (const w of Object.values(gamefile.basegame.gameRules.winConditions)) {
				if ("royalcapture" in w) continue;
				w.push("royalcapture");
			}
			events.removeEventListener(gamefile.events, "gameloaded", swapCheckmateForRoyalCapture);
			return false;
		}
		events.addEventListener(gamefile.events, "gameloaded", swapCheckmateForRoyalCapture);
	}
}

export {
	NukeRange
};
export default setup;