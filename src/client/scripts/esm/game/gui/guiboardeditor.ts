
// src/client/scripts/esm/game/gui/guiboardeditor.ts

/*
 * This script handles the Board Editor GUI
 */

import gameloader from "../chess/gameloader.js";
import boardeditor from "../misc/boardeditor.js";
import svgcache from "../../chess/rendering/svgcache.js";
import typeutil, { rawTypes, players } from "../../chess/util/typeutil.js";
import gameslot from "../chess/gameslot.js";

import type { Player } from "../../chess/util/typeutil.js";


// Variables ---------------------------------------------------------------

const element_menu = document.getElementById("editor-menu")!;
const element_tools = document.getElementById("editor-tools")!;
const element_typesContainer = document.getElementById("editor-pieceTypes")!;
const element_neutralTypesContainer = document.getElementById("editor-neutralTypes")!;
const element_dot = document.getElementById("editor-dot")!;

const element_playerContainers: Map<Player, Element> = new Map();
const element_playerTypes: Map<Player, Array<Element>> = new Map();
const element_neutralTypes: Array<Element> = [];

/** Player pieces in the order they will appear */
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
	rawTypes.ROSE,
	rawTypes.ROYALQUEEN,
];

/** Neutral pieces in the order they will appear (except void, which is included manually in initUI by default) */
const neutralTypes = [ rawTypes.OBSTACLE ];

let initialized = false;
let isOpen = false;

// Functions ---------------------------------------------------------------

async function open() {
	element_menu.classList.remove("hidden");
	await gameloader.startBoardEditor();
	initListeners();
	isOpen = true;
}

function close() {
	if (!isOpen) return;
	element_menu.classList.add("hidden");
	closeListeners();
	isOpen = false;
}

async function initUI() {
	if (initialized) return;
	const gamefile = gameslot.getGamefile()!;
	const setOfPlayers: Set<Player> = new Set(gamefile.basegame.gameRules.turnOrder);

	// Colored pieces
	for (const player of setOfPlayers) {
		const svgs = await svgcache.getSVGElements(coloredTypes.map((rawType) => { return typeutil.buildType(rawType, player); }));
		const playerPieces = document.createElement("div");
		element_playerContainers.set(player, playerPieces);
		element_playerTypes.set(player, svgs);
		playerPieces.classList.add("editor-types");
		if (player !== boardeditor.getColor()) playerPieces.classList.add("hidden");
		for (const svg of svgs) {
			svg.classList.add("piece");
			playerPieces.appendChild(svg);
		}
		element_typesContainer.appendChild(playerPieces);
	}

	// Neutral pieces
	const neutral_svgs = await svgcache.getSVGElements(neutralTypes.map((rawType) => { return typeutil.buildType(rawType, players.NEUTRAL); }));
	const neutralPieces = document.createElement("div");
	neutralPieces.classList.add("editor-types");

	const element_void = document.createElement("div");
	element_void.classList.add("piece");
	element_void.classList.add("void");
	element_void.id = "0";
	element_neutralTypes.push(element_void);
	neutralPieces.appendChild(element_void);

	for (const neutral_svg of neutral_svgs) {
		neutral_svg.classList.add("piece");
		element_neutralTypes.push(neutral_svg);
		neutralPieces.appendChild(neutral_svg);
	}
	element_neutralTypesContainer.appendChild(neutralPieces);

	initialized = true;
}

function initListeners() {
	Array.from(element_tools.children).forEach((element) => {
		element.addEventListener("click", callback_ChangeTool);
	});
	element_playerTypes.get(boardeditor.getColor())!.forEach((element) => {
		element.addEventListener("click", callback_ChangePieceType);
	});
	element_neutralTypes.forEach((element) => {
		element.addEventListener("click", callback_ChangePieceType);
	});
}

function closeListeners() {
	Array.from(element_tools.children).forEach((element) => {
		element.removeEventListener("click", callback_ChangeTool);
	});
	element_playerTypes.get(boardeditor.getColor())!.forEach((element) => {
		element.removeEventListener("click", callback_ChangePieceType);
	});
	element_neutralTypes.forEach((element) => {
		element.removeEventListener("click", callback_ChangePieceType);
	});
}

function callback_ChangeTool(e: Event) {
	const target = (e.currentTarget as HTMLElement);
	const tool = target.getAttribute("data-tool");
	switch (tool) {
		case "undo":
			boardeditor.undo();
			return;
		case "redo":
			boardeditor.redo();
			return;
		case "save":
			boardeditor.save();
			return;
		case "load":
			boardeditor.load();
			return;
		case "clearall":
			boardeditor.clearAll();
			return;
		case "color":
			nextColor();
			return;
		default:
			if (tool !== null) boardeditor.setTool(tool);
			return;
	}
}

function callback_ChangePieceType(e: Event) {
	const target = (e.currentTarget as HTMLElement);
	const currentPieceType = Number.parseInt(target.id);
	if (isNaN(currentPieceType)) return console.error(`Invalid piece type: ${currentPieceType}`);
	boardeditor.setPiece(currentPieceType);
	boardeditor.setTool("placer");
	markPiece(currentPieceType);
}

function markTool(tool: string) {
	Array.from(element_tools.children).forEach((element) => {
		const element_tool = element.getAttribute("data-tool");
		if (element_tool === tool) element.classList.add("active");
		else element.classList.remove("active");
	});
}

function markPiece(type: number | null) {
	const placerToolActive = boardeditor.getTool() === "placer";

	element_playerTypes.get(boardeditor.getColor())!.forEach((element) => {
		const element_type = Number.parseInt(element.id);
		if (element_type === type && placerToolActive) element.classList.add("active");
		else element.classList.remove("active");
	});
	element_neutralTypes.forEach((element) => {
		const element_type = Number.parseInt(element.id);
		if (element_type === type && placerToolActive) element.classList.add("active");
		else element.classList.remove("active");
	});
}

function updatePieceColors(newColor: Player, iterate_over_all_old_colors = false) {
	if (!initialized) return;

	// Hide all unused piece colors that may be shown
	const playersSet: Set<Player> = new Set(gameslot.getGamefile()!.basegame.gameRules.turnOrder);
	const playersArray: Array<Player> = [...playersSet];
	const old_colors = iterate_over_all_old_colors ? playersArray.filter((color) => color !== newColor) : [boardeditor.getColor()];
	for (const old_color of old_colors) {
		element_playerTypes.get(old_color)!.forEach((element) => {
			element.removeEventListener("click", callback_ChangePieceType);
		});
		element_playerContainers.get(old_color)!.classList.add("hidden");
	}

	// Show pieces in correct colors
	element_playerTypes.get(newColor)!.forEach((element) => {
		element.addEventListener("click", callback_ChangePieceType);
	});
	element_playerContainers.get(newColor)!.classList.remove("hidden");
	element_dot.style.backgroundColor = typeutil.strcolors[newColor];
	boardeditor.setColor(newColor);
	
	// Update currentPieceType, if necessary
	if (typeutil.getColorFromType(boardeditor.getPiece()) !== players.NEUTRAL) {
		const currentPieceType = typeutil.buildType(typeutil.getRawType(boardeditor.getPiece()), newColor);
		boardeditor.setPiece(currentPieceType);
	}
	markPiece(boardeditor.getPiece());
}

function nextColor() {
	// Is there a better way to do this?
	const playersSet: Set<Player> = new Set(gameslot.getGamefile()!.basegame.gameRules.turnOrder);
	const playersArray: Array<Player> = [...playersSet];
	updatePieceColors(playersArray[(playersArray.indexOf(boardeditor.getColor()) + 1) % playersArray.length]!);
}

export default {
	open,
	close,
	initUI,
	markTool,
	markPiece,
	updatePieceColors
};