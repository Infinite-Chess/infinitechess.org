
/**
 * This script calculates and renders the arrow indicators
 * on the sides of the screen, pointing to pieces off-screen
 * that are in that direction.
 * 
 * If the pictues are clicked, we initiate a teleport to that piece.
 */

import type { BufferModel, BufferModelInstanced } from './buffermodel.js';
import type { Coords, CoordsKey } from '../../chess/util/coordutil.js';
import type { LegalMoves } from '../chess/selection.js';
import type { Color } from '../../chess/util/colorutil.js';
import type { Corner, Vec2 } from '../../util/math.js';
import type { LinesByStep, PieceLinesByKey } from '../../chess/logic/organizedlines.js';

import spritesheet from './spritesheet.js';
import gameslot from '../chess/gameslot.js';
import guinavigation from '../gui/guinavigation.js';
import guigameinfo from '../gui/guigameinfo.js';
import { createModel } from './buffermodel.js';
import colorutil from '../../chess/util/colorutil.js';
import jsutil from '../../util/jsutil.js';
import coordutil from '../../chess/util/coordutil.js';
import math from '../../util/math.js';
import organizedlines from '../../chess/logic/organizedlines.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import legalmovehighlights from './highlights/legalmovehighlights.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import bufferdata from './bufferdata.js';
// @ts-ignore
import legalmoves from '../../chess/logic/legalmoves.js';
// @ts-ignore
import input from '../input.js';
// @ts-ignore
import perspective from './perspective.js';
// @ts-ignore
import transition from './transition.js';
// @ts-ignore
import movement from './movement.js';
// @ts-ignore
import options from './options.js';
// @ts-ignore
import selection from '../chess/selection.js';
// @ts-ignore
import camera from './camera.js';
// @ts-ignore
import board from './board.js';
// @ts-ignore
import moveutil from '../../chess/util/moveutil.js';
// @ts-ignore
import space from '../misc/space.js';
import { Piece } from '../../chess/logic/boardchanges.js';
import frametracker from './frametracker.js';


// Type Definitions --------------------------------------------------------------------


/** Contains the legal moves, and other info, about the piece an arrow indicator is pointing to. */
interface ArrowLegalMoves {
	/** The Piece this arrow is pointing to, including its coords & type. */
	piece: Piece,
	/** The calculated legal moves of the piece. */
	legalMoves: LegalMoves,
	/** The buffer model for rendering the non-capturing legal moves of the piece. */
	model_NonCapture: BufferModelInstanced,
	/** The buffer model for rendering the capturing legal moves of the piece. */
	model_Capture: BufferModelInstanced,
	/** The [r,b,g,a] values these legal move highlights should be rendered.
	 * Depends on whether the piece is ours, a premove, or an opponent's piece. */
	color: Color
}


// Variables ----------------------------------------------------------------------------


/** The width of the mini images of the pieces and arrows, in percentage of 1 tile. */
const width: number = 0.65;
/** How much padding to include between the mini image of the pieces & arrows and the edge of the screen, in percentage of 1 tile. */
const sidePadding: number = 0.15;
/** Opacity of the mini images of the pieces and arrows. */
const opacity: number = 0.6;
/** When we're zoomed out far enough that 1 tile is as wide as this many virtual pixels, we don't render the arrow indicators. */
const renderZoomLimitVirtualPixels: number = 10; // virtual pixels. Default: 14

/** The distance in perspective mode to render the arrow indicators from the camera.
 * We need this because there is no normal edge of the screen like in 2D mode. */
const perspectiveDist = 17;

/** The buffer model of the piece mini images on
 * the edge of the screen. **Doesn't include** the little arrows. */
let modelPictures: BufferModel | undefined;

/** The buffer model of the little arrows on
 * the edge of the screen next to the mini piece images. */
let modelArrows: BufferModel | undefined;

/**
 * The mode the arrow indicators on the edges of the screen is currently in.
 * 0 = Off,
 * 1 = Defense,
 * 2 = All (orthogonals & diagonals)
 * 3 = All (including hippogonals, only used in variants using hippogonals)
 */
let mode: 0 | 1 | 2 | 3 = 1;

/** Whether our mouse is currently hovering over one arrow indicator.
 * Could be used to cancel other mouse events. */
let hovering: boolean = false;

/**
 * An array storing the LegalMoves, model and other info, for rendering the legal move highlights
 * of piece arrow indicators currently being hovered over!
 */
const hoveredArrows: ArrowLegalMoves[] = [];


// Functions ------------------------------------------------------------------------------


/**
 * Returns the mode the arrow indicators on the edges of the screen is currently in.
 * @returns {number} The current mode
 */
function getMode(): typeof mode {
	return mode;
}

/**
 * Sets the rendering mode of the arrow indicators on the edges of the screen.
 */
function setMode(value: typeof mode) {
	mode = value;
	if (mode === 0) hoveredArrows.length = 0; // Erase, otherwise their legal move highlights continue to render
}

function toggleArrows() {
	frametracker.onVisualChange();
	mode++;
	const gamefile = gameslot.getGamefile();
	const hippogonalsPresent = gamefile !== undefined ? gamefile.startSnapshot.hippogonalsPresent : false;
	const cap = hippogonalsPresent ? 3 : 2;
	if (mode > cap) mode = 0; // Wrap back to zero
}

/**
 * Returns *true* if the mouse is hovering over any one arrow indicator.
 */
function isMouseHovering(): boolean {
	return hovering;
}


/**
 * Calculates what arrows should be visible this frame.
 * 
 * Needs to be done every frame, even if the mouse isn't moved,
 * since actions such as rewinding/forwarding may change them,
 * or board velocity.
 */
function update() {
	if (mode === 0) return;

	// generate model
	modelPictures = undefined;

	// Are we zoomed in enough?
	const scaleWhenAtLimit: number = ((camera.getScreenBoundingBox(false).right * 2) / camera.canvas.width) * window.devicePixelRatio * renderZoomLimitVirtualPixels;
	if (movement.getBoardScale() < scaleWhenAtLimit) return;

	modelArrows = undefined;
	const data: number[] = [];
	const dataArrows: number[] = [];

	hovering = false;

	// How do we find out what pieces are off-screen?

	// If any part of the square is on screen, this box rounds outward to contain it.
	const boundingBoxInt = perspective.getEnabled() ? board.generatePerspectiveBoundingBox(perspectiveDist + 1) : board.gboundingBox(); 
	// Same as above, but doesn't round
	const boundingBoxFloat = perspective.getEnabled() ? board.generatePerspectiveBoundingBox(perspectiveDist) : board.gboundingBoxFloat(); 

	const slideArrows: { [vec2Key: CoordsKey]: { [lineKey: string]: { l?: Piece, r?: Piece } } } = {};

	let headerPad = perspective.getEnabled() ? 0 : space.convertPixelsToWorldSpace_Virtual(guinavigation.getHeightOfNavBar());
	let footerPad = perspective.getEnabled() ? 0 : space.convertPixelsToWorldSpace_Virtual(guigameinfo.getHeightOfGameInfoBar());
	// Reverse header and footer pads if we're viewing blacks side
	if (!perspective.getEnabled() && !gameslot.isLoadedGameViewingWhitePerspective()) {
		const a = headerPad;
		headerPad = footerPad;
		footerPad = a;
	}

	// Apply the padding to the bounding box
	if (!perspective.getEnabled()) {
		boundingBoxFloat.top -= space.convertWorldSpaceToGrid(headerPad);
		boundingBoxFloat.bottom += space.convertWorldSpaceToGrid(footerPad);
	}

	const gamefile = gameslot.getGamefile()!;
	const slidesPossible = gamefile.startSnapshot.slidingPossible;

	for (const slideDir of slidesPossible) {
		const perpendicularSlideDir: Vec2 = [-slideDir[1], slideDir[0]]; // Rotates left 90deg
        
		const boardCornerLeft_AB: Corner = math.getAABBCornerOfLine(perpendicularSlideDir,true);
		const boardCornerRight_AB: Corner = math.getAABBCornerOfLine(perpendicularSlideDir,false);

		const boardCornerLeft: Coords = math.getCornerOfBoundingBox(boundingBoxFloat,boardCornerLeft_AB);
		const boardCornerRight: Coords = math.getCornerOfBoundingBox(boundingBoxFloat,boardCornerRight_AB);

		const boardSlidesRight: number = organizedlines.getCFromLine(slideDir, boardCornerLeft);
		const boardSlidesLeft: number = organizedlines.getCFromLine(slideDir, boardCornerRight);

		const boardSlidesStart = Math.min(boardSlidesLeft, boardSlidesRight);
		const boardSlidesEnd = Math.max(boardSlidesLeft, boardSlidesRight);
		// For all our lines in the game with this slope...
		const slideDirKey = coordutil.getKeyFromCoords(slideDir);
		for (const [key,organizedLine] of Object.entries(gamefile.piecesOrganizedByLines[slideDirKey])) {
			const [X,C] = key.split("|").map(Number);
			if (boardSlidesStart > X || boardSlidesEnd < X) continue; // Next line, this one is off-screen
			const pieces = calcPiecesOffScreen(slideDir, organizedLine);

			if (jsutil.isEmpty(pieces)) continue; // This line of pieces is empty

			if (!slideArrows[slideDirKey]) slideArrows[slideDirKey] = {};
            
			slideArrows[slideDirKey][key] = pieces;
		}
	}

	function calcPiecesOffScreen(slideDir: Vec2, organizedline: Array<Piece>): { l?: Piece, r?: Piece } {

		const rightCorner = math.getCornerOfBoundingBox(boundingBoxFloat, math.getAABBCornerOfLine(slideDir,false));

		let left: Piece | undefined;
		let right: Piece | undefined;
		for (const piece of organizedline) {
			if (!piece.coords) continue; // Undefined placeholder
            
			// Is the piece off-screen?

			if (math.boxContainsSquare(boundingBoxInt, piece.coords)) continue; // On-screen, no arrow needed
            
			const x = piece.coords[0];
			const y = piece.coords[1];
			const axis = slideDir[0] === 0 ? 1 : 0;

			const rightSide = x > boundingBoxFloat.right || y > rightCorner[1] === (rightCorner[1] === boundingBoxFloat.top);
			if (rightSide) {
				if (right === undefined) right = piece;
				else if (piece.coords[axis] < right.coords[axis]) right = piece;
			} else {
				if (left === undefined) left = piece;
				else if (piece.coords[axis] > left.coords[axis]) left = piece;
			}
		}

		return { l: left, r: right };
	}

	// If we are in only-show-attackers mode
	removeUnnecessaryArrows(slideArrows);

	// Calc the model data...

	// What will be the world-space width of our ghost images?
	const boardScale = movement.getBoardScale();
	const worldWidth = width * boardScale;
	let padding = (worldWidth / 2) + sidePadding * boardScale;
	const cpadding = padding / boardScale;
	if (perspective.getEnabled()) padding = 0;

	boundingBoxFloat.top -= cpadding;
	boundingBoxFloat.right -= cpadding;
	boundingBoxFloat.bottom += cpadding;
	boundingBoxFloat.left += cpadding;

	/** A running list of of piece arrows being hovered over this frame */
	const piecesHoveringOverThisFrame: Array<{ type: string, coords: Coords, dir: Vec2 }> = [];

	for (const strline in slideArrows) {
		const line = coordutil.getCoordsFromKey(strline as CoordsKey);
		iterateThroughLines(slideArrows[strline], line);
	}

	function iterateThroughLines(lines: { [lineKey: string]: { l?: Piece; r?: Piece } }, direction: Vec2) {
		for (const lineKey in lines) {
			for (const side in lines[lineKey]) { // 'r' | 'l'
				const piece: Piece = lines[lineKey][side]; //
				const intersect = Number(lineKey.split("|")[0]); // 'X|C' => X (the nearest X on or after y=0 that the line intersects)
				if (piece.type === 'voidsN') continue;
				const isLeft = side === "l";
				const corner: Corner = math.getAABBCornerOfLine(direction, isLeft);
				const renderCoords = math.getLineIntersectionEntryPoint(direction[0], direction[1], intersect, boundingBoxFloat, corner);
				if (!renderCoords) continue;
				const arrowDirection: Vec2 = isLeft ? [-direction[0],-direction[1]] : direction;
				concatData(renderCoords, piece.type, corner, worldWidth, 0, piece.coords, arrowDirection, piecesHoveringOverThisFrame);
			}
		}
	}

	// Do not render line highlights upon arrow hover, when game is rewinded,
	// since calculating their legal moves means overwriting game's move history.
	if (!moveutil.areWeViewingLatestMove(gamefile)) piecesHoveringOverThisFrame.length = 0;

	// Iterate through all pieces in piecesHoveredOver, if they aren't being
	// hovered over anymore, delete them. Stop rendering their legal moves. 
	const piecesHoveringOverThisFrame_Keys = piecesHoveringOverThisFrame.map(rider => coordutil.getKeyFromCoords(rider.coords)); // ['1,2', '3,4']
	for (const key of Object.keys(hoveredArrows)) {
		if (piecesHoveringOverThisFrame_Keys.includes(key as CoordsKey)) continue; // Still being hovered over
		delete hoveredArrows[key]; // No longer being hovered over
	}

	if (data.length === 0) return; // No visible arrows, don't generate the model

	for (const pieceHovered of piecesHoveringOverThisFrame) {
		onPieceIndicatorHover(pieceHovered.type, pieceHovered.coords, pieceHovered.dir); // Generate their legal moves and highlight model
	}
    
	modelPictures = createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
	modelArrows = createModel(dataArrows, 2, "TRIANGLES", true);
}

/**
 * Removes asrrows based on the mode.
 * mode == 1 Removes arrows to pieces that cant slide in that direction
 * mode == 2 Like mode 1 but will keep any arrows in directions that a selected piece can move
 * Will not return anything as it alters the object it is given.
 * @param {Object} arrows 
 */
function removeUnnecessaryArrows(arrows) {
	if (mode === 0) return;

	const gamefile = gameslot.getGamefile();
	let attacklines = [];
	attack: {
		if (mode !== 2) break attack;
		const piece = selection.getPieceSelected();
		if (!piece) break attack;
		const slidingMoveset = legalmoves.getPieceMoveset(gamefile, piece.type).sliding;
		if (!slidingMoveset) break attack;
		attacklines = Object.keys(slidingMoveset);
	}
	for (const strline in arrows) {
		if (attacklines.includes(strline)) continue;
		removeTypesWithIncorrectMoveset(arrows[strline],strline);
		if (jsutil.isEmpty(arrows[strline])) delete arrows[strline];
	}

	function removeTypesWithIncorrectMoveset(object, direction) { // horzRight, vertical/diagonalUp
		for (const key in object) {
			// { type, coords }
			for (const side in object[key]) {
				const type = object[key][side].type;
				if (!doesTypeHaveMoveset(gamefile, type, direction)) delete object[key][side];
			}
			if (jsutil.isEmpty(object[key])) delete object[key];
		}
	}

	function doesTypeHaveMoveset(gamefile, type, direction) {
		const moveset = legalmoves.getPieceMoveset(gamefile, type);
		if (!moveset.sliding) return false;
		return moveset.sliding[direction] !== undefined;
	}
}

function concatData(renderCoords, type, paddingDir, worldWidth, padding, pieceCoords, direction, piecesHoveringOverThisFrame) {
	const worldHalfWidth = worldWidth / 2;

	// Convert to world-space
	const worldCoords = space.convertCoordToWorldSpace(renderCoords);

	const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
	const { texleft, texbottom, texright, textop } = bufferdata.getTexDataOfType(type, rotation);

	const xPad = paddingDir.includes('right') ? -padding
                : paddingDir.includes('left')  ?  padding
                : 0;

	const yPad = paddingDir.includes('top')          ? -padding
                : paddingDir.includes('bottom')       ?  padding
                : 0;

	worldCoords[0] += xPad;
	worldCoords[1] += yPad;

	const startX = worldCoords[0] - worldHalfWidth;   
	const startY = worldCoords[1] - worldHalfWidth;
	const endX = startX + worldWidth;
	const endY = startY + worldWidth;

	// Color
	const { r, g, b } = options.getColorOfType(type);
	let thisOpacity = opacity;

	// Opacity changing with distance
	// let maxAxisDist = math.chebyshevDistance(movement.getBoardPos(), pieceCoords) - 8;
	// opacity = Math.sin(maxAxisDist / 40) * 0.5

	// Are we hovering over? If so, opacity needs to be 100%
	const mouseWorldLocation = input.getMouseWorldLocation(); // [x,y]
	const mouseWorldX = input.getTouchClickedWorld() ? input.getTouchClickedWorld()[0] : mouseWorldLocation[0];
	const mouseWorldY = input.getTouchClickedWorld() ? input.getTouchClickedWorld()[1] : mouseWorldLocation[1];
	if (mouseWorldX > startX && mouseWorldX < endX && mouseWorldY > startY && mouseWorldY < endY) { // Mouse is hovering over
		piecesHoveringOverThisFrame.push({ type, coords: pieceCoords, dir: direction });
		thisOpacity = 1;
		hovering = true;
		// If we also clicked, then teleport!
		if (input.isMouseDown_Left() || input.getTouchClicked()) {
			const startCoords = movement.getBoardPos();
			let telCoords;
			if      (paddingDir === 'right' || paddingDir === 'left') telCoords = [pieceCoords[0], startCoords[1]];
			else if (paddingDir === 'top' || paddingDir === 'bottom') telCoords = [startCoords[0], pieceCoords[1]];
			else                                                      telCoords = [pieceCoords[0], pieceCoords[1]];
			transition.panTel(startCoords, telCoords);
			if (input.isMouseDown_Left()) input.removeMouseDown_Left();
		}
	}

	const thisData = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texleft, texbottom, texright, textop, r, g, b, thisOpacity);

	data.push(...thisData);

	// Next append the data of the little arrow!

	const dist = worldHalfWidth * 1;
	const size = 0.3 * worldHalfWidth;
	const points = [
        [dist, -size],
        [dist, +size],
        [dist + size, 0]
    ];

	const angle = Math.atan2(direction[1], direction[0]);
	const ad = applyTransform(points, angle, worldCoords);

	for (let i = 0; i < ad.length; i++) {
		const thisPoint = ad[i];
		//                          x             y                color
		dataArrows.push(thisPoint[0], thisPoint[1], 0,0,0, thisOpacity );
	}
}

function applyTransform(points, rotation, translation) {
	// convert rotation angle to radians
    
	// apply rotation matrix and translation vector to each point
	const transformedPoints = points.map(point => {
		const cos = Math.cos(rotation);
		const sin = Math.sin(rotation);
		const xRot = point[0] * cos - point[1] * sin;
		const yRot = point[0] * sin + point[1] * cos;
		const xTrans = xRot + translation[0];
		const yTrans = yRot + translation[1];
		return [xTrans, yTrans];
	});
    
	// return transformed points as an array of length-2 arrays
	return transformedPoints;
}

function renderThem() {
	if (mode === 0) return;
	if (!modelPictures) return;

	// render.renderModel(model, undefined, undefined, "TRIANGLES", spritesheet.getSpritesheet())
	modelPictures.render();
	// render.renderModel(modelArrows, undefined, undefined, "TRIANGLES")
	modelArrows.render();
}

/**
 * Call when a piece's arrow is hovered over.
 * Calculates their legal moves and model for rendering them.
 * @param {string} type - The type of piece of this arrow indicator
 * @param {number[]} pieceCoords - The coordinates of the piece the arrow is pointing to
 * @param {number[]} direction - The direction/line the arrow is pointing: `[dx,dy]`
 */
function onPieceIndicatorHover(type, pieceCoords, direction) {
	// Check if their legal moves and mesh have already been stored
	const key = coordutil.getKeyFromCoords(pieceCoords);
	if (key in hoveredArrows) return console.error("Moves alreadfy stored"); // Legal moves and mesh already calculated.

	// Calculate their legal moves and mesh!
	const gamefile = gameslot.getGamefile();
	const thisRider = gamefileutility.getPieceAtCoords(gamefile, pieceCoords);
	const thisPieceLegalMoves = legalmoves.calculate(gamefile, thisRider);

	// Calculate the mesh...

	// Determine what color the legal move highlights should be...
	const pieceColor = colorutil.getPieceColorFromType(type);
	const opponentColor = onlinegame.areInOnlineGame() ? colorutil.getOppositeColor(onlinegame.getOurColor()) : colorutil.getOppositeColor(gamefile.whosTurn);
	const isOpponentPiece = pieceColor === opponentColor;
	const isOurTurn = gamefile.whosTurn === pieceColor;
	const color = options.getLegalMoveHighlightColor({ isOpponentPiece, isPremove: !isOurTurn });

	const { NonCaptureModel, CaptureModel } = legalmovehighlights.generateModelsForPiecesLegalMoveHighlights(pieceCoords, thisPieceLegalMoves, color);
	// Store both these objects inside piecesHoveredOver
	hoveredArrows[key] = { legalMoves: thisPieceLegalMoves, model_NonCapture: NonCaptureModel, model_Capture: CaptureModel, color };
}

/**
 * Tests if the piece type can move in the specified direction in the game.
 * This works even with directions in the negative-x direction.
 * For example, a piece can move [-2,-1] if it has the slide moveset [2,1].
 * @param {string} type - 'knightridersW'
 * @param {string} direction - [dx,dy]  where dx can be negative
 */
function doesTypeHaveDirection(type, direction) {
	const moveset = legalmoves.getPieceMoveset(gameslot.getGamefile(), type);
	if (!moveset.sliding) return false;

	const absoluteDirection = absoluteValueOfDirection(direction); // 'dx,dy'  where dx is always positive
	const key = coordutil.getKeyFromCoords(absoluteDirection);
	return key in moveset.sliding;
}

/**
 * Returns the absolute value of the direction/line.
 * If it's in the negative-x direction, it negates it.
 * @param {string} direction - `[dx,dy]`
 */
function absoluteValueOfDirection(direction) {
	let [dx,dy] = direction;
	if (dx < 0 || dx === 0 && dy < 0) { // Negate
		dx *= -1;
		dy *= -1;
	}
	return [dx,dy];
}

function renderEachHoveredPieceLegalMoves() {
	const boardPos = movement.getBoardPos();
	const model_Offset = legalmovehighlights.getOffset();
	const position = [
        -boardPos[0] + model_Offset[0], // Add the highlights offset
        -boardPos[1] + model_Offset[1],
        0
    ];
	const boardScale = movement.getBoardScale();
	const scale = [boardScale, boardScale, 1];

	for (const [key, value] of Object.entries(hoveredArrows)) { // 'x,y': { legalMoves, model, color }
		// Skip it if the rider being hovered over IS the piece selected! (Its legal moves are already being rendered)
		if (selection.isAPieceSelected()) {
			const coords = coordutil.getCoordsFromKey(key);
			const pieceSelectedCoords = selection.getPieceSelected().coords;
			if (coordutil.areCoordsEqual(coords, pieceSelectedCoords)) continue; // Skip (already rendering its legal moves, because it's selected)
		}
		value.model_NonCapture.render(position, scale);
		value.model_Capture.render(position, scale);
	}
}

/**
 * Call when our highlights offset, or render range bounding box, changes.
 * This regenerates the mesh of the piece arrow indicators hovered
 * over to account for the new offset.
 */
function regenModelsOfHoveredPieces() {
	if (!Object.keys(hoveredArrows).length) return; // No arrows being hovered over

	console.log("Updating models of hovered piece's legal moves..");

	for (const [coordsKey, hoveredArrow] of Object.entries(hoveredArrows)) { // { legalMoves, model, color }
		const coords = coordutil.getCoordsFromKey(coordsKey);

		// Calculate the mesh...
		const { NonCaptureModel, CaptureModel } = legalmovehighlights.generateModelsForPiecesLegalMoveHighlights(coords, hoveredArrow.legalMoves, hoveredArrow.color);
		
		// Overwrite the model inside piecesHoveredOver
		hoveredArrow.model_NonCapture = NonCaptureModel;
		hoveredArrow.model_Capture = CaptureModel;
	}
}

/**
 * Erases the list of piece arrows the mouse is currently hovering over & rendering legal moves for.
 * This is typically called when a move is made in-game, so that the arrows' legal moves don't leak from move to move.
 */
function clearListOfHoveredPieces() {
	for (const hoveredPieceKey in hoveredArrows) {
		delete hoveredArrows[hoveredPieceKey];
	}
}

export default {
	getMode,
	setMode,
	toggleArrows,
	
	update,
	renderThem,
	isMouseHovering,
	renderEachHoveredPieceLegalMoves,
	regenModelsOfHoveredPieces,
	clearListOfHoveredPieces
};