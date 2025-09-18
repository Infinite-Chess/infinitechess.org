
/**
 * [ZOOMED IN] This script renders legal moves of:
 * 
 * * Selected piece
 * * All hovered arrows
 */

import type { Color } from '../../../../../../shared/util/math/math.js';
import type { BDCoords } from '../../../../../../shared/chess/util/coordutil.js';
import type { Piece } from '../../../../../../shared/chess/util/boardutil.js';
import type { LegalMoves } from '../../../../../../shared/chess/logic/legalmoves.js';
import type { Vec3 } from '../../../../../../shared/util/math/vectors.js';

import coordutil from '../../../../../../shared/chess/util/coordutil.js';
import arrowlegalmovehighlights from '../arrows/arrowlegalmovehighlights.js';
import specialrighthighlights from './specialrighthighlights.js';
import selection from '../../chess/selection.js';
import frametracker from '../frametracker.js';
import preferences from '../../../components/header/preferences.js';
import typeutil from '../../../../../../shared/chess/util/typeutil.js';
import boardpos from '../boardpos.js';
import piecemodels from '../piecemodels.js';
import legalmoveshapes from '../instancedshapes.js';
import legalmovemodel from './legalmovemodel.js';
import camera from '../camera.js';
import meshes from '../meshes.js';
import { BufferModelInstanced, createModel_Instanced } from '../buffermodel.js';


// Variables -----------------------------------------------------------------------------


/** The current piece selected, if there is one. */
let pieceSelected: Piece | undefined;
/** The current selected piece's legal moves, if there is one. */
let selectedPieceLegalMoves: LegalMoves | undefined;

/**
 * A buffer model that contains the single square
 * highlight immediately underneath the selected piece.
 */
let model_SelectedPiece: BufferModelInstanced | undefined;

/**
 * An model using instanced-rendering for rendering the
 * non-capturing selected piece's legal move highlights
 */
let model_NonCapture: BufferModelInstanced | undefined;
/**
 * An model using instanced-rendering for rendering the
 * capturing selected piece's legal move highlights
 */
let model_Capture: BufferModelInstanced | undefined;


// Init Listeners --------------------------------------------------------------------------------


// When the legal move shape settings is modified, regenerate the model of the highlights
document.addEventListener('legalmove-shape-change', regenerateAll); // Custom Event

// When the theme is changed, erase the models so they
// will be regenerated next render call.
document.addEventListener('theme-change', regenerateAll);


// On Events -------------------------------------------------------------------------------------


/** Call this from selection.js when a piece is selected */
function onPieceSelected(piece: Piece, legalMoves: LegalMoves): void {
	pieceSelected = piece;
	selectedPieceLegalMoves = legalMoves;
	regenSelectedPieceLegalMovesHighlightsModel();
}

function onPieceUnselected(): void {
	pieceSelected = undefined;
	selectedPieceLegalMoves = undefined;

	// Erase models
	model_SelectedPiece = undefined;
	model_NonCapture = undefined;
	model_Capture = undefined;
}


// Rendering --------------------------------------------------------------------------------------


/**
 * Renders the legal move highlights of the selected piece, all hovered arrows,
 * and outlines the box containing all of them.
 */
function render(): void {
	// Sometimes when we are just panning around, our screen bounding box
	// exits the box containing our generating legal move highlights mesh.
	// When that happens, update the box and regenerate the highlights!
	const changeMade = legalmovemodel.updateRenderRange();
	if (changeMade) regenerateAll();

	renderSelectedPieceLegalMoves();
	arrowlegalmovehighlights.renderEachHoveredPieceLegalMoves();
	if (camera.getDebug()) legalmovemodel.renderOutlineofRenderBox();
}

/**
 * Regenerates both the models of our selected piece's legal move highlights,
 * and the models of pieces legal moves of which we're currently hovering over their arrow,
 * and the model of the special rights highlights.
 * 
 * Basically everything that relies on {@link model_Offset}
 */
function regenerateAll(): void {
	regenSelectedPieceLegalMovesHighlightsModel();
	arrowlegalmovehighlights.regenModelsOfHoveredPieces();
	specialrighthighlights.regenModel();
}

// Regenerates the model for all highlighted legal moves.
function regenSelectedPieceLegalMovesHighlightsModel(): void {
	if (!pieceSelected) return;
	// console.log("Regenerating legal moves model..");

	// The model of the selected piece's legal moves
	const selectedPieceColor = typeutil.getColorFromType(pieceSelected!.type);
	const color_options = { isOpponentPiece: selection.isOpponentPieceSelected(), isPremove: selection.arePremoving() };
	const color: Color = preferences.getLegalMoveHighlightColor(color_options);
	const { NonCaptureModel, CaptureModel } = legalmovemodel.generateModelsForPiecesLegalMoveHighlights(pieceSelected!.coords, selectedPieceLegalMoves!, selectedPieceColor, color);
	model_NonCapture = NonCaptureModel;
	model_Capture = CaptureModel;
	
	// The selected piece highlight model
	const vertexData: number[] = legalmoveshapes.getDataLegalMoveSquare(color);
	const coords = pieceSelected!.coords;
	const offsetCoord = coordutil.subtractCoords(coords, legalmovemodel.getOffset());
	const instanceData: bigint[] = [...offsetCoord];
	model_SelectedPiece = createModel_Instanced(vertexData, piecemodels.castBigIntArrayToFloat32(instanceData), "TRIANGLES", true),
	
	frametracker.onVisualChange();
}

/**
 * Renders the current selected piece's legal move mesh,
 * IF a piece is selected.
 * 
 * The mesh should have been pre-calculated.
 */
function renderSelectedPieceLegalMoves(): void {
	if (!pieceSelected) return; // No model to render

	const boardPos: BDCoords = boardpos.getBoardPos();
	// Add the model's offset
	const position = meshes.getModelPosition(boardPos, legalmovemodel.getOffset(), 0);
	const boardScale: number = boardpos.getBoardScaleAsNumber();
	const scale: Vec3 = [boardScale, boardScale, 1];
	
	// Render each of the models using instanced rendering.
	model_SelectedPiece!.render(position, scale);
	model_NonCapture!.render(position, scale);
	model_Capture!.render(position, scale);
}


// Exports -----------------------------------------------------------------------------------


export default {
	// On Events
	onPieceSelected,
	onPieceUnselected,
	// Rendering
	render,
};
