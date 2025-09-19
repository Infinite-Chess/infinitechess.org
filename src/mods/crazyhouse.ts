import type { Construction } from "./modmanager.js";
import type { FullGame } from "../chess/logic/gamefile.js";
import type { TypeGroup } from "../chess/util/typeutil.js";

import events from "../chess/logic/events.js";
import svgcache from "../chess/rendering/svgcache.js";
import { rawTypes as r, ext as e } from "../chess/util/typeutil.js";

type CrazyhouseState = {crazyhouse: {inventory: TypeGroup<number>}};

type CrazyhouseGui = {crazyhouse: {gui: TypeGroup<{
	element: SVGElement,
	shown: boolean,
}>}}

function createCrazyhouseGui() {
	const container = document.createElement("div");
	container.id = "crazyhouse-container";
	container.style.position = "absolute";
	document.getElementById("boardUI")!.appendChild(container);
};

function updateHome(gamefile: CrazyhouseState & CrazyhouseGui) {
	const crazycontainer = document.querySelector("#boardUI #crazyhouse-container")!;
	console.log(gamefile.crazyhouse);
	for (const [sType, data] of Object.entries(gamefile.crazyhouse.gui)) {
		const iType = Number(sType);
		const count = gamefile.crazyhouse.inventory[iType] ?? 0;
		
		if (count === 0 && data.shown) {
			crazycontainer.removeChild(data.element);
			data.shown = false;
		} else if (count !== 0 && !data.shown) {
			crazycontainer.appendChild(data.element);
			data.shown = true;
		}
		data.element.querySelector("#count")!.innerHTML = String(count);
	}
}

function loadPieces(g: CrazyhouseGui,svgs: SVGElement[]) {
	for (const svg of svgs) {
		const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
		const p = document.createElement("p");
		p.id = "count";
		fo.appendChild(p);
		svg.appendChild(fo);
		g.crazyhouse.gui[Number(svg.id)] = {
			element: svg,
			shown: false
		};
	}
}

function setup(gamefile: Construction<CrazyhouseState & CrazyhouseGui, FullGame & CrazyhouseState & CrazyhouseGui>) {
	gamefile.crazyhouse = {
		inventory: {[r.PAWN + e.B]: 10, [r.QUEEN + e.W]: 99, [r.KING + e.W]: -1},
		gui: {}
	};
	if (gamefile.components.has("client")) {
		createCrazyhouseGui();
		events.addEventListener(gamefile.events, "fullyloaded", egg);
	}

	function egg(gamefile: FullGame & CrazyhouseGui & CrazyhouseState): false {
		events.removeEventListener(gamefile.events, "fullyloaded", egg);

		svgcache.getSVGElements(gamefile.boardsim.existingTypes, 50, 50).then(s => {
			loadPieces(gamefile, s);
			updateHome(gamefile);
		});
		return false;
	}
}

export default setup;