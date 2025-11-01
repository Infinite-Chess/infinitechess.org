
// src/client/scripts/esm/game/gui/boardeditor/guigamerules.ts

/**
 * Manages the GUI popup window for the Game Rules of the Board Editor
 */

import icnconverter from "../../../../../../shared/chess/logic/icn/icnconverter";
import { RawType } from "../../../../../../shared/chess/util/typeutil";
import jsutil from "../../../../../../shared/util/jsutil";
import math from "../../../../../../shared/util/math/math";
import egamerules, { GameRulesGUIinfo } from "../../boardeditor/egamerules";


// Elements ----------------------------------------------------------


const element_boardUI = document.getElementById("boardUI")!;

/** The button the toggles visibility of the Game Rules popup window. */
const element_gamerules = document.getElementById("gamerules")!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById("game-rules")!;
const element_header = document.getElementById("game-rules-header")!;
const element_closeButton = document.getElementById("close-rules")!;

const element_white = document.getElementById("rules-white")! as HTMLInputElement;
const element_black = document.getElementById("rules-black")! as HTMLInputElement;
const element_enPassantX = document.getElementById("rules-enpassant-x")! as HTMLInputElement;
const element_enPassantY = document.getElementById("rules-enpassant-y")! as HTMLInputElement;
const element_moveruleCurrent = document.getElementById("rules-moverule-current")! as HTMLInputElement;
const element_moveruleMax = document.getElementById("rules-moverule-max")! as HTMLInputElement;
const element_promotionranksWhite = document.getElementById("rules-promotionranks-white")! as HTMLInputElement;
const element_promotionranksBlack = document.getElementById("rules-promotionranks-black")! as HTMLInputElement;
const element_promotionpieces = document.getElementById("rules-promotionpieces")! as HTMLInputElement;
const element_checkmate = document.getElementById("rules-checkmate")! as HTMLInputElement;
const element_royalcapture = document.getElementById("rules-royalcapture")! as HTMLInputElement;
const element_allroyalscaptured = document.getElementById("rules-allroyalscaptured")! as HTMLInputElement;
const element_allpiecescaptured = document.getElementById("rules-allpiecescaptured")! as HTMLInputElement;
const element_pawnDoublePush = document.getElementById('rules-doublepush')! as HTMLInputElement;
const element_castlingWithRooks = document.getElementById('rules-castling')! as HTMLInputElement;

const elements_selectionList: HTMLInputElement[] = [
	element_white,
	element_black,
	element_enPassantX,
	element_enPassantY,
	element_moveruleCurrent,
	element_moveruleMax,
	element_promotionranksWhite,
	element_promotionranksBlack,
	element_promotionpieces,
	element_checkmate,
	element_royalcapture,
	element_allroyalscaptured,
	element_allpiecescaptured,
	element_pawnDoublePush,
	element_castlingWithRooks
];


// Constants --------------------------------------------------------------


/** Regexes for validating game rules input fields */
const integerRegex = new RegExp(String.raw`^${icnconverter.integerSource}$`);
const promotionRanksRegex = new RegExp(String.raw`^${icnconverter.promotionRanksSource}$`);
const promotionsAllowedRegex = new RegExp(String.raw`^${icnconverter.promotionsAllowedSource}$`);


// State ------------------------------------------------------------------


// Window Position & Dragging State

let gameRulesOffsetX = 0;
let gameRulesOffsetY = 0;
let gameRulesIsDragging = false;
let gameRulesSavedPos: { left: number, top: number } | undefined;


// Initialization ----------------------------------------------------------------


function openGameRules(): void {
	if (gameRulesSavedPos !== undefined) {
		element_window.style.left = `${gameRulesSavedPos.left}px`;
		element_window.style.top = `${gameRulesSavedPos.top}px`;
	}
	element_window.classList.remove("hidden");
	element_gamerules.classList.add("active");
	clampGameRulesToBoardUIBounds();
	initGameRulesListeners();
}

function closeGameRules(): void {
	element_window.classList.add("hidden");
	element_gamerules.classList.remove("active");
	closeGameRulesListeners();
}

/** Opens and closes the Game Rules window. */
function toggleGameRules(): void {
	if (element_window.classList.contains("hidden")) openGameRules();
	else closeGameRules();
}

function initGameRulesListeners(): void {
	element_header.addEventListener("mousedown", startGameRulesMouseDrag);
	document.addEventListener("mousemove", duringGameRulesMouseDrag);
	document.addEventListener("mouseup", stopGameRulesDrag);
	element_header.addEventListener("touchstart", startGameRulesTouchDrag, { passive: false });
	document.addEventListener("touchmove", duringGameRulesTouchDrag, { passive: false });
	document.addEventListener("touchend", stopGameRulesDrag, { passive: false });

	window.addEventListener("resize", clampGameRulesToBoardUIBounds);
	element_closeButton.addEventListener("click", closeGameRules);

	elements_selectionList.forEach(el => {
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
	element_header.removeEventListener("mousedown", startGameRulesMouseDrag);
	document.removeEventListener("mousemove", duringGameRulesMouseDrag);
	document.removeEventListener("mouseup", stopGameRulesDrag);
	element_header.removeEventListener("touchstart", startGameRulesTouchDrag);
	document.removeEventListener("touchmove", duringGameRulesTouchDrag);
	document.removeEventListener("touchend", stopGameRulesDrag);

	window.removeEventListener("resize", clampGameRulesToBoardUIBounds);
	element_closeButton.removeEventListener("click", closeGameRules);

	elements_selectionList.forEach(el => {
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

function resetPositioning(): void {
	element_window.style.left = "";
	element_window.style.top = "";
	gameRulesSavedPos = undefined;
}

// Reading/Writing Game Rules -----------------------------------------------


/** Reads the game rules inserted into the input boxes and updates boardeditor.gameRulesGUIinfo */
function readGameRules(): void {
	// playerToMove
	const playerToMove = element_white.checked ? 'white' : 'black';

	// enPassant
	let validEnPassantCoords = 0;
	const enPassantX = element_enPassantX.value;
	if (integerRegex.test(enPassantX)) {
		element_enPassantX.classList.remove('invalid-input');
		validEnPassantCoords++;
	} else if (enPassantX === "") {
		element_enPassantX.classList.remove('invalid-input');
	} else {
		element_enPassantX.classList.add('invalid-input');
	}

	const enPassantY = element_enPassantY.value;
	if (integerRegex.test(enPassantY)) {
		element_enPassantY.classList.remove('invalid-input');
		validEnPassantCoords++;
	} else if (enPassantY === "") {
		element_enPassantY.classList.remove('invalid-input');
	} else {
		element_enPassantY.classList.add('invalid-input');
	}

	const enPassant = (validEnPassantCoords === 2 ? { x: BigInt(enPassantX), y: BigInt(enPassantY) } : undefined);

	// moveRule
	let validMoveRuleInputs = 0;
	const moveRuleCurrent = element_moveruleCurrent.value;
	if (integerRegex.test(moveRuleCurrent) && Number(moveRuleCurrent) >= 0) {
		element_moveruleCurrent.classList.remove('invalid-input');
		validMoveRuleInputs++;
	} else if (moveRuleCurrent === "") {
		element_moveruleCurrent.classList.remove('invalid-input');
	} else {
		element_moveruleCurrent.classList.add('invalid-input');
	}

	const moveRuleMax = element_moveruleMax.value;
	if (integerRegex.test(moveRuleMax) && Number(moveRuleMax) > 0) {
		if (validMoveRuleInputs === 1 && Number(moveRuleCurrent) > Number(moveRuleMax)) {
			element_moveruleMax.classList.add('invalid-input');
		} else {
			element_moveruleMax.classList.remove('invalid-input');
			validMoveRuleInputs++;
		}
	} else if (moveRuleMax === "") {
		element_moveruleMax.classList.remove('invalid-input');
	} else {
		element_moveruleMax.classList.add('invalid-input');
	}

	const moveRule = (validMoveRuleInputs === 2 ? { current: Number(moveRuleCurrent), max: Number(moveRuleMax) } : undefined);

	// promotionRanks
	let promotionRanksWhite: bigint[] = [];
	const promotionRanksWhiteInput = element_promotionranksWhite.value;
	if (promotionRanksRegex.test(promotionRanksWhiteInput)) {
		element_promotionranksWhite.classList.remove('invalid-input');
		promotionRanksWhite = [...new Set(promotionRanksWhiteInput.split(',').map(BigInt))];
	} else if (promotionRanksWhiteInput === "") {
		element_promotionranksWhite.classList.remove('invalid-input');
	} else {
		element_promotionranksWhite.classList.add('invalid-input');
	}

	let promotionRanksBlack: bigint[] = [];
	const promotionRanksBlackInput = element_promotionranksBlack.value;
	if (promotionRanksRegex.test(promotionRanksBlackInput)) {
		element_promotionranksBlack.classList.remove('invalid-input');
		promotionRanksBlack = [...new Set(promotionRanksBlackInput.split(',').map(BigInt))];
	} else if (promotionRanksBlackInput === "") {
		element_promotionranksBlack.classList.remove('invalid-input');
	} else {
		element_promotionranksBlack.classList.add('invalid-input');
	}

	const promotionRanks = (promotionRanksWhite.length === 0 && promotionRanksBlack.length === 0) ? undefined : {
		white: promotionRanksWhite.length === 0 ? undefined : promotionRanksWhite,
		black: promotionRanksBlack.length === 0 ? undefined : promotionRanksBlack
	};

	// promotionsAllowed
	let promotionsAllowed: Number[] | undefined = undefined;
	const promotionsAllowedRaw = element_promotionpieces.value;
	if (promotionsAllowedRegex.test(promotionsAllowedRaw)) {
		promotionsAllowed = promotionsAllowedRaw ? [...new Set(promotionsAllowedRaw.split(',').map(raw => Number(icnconverter.piece_codes_raw_inverted[raw.toLowerCase()]) as Number))] : jsutil.deepCopyObject(icnconverter.default_promotions);
		if (promotionsAllowed.includes(NaN)) {
			// One or more piece abbreviations were invalid
			element_promotionpieces.classList.add('invalid-input');
			promotionsAllowed = undefined;
		} else {
			element_promotionpieces.classList.remove('invalid-input');
			if (promotionsAllowed.length === 0) promotionsAllowed = undefined;
		}
	} else if (promotionsAllowedRaw === "") {
		element_promotionpieces.classList.remove('invalid-input');
	} else {
		element_promotionpieces.classList.add('invalid-input');
	}

	// win conditions
	const winConditions: string[] = [];
	if (element_checkmate.checked) winConditions.push("checkmate");
	if (element_royalcapture.checked) winConditions.push("royalcapture");
	if (element_allroyalscaptured.checked) winConditions.push("allroyalscaptured");
	if (element_allpiecescaptured.checked) winConditions.push("allpiecescaptured");
	if (winConditions.length === 0) winConditions.push(icnconverter.default_win_condition);

	const gameRules: GameRulesGUIinfo = {
		playerToMove,
		enPassant,
		moveRule,
		promotionRanks,
		promotionsAllowed: promotionsAllowed as RawType[],
		winConditions
	};

	// Set en passant state for rendering purposes
	if (enPassant !== undefined) egamerules.setEnpassantState([enPassant.x, enPassant.y]);
	else egamerules.setEnpassantState(undefined);

	// Update the promotionlines in the gamefile for rendering purposes
	egamerules.updatePromotionLines(gameRules.promotionRanks);

	// Upate boardeditor.gamerulesGUIinfo
	egamerules.updateGamerulesGUIinfo(gameRules);
}

/** Sets the game rules in the game rules GUI according to the supplied GameRulesGUIinfo object*/
function setGameRules(gamerulesGUIinfo: GameRulesGUIinfo): void {
	if (gamerulesGUIinfo.playerToMove === "white") {
		element_white.checked = true;
		element_black.checked = false;
	}
	else {
		element_white.checked = false;
		element_black.checked = true;
	}

	if (gamerulesGUIinfo.enPassant !== undefined) {
		element_enPassantX.value = String(gamerulesGUIinfo.enPassant.x);
		element_enPassantY.value = String(gamerulesGUIinfo.enPassant.y);
	} else {
		element_enPassantX.value = "";
		element_enPassantY.value = "";
	}

	if (gamerulesGUIinfo.moveRule !== undefined) {
		element_moveruleCurrent.value = String(gamerulesGUIinfo.moveRule.current);
		element_moveruleMax.value = String(gamerulesGUIinfo.moveRule.max);
	} else {
		element_moveruleCurrent.value = "";
		element_moveruleMax.value = "";
	}

	if (gamerulesGUIinfo.promotionRanks !== undefined) {
		if (gamerulesGUIinfo.promotionRanks.white !== undefined) {
			element_promotionranksWhite.value = gamerulesGUIinfo.promotionRanks.white.map(bigint => String(bigint)).join(",");
		} else element_promotionranksWhite.value = "";
		if (gamerulesGUIinfo.promotionRanks.black !== undefined) {
			element_promotionranksBlack.value = gamerulesGUIinfo.promotionRanks.black.map(bigint => String(bigint)).join(",");
		} else element_promotionranksBlack.value = "";
	} else {
		element_promotionranksWhite.value = "";
		element_promotionranksBlack.value = "";
	}

	if (gamerulesGUIinfo.promotionsAllowed !== undefined) {
		element_promotionpieces.value = gamerulesGUIinfo.promotionsAllowed.map(type => icnconverter.piece_codes_raw[type]).join(",").toUpperCase();
	} else element_promotionpieces.value = "";

	element_checkmate.checked = gamerulesGUIinfo.winConditions.includes("checkmate");
	element_royalcapture.checked = gamerulesGUIinfo.winConditions.includes("royalcapture");
	element_allroyalscaptured.checked = gamerulesGUIinfo.winConditions.includes("allroyalscaptured");
	element_allpiecescaptured.checked = gamerulesGUIinfo.winConditions.includes("allpiecescaptured");

	// Since we manually set all inputs in this function, they are all valid
	element_enPassantX.classList.remove('invalid-input');
	element_enPassantY.classList.remove('invalid-input');
	element_moveruleCurrent.classList.remove('invalid-input');
	element_moveruleMax.classList.remove('invalid-input');
	element_promotionranksWhite.classList.remove('invalid-input');
	element_promotionranksBlack.classList.remove('invalid-input');
	element_promotionpieces.classList.remove('invalid-input');
}


// Utilities ------------------------------------------------------------


/** Deselects the input boxes when pressing Enter */
function blurOnEnter(e: KeyboardEvent): void {
	if (e.key === 'Enter') {
		(e.target as HTMLInputElement).blur();
	}
}

/** Deselects the input boxes when clicking somewhere outside the game rules UI */
function blurOnClickorTouchOutside(e: MouseEvent | TouchEvent): void {
	if (!element_window.contains(e.target as Node)) {
		const activeEl = document.activeElement as HTMLInputElement;
		if (activeEl && elements_selectionList.includes(activeEl) && activeEl.tagName === 'INPUT') activeEl.blur();
	}
}

/** Helper: keep the UI box within boardUI bounds */
function clampGameRulesToBoardUIBounds(): void {
	const parentRect = element_boardUI.getBoundingClientRect();
	const elWidth = element_window.offsetWidth;
	const elHeight = element_window.offsetHeight;

	// Compute clamped position
	const newLeft = math.clamp(element_window.offsetLeft, 0, parentRect.width - elWidth);
	const newTop = math.clamp(element_window.offsetTop, 0, parentRect.height - elHeight);

	element_window.style.left = `${newLeft}px`;
	element_window.style.top = `${newTop}px`;

	// Save new position
	gameRulesSavedPos = { left: newLeft, top: newTop };
}


// Dragging ---------------------------------------------------------------


/** Start dragging */
function startGameRulesDrag(coordx: number, coordy: number): void {
	gameRulesIsDragging = true;
	gameRulesOffsetX = coordx - element_window.offsetLeft;
	gameRulesOffsetY = coordy - element_window.offsetTop;
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

/** Stop dragging */
function stopGameRulesDrag(): void {
	if (gameRulesIsDragging) {
		clampGameRulesToBoardUIBounds();
	}
	gameRulesIsDragging = false;
	document.body.style.userSelect = "auto";
}

/** During drag */
function duringGameRulesDrag(coordx: number, coordy: number): void {
	if (!gameRulesIsDragging) return;

	const parentRect = element_boardUI.getBoundingClientRect();
	const elWidth = element_window.offsetWidth;
	const elHeight = element_window.offsetHeight;

	// Compute desired new position
	const newLeft = coordx - gameRulesOffsetX;
	const newTop = coordy - gameRulesOffsetY;

	// Clamp within parent container
	const clampedLeft = math.clamp(newLeft, 0, parentRect.width - elWidth);
	const clampedTop = math.clamp(newTop, 0, parentRect.height - elHeight);

	element_window.style.left = `${clampedLeft}px`;
	element_window.style.top = `${clampedTop}px`;

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


// Exports -----------------------------------------------------------------


export default {
	closeGameRules,
	toggleGameRules,
	resetPositioning,
	setGameRules,
};