
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
	window.dispatchEvent(new CustomEvent('resize')); // the screen and canvas get effectively resized when the vertical board editor bar is toggled
	await gameloader.startBoardEditor();
	initListeners();
	isOpen = true;
}

function close() {
	if (!isOpen) return;
	element_menu.classList.add("hidden");
	window.dispatchEvent(new CustomEvent('resize')); // the screen and canvas get effectively resized when the vertical board editor bar is toggled
	closeListeners();
	isOpen = false;
}

async function initUI() {
	if (initialized) return;
	const uniquePlayers = _getPlayersInOrder();

	// Colored pieces
	for (const player of uniquePlayers) {
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
	_getActivePieceElements().forEach((element) => {
		element.addEventListener("click", callback_ChangePieceType);
	});
}

function closeListeners() {
	Array.from(element_tools.children).forEach((element) => {
		element.removeEventListener("click", callback_ChangeTool);
	});
	_getActivePieceElements().forEach((element) => {
		element.removeEventListener("click", callback_ChangePieceType);
	});
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

	_getActivePieceElements().forEach((element) => {
		const element_type = Number.parseInt(element.id);
		if (element_type === type && placerToolActive) element.classList.add("active");
		else element.classList.remove("active");
	});
}

function updatePieceColors(newColor: Player) {
	if (!initialized) return;

	// Hide all player containers and remove their listeners
	for (const [player, container] of element_playerContainers.entries()) {
		container.classList.add("hidden");
		element_playerTypes.get(player)!.forEach((element) => {
			element.removeEventListener("click", callback_ChangePieceType);
		});
	}

	// Show the correct container and add its listeners
	const newPlayerContainer = element_playerContainers.get(newColor);
	if (newPlayerContainer) {
		newPlayerContainer.classList.remove("hidden");
		element_playerTypes.get(newColor)!.forEach((element) => {
			element.addEventListener("click", callback_ChangePieceType);
		});
	}

	// Update dot color and internal state
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
	const playersArray = _getPlayersInOrder();
	const currentIndex = playersArray.indexOf(boardeditor.getColor());
	const nextColor = playersArray[(currentIndex + 1) % playersArray.length]!;
	updatePieceColors(nextColor);
}

/** Helper Function: Returns an array of all piece elements that are currently clickable (active color + neutral). */
function _getActivePieceElements(): Element[] {
	const playerElements = element_playerTypes.get(boardeditor.getColor()) ?? [];
	return [...playerElements, ...element_neutralTypes];
}

/** Helper Function: Returns an array of players based on the current gamefile's turn order. */
function _getPlayersInOrder(): Player[] {
	const gamefile = gameslot.getGamefile()!;
	// Using a Set removes duplicates before converting to an array
	return [...new Set(gamefile.basegame.gameRules.turnOrder)];
}

// Callbacks ---------------------------------------------------------------

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

// Exports ----------------------------------------------------------------


export default {
	open,
	close,
	initUI,
	markTool,
	markPiece,
	updatePieceColors
};