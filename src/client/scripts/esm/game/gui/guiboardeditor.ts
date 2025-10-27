
// src/client/scripts/esm/game/gui/guiboardeditor.ts

/*
 * This script handles the Board Editor GUI
 */

import gameloader from "../chess/gameloader.js";
import boardeditor from "../misc/boardeditor.js";
import svgcache from "../../chess/rendering/svgcache.js";
import typeutil, { rawTypes, players } from "../../../../../shared/chess/util/typeutil.js";
import gameslot from "../chess/gameslot.js";

import type { Player } from "../../../../../shared/chess/util/typeutil.js";


// Variables ---------------------------------------------------------------


const element_menu = document.getElementById("editor-menu")!;
const element_tools = document.getElementById("editor-tools")!;
const element_typesContainer = document.getElementById("editor-pieceTypes")!;
const element_neutralTypesContainer = document.getElementById("editor-neutralTypes")!;
const element_dot = document.getElementById("editor-dot")!;

const element_boardUI = document.getElementById("boardUI")!;
const element_gamerulesWindow = document.getElementById("game-rules")!;
const element_gamerulesHeader = document.getElementById("game-rules-header")!;
const element_gamerulesCloseButton = document.getElementById("close-rules")!;

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
let boardEditorOpen = false;

let gameRulesOffsetX = 0;
let gameRulesOffsetY = 0;
let gameRulesIsDragging = false;

interface GameRulesPosition {
  left: number;
  top: number;
}
let gameRulesSavedPos : GameRulesPosition | undefined;


// Functions ---------------------------------------------------------------

function isOpen(): boolean {
	return boardEditorOpen;
}

async function open(): Promise<void> {
	boardEditorOpen = true;
	gameRulesSavedPos = undefined;
	element_menu.classList.remove("hidden");
	window.dispatchEvent(new CustomEvent('resize')); // the screen and canvas get effectively resized when the vertical board editor bar is toggled
	await gameloader.startBoardEditor();
	initListeners();
}

function close(): void {
	if (!boardEditorOpen) return;
	element_menu.classList.add("hidden");
	window.dispatchEvent(new CustomEvent('resize')); // the screen and canvas get effectively resized when the vertical board editor bar is toggled
	closeListeners();
	boardEditorOpen = false;
}

async function initUI(): Promise<void> {
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

function initListeners(): void {
	Array.from(element_tools.children).forEach((element) => {
		element.addEventListener("click", callback_ChangeTool);
	});
	_getActivePieceElements().forEach((element) => {
		element.addEventListener("click", callback_ChangePieceType);
	});
}

function closeListeners(): void {
	Array.from(element_tools.children).forEach((element) => {
		element.removeEventListener("click", callback_ChangeTool);
	});
	_getActivePieceElements().forEach((element) => {
		element.removeEventListener("click", callback_ChangePieceType);
	});
}


function markTool(tool: string): void {
	Array.from(element_tools.children).forEach((element) => {
		const element_tool = element.getAttribute("data-tool");
		if (element_tool === tool) element.classList.add("active");
		else element.classList.remove("active");
	});
}

function markPiece(type: number | null): void {
	const placerToolActive = boardeditor.getTool() === "placer";

	_getActivePieceElements().forEach((element) => {
		const element_type = Number.parseInt(element.id);
		if (element_type === type && placerToolActive) element.classList.add("active");
		else element.classList.remove("active");
	});
}

function updatePieceColors(newColor: Player): void {
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

function nextColor(): void {
	const playersArray = _getPlayersInOrder();
	const currentIndex = playersArray.indexOf(boardeditor.getColor());
	const nextColor = playersArray[(currentIndex + 1) % playersArray.length]!;
	updatePieceColors(nextColor);
}


// Game Rules Utilities ---------------------------------------------------------------


/** Helper: clamp value between min and max */
function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max));
}

/** Helper: keep the UI box within boardUI bounds */
function clampGameRulesToBoardUIBounds(): void {
	const parentRect = element_boardUI.getBoundingClientRect();
	const elWidth = element_gamerulesWindow.offsetWidth;
	const elHeight = element_gamerulesWindow.offsetHeight;

	// Compute clamped position
	const newLeft = clamp(element_gamerulesWindow.offsetLeft, 0, parentRect.width - elWidth);
	const newTop = clamp(element_gamerulesWindow.offsetTop, 0, parentRect.height - elHeight);

	element_gamerulesWindow.style.left = `${newLeft}px`;
	element_gamerulesWindow.style.top = `${newTop}px`;

	// Save new position
	gameRulesSavedPos = { left: newLeft, top: newTop };
}

/** Start dragging */
function startGameRulesDrag(e: MouseEvent): void {
	gameRulesIsDragging = true;
	gameRulesOffsetX = e.clientX - element_gamerulesWindow.offsetLeft;
	gameRulesOffsetY = e.clientY - element_gamerulesWindow.offsetTop;
	document.body.style.userSelect = "none";
}

/** During drag */
function duringGameRulesDrag(e: MouseEvent): void {
	if (!gameRulesIsDragging) return;

	const parentRect = element_boardUI.getBoundingClientRect();
	const elWidth = element_gamerulesWindow.offsetWidth;
	const elHeight = element_gamerulesWindow.offsetHeight;

	// Compute desired new position
	const newLeft = e.clientX - gameRulesOffsetX;
	const newTop = e.clientY - gameRulesOffsetY;

	// Clamp within parent container
	const clampedLeft = clamp(newLeft, 0, parentRect.width - elWidth);
	const clampedTop = clamp(newTop, 0, parentRect.height - elHeight);

	element_gamerulesWindow.style.left = `${clampedLeft}px`;
	element_gamerulesWindow.style.top = `${clampedTop}px`;

	// Save new position
	gameRulesSavedPos = { left: clampedLeft, top: clampedTop };
}

/** Stop dragging */
function stopGameRulesDrag(): void {
	if (gameRulesIsDragging) {
		clampGameRulesToBoardUIBounds();
	}
	gameRulesIsDragging = false;
	document.body.style.userSelect = "auto";
}

function initGameRulesListeners(): void {
	element_gamerulesHeader.addEventListener("mousedown", startGameRulesDrag);
	document.addEventListener("mousemove", duringGameRulesDrag);
	document.addEventListener("mouseup", stopGameRulesDrag);
	window.addEventListener("resize", clampGameRulesToBoardUIBounds);
	element_gamerulesCloseButton.addEventListener("click", closeGameRules);
}

function closeGameRulesListeners(): void {
	element_gamerulesHeader.removeEventListener("mousedown", startGameRulesDrag);
	document.removeEventListener("mousemove", duringGameRulesDrag);
	document.removeEventListener("mouseup", stopGameRulesDrag);
	window.removeEventListener("resize", clampGameRulesToBoardUIBounds);
	element_gamerulesCloseButton.removeEventListener("click", closeGameRules);
}

function openGameRules(): void {
	if (gameRulesSavedPos !== undefined) {
		element_gamerulesWindow.style.left = `${gameRulesSavedPos.left}px`;
		element_gamerulesWindow.style.top = `${gameRulesSavedPos.top}px`;
	}
	element_gamerulesWindow.classList.remove("hidden");
	clampGameRulesToBoardUIBounds();
	initGameRulesListeners();
}

function closeGameRules(): void {
	element_gamerulesWindow.classList.add("hidden");
	closeGameRulesListeners();
}

function toggleGameRules(): void {
	if (element_gamerulesWindow.classList.contains("hidden")) openGameRules();
	else closeGameRules();
}

// Helper Functions ---------------------------------------------------------


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


function callback_ChangeTool(e: Event): void {
	const target = (e.currentTarget as HTMLElement);
	const tool = target.getAttribute("data-tool");
	switch (tool) {
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
		case "gamerules":
			toggleGameRules();
			return;
		default:
			if (tool !== null) boardeditor.setTool(tool);
			return;
	}
}

function callback_ChangePieceType(e: Event): void {
	const target = (e.currentTarget as HTMLElement);
	const currentPieceType = Number.parseInt(target.id);
	if (isNaN(currentPieceType)) return console.error(`Invalid piece type: ${currentPieceType}`);
	boardeditor.setPiece(currentPieceType);
	boardeditor.setTool("placer");
	markPiece(currentPieceType);
}

// Exports ----------------------------------------------------------------


export default {
	isOpen,
	open,
	close,
	initUI,
	markTool,
	markPiece,
	updatePieceColors
};