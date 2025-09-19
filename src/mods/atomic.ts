import type { FullGame } from "../chess/logic/gamefile.js";
import type { Move } from "../chess/logic/movepiece.js";
import type { Coords } from "../chess/util/coordutil.js";
import type { Change } from "../chess/logic/boardchanges.js";
import type { Construction } from "./modmanager.js";

import boardutil from "../chess/util/boardutil.js";
import boardchanges from "../chess/logic/boardchanges.js";
import coordutil from "../chess/util/coordutil.js";
import events from "../chess/logic/events.js";

import { rawTypes } from "../chess/util/typeutil.js";
import movesets from "../chess/logic/movesets.js";

const NukeRange = [...movesets.getPieceDefaultMovesets()[rawTypes.KING]!.individual!, [0n, 0n]] as Coords[];

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

import mouse from "../util/mouse.js";
import selection from "../game/chess/selection.js";
import squarerendering from "../game/rendering/highlights/squarerendering.js";
import typeutil from "../chess/util/typeutil.js";

function renderNukeSites(gamefile: FullGame): false {
	const hover = mouse.getTileMouseOver_Integer();
	if (!selection.isAPieceSelected() || !hover || !boardutil.isPieceOnCoords(gamefile.boardsim.pieces, hover)) return false;
	if (typeutil.getColorFromType(selection.getPieceSelected()!.type) === typeutil.getColorFromType(boardutil.getPieceFromCoords(gamefile.boardsim.pieces, hover)!.type)) return false;
	squarerendering.genModel(NukeRange.map(n => coordutil.addCoords(n, hover)), [1, 0, 0, 0.40]).render();
	return false;
}

function setup(gamefile: Construction<void, FullGame>) {
	
	events.addEventListener(gamefile.events, "draftmoves", draftHook);
	events.addEventListener(gamefile.events, "renderabovepieces", renderNukeSites);
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

export default setup;