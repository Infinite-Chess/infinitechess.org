// src/client/scripts/esm/game/gui/boardeditor/guipalette.ts

/**
 * Manages the piece palette in the board editor GUI.
 * Handles palette initialization, piece/color selection, and palette listener wiring.
 */

import type { Player } from '../../../../../../shared/chess/util/typeutil.js';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import typeutil, {
	rawTypes as r,
	players as p,
} from '../../../../../../shared/chess/util/typeutil.js';

import svgcache from '../../../chess/rendering/svgcache.js';
import gameslot from '../../chess/gameslot.js';
import drawingtool from '../../boardeditor/tools/drawingtool.js';
import etoolmanager from '../../boardeditor/tools/etoolmanager.js';

// Elements ---------------------------------------------------------------

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
	r.KING,
	r.QUEEN,
	r.ROOK,
	r.BISHOP,
	r.KNIGHT,
	r.PAWN,
	r.CHANCELLOR,
	r.ARCHBISHOP,
	r.AMAZON,
	r.GUARD,
	r.CENTAUR,
	r.HAWK,
	r.KNIGHTRIDER,
	r.HUYGEN,
	r.ROSE,
	r.CAMEL,
	r.GIRAFFE,
	r.ZEBRA,
	r.ROYALCENTAUR,
	r.ROYALQUEEN,
];

/** Neutral pieces in the order they will appear (except void, which is included manually in initUI by default) */
const neutralTypes = [r.OBSTACLE];

// State -------------------------------------------------------------------

/**
 * Whether the UI has been initialized and all piece svgs appended to the editor menu.
 * Only needs to be done once.
 */
let initialized = false;

// Functions ---------------------------------------------------------------

/**
 * Initializes the palette UI, appending piece SVGs to the editor menu.
 * Only runs once; subsequent calls are no-ops.
 */
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
			else pieceContainer.classList.add('tooltip-d');
			const localized_piece_name =
				// @ts-ignore
				translations.piecenames[typeutil.getRawTypeStr(coloredTypes[i]!)!];
			const piece_abbreviation = icnconverter.piece_codes_raw[coloredTypes[i]!];
			const modified_piece_abbreviation =
				player === p.WHITE
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
			return typeutil.buildType(rawType, p.NEUTRAL);
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
	// @ts-ignore
	const localized_void_name = translations.piecenames[typeutil.getRawTypeStr(r.VOID)!];
	const void_abbreviation = icnconverter.piece_codes_raw[r.VOID];
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
			// @ts-ignore
			translations.piecenames[typeutil.getRawTypeStr(neutralTypes[i]!)!];
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

	initialized = true;
}

/** Adds/removes the 'active' class from the piece svgs in the Palette, changing their style. */
function markPiece(type: number | null): void {
	const placerToolActive = etoolmanager.getTool() === 'placer';

	_getActivePieceElements().forEach((element) => {
		const element_type = Number.parseInt(element.id);
		if (element_type === type && placerToolActive) element.classList.add('active');
		else element.classList.remove('active');
	});
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
	if (typeutil.getColorFromType(drawingtool.getPiece()) !== p.NEUTRAL) {
		const currentPieceType = typeutil.buildType(
			typeutil.getRawType(drawingtool.getPiece()),
			newColor,
		);
		drawingtool.setPiece(currentPieceType);
	}
	markPiece(drawingtool.getPiece());
}

/** Swaps the color of pieces being drawn. */
function nextColor(): void {
	const playersArray = _getPlayersInOrder();
	const currentIndex = playersArray.indexOf(drawingtool.getColor());
	const next = playersArray[(currentIndex + 1) % playersArray.length]!;
	updatePieceColors(next);
}

function initListeners(): void {
	_getActivePieceElements().forEach((element) => {
		element.addEventListener('click', callback_ChangePieceType);
	});
}

function closeListeners(): void {
	_getActivePieceElements().forEach((element) => {
		element.removeEventListener('click', callback_ChangePieceType);
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

function callback_ChangePieceType(e: Event): void {
	const target = e.currentTarget as HTMLElement;
	const currentPieceType = Number.parseInt(target.id);
	if (isNaN(currentPieceType)) return console.error(`Invalid piece type: ${currentPieceType}`);
	drawingtool.setPiece(currentPieceType);
	etoolmanager.setTool('placer');
	markPiece(currentPieceType);
}

// Exports ----------------------------------------------------------------

export default {
	initUI,
	markPiece,
	updatePieceColors,
	nextColor,
	initListeners,
	closeListeners,
};
