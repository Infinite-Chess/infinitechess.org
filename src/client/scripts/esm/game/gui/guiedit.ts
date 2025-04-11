import boardeditor from "../misc/boardeditor.js";
import svgcache from "../../chess/rendering/svgcache.js";
import typeutil, { rawTypes, players } from "../../chess/util/typeutil.js";
import gameslot from "../chess/gameslot.js";

import type { Player } from "../../chess/util/typeutil.js";

// Variables ---------------------------------------------------------------

const element_menu = document.getElementById("editor-menu")!;
const element_navigationBar = document.getElementById("navigation-bar")!;
const element_tools = document.querySelectorAll(".editor-tools>*")!;

const element_typesContainer = document.getElementById("editor-pieceTypes")!;
const element_playerContainers: Map<Player, Element> = new Map();
const element_playerTypes: Map<Player, Array<Element>> = new Map();


// Pieces in the order they will appear
const coloredTypes = [
	rawTypes.KING,
	rawTypes.QUEEN,
	rawTypes.ROOK,
	rawTypes.BISHOP,
	rawTypes.KNIGHT,
	rawTypes.PAWN,
	rawTypes.CHANCELLOR,
	rawTypes.ARCHBISHOP,
	rawTypes.AMAZON,
	rawTypes.GUARD,
	rawTypes.HAWK,
	rawTypes.CENTAUR,
	rawTypes.KNIGHTRIDER,
	rawTypes.HUYGEN,
	rawTypes.ROYALQUEEN,
	rawTypes.OBSTACLE,
];
const nuetralTypes = [ rawTypes.VOID ];

let isOpen = false;
let initalized = false;

let currentColor: Player = players.WHITE;

// Functions ---------------------------------------------------------------

function open() {
	element_menu.classList.remove("hidden");
	element_navigationBar.classList.add("vertical");
	initListeners();
	isOpen = true;
}

function close() {
	element_menu.classList.add("hidden");
	element_navigationBar.classList.remove("vertical");
	closeListeners();
	isOpen = false;
}

async function initUI() {
	if (initalized) return;
	const gamefile = gameslot.getGamefile()!;
	for (let player = players.NEUTRAL; player<=gamefile.startSnapshot.playerCount!; player++) {
		const svgs = await svgcache.getSVGElements(coloredTypes.map((rawType) => { return typeutil.buildType(rawType, player) }));
		
		const playerPieces = document.createElement("div");
		element_playerContainers.set(player, playerPieces);
		element_playerTypes.set(player, svgs);
		playerPieces.classList.add("editor-types")
		if (player !== currentColor) playerPieces.classList.add("hidden");
		for (const svg of svgs) {
			playerPieces.appendChild(svg);
		}
		
		element_typesContainer.appendChild(playerPieces);
	}
	initalized = true;
}

function initListeners() {
	element_tools.forEach((element) => {
		element.addEventListener("click", callback_ChangeTool);
	});
	element_playerTypes.get(currentColor)!.forEach((element) => {
		element.addEventListener("click", callback_ChangePieceType);
	});
}

function closeListeners() {
	element_tools.forEach((element) => {
		element.removeEventListener("click", callback_ChangeTool);
	});
	element_playerTypes.get(currentColor)!.forEach((element) => {
		element.removeEventListener("click", callback_ChangePieceType);
	});
}

function callback_ChangeTool(e: Event) {
	const target = (e.currentTarget as HTMLElement)
	const tool = target.getAttribute("data-tool");
	switch (tool) {
		case "color": toggleColor(); return;
		case "save":  boardeditor.save(); return;
		case "clear": boardeditor.clearAll(); return;
		case "eraser":
		case "special":
			boardeditor.setTool(tool); return;
		case "void":
			boardeditor.setTool("piece");
			boardeditor.setPiece(rawTypes.VOID);
			return;
		default: console.error(`Invalid tool: ${tool}`); return;
	}
}

function callback_ChangePieceType(e: Event) {
	const target = (e.currentTarget as HTMLElement)
	const type = Number.parseInt(target.id);
	if (isNaN(type)) return console.error(`Invalid piece type: ${type}`);
	boardeditor.setPiece(type);
	boardeditor.setTool("piece");
}

function setColor(newColor: Player) {
	if (!initalized) return;
	element_playerTypes.get(currentColor)!.forEach((element) => {
		element.removeEventListener("click", callback_ChangePieceType);
	});
	element_playerTypes.get(currentColor)!.forEach((element) => {
		element.addEventListener("click", callback_ChangePieceType);
	});
	element_playerContainers.get(currentColor)!.classList.add("hidden");
	element_playerContainers.get(newColor)!.classList.remove("hidden");
	//element_dot.style.backgroundColor = 
	currentColor = newColor;
}

function toggleColor() {
	// This looks rather messy is there a utility function for next player?
	setColor((currentColor+1)%(gameslot.getGamefile()!.startSnapshot.playerCount!+1) as Player);
}

export default {
	initUI,
	open,
	close,
};