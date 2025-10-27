
// src/client/scripts/esm/game/gui/guiboardeditor.ts

/*
 * This script handles the Board Editor GUI
 */

import gameloader from "../chess/gameloader.js";
import boardeditor from "../misc/boardeditor.js";
import svgcache from "../../chess/rendering/svgcache.js";
import typeutil, { rawTypes, players } from "../../../../../shared/chess/util/typeutil.js";
import gameslot from "../chess/gameslot.js";
import icnconverter from "../../../../../shared/chess/logic/icn/icnconverter.js";
import jsutil from "../../../../../shared/util/jsutil.js";

import type { Player, RawType } from "../../../../../shared/chess/util/typeutil.js";
import type { GameRulesGUIinfo } from "../misc/boardeditor.js";


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

const element_gamerulesWhite = document.getElementById("rules-white")! as HTMLInputElement;
const element_gamerulesBlack = document.getElementById("rules-black")! as HTMLInputElement;
const element_gamerulesEnPassantX = document.getElementById("rules-enpassant-x")! as HTMLInputElement;
const element_gamerulesEnPassantY = document.getElementById("rules-enpassant-y")! as HTMLInputElement;
const element_gamerulesMoveruleCurrent = document.getElementById("rules-moverule-current")! as HTMLInputElement;
const element_gamerulesMoveruleMax = document.getElementById("rules-moverule-max")! as HTMLInputElement;
const element_gamerulesPromotionranksWhite = document.getElementById("rules-promotionranks-white")! as HTMLInputElement;
const element_gamerulesPromotionpiecesWhite = document.getElementById("rules-promotionpieces-white")! as HTMLInputElement;
const element_gamerulesPromotionranksBlack = document.getElementById("rules-promotionranks-black")! as HTMLInputElement;
const element_gamerulesPromotionpiecesBlack = document.getElementById("rules-promotionpieces-black")! as HTMLInputElement;
const element_gamerulesCheckmateWhite = document.getElementById("rules-checkmate-white")! as HTMLInputElement;
const element_gamerulesCheckmateBlack = document.getElementById("rules-checkmate-black")! as HTMLInputElement;
const element_gamerulesRoyalcaptureWhite = document.getElementById("rules-royalcapture-white")! as HTMLInputElement;
const element_gamerulesRoyalcaptureBlack = document.getElementById("rules-royalcapture-black")! as HTMLInputElement;
const element_gamerulesAllroyalscapturedWhite = document.getElementById("rules-allroyalscaptured-white")! as HTMLInputElement;
const element_gamerulesAllroyalscapturedBlack = document.getElementById("rules-allroyalscaptured-black")! as HTMLInputElement;
const element_gamerulesAllpiecescapturedWhite = document.getElementById("rules-allpiecescaptured-white")! as HTMLInputElement;
const element_gamerulesAllpiecescapturedBlack = document.getElementById("rules-allpiecescaptured-black")! as HTMLInputElement;

const elements_gamerulesSelectionList : HTMLInputElement[] = [
	element_gamerulesWhite, element_gamerulesBlack, element_gamerulesEnPassantX, element_gamerulesEnPassantY,
	element_gamerulesMoveruleCurrent, element_gamerulesMoveruleMax,
	element_gamerulesPromotionranksWhite, element_gamerulesPromotionpiecesWhite,
	element_gamerulesPromotionranksBlack, element_gamerulesPromotionpiecesBlack,
	element_gamerulesCheckmateWhite, element_gamerulesCheckmateBlack,
	element_gamerulesRoyalcaptureWhite, element_gamerulesRoyalcaptureBlack,
	element_gamerulesAllroyalscapturedWhite, element_gamerulesAllroyalscapturedBlack,
	element_gamerulesAllpiecescapturedWhite, element_gamerulesAllpiecescapturedBlack
];

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

/** Variables for controlling the game rules GUI dragging */
let gameRulesOffsetX = 0;
let gameRulesOffsetY = 0;
let gameRulesIsDragging = false;
let gameRulesSavedPos : { left: number, top: number } | undefined;

/** Regexes for validating game rules input fields */
const integerRegex = new RegExp(String.raw`^${icnconverter.integerSource}$`);
const promotionRanksRegex = new RegExp(String.raw`^${icnconverter.promotionRanksSource}$`);
const promotionsAllowedRegex = new RegExp(String.raw`^${icnconverter.promotionsAllowedSource}$`);

let initialized = false;
let boardEditorOpen = false;


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
	closeGameRules();
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

/** Reads the game rules inserted into the input boxes */
function readGameRules() : GameRulesGUIinfo {
	// playerToMove
	const playerToMove = element_gamerulesWhite.checked ? 'white' : 'black';

	// enPassant
	let validEnPassantCoords = 0;
	const enPassantX = element_gamerulesEnPassantX.value;
	if (integerRegex.test(enPassantX)) {
		element_gamerulesEnPassantX.classList.remove('invalid-input');
		validEnPassantCoords++;
	} else {
		element_gamerulesEnPassantX.classList.add('invalid-input');
	}

	const enPassantY = element_gamerulesEnPassantY.value;
	if (integerRegex.test(enPassantY)) {
		element_gamerulesEnPassantY.classList.remove('invalid-input');
		validEnPassantCoords++;
	} else {
		element_gamerulesEnPassantY.classList.add('invalid-input');
	}

	const enPassant = (validEnPassantCoords === 2 ? {x : BigInt(enPassantX), y: BigInt(enPassantY)} : undefined);

	// moveRule
	let validMoveRuleInputs = 0;
	const moveRuleCurrent = element_gamerulesMoveruleCurrent.value;
	if (integerRegex.test(moveRuleCurrent)) {
		element_gamerulesMoveruleCurrent.classList.remove('invalid-input');
		validMoveRuleInputs++;
	} else {
		element_gamerulesMoveruleCurrent.classList.add('invalid-input');
	}

	const moveRuleMax = element_gamerulesMoveruleMax.value;
	if (integerRegex.test(moveRuleMax)) {
		element_gamerulesMoveruleMax.classList.remove('invalid-input');
		validMoveRuleInputs++;
	} else {
		element_gamerulesMoveruleMax.classList.add('invalid-input');
	}

	const moveRule = (validMoveRuleInputs === 2 ? {current : Number(moveRuleCurrent), max: Number(moveRuleMax)} : undefined);

	// promotionRanks
	const promotionRanks: {white?: bigint[], black?: bigint[]} = {};
	const promotionRanksWhite = element_gamerulesPromotionranksWhite.value;
	if (promotionRanksRegex.test(promotionRanksWhite)) {
		element_gamerulesPromotionranksWhite.classList.remove('invalid-input');
		promotionRanks.white = [...new Set(promotionRanksWhite.split(',').map(BigInt))];
	} else {
		element_gamerulesPromotionranksWhite.classList.add('invalid-input');
	}

	const promotionRanksBlack = element_gamerulesPromotionranksBlack.value;
	if (promotionRanksRegex.test(promotionRanksBlack)) {
		element_gamerulesPromotionranksBlack.classList.remove('invalid-input');
		promotionRanks.black = [...new Set(promotionRanksBlack.split(',').map(BigInt))];
	} else {
		element_gamerulesPromotionranksBlack.classList.add('invalid-input');
	}

	// promotionsAllowed
	const promotionsAllowed: {white?: RawType[], black?: RawType[]} = {};
	const promotionsAllowedWhite = element_gamerulesPromotionpiecesWhite.value;
	if (promotionsAllowedRegex.test(promotionsAllowedWhite)) {
		element_gamerulesPromotionpiecesWhite.classList.remove('invalid-input');
		promotionsAllowed.white = promotionsAllowedWhite ? [...new Set(promotionsAllowedWhite.split(',').map(raw => Number(icnconverter.piece_codes_raw_inverted[raw.toLowerCase()]) as RawType).filter(x => !Number.isNaN(x)))] : jsutil.deepCopyObject(icnconverter.default_promotions);
	} else {
		element_gamerulesPromotionpiecesWhite.classList.add('invalid-input');
	}

	const promotionsAllowedBlack = element_gamerulesPromotionpiecesBlack.value;
	if (promotionsAllowedRegex.test(promotionsAllowedBlack)) {
		element_gamerulesPromotionpiecesBlack.classList.remove('invalid-input');
		promotionsAllowed.black = promotionsAllowedBlack ? [...new Set(promotionsAllowedBlack.split(',').map(raw => Number(icnconverter.piece_codes_raw_inverted[raw.toLowerCase()]) as RawType).filter(x => !Number.isNaN(x)))] : jsutil.deepCopyObject(icnconverter.default_promotions);
	} else {
		element_gamerulesPromotionpiecesBlack.classList.add('invalid-input');
	}

	// win conditions
	const winConditionsWhite : string[] = [];
	if (element_gamerulesCheckmateWhite.checked) winConditionsWhite.push("checkmate");
	if (element_gamerulesRoyalcaptureWhite.checked) winConditionsWhite.push("royalcapture");
	if (element_gamerulesAllroyalscapturedWhite.checked) winConditionsWhite.push("allroyalscaptured");
	if (element_gamerulesAllpiecescapturedWhite.checked) winConditionsWhite.push("allpiecescaptured");

	const winConditionsBlack : string[] = [];
	if (element_gamerulesCheckmateBlack.checked) winConditionsBlack.push("checkmate");
	if (element_gamerulesRoyalcaptureBlack.checked) winConditionsBlack.push("royalcapture");
	if (element_gamerulesAllroyalscapturedBlack.checked) winConditionsBlack.push("allroyalscaptured");
	if (element_gamerulesAllpiecescapturedBlack.checked) winConditionsBlack.push("allpiecescaptured");

	const winConditions = {white: winConditionsWhite, black: winConditionsBlack};

	const gameRules : GameRulesGUIinfo = {
		playerToMove,
		enPassant,
		moveRule,
		promotionRanks,
		promotionsAllowed,
		winConditions
	};

	return gameRules;
}

/** Deselects the input boxes when pressing Enter */
function blurOnEnter(e: KeyboardEvent) : void {
	if (e.key === 'Enter') {
		(e.target as HTMLInputElement).blur();
	}
}

/** Deselects the input boxes when clicking somewhere outside the game rules UI */
function blurOnClickorTouchOutside(e: MouseEvent | TouchEvent) : void {
	if (!element_gamerulesWindow.contains(e.target as Node)) {
		const activeEl = document.activeElement as HTMLInputElement;
		if (activeEl && elements_gamerulesSelectionList.includes(activeEl) && activeEl.tagName === 'INPUT') activeEl.blur();
	}
}

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
function startGameRulesDrag(coordx: number, coordy: number): void {
	gameRulesIsDragging = true;
	gameRulesOffsetX = coordx - element_gamerulesWindow.offsetLeft;
	gameRulesOffsetY = coordy - element_gamerulesWindow.offsetTop;
	document.body.style.userSelect = "none";
}

function startGameRulesMouseDrag(e: MouseEvent): void {
	startGameRulesDrag(e.clientX, e.clientY);
}

function startGameRulesTouchDrag(e: TouchEvent): void {
	if (e.touches.length === 1) {
		const touch = e.touches[0]!;
		startGameRulesDrag(touch.clientX, touch.clientY);
	}
}

/** During drag */
function duringGameRulesDrag(coordx: number, coordy: number): void {
	if (!gameRulesIsDragging) return;

	const parentRect = element_boardUI.getBoundingClientRect();
	const elWidth = element_gamerulesWindow.offsetWidth;
	const elHeight = element_gamerulesWindow.offsetHeight;

	// Compute desired new position
	const newLeft = coordx - gameRulesOffsetX;
	const newTop = coordy - gameRulesOffsetY;

	// Clamp within parent container
	const clampedLeft = clamp(newLeft, 0, parentRect.width - elWidth);
	const clampedTop = clamp(newTop, 0, parentRect.height - elHeight);

	element_gamerulesWindow.style.left = `${clampedLeft}px`;
	element_gamerulesWindow.style.top = `${clampedTop}px`;

	// Save new position
	gameRulesSavedPos = { left: clampedLeft, top: clampedTop };
}

function duringGameRulesMouseDrag(e: MouseEvent): void {
	duringGameRulesDrag(e.clientX, e.clientY);
}

function duringGameRulesTouchDrag(e: TouchEvent): void {
	if (e.touches.length === 1) {
		e.preventDefault(); // prevent scrolling
		const touch = e.touches[0]!;
		duringGameRulesDrag(touch.clientX, touch.clientY);
	}
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
	element_gamerulesHeader.addEventListener("mousedown", startGameRulesMouseDrag);
	document.addEventListener("mousemove", duringGameRulesMouseDrag);
	document.addEventListener("mouseup", stopGameRulesDrag);
	element_gamerulesHeader.addEventListener("touchstart", startGameRulesTouchDrag, { passive: false });
	document.addEventListener("touchmove", duringGameRulesTouchDrag, { passive: false });
	document.addEventListener("touchend", stopGameRulesDrag, { passive: false });

	window.addEventListener("resize", clampGameRulesToBoardUIBounds);
	element_gamerulesCloseButton.addEventListener("click", closeGameRules);

	elements_gamerulesSelectionList.forEach(el => {
		if (el.type === 'text') {
			el.addEventListener('keydown', blurOnEnter);
			el.addEventListener('blur', readGameRules);
		} else if (el.type === 'radio' || el.type === 'checkbox') {
			el.addEventListener('change', readGameRules);
		}
	});
	document.addEventListener('click', blurOnClickorTouchOutside);
	document.addEventListener('touchstart', blurOnClickorTouchOutside);
}

function closeGameRulesListeners(): void {
	element_gamerulesHeader.removeEventListener("mousedown", startGameRulesMouseDrag);
	document.removeEventListener("mousemove", duringGameRulesMouseDrag);
	document.removeEventListener("mouseup", stopGameRulesDrag);
	element_gamerulesHeader.removeEventListener("touchstart", startGameRulesTouchDrag);
	document.removeEventListener("touchmove", duringGameRulesTouchDrag);
	document.removeEventListener("touchend", stopGameRulesDrag);

	window.removeEventListener("resize", clampGameRulesToBoardUIBounds);
	element_gamerulesCloseButton.removeEventListener("click", closeGameRules);

	elements_gamerulesSelectionList.forEach(el => {
		if (el.type === 'text') {
			el.removeEventListener('keydown', blurOnEnter);
			el.removeEventListener('blur', readGameRules);
		} else if (el.type === 'radio' || el.type === 'checkbox') {
			el.removeEventListener('change', readGameRules);
		}
	});
	document.removeEventListener('click', blurOnClickorTouchOutside);
	document.removeEventListener('touchstart', blurOnClickorTouchOutside);
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
	updatePieceColors,
	readGameRules
};