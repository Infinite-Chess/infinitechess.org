// src/client/scripts/esm/game/gui/boardeditor/guiboardeditor.ts

/*
 * Handles the Board Editor GUI
 */

import type { Player } from '../../../../../../shared/chess/util/typeutil.js';
import type { Tool } from '../../boardeditor/boardeditor.js';

// @ts-ignore
import statustext from '../statustext.js';
import typeutil, { rawTypes, players } from '../../../../../../shared/chess/util/typeutil.js';
import gameloader from '../../chess/gameloader.js';
import boardeditor from '../../boardeditor/boardeditor.js';
import svgcache from '../../../chess/rendering/svgcache.js';
import gameslot from '../../chess/gameslot.js';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import tooltips from '../../../util/tooltips.js';
import eactions from '../../boardeditor/eactions.js';
import drawingtool from '../../boardeditor/tools/drawingtool.js';
import guigamerules from './guigamerules.js';
import selectiontool from '../../boardeditor/tools/selection/selectiontool.js';
import stransformations from '../../boardeditor/tools/selection/stransformations.js';

// Elements ---------------------------------------------------------------

const element_menu = document.getElementById('editor-menu')!;

const elements_tools = [
	document.getElementById('normal')!,
	document.getElementById('eraser')!,
	document.getElementById('specialrights')!,
	document.getElementById('selection-tool')!,
];

/** The element containing all selection tool action buttons. */
const element_selectionActions = document.getElementsByClassName(
	'selection-actions',
)[0]! as HTMLElement;
const elements_actions = [
	// Position
	document.getElementById('reset')!,
	document.getElementById('clearall')!,
	document.getElementById('saved-positions')!,
	document.getElementById('copy-notation')!,
	document.getElementById('paste-notation')!,
	document.getElementById('gamerules')!,
	document.getElementById('start-local-game')!,
	document.getElementById('start-engine-game')!,
	// Selection
	document.getElementById('select-all')!,
	document.getElementById('delete-selection')!,
	document.getElementById('copy-selection')!,
	document.getElementById('paste-selection')!,
	document.getElementById('invert-color')!,
	document.getElementById('rotate-left')!,
	document.getElementById('rotate-right')!,
	document.getElementById('flip-horizontal')!,
	document.getElementById('flip-vertical')!,
	// Palette
	document.getElementById('editor-color-select')!,
];
/** These selection action buttons are always enabled. */
const alwaysActiveSelectionActions = [document.getElementById('select-all')!];

const element_typesContainer = document.getElementById('editor-pieceTypes')!;
const element_neutralTypesContainer = document.getElementById('editor-neutralTypes')!;
const element_colorSelect = document.getElementById('editor-color-select')!;
/** A map of each player's element container containing their colored pieces in the Palette. */
const element_playerContainers: Map<Player, Element> = new Map();
const element_playerTypes: Map<Player, Array<Element>> = new Map();
const element_neutralTypes: Array<Element> = [];

// Constants -----------------------------------------------------------

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
const neutralTypes = [rawTypes.OBSTACLE];

// State -------------------------------------------------------------------

/**
 * Whether the UI has been initialized and all piece svgs appended to the editor menu.
 * Only needs to be done once.
 */
let initialized = false;
/** Whether the board editor UI is open. */
let boardEditorOpen = false;

// Functions ---------------------------------------------------------------

// Initialization ---------------------------------------------------------

async function open(): Promise<void> {
	boardEditorOpen = true;
	element_menu.classList.remove('hidden');
	window.dispatchEvent(new CustomEvent('resize')); // the screen and canvas get effectively resized when the vertical board editor bar is toggled
	await gameloader.startBoardEditor();
	initListeners();
}

/** Whether the board editor UI is open. */
function isOpen(): boolean {
	return boardEditorOpen;
}

function close(): void {
	if (!boardEditorOpen) return;
	guigamerules.closeGameRules();
	guigamerules.resetPositioning();
	element_menu.classList.add('hidden');
	window.dispatchEvent(new CustomEvent('resize')); // The screen and canvas get effectively resized when the vertical board editor bar is toggled
	closeListeners();
	boardEditorOpen = false;
}

function initListeners(): void {
	elements_tools.forEach((element) => {
		element.addEventListener('click', callback_ChangeTool);
	});
	elements_actions.forEach((element) => {
		element.addEventListener('click', callback_Action);
	});
	_getActivePieceElements().forEach((element) => {
		element.addEventListener('click', callback_ChangePieceType);
	});
}

function closeListeners(): void {
	elements_tools.forEach((element) => {
		element.removeEventListener('click', callback_ChangeTool);
	});
	elements_actions.forEach((element) => {
		element.removeEventListener('click', callback_Action);
	});
	_getActivePieceElements().forEach((element) => {
		element.removeEventListener('click', callback_ChangePieceType);
	});
}

async function initUI(): Promise<void> {
	if (initialized) return;
	const uniquePlayers = _getPlayersInOrder();

	// Colored pieces
	for (const player of uniquePlayers) {
		const svgs = await svgcache.getSVGElements(
			coloredTypes.map((rawType) => {
				return typeutil.buildType(rawType, player);
			}),
		);
		const playerPieces = document.createElement('div');
		element_playerContainers.set(player, playerPieces);
		element_playerTypes.set(player, svgs);
		playerPieces.classList.add('editor-types');
		if (player !== drawingtool.getColor()) playerPieces.classList.add('hidden');

		// Tooltips (i.e. "Amazon (AM)")
		for (let i = 0; i < svgs.length; i++) {
			const svg = svgs[i]!;
			svg.classList.add('piece');
			const pieceContainer = document.createElement('div');

			if (i % 4 === 0) pieceContainer.classList.add('tooltip-dr');
			else if (i % 4 === 3) pieceContainer.classList.add('tooltip-dl');
			else pieceContainer.classList.add('tooltip-d');
			const localized_piece_name =
				translations['piecenames'][typeutil.getRawTypeStr(coloredTypes[i]!)!];
			const piece_abbreviation = icnconverter.piece_codes_raw[coloredTypes[i]!];
			const modified_piece_abbreviation =
				player === players.WHITE
					? piece_abbreviation.toUpperCase()
					: piece_abbreviation.toLowerCase();
			pieceContainer.setAttribute(
				'data-tooltip',
				`${localized_piece_name} (${modified_piece_abbreviation})`,
			);

			pieceContainer.appendChild(svg);
			playerPieces.appendChild(pieceContainer);
		}
		element_typesContainer.appendChild(playerPieces);
	}

	// Neutral pieces
	const neutral_svgs = await svgcache.getSVGElements(
		neutralTypes.map((rawType) => {
			return typeutil.buildType(rawType, players.NEUTRAL);
		}),
	);
	const neutralPieces = document.createElement('div');
	neutralPieces.classList.add('editor-types');

	const element_void = document.createElement('div');
	element_void.classList.add('piece');
	element_void.classList.add('void');
	element_void.id = '0';

	// Void tooltip
	element_void.classList.add('tooltip-dr');
	const localized_void_name = translations['piecenames'][typeutil.getRawTypeStr(rawTypes.VOID)!];
	const void_abbreviation = icnconverter.piece_codes_raw[rawTypes.VOID];
	element_void.setAttribute('data-tooltip', `${localized_void_name} (${void_abbreviation})`);

	element_neutralTypes.push(element_void);
	neutralPieces.appendChild(element_void);

	for (let i = 0; i < neutral_svgs.length; i++) {
		const neutral_svg = neutral_svgs[i]!;
		neutral_svg.classList.add('piece');
		const pieceContainer = document.createElement('div');

		// Neutral piece tooltips
		if (i % 4 === 3) pieceContainer.classList.add('tooltip-dr');
		else if (i % 4 === 2) pieceContainer.classList.add('tooltip-dl');
		else pieceContainer.classList.add('tooltip-d');
		const localized_piece_name =
			translations['piecenames'][typeutil.getRawTypeStr(neutralTypes[i]!)!];
		const piece_abbreviation = icnconverter.piece_codes_raw[neutralTypes[i]!];
		const modified_piece_abbreviation = piece_abbreviation.toLowerCase();
		pieceContainer.setAttribute(
			'data-tooltip',
			`${localized_piece_name} (${modified_piece_abbreviation})`,
		);

		pieceContainer.appendChild(neutral_svg);
		element_neutralTypes.push(neutral_svg);
		neutralPieces.appendChild(pieceContainer);
	}
	element_neutralTypesContainer.appendChild(neutralPieces);

	// Re-init tooltip listeners after pushing elements to the document with additional tooltips.
	tooltips.initTooltips();

	initialized = true;
}

// Marking Active Tools & Buttons ------------------------------------------------

/** Adds/removes the 'active' class from the tools, changing their style. */
function markTool(tool: Tool): void {
	elements_tools.forEach((element) => {
		const element_tool = element.getAttribute('data-tool');
		if (element_tool === tool) element.classList.add('active');
		else if (element_tool !== 'gamerules') element.classList.remove('active');
	});
}

/** Adds/removes the 'active' class from the piece svgs in the Palette, changing their style. */
function markPiece(type: number | null): void {
	const placerToolActive = boardeditor.getTool() === 'placer';

	_getActivePieceElements().forEach((element) => {
		const element_type = Number.parseInt(element.id);
		if (element_type === type && placerToolActive) element.classList.add('active');
		else element.classList.remove('active');
	});
}

// Un-greys selection action buttons
function onNewSelection(): void {
	// Remove 'disabled' class to all children except those included in the alwaysActiveSelectionActions array
	Array.from(element_selectionActions.children).forEach((child) => {
		(child as HTMLElement).classList.remove('disabled');
	});
}

// Greys out selection action buttons
function onClearSelection(): void {
	// Remove 'disabled' from all children except those included in the alwaysActiveSelectionActions array
	Array.from(element_selectionActions.children).forEach((child) => {
		if (!alwaysActiveSelectionActions.includes(child as HTMLElement)) {
			(child as HTMLElement).classList.add('disabled');
		}
	});
}

// Helper Functions ---------------------------------------------------------

/** Helper Function: Returns an array of players based on the current gamefile's turn order. */
function _getPlayersInOrder(): Player[] {
	const gamefile = gameslot.getGamefile()!;
	// Using a Set removes duplicates before converting to an array
	return [...new Set(gamefile.basegame.gameRules.turnOrder)];
}

/** Helper Function: Returns an array of all piece elements that are currently clickable (active color + neutral). */
function _getActivePieceElements(): Element[] {
	const playerElements = element_playerTypes.get(drawingtool.getColor()) ?? [];
	return [...playerElements, ...element_neutralTypes];
}

// Callbacks ---------------------------------------------------------------

function callback_ChangeTool(e: Event): void {
	const target = e.currentTarget as HTMLElement;
	const tool = target.getAttribute('data-tool');
	if (tool === null) throw new Error('Tool attribute is null');
	boardeditor.setTool(tool);
}

function callback_Action(e: Event): void {
	const target = e.currentTarget as HTMLElement;
	const action = target.getAttribute('data-action');

	// Position/Palette actions...

	switch (action) {
		// Position ---------------------
		case 'reset':
			eactions.reset();
			return;
		case 'clearall':
			eactions.clearAll();
			return;
		case 'saved-positions':
			statustext.showStatus('Not implemented yet.');
			return;
		case 'copy-notation':
			eactions.save();
			return;
		case 'paste-notation':
			eactions.load();
			return;
		case 'gamerules':
			guigamerules.toggleGameRules();
			return;
		case 'start-local-game':
			handleStartLocalGame();
			return;
		case 'start-engine-game':
			handleStartEngineGame();
			return;
		// Selection (buttons that are always active)
		case 'select-all':
			selectiontool.selectAll();
			return;
		// Palette ---------------------
		case 'color':
			nextColor();
			return;
	}

	// Selection actions...

	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	const selectionBox = selectiontool.getSelectionIntBox();
	if (!selectionBox) return; // Might have clicked action button when there was no selection.

	switch (action) {
		case 'delete-selection':
			stransformations.Delete(gamefile, mesh, selectionBox);
			break;
		case 'copy-selection':
			stransformations.Copy(gamefile, selectionBox);
			break;
		case 'paste-selection':
			stransformations.Paste(gamefile, mesh, selectionBox);
			break;
		case 'invert-color':
			stransformations.InvertColor(gamefile, mesh, selectionBox);
			break;
		case 'rotate-left':
			stransformations.RotateLeft(gamefile, mesh, selectionBox);
			break;
		case 'rotate-right':
			stransformations.RotateRight(gamefile, mesh, selectionBox);
			break;
		case 'flip-horizontal':
			stransformations.FlipHorizontal(gamefile, mesh, selectionBox);
			break;
		case 'flip-vertical':
			stransformations.FlipVertical(gamefile, mesh, selectionBox);
			break;
		default:
			console.error(`Unknown action: ${action}`);
	}
}

function callback_ChangePieceType(e: Event): void {
	const target = e.currentTarget as HTMLElement;
	const currentPieceType = Number.parseInt(target.id);
	if (isNaN(currentPieceType)) return console.error(`Invalid piece type: ${currentPieceType}`);
	drawingtool.setPiece(currentPieceType);
	boardeditor.setTool('placer');
	markPiece(currentPieceType);
}

/** Called when users click the "Start local game from position" button. */
function handleStartLocalGame(): void {
	// Show a dialog box to confirm they want to leave the editor
	const result = confirm(
		'Do you want to leave the board editor and start a local game from this position? Changes will be saved.',
	); // PLANNED to save changes
	// Start the local game as requested
	if (result) eactions.startLocalGame();
}

/** Called when users click the "Start engine game from position" button. */
function handleStartEngineGame(): void {
	// Show a dialog box to confirm they want to leave the editor
	const result = confirm(
		'Do you want to leave the board editor and start an engine game from this position? Changes will be saved.',
	); // PLANNED to save changes

	// TODO: Allow the user to configure these values in improved confirmation dialogue
	const TimeControl = '-';
	const youAreColor = players.WHITE;
	const currentEngine = 'hydrochess';

	// TODO: Forbid the user from starting engine games in positions with more than one king per side,
	// since hydrochess does not currently support this

	// TODO: Maybe(?): If the position allows for it, use the checkmate practice engine instead of hydrochess
	// since it is far stronger and faster for single king endgames.
	// Rememember to also set checkmateSelectedID if applicable

	// Start the engine game as requested
	if (result) eactions.startEngineGame(TimeControl, youAreColor, currentEngine);
}

/** Swaps the color of pieces being drawn. */
function nextColor(): void {
	const playersArray = _getPlayersInOrder();
	const currentIndex = playersArray.indexOf(drawingtool.getColor());
	const nextColor = playersArray[(currentIndex + 1) % playersArray.length]!;
	updatePieceColors(nextColor);
}

/** Updates which players element container of their colored piece svgs are visible in the Palette. */
function updatePieceColors(newColor: Player): void {
	if (!initialized) return;

	// Hide all player containers and remove their listeners
	for (const [player, container] of element_playerContainers.entries()) {
		container.classList.add('hidden');
		element_playerTypes.get(player)!.forEach((element) => {
			element.removeEventListener('click', callback_ChangePieceType);
		});
	}

	// Show the correct container and add its listeners
	const newPlayerContainer = element_playerContainers.get(newColor);
	if (newPlayerContainer) {
		newPlayerContainer.classList.remove('hidden');
		element_playerTypes.get(newColor)!.forEach((element) => {
			element.addEventListener('click', callback_ChangePieceType);
		});
	}

	// Update dot color and internal state
	element_colorSelect.style.backgroundColor = typeutil.strcolors[newColor];
	drawingtool.setColor(newColor);

	// Update currentPieceType, if necessary
	if (typeutil.getColorFromType(drawingtool.getPiece()) !== players.NEUTRAL) {
		const currentPieceType = typeutil.buildType(
			typeutil.getRawType(drawingtool.getPiece()),
			newColor,
		);
		drawingtool.setPiece(currentPieceType);
	}
	markPiece(drawingtool.getPiece());
}

// Exports ----------------------------------------------------------------

export default {
	open,
	isOpen,
	close,
	initUI,
	markTool,
	markPiece,
	onNewSelection,
	onClearSelection,
	updatePieceColors,
};
