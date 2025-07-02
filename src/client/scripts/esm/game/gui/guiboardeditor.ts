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
	rawTypes.ROSE,
	rawTypes.ROYALQUEEN,
	rawTypes.OBSTACLE,
];

const neutralTypes = [ rawTypes.VOID ];

let isOpen = false;
let initalized = false;

let currentColor: Player = players.WHITE;

// Functions ---------------------------------------------------------------

async function open() {
	element_menu.classList.remove("hidden");
	await gameloader.startBoardEditor();
	initListeners();
	isOpen = true;
}

function close() {
	element_menu.classList.add("hidden");
	closeListeners();
	isOpen = false;
}

async function initUI() {
	if (initalized) return;
	const gamefile = gameslot.getGamefile()!;
	const setOfPlayers: Set<Player> = new Set(gamefile.basegame.gameRules.turnOrder);
	setOfPlayers.add(players.NEUTRAL);

	for (const player of setOfPlayers) {
		const svgs = await svgcache.getSVGElements(coloredTypes.map((rawType) => { return typeutil.buildType(rawType, player); }));
		const playerPieces = document.createElement("div");
		element_playerContainers.set(player, playerPieces);
		element_playerTypes.set(player, svgs);
		playerPieces.classList.add("editor-types");
		if (player !== currentColor) playerPieces.classList.add("hidden");
		for (const svg of svgs) {
			playerPieces.appendChild(svg);
		}
		element_typesContainer.appendChild(playerPieces);
	}

	initalized = true;
}

function initListeners() {
	Array.from(element_tools.children).forEach((element) => {
		element.addEventListener("click", callback_ChangeTool);
	});
	element_playerTypes.get(currentColor)!.forEach((element) => {
		element.addEventListener("click", callback_ChangePieceType);
	});
}

function closeListeners() {
	Array.from(element_tools.children).forEach((element) => {
		element.removeEventListener("click", callback_ChangeTool);
	});
	element_playerTypes.get(currentColor)!.forEach((element) => {
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
		case "normal":
			boardeditor.setTool(tool);
			return;
		case "placer":
			boardeditor.setTool(tool);
			return;
		case "eraser":
			boardeditor.setTool(tool);
			return;
		case "selector":
			boardeditor.setTool(tool);
			return;
		case "gamerules":
			boardeditor.setTool("normal");
			return;
		case "specialrights":
			boardeditor.setTool(tool);
			return;
		case "clearall":
			boardeditor.setTool("normal");
			boardeditor.clearAll();
			return;
		case "color":
			nextColor();
			return;
		case "void":
			boardeditor.setTool("placer");
			boardeditor.setPiece(rawTypes.VOID);
			return;
		default:
			if (tool !== null) boardeditor.setTool(tool);
			return;
	}
}

function markTool(tool: string) {
	Array.from(element_tools.children).forEach((element) => {
		const element_tool = element.getAttribute("data-tool");
		if (element_tool === tool) element.classList.add("active");
		else element.classList.remove("active");
	});
}

function callback_ChangePieceType(e: Event) {
	const target = (e.currentTarget as HTMLElement);
	const type = Number.parseInt(target.id);
	if (isNaN(type)) return console.error(`Invalid piece type: ${type}`);
	boardeditor.setPiece(type);
	boardeditor.setTool("placer");
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

function nextColor() {
	// Is there a better way to do this?
	const playersSet: Set<Player> = new Set(gameslot.getGamefile()!.basegame.gameRules.turnOrder);
	playersSet.add(players.NEUTRAL);
	const playersArray: Array<Player> = [...playersSet];
	setColor(playersArray[(playersArray.indexOf(currentColor) + 1) % playersArray.length]!);
}

export default {
	open,
	close,
	initUI,
	markTool
};