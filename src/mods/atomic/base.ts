import type { FullGame, Gamesim, Game } from '../../shared/chess/logic/gamefile.js';
import type { Move } from '../../shared/chess/logic/movepiece.js';
import type { Coords } from '../../shared/chess/util/coordutil.js';
import type { Change } from '../../shared/chess/logic/boardchanges.js';
import type { Construction } from '../modmanager.js';
import type { RawType } from '../../shared/chess/util/typeutil.js';

import boardutil from '../../shared/chess/util/boardutil.js';
import typeutil from '../../shared/chess/util/typeutil.js';
import boardchanges from '../../shared/chess/logic/boardchanges.js';
import coordutil from '../../shared/chess/util/coordutil.js';
import events from '../../shared/chess/logic/events.js';
import movesets from '../../shared/chess/logic/movesets.js';
import { rawTypes } from '../../shared/chess/util/typeutil.js';

class SimulatedChangeStack {
	#changes: Change[];
	#gamefile: Gamesim;

	constructor(gamefile: Gamesim) {
		this.#changes = [];
		this.#gamefile = gamefile;
	}

	push(c: Change): void {
		this.#changes.push(c);
		boardchanges.changeFuncs.forward[c.action]!(this.#gamefile, c);
	}

	pop(): Change {
		const c = this.#changes.pop();
		if (c?.action! in boardchanges.changeFuncs.backward)
			boardchanges.changeFuncs.backward[c!.action]!(this.#gamefile, c!);
		if (c === undefined) {
			throw RangeError();
		}
		return c;
	}

	get changes(): Change[] {
		return [...this.#changes];
	}
}

function draftHook<T extends FullGame & AtomicData>(gamefile: T, move: Move): boolean {
	// Better compositor please? lol no
	const newChanges = new SimulatedChangeStack(gamefile);
	let blowUp = false;
	for (let i = 0; i < move.changes.length; i++) {
		const c = move.changes[i]!;

		newChanges.push(c);

		if (c.action === 'capture') {
			blowUp = true;
		} else if (c.action === 'move' && blowUp) {
			newChanges.pop();
			for (const nukePos of gamefile.atomic.nukeRange) {
				const a = coordutil.addCoords(c.endCoords, nukePos);
				const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, a);
				const isMovedPiece = coordutil.areCoordsEqual(a, c.piece.coords);
				if (
					piece === undefined ||
					isMovedPiece ||
					gamefile.atomic.bunkeredPieces.has(typeutil.getRawType(piece.type))
				)
					continue;
				// @ts-ignore this is 100% "legal"
				boardchanges.queueCapture(newChanges, c.main, piece);
			}
			newChanges.push(c);
			// @ts-ignore
			boardchanges.queueDeletePiece(newChanges, true, {
				coords: c.endCoords,
				type: c.piece.type,
				index: c.piece.index,
			});
		}
	}
	move.changes = newChanges.changes;
	boardchanges.runChanges(gamefile, move.changes, boardchanges.changeFuncs, false);
	return false;
}

export function setupComponents(gamefile: Construction<FullGame & AtomicData>): void {
	gamefile.atomic = {
		nukeRange: [...movesets.generateCompassMoves(1n)],
		bunkeredPieces: new Set([rawTypes.PAWN]),
	};
	events.addEventListener(gamefile.events, 'gameloaded', (gamefile: any, basegame: Game) => {
		for (const w of Object.values(basegame.gameRules.winConditions)) {
			if ('royalcapture' in w) continue;
			w.push('royalcapture');
		}
		return false;
	});
}

export function setupSystems(gamefile: FullGame & AtomicData): void {
	events.addEventListener(gamefile.events, 'draftmoves', draftHook);
}

type AtomicData = {
	atomic: {
		nukeRange: readonly Coords[];
		bunkeredPieces: Set<RawType>;
	};
};

export type { AtomicData };
