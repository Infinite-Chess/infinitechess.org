import mouse from "../../client/scripts/esm/util/mouse.js";
import selection from "../../client/scripts/esm/game/chess/selection.js";
import squarerendering from "../../client/scripts/esm/game/rendering/highlights/squarerendering.js";
import typeutil from "../../shared/chess/util/typeutil.js";
import coordutil from "../../shared/chess/util/coordutil.js";
import boardutil from "../../shared/chess/util/boardutil.js";
import events from "../../shared/chess/logic/events.js";

import type { Gamesim, FullGame } from "../../shared/chess/logic/gamefile.js";
import type { AtomicData } from "./base.js";

function renderNukeSites<T extends Gamesim & AtomicData>(gamefile: T): false {
	const hover = mouse.getTileMouseOver_Integer();
	if (!selection.isAPieceSelected() || !hover || !boardutil.isPieceOnCoords(gamefile.boardsim.pieces, hover)) return false;
	if (typeutil.getColorFromType(selection.getPieceSelected()!.type) === typeutil.getColorFromType(boardutil.getPieceFromCoords(gamefile.boardsim.pieces, hover)!.type)) return false;
	squarerendering.genModel(gamefile.atomic.nukeRange.map(n => coordutil.addCoords(n, hover)), [1, 0, 0, 0.40]).render();
	return false;
}

function setupSystems(gamefile: FullGame & AtomicData): void {
	events.addEventListener(gamefile.events, "renderabovepieces", renderNukeSites);
}

export default [null, setupSystems];