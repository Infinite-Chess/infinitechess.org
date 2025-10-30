
// src/client/scripts/esm/game/gui/guiboardeditor.ts

/*
 * This script handles the Board Editor GUI
 */

import gameloader from "../chess/gameloader.js";
import boardeditor from "../boardeditor/boardeditor.js";
import svgcache from "../../chess/rendering/svgcache.js";
import typeutil, { rawTypes, players } from "../../../../../shared/chess/util/typeutil.js";
import gameslot from "../chess/gameslot.js";
import icnconverter from "../../../../../shared/chess/logic/icn/icnconverter.js";
import jsutil from "../../../../../shared/util/jsutil.js";
import math from "../../../../../shared/util/math/math.js";
// @ts-ignore
import statustext from "./statustext.js";

import type { Player, RawType } from "../../../../../shared/chess/util/typeutil.js";
import type { GameRulesGUIinfo } from "../boardeditor/boardeditor.js";
import tooltips from "../../util/tooltips.js";


// Variables ---------------------------------------------------------------


const element_menu = document.getElementById("editor-menu")!;
const element_gamerules = document.getElementById("gamerules")!;
const element_typesContainer = document.getElementById("editor-pieceTypes")!;
const element_neutralTypesContainer = document.getElementById("editor-neutralTypes")!;
const element_colorSelect = document.getElementById("editor-color-select")!;
const elements_tools = [
	// Position
	document.getElementById("reset")!,
	document.getElementById("clearall")!,
	document.getElementById("saved-positions")!,
	document.getElementById("copy-notation")!,
	document.getElementById("paste-notation")!,
	document.getElementById("gamerules")!,
	document.getElementById("start-game")!,
	// Tools
	document.getElementById("normal")!,
	document.getElementById("eraser")!,
	document.getElementById("specialrights")!,
	document.getElementById("selection-tool")!,
	// Selection
	// (none)
	// Palette
	document.getElementById("editor-color-select")!
];

const element_boardUI = document.getElementById("boardUI")!;

// Game Rules UI elements---------------------------------------------------------------
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
const element_gamerulesPromotionranksBlack = document.getElementById("rules-promotionranks-black")! as HTMLInputElement;
const element_gamerulesPromotionpieces = document.getElementById("rules-promotionpieces")! as HTMLInputElement;
const element_gamerulesCheckmate = document.getElementById("rules-checkmate")! as HTMLInputElement;
const element_gamerulesRoyalcapture = document.getElementById("rules-royalcapture")! as HTMLInputElement;
const element_gamerulesAllroyalscaptured = document.getElementById("rules-allroyalscaptured")! as HTMLInputElement;
const element_gamerulesAllpiecescaptured = document.getElementById("rules-allpiecescaptured")! as HTMLInputElement;
const element_gamerulesPawnDoublePush = document.getElementById('rules-doublepush')! as HTMLInputElement;
const element_gamerulesCastlingWithRooks = document.getElementById('rules-castling')! as HTMLInputElement;

const elements_gamerulesSelectionList : HTMLInputElement[] = [
	element_gamerulesWhite, element_gamerulesBlack, element_gamerulesEnPassantX, element_gamerulesEnPassantY,
	element_gamerulesMoveruleCurrent, element_gamerulesMoveruleMax,
	element_gamerulesPromotionranksWhite, element_gamerulesPromotionranksBlack, element_gamerulesPromotionpieces,
	element_gamerulesCheckmate, element_gamerulesRoyalcapture,
	element_gamerulesAllroyalscaptured, element_gamerulesAllpiecescaptured,
	element_gamerulesPawnDoublePush, element_gamerulesCastlingWithRooks
];
// -------------------------------------------------------------------------------------

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
	rawTypes.CENTAUR,
	rawTypes.HAWK,
	rawTypes.KNIGHTRIDER,
	rawTypes.HUYGEN,
	rawTypes.ROSE,
	rawTypes.CAMEL,
	rawTypes.GIRAFFE,
	rawTypes.ZEBRA,
	rawTypes.ROYALCENTAUR,
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
	element_menu.classList.remove("hidden");
	window.dispatchEvent(new CustomEvent('resize')); // the screen and canvas get effectively resized when the vertical board editor bar is toggled
	await gameloader.startBoardEditor();
	initListeners();
}

function close(): void {
	if (!boardEditorOpen) return;
	closeGameRules();
	element_gamerulesWindow.style.left = "";
	element_gamerulesWindow.style.top = "";
	gameRulesSavedPos = undefined;
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

		// Tooltips (i.e. "Amazon (AM)")
		for (let i = 0; i < svgs.length; i++) {
			const svg = svgs[i]!;
			svg.classList.add("piece");
			const pieceContainer = document.createElement("div");

			if (i % 4 === 0) pieceContainer.classList.add("tooltip-dr");
			else if (i % 4 === 3) pieceContainer.classList.add("tooltip-d");
			else pieceContainer.classList.add("tooltip-d");
			const localized_piece_name = translations['piecenames'][typeutil.getRawTypeStr(coloredTypes[i]!)!];
			const piece_abbreviation = icnconverter.piece_codes_raw[coloredTypes[i]!];
			const modified_piece_abbreviation = (player === players.WHITE ? piece_abbreviation.toUpperCase() : piece_abbreviation.toLowerCase());
			pieceContainer.setAttribute("data-tooltip", `${localized_piece_name} (${modified_piece_abbreviation})`);
			
			pieceContainer.appendChild(svg);
			playerPieces.appendChild(pieceContainer);
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

	// Void tooltip
	element_void.classList.add("tooltip-dr");
	const localized_void_name = translations['piecenames'][typeutil.getRawTypeStr(rawTypes.VOID)!];
	const void_abbreviation = icnconverter.piece_codes_raw[rawTypes.VOID];
	element_void.setAttribute("data-tooltip", `${localized_void_name} (${void_abbreviation})`);

	element_neutralTypes.push(element_void);
	neutralPieces.appendChild(element_void);

	for (let i = 0; i < neutral_svgs.length; i++) {
		const neutral_svg = neutral_svgs[i]!;
		neutral_svg.classList.add("piece");
		const pieceContainer = document.createElement("div");
		
		// Neutral piece tooltips
		if (i % 4 === 3) pieceContainer.classList.add("tooltip-dr");
		else if (i % 4 === 2) pieceContainer.classList.add("tooltip-dl");
		else pieceContainer.classList.add("tooltip-d");
		const localized_piece_name = translations['piecenames'][typeutil.getRawTypeStr(neutralTypes[i]!)!];
		const piece_abbreviation = icnconverter.piece_codes_raw[neutralTypes[i]!];
		const modified_piece_abbreviation = piece_abbreviation.toLowerCase();
		pieceContainer.setAttribute("data-tooltip", `${localized_piece_name} (${modified_piece_abbreviation})`);
		
		pieceContainer.appendChild(neutral_svg);
		element_neutralTypes.push(neutral_svg);
		neutralPieces.appendChild(pieceContainer);
	}
	element_neutralTypesContainer.appendChild(neutralPieces);

	// Re-init tooltip listeners after pushing elements to the document with additional tooltips.
	tooltips.initTooltips();

	initialized = true;
}

function initListeners(): void {
	elements_tools.forEach((element) => {
		element.addEventListener("click", callback_ChangeTool);
	});
	_getActivePieceElements().forEach((element) => {
		element.addEventListener("click", callback_ChangePieceType);
	});
}

function closeListeners(): void {
	elements_tools.forEach((element) => {
		element.removeEventListener("click", callback_ChangeTool);
	});
	_getActivePieceElements().forEach((element) => {
		element.removeEventListener("click", callback_ChangePieceType);
	});
}


function markTool(tool: string): void {
	elements_tools.forEach((element) => {
		const element_tool = element.getAttribute("data-tool");
		if (element_tool === tool) element.classList.add("active");
		else if (element_tool !== 'gamerules') element.classList.remove("active");
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
	element_colorSelect.style.backgroundColor = typeutil.strcolors[newColor];
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

/** Called when users click the "Start local game from position" button. */
function handleStartLocalGame(): void {
	// Show a dialog box to confirm they want to leave the editor
	const result = confirm("Do you want to leave the board editor and start a local game from this position? Changes will be saved."); // PLANNED to save changes
	// Start the local game as requested
	if (result) boardeditor.startLocalGame();
}


// Game Rules Utilities ---------------------------------------------------------------

/** Reads the game rules inserted into the input boxes and updates boardeditor.gameRulesGUIinfo */
function readGameRules() : void {
	// playerToMove
	const playerToMove = element_gamerulesWhite.checked ? 'white' : 'black';

	// enPassant
	let validEnPassantCoords = 0;
	const enPassantX = element_gamerulesEnPassantX.value;
	if (integerRegex.test(enPassantX)) {
		element_gamerulesEnPassantX.classList.remove('invalid-input');
		validEnPassantCoords++;
	} else if (enPassantX === "") {
		element_gamerulesEnPassantX.classList.remove('invalid-input');
	} else {
		element_gamerulesEnPassantX.classList.add('invalid-input');
	}

	const enPassantY = element_gamerulesEnPassantY.value;
	if (integerRegex.test(enPassantY)) {
		element_gamerulesEnPassantY.classList.remove('invalid-input');
		validEnPassantCoords++;
	} else if (enPassantY === "") {
		element_gamerulesEnPassantY.classList.remove('invalid-input');
	} else {
		element_gamerulesEnPassantY.classList.add('invalid-input');
	}

	const enPassant = (validEnPassantCoords === 2 ? {x : BigInt(enPassantX), y: BigInt(enPassantY)} : undefined);

	// moveRule
	let validMoveRuleInputs = 0;
	const moveRuleCurrent = element_gamerulesMoveruleCurrent.value;
	if (integerRegex.test(moveRuleCurrent) && Number(moveRuleCurrent) >= 0) {
		element_gamerulesMoveruleCurrent.classList.remove('invalid-input');
		validMoveRuleInputs++;
	} else if (moveRuleCurrent === "") {
		element_gamerulesMoveruleCurrent.classList.remove('invalid-input');
	} else {
		element_gamerulesMoveruleCurrent.classList.add('invalid-input');
	}

	const moveRuleMax = element_gamerulesMoveruleMax.value;
	if (integerRegex.test(moveRuleMax) && Number(moveRuleMax) > 0) {
		if (validMoveRuleInputs === 1 && Number(moveRuleCurrent) > Number(moveRuleMax)) {
			element_gamerulesMoveruleMax.classList.add('invalid-input');
		} else {
			element_gamerulesMoveruleMax.classList.remove('invalid-input');
			validMoveRuleInputs++;
		}
	} else if (moveRuleMax === "") {
		element_gamerulesMoveruleMax.classList.remove('invalid-input');
	} else {
		element_gamerulesMoveruleMax.classList.add('invalid-input');
	}

	const moveRule = (validMoveRuleInputs === 2 ? {current : Number(moveRuleCurrent), max: Number(moveRuleMax)} : undefined);

	// promotionRanks
	let promotionRanksWhite : bigint[] = [];
	const promotionRanksWhiteInput = element_gamerulesPromotionranksWhite.value;
	if (promotionRanksRegex.test(promotionRanksWhiteInput)) {
		element_gamerulesPromotionranksWhite.classList.remove('invalid-input');
		promotionRanksWhite = [...new Set(promotionRanksWhiteInput.split(',').map(BigInt))];
	} else if (promotionRanksWhiteInput === "") {
		element_gamerulesPromotionranksWhite.classList.remove('invalid-input');
	} else {
		element_gamerulesPromotionranksWhite.classList.add('invalid-input');
	}

	let promotionRanksBlack : bigint[] = [];
	const promotionRanksBlackInput = element_gamerulesPromotionranksBlack.value;
	if (promotionRanksRegex.test(promotionRanksBlackInput)) {
		element_gamerulesPromotionranksBlack.classList.remove('invalid-input');
		promotionRanksBlack = [...new Set(promotionRanksBlackInput.split(',').map(BigInt))];
	} else if (promotionRanksBlackInput === "") {
		element_gamerulesPromotionranksBlack.classList.remove('invalid-input');
	} else {
		element_gamerulesPromotionranksBlack.classList.add('invalid-input');
	}

	const promotionRanks = (promotionRanksWhite.length === 0 && promotionRanksBlack.length === 0) ? undefined : {
		white: promotionRanksWhite.length === 0 ? undefined : promotionRanksWhite,
		black: promotionRanksBlack.length === 0 ? undefined : promotionRanksBlack
	};

	// promotionsAllowed
	let promotionsAllowed: Number[] | undefined = undefined;
	const promotionsAllowedRaw = element_gamerulesPromotionpieces.value;
	if (promotionsAllowedRegex.test(promotionsAllowedRaw)) {
		promotionsAllowed = promotionsAllowedRaw ? [...new Set(promotionsAllowedRaw.split(',').map(raw => Number(icnconverter.piece_codes_raw_inverted[raw.toLowerCase()]) as Number))] : jsutil.deepCopyObject(icnconverter.default_promotions);
		if (promotionsAllowed.includes(NaN)) {
			// One or more piece abbreviations were invalid
			element_gamerulesPromotionpieces.classList.add('invalid-input');
			promotionsAllowed = undefined;
		} else {
			element_gamerulesPromotionpieces.classList.remove('invalid-input');
			if (promotionsAllowed.length === 0) promotionsAllowed = undefined;
		}
	} else if (promotionsAllowedRaw === "") {
		element_gamerulesPromotionpieces.classList.remove('invalid-input');
	} else {
		element_gamerulesPromotionpieces.classList.add('invalid-input');
	}

	// win conditions
	const winConditions : string[] = [];
	if (element_gamerulesCheckmate.checked) winConditions.push("checkmate");
	if (element_gamerulesRoyalcapture.checked) winConditions.push("royalcapture");
	if (element_gamerulesAllroyalscaptured.checked) winConditions.push("allroyalscaptured");
	if (element_gamerulesAllpiecescaptured.checked) winConditions.push("allpiecescaptured");
	if (winConditions.length === 0) winConditions.push(icnconverter.default_win_condition);

	const gameRules : GameRulesGUIinfo = {
		playerToMove,
		enPassant,
		moveRule,
		promotionRanks,
		promotionsAllowed: promotionsAllowed as RawType[],
		winConditions
	};

	// Set en passant state for rendering purposes
	if (enPassant !== undefined) boardeditor.setEnpassantState([enPassant.x, enPassant.y]);
	else boardeditor.setEnpassantState(undefined);

	// Update the promotionlines in the gamefile for rendering purposes
	boardeditor.updatePromotionLines(gameRules.promotionRanks);

	// Upate boardeditor.gamerulesGUIinfo
	boardeditor.updateGamerulesGUIinfo(gameRules);
}

/** Sets the game rules in the game rules GUI according to the supplied GameRulesGUIinfo object*/
function setGameRules(gamerulesGUIinfo : GameRulesGUIinfo) : void {
	if (gamerulesGUIinfo.playerToMove === "white") {
		element_gamerulesWhite.checked = true;
		element_gamerulesBlack.checked = false;
	}
	else {
		element_gamerulesWhite.checked = false;
		element_gamerulesBlack.checked = true;
	}

	if (gamerulesGUIinfo.enPassant !== undefined) {
		element_gamerulesEnPassantX.value = String(gamerulesGUIinfo.enPassant.x);
		element_gamerulesEnPassantY.value = String(gamerulesGUIinfo.enPassant.y);
	} else {
		element_gamerulesEnPassantX.value = "";
		element_gamerulesEnPassantY.value = "";
	}

	if (gamerulesGUIinfo.moveRule !== undefined) {
		element_gamerulesMoveruleCurrent.value = String(gamerulesGUIinfo.moveRule.current);
		element_gamerulesMoveruleMax.value = String(gamerulesGUIinfo.moveRule.max);
	} else {
		element_gamerulesMoveruleCurrent.value = "";
		element_gamerulesMoveruleMax.value = "";
	}

	if (gamerulesGUIinfo.promotionRanks !== undefined) {
		if (gamerulesGUIinfo.promotionRanks.white !== undefined) {
			element_gamerulesPromotionranksWhite.value = gamerulesGUIinfo.promotionRanks.white.map(bigint => String(bigint)).join(",");
		} else element_gamerulesPromotionranksWhite.value = "";
		if (gamerulesGUIinfo.promotionRanks.black !== undefined) {
			element_gamerulesPromotionranksBlack.value = gamerulesGUIinfo.promotionRanks.black.map(bigint => String(bigint)).join(",");
		} else element_gamerulesPromotionranksBlack.value = "";
	} else {
		element_gamerulesPromotionranksWhite.value = "";
		element_gamerulesPromotionranksBlack.value = "";
	}

	if (gamerulesGUIinfo.promotionsAllowed !== undefined) {
		element_gamerulesPromotionpieces.value = gamerulesGUIinfo.promotionsAllowed.map(type => icnconverter.piece_codes_raw[type]).join(",").toUpperCase();
	} else element_gamerulesPromotionpieces.value = "";

	element_gamerulesCheckmate.checked = gamerulesGUIinfo.winConditions.includes("checkmate");
	element_gamerulesRoyalcapture.checked = gamerulesGUIinfo.winConditions.includes("royalcapture");
	element_gamerulesAllroyalscaptured.checked = gamerulesGUIinfo.winConditions.includes("allroyalscaptured");
	element_gamerulesAllpiecescaptured.checked = gamerulesGUIinfo.winConditions.includes("allpiecescaptured");

	// Since we manually set all inputs in this function, they are all valid
	element_gamerulesEnPassantX.classList.remove('invalid-input');
	element_gamerulesEnPassantY.classList.remove('invalid-input');
	element_gamerulesMoveruleCurrent.classList.remove('invalid-input');
	element_gamerulesMoveruleMax.classList.remove('invalid-input');
	element_gamerulesPromotionranksWhite.classList.remove('invalid-input');
	element_gamerulesPromotionranksBlack.classList.remove('invalid-input');
	element_gamerulesPromotionpieces.classList.remove('invalid-input');
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

/** Helper: keep the UI box within boardUI bounds */
function clampGameRulesToBoardUIBounds(): void {
	const parentRect = element_boardUI.getBoundingClientRect();
	const elWidth = element_gamerulesWindow.offsetWidth;
	const elHeight = element_gamerulesWindow.offsetHeight;

	// Compute clamped position
	const newLeft = math.clamp(element_gamerulesWindow.offsetLeft, 0, parentRect.width - elWidth);
	const newTop = math.clamp(element_gamerulesWindow.offsetTop, 0, parentRect.height - elHeight);

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
	const clampedLeft = math.clamp(newLeft, 0, parentRect.width - elWidth);
	const clampedTop = math.clamp(newTop, 0, parentRect.height - elHeight);

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
	element_gamerules.classList.add("active");
	clampGameRulesToBoardUIBounds();
	initGameRulesListeners();
}

function closeGameRules(): void {
	element_gamerulesWindow.classList.add("hidden");
	element_gamerules.classList.remove("active");
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
		case "reset":
			boardeditor.reset();
			return;
		case "clearall":
			boardeditor.clearAll();
			return;
		case "saved-positions":
			statustext.showStatus("Not implemented yet.");
			return;
		case "copy-notation":
			boardeditor.save();
			return;
		case "paste-notation":
			boardeditor.load();
			return;
		case "gamerules":
			toggleGameRules();
			return;
		case "start-game":
			handleStartLocalGame();
			return;
		case "color":
			nextColor();
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
	setGameRules,
};