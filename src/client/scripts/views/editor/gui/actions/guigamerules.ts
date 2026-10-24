// src/client/scripts/views/editor/gui/actions/guigamerules.ts

/**
 * Manages the GUI popup window for the Game Rules of the Board Editor
 */

import type { Edit } from '../../../../../../shared/chess/logic/movepiece.js';
import type { Coords } from '../../../../../../shared/util/coordutil.js';
import type { UnboundedRectangle } from '../../../../../../shared/util/math/bounds.js';
import type { GameruleWinCondition } from '../../../../../../shared/chess/util/winconutil.js';

import bounds from '../../../../../../shared/util/math/bounds.js';
import boardutil from '../../../../../../shared/chess/logic/boardutil.js';
import gamerules from '../../../../../../shared/chess/util/gamerules.js';
import icnposition from '../../../../../../shared/chess/logic/icn/icnposition.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import typeutil, { RawType } from '../../../../../../shared/chess/util/typeutil.js';

import gameslot from '../../../../game/chess/gameslot.js';
import boardeditor from '../../boardeditor.js';
import edithistory from '../../edithistory.js';
import guifloatingwindow from '../guifloatingwindow.js';
import egamerules, { GameRulesGUIinfo } from '../../egamerules.js';

// Elements --------------------------------------------------------------------

/** The button that toggles visibility of the Game Rules popup window. */
const element_gamerules = document.getElementById('gamerules')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('game-rules')!;
const element_header = document.getElementById('game-rules-header')!;
const element_closeButton = document.getElementById('close-rules')!;

const element_white = document.getElementById('rules-white')! as HTMLInputElement;
const element_black = document.getElementById('rules-black')! as HTMLInputElement;
const element_enPassantX = document.getElementById('rules-enpassant-x')! as HTMLInputElement;
const element_enPassantY = document.getElementById('rules-enpassant-y')! as HTMLInputElement;
const element_moveruleCurrent = document.getElementById(
	'rules-moverule-current',
)! as HTMLInputElement;
const element_moveruleMax = document.getElementById('rules-moverule-max')! as HTMLInputElement;
const element_promotionranksWhite = document.getElementById(
	'rules-promotionranks-white',
)! as HTMLInputElement;
const element_promotionranksBlack = document.getElementById(
	'rules-promotionranks-black',
)! as HTMLInputElement;
const element_promotionpieces = document.getElementById(
	'rules-promotionpieces',
)! as HTMLInputElement;
const element_checkmate = document.getElementById('rules-checkmate')! as HTMLInputElement;
const element_royalcapture = document.getElementById('rules-royalcapture')! as HTMLInputElement;
const element_allroyalscaptured = document.getElementById(
	'rules-allroyalscaptured',
)! as HTMLInputElement;
const element_allpiecescaptured = document.getElementById(
	'rules-allpiecescaptured',
)! as HTMLInputElement;
const element_pawnDoublePush = document.getElementById('rules-doublepush')! as HTMLInputElement;
const element_castling = document.getElementById('rules-castling')! as HTMLInputElement;

const element_borderLeft = document.getElementById('rules-border-left')! as HTMLInputElement;
const element_borderRight = document.getElementById('rules-border-right')! as HTMLInputElement;
const element_borderBottom = document.getElementById('rules-border-bottom')! as HTMLInputElement;
const element_borderTop = document.getElementById('rules-border-top')! as HTMLInputElement;

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
	element_castling,
	element_borderLeft,
	element_borderRight,
	element_borderBottom,
	element_borderTop,
];

// Constants -------------------------------------------------------------------

/** Regexes for validating game rules input fields */
const INTEGER_REGEX = new RegExp(String.raw`^${icnposition.INTEGER_SOURCE}$`);
const PROMOTION_RANKS_REGEX = new RegExp(String.raw`^${icnconverter.PROMOTION_RANKS_SOURCE}$`);
const PROMOTION_PIECES_REGEX = new RegExp(String.raw`^${icnconverter.PROMOTIONS_PIECES_SOURCE}$`);

// Create floating window ------------------------------------------------------

const floatingWindow = guifloatingwindow.create({
	windowEl: element_window,
	headerEl: element_header,
	closeButtonEl: element_closeButton,
	inputElList: elements_selectionList,
	onOpen,
	onClose,
});

// Toggling --------------------------------------------------------------------

function onOpen(): void {
	element_gamerules.classList.add('active');
	initGameRulesListeners();
}

function onClose(resetPositioning: boolean): void {
	if (resetPositioning) floatingWindow.resetPositioning();
	element_gamerules.classList.remove('active');
	closeGameRulesListeners();
}

// Gamerules-specific listeners ------------------------------------------------

function initGameRulesListeners(): void {
	elements_selectionList.forEach((el) => {
		el.addEventListener('blur', readGameRules);
	});
}

function closeGameRulesListeners(): void {
	elements_selectionList.forEach((el) => {
		el.removeEventListener('blur', readGameRules);
	});
}

// Reading/Writing Game Rules --------------------------------------------------

/** Reads the game rules inserted into the input boxes and updates egamerules.gameRulesGUIinfo */
function readGameRules(): void {
	// playerToMove
	const playerToMove = element_white.checked ? 'white' : 'black';

	// enPassant
	const enPassantX = element_enPassantX.value;
	const enPassantY = element_enPassantY.value;
	const enPassantXValid = markInputValidity(element_enPassantX, INTEGER_REGEX.test(enPassantX));
	const enPassantYValid = markInputValidity(element_enPassantY, INTEGER_REGEX.test(enPassantY));
	const enPassant: Coords | undefined =
		enPassantXValid && enPassantYValid ? [BigInt(enPassantX), BigInt(enPassantY)] : undefined;

	// moveRule
	const moveRuleCurrent = element_moveruleCurrent.value;
	const moveRuleMax = element_moveruleMax.value;
	const moveRuleCurrentValid = markInputValidity(
		element_moveruleCurrent,
		INTEGER_REGEX.test(moveRuleCurrent) && Number(moveRuleCurrent) >= 0,
	);
	const moveRuleMaxValid = markInputValidity(
		element_moveruleMax,
		INTEGER_REGEX.test(moveRuleMax) &&
			Number(moveRuleMax) > 0 &&
			!(moveRuleCurrentValid && Number(moveRuleCurrent) > Number(moveRuleMax)),
	);
	const moveRule =
		moveRuleCurrentValid && moveRuleMaxValid
			? { current: Number(moveRuleCurrent), max: Number(moveRuleMax) }
			: undefined;

	// promotionRanks
	const promotionRanksWhite = parsePromotionRanks(element_promotionranksWhite.value);
	const promotionRanksBlack = parsePromotionRanks(element_promotionranksBlack.value);
	markInputValidity(element_promotionranksWhite, promotionRanksWhite !== undefined);
	markInputValidity(element_promotionranksBlack, promotionRanksBlack !== undefined);

	const promotionRanks =
		promotionRanksWhite === undefined && promotionRanksBlack === undefined
			? undefined
			: { white: promotionRanksWhite, black: promotionRanksBlack };

	// promotion pieces
	const promotionPieces = parsePromotionPieces(element_promotionpieces.value);
	markInputValidity(element_promotionpieces, promotionPieces !== undefined);

	// win conditions
	const winConditions: GameruleWinCondition[] = [];
	if (element_checkmate.checked) winConditions.push('checkmate');
	if (element_royalcapture.checked) winConditions.push('royalcapture');
	if (element_allroyalscaptured.checked) winConditions.push('allroyalscaptured');
	if (element_allpiecescaptured.checked) winConditions.push('allpiecescaptured');
	if (winConditions.length === 0) winConditions.push(gamerules.DEFAULT_WIN_CONDITION);

	// pawn double push
	let pawnDoublePush: boolean | undefined = undefined;
	if (!element_pawnDoublePush.indeterminate) pawnDoublePush = element_pawnDoublePush.checked;

	// castling with rooks
	let castling: boolean | undefined = undefined;
	if (!element_castling.indeterminate) castling = element_castling.checked;

	// World Border
	let worldBorder: UnboundedRectangle | undefined = undefined;
	const borderInputs = [
		{ el: element_borderLeft, val: element_borderLeft.value },
		{ el: element_borderRight, val: element_borderRight.value },
		{ el: element_borderBottom, val: element_borderBottom.value },
		{ el: element_borderTop, val: element_borderTop.value },
	];

	const gamefile = gameslot.getGamefile()!;

	const anyBorderSet = borderInputs.some((input) => input.val !== '');
	if (!anyBorderSet) {
		// All empty -> Valid (Undefined)
		borderInputs.forEach((input) => input.el.classList.remove('invalid-input'));
		worldBorder = undefined;
	} else {
		// Must be valid integers or empty, and must be ascending
		// Empty represents Infinity or -Infinity
		let leftValid = !element_borderLeft.value || INTEGER_REGEX.test(element_borderLeft.value);
		let rightValid =
			!element_borderRight.value ||
			(INTEGER_REGEX.test(element_borderRight.value) &&
				(!leftValid ||
					!element_borderLeft.value ||
					BigInt(element_borderRight.value) >= BigInt(element_borderLeft.value)));
		let bottomValid =
			!element_borderBottom.value || INTEGER_REGEX.test(element_borderBottom.value);
		let topValid =
			!element_borderTop.value ||
			(INTEGER_REGEX.test(element_borderTop.value) &&
				(!bottomValid ||
					!element_borderBottom.value ||
					BigInt(element_borderTop.value) >= BigInt(element_borderBottom.value)));

		if (leftValid && rightValid && bottomValid && topValid) {
			// Initial values look valid
			worldBorder = {
				left: element_borderLeft.value ? BigInt(element_borderLeft.value) : null,
				right: element_borderRight.value ? BigInt(element_borderRight.value) : null,
				bottom: element_borderBottom.value ? BigInt(element_borderBottom.value) : null,
				top: element_borderTop.value ? BigInt(element_borderTop.value) : null,
			};
			if (
				worldBorder.left === null &&
				worldBorder.right === null &&
				worldBorder.bottom === null &&
				worldBorder.top === null
			)
				worldBorder = undefined;

			// Further check if all pieces are within the border
			if (worldBorder) {
				// Undefined when the board is empty, which no border can exclude a piece from.
				const piecesBox = boardutil.getBoundingBoxOfAllPieces(gamefile.pieces);
				if (piecesBox !== undefined && !bounds.boxContainsBox(worldBorder, piecesBox)) {
					// One or more pieces are outside the border -> All invalid
					leftValid = false;
					rightValid = false;
					bottomValid = false;
					topValid = false;
				}
			}
		}

		// Mark invalid fields as invalid.
		if (!leftValid) element_borderLeft.classList.add('invalid-input');
		else element_borderLeft.classList.remove('invalid-input');
		if (!rightValid) element_borderRight.classList.add('invalid-input');
		else element_borderRight.classList.remove('invalid-input');
		if (!bottomValid) element_borderBottom.classList.add('invalid-input');
		else element_borderBottom.classList.remove('invalid-input');
		if (!topValid) element_borderTop.classList.add('invalid-input');
		else element_borderTop.classList.remove('invalid-input');

		if (!leftValid || !rightValid || !bottomValid || !topValid) worldBorder = undefined;
	}

	const gameRules: GameRulesGUIinfo = {
		playerToMove,
		enPassant,
		moveRule,
		promotionRanks,
		promotionPieces,
		winConditions,
		pawnDoublePush,
		castling,
		worldBorder,
	};

	// Update gamefile properties for rendering purposes and correct legal move calculation
	egamerules.updateGamefileProperties(gameRules);

	const mesh = gameslot.getMesh()!;
	const edit: Edit = { changes: [], state: [] };

	// Fetch previous values before updating, to skip queuing when unchanged and prevent unnecessary edit history bloat.
	const previousPositionDependentGameRules = egamerules.getPositionDependentGameRules();

	// Update pawn double push specialrights of position, only if the value changed
	if (
		gameRules.pawnDoublePush !== undefined &&
		gameRules.pawnDoublePush !== previousPositionDependentGameRules.pawnDoublePush
	)
		egamerules.queueToggleGlobalPawnDoublePush(gameRules.pawnDoublePush, edit);

	// Update castling with rooks specialrights of position, only if the value changed
	if (
		gameRules.castling !== undefined &&
		gameRules.castling !== previousPositionDependentGameRules.castling
	)
		egamerules.queueToggleGlobalCastlingWithRooks(gameRules.castling, edit);

	// Update egamerules.gamerulesGUIinfo
	egamerules.updateGamerulesGUIinfo(gameRules);

	edithistory.runEdit(gamefile, mesh, edit, true);
	edithistory.addEditToHistory(edit);
	// Mark as dirty anyway, since edithistory.addEditToHistory() may early exit
	// if the edit has no changes, but gamerule changes still consider the position dirty.
	boardeditor.markPositionDirty();
}

/** Outlines `input` as invalid if it holds text that isn't `valid`, and returns `valid`. */
function markInputValidity(input: HTMLInputElement, valid: boolean): boolean {
	input.classList.toggle('invalid-input', !valid && input.value !== '');
	return valid;
}

/** The promotion ranks `raw` lists, de-duplicated, or undefined unless it's a valid list. */
function parsePromotionRanks(raw: string): bigint[] | undefined {
	if (!PROMOTION_RANKS_REGEX.test(raw)) return undefined;
	return [...new Set(raw.split(',').map(BigInt))];
}

/** The promotion pieces `raw` lists, or undefined unless it's a valid list without duplicates. */
function parsePromotionPieces(raw: string): RawType[] | undefined {
	if (!PROMOTION_PIECES_REGEX.test(raw)) return undefined;
	const pieces: RawType[] = [];
	for (const code of raw.split(',')) {
		const typeStr: string | undefined = icnposition.PIECE_CODES_INVERTED[code];
		if (typeStr === undefined) return undefined;
		const rawType = typeutil.getRawType(Number(typeStr));
		if (!gamerules.isValidPromotionPiece(rawType) || pieces.includes(rawType)) return undefined;
		pieces.push(rawType);
	}
	return pieces;
}

/** Sets the game rules in the game rules GUI according to the supplied GameRulesGUIinfo object*/
function setGameRules(gamerulesGUIinfo: GameRulesGUIinfo): void {
	if (gamerulesGUIinfo.playerToMove === 'white') {
		element_white.checked = true;
		element_black.checked = false;
	} else {
		element_white.checked = false;
		element_black.checked = true;
	}

	if (gamerulesGUIinfo.enPassant !== undefined) {
		element_enPassantX.value = String(gamerulesGUIinfo.enPassant[0]);
		element_enPassantY.value = String(gamerulesGUIinfo.enPassant[1]);
	} else {
		element_enPassantX.value = '';
		element_enPassantY.value = '';
	}

	if (gamerulesGUIinfo.moveRule !== undefined) {
		element_moveruleCurrent.value = String(gamerulesGUIinfo.moveRule.current);
		element_moveruleMax.value = String(gamerulesGUIinfo.moveRule.max);
	} else {
		element_moveruleCurrent.value = '';
		element_moveruleMax.value = '';
	}

	if (gamerulesGUIinfo.promotionRanks !== undefined) {
		if (gamerulesGUIinfo.promotionRanks.white !== undefined) {
			element_promotionranksWhite.value = gamerulesGUIinfo.promotionRanks.white
				.map((bigint) => String(bigint))
				.join(',');
		} else element_promotionranksWhite.value = '';
		if (gamerulesGUIinfo.promotionRanks.black !== undefined) {
			element_promotionranksBlack.value = gamerulesGUIinfo.promotionRanks.black
				.map((bigint) => String(bigint))
				.join(',');
		} else element_promotionranksBlack.value = '';
	} else {
		element_promotionranksWhite.value = '';
		element_promotionranksBlack.value = '';
	}

	if (gamerulesGUIinfo.promotionPieces !== undefined) {
		element_promotionpieces.value = gamerulesGUIinfo.promotionPieces
			.map((type) => icnposition.PIECE_CODES_RAW[type])
			.join(',')
			.toUpperCase();
	} else element_promotionpieces.value = '';

	element_checkmate.checked = gamerulesGUIinfo.winConditions.includes('checkmate');
	element_royalcapture.checked = gamerulesGUIinfo.winConditions.includes('royalcapture');
	element_allroyalscaptured.checked =
		gamerulesGUIinfo.winConditions.includes('allroyalscaptured');
	element_allpiecescaptured.checked =
		gamerulesGUIinfo.winConditions.includes('allpiecescaptured');

	if (gamerulesGUIinfo.pawnDoublePush === undefined) {
		element_pawnDoublePush.indeterminate = true;
		element_pawnDoublePush.checked = false;
	} else {
		element_pawnDoublePush.indeterminate = false;
		element_pawnDoublePush.checked = gamerulesGUIinfo.pawnDoublePush;
	}

	if (gamerulesGUIinfo.castling === undefined) {
		element_castling.indeterminate = true;
		element_castling.checked = false;
	} else {
		element_castling.indeterminate = false;
		element_castling.checked = gamerulesGUIinfo.castling;
	}

	// World Border
	if (gamerulesGUIinfo.worldBorder !== undefined) {
		element_borderLeft.value = String(gamerulesGUIinfo.worldBorder.left ?? '');
		element_borderRight.value = String(gamerulesGUIinfo.worldBorder.right ?? '');
		element_borderBottom.value = String(gamerulesGUIinfo.worldBorder.bottom ?? '');
		element_borderTop.value = String(gamerulesGUIinfo.worldBorder.top ?? '');
	} else {
		element_borderLeft.value = '';
		element_borderRight.value = '';
		element_borderBottom.value = '';
		element_borderTop.value = '';
	}

	// Since we manually set all inputs in this function, they are all valid
	element_enPassantX.classList.remove('invalid-input');
	element_enPassantY.classList.remove('invalid-input');
	element_moveruleCurrent.classList.remove('invalid-input');
	element_moveruleMax.classList.remove('invalid-input');
	element_promotionranksWhite.classList.remove('invalid-input');
	element_promotionranksBlack.classList.remove('invalid-input');
	element_promotionpieces.classList.remove('invalid-input');

	element_borderLeft.classList.remove('invalid-input');
	element_borderRight.classList.remove('invalid-input');
	element_borderBottom.classList.remove('invalid-input');
	element_borderTop.classList.remove('invalid-input');
}

// Exports ---------------------------------------------------------------------

export default {
	open: floatingWindow.open,
	close: floatingWindow.close,
	isOpen: floatingWindow.isOpen,
	setGameRules,
};
