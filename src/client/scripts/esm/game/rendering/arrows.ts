
/**
 * This script calculates and renders the arrow indicators
 * on the sides of the screen, pointing to pieces off-screen
 * that are in that direction.
 * 
 * If the pictues are clicked, we initiate a teleport to that piece.
 */

import type { BufferModel, BufferModelInstanced } from './buffermodel.js';
import type { Coords, CoordsKey } from '../../chess/util/coordutil.js';
import type { Piece } from '../../chess/logic/boardchanges.js';
import type { Color } from '../../chess/util/colorutil.js';
import type { BoundingBox, Corner, Vec2, Vec2Key } from '../../util/math.js';
import type { LineKey, LinesByStep, PieceLinesByKey } from '../../chess/logic/organizedlines.js';
// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';
// @ts-ignore
import type { LegalMoves } from '../chess/selection.js';

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
import frametracker from './frametracker.js';
// @ts-ignore
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

/**
 * An object containing all existing arrows for a single frame.
 */
interface SlideArrows {
	/** An object containing all existing arrows for a specific slide direction */
	[vec2Key: Vec2Key]: {
		/**
		 * A single line containing what arrows should be visible on the
		 * sides of the screen for offscreen pieces.
		 */
		[lineKey: string]: ArrowsLine
	}
}

/**
 * An object containing the arrows that should actually be present,
 * for a single organized line intersecting through our screen.
 */
interface ArrowsLine {
	left: Piece[],
	right: Piece[]
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

/**
 * An array storing the LegalMoves, model and other info, for rendering the legal move highlights
 * of piece arrow indicators currently being hovered over!
 */
const hoveredArrows: Array<ArrowLegalMoves> = [];


// Functions ------------------------------------------------------------------------------


/**
 * Returns the mode the arrow indicators on the edges of the screen is currently in.
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

/** Rotates the current mode of the arrow indicators. */
function toggleArrows() {
	frametracker.onVisualChange();
	mode++;
	// Calculate the cap
	const cap = gameslot.getGamefile()!.startSnapshot.hippogonalsPresent ? 3 : 2;
	if (mode > cap) mode = 0; // Wrap back to zero
}

/**
 * Returns *true* if the mouse is hovering over any one arrow indicator.
 */
function isMouseHovering(): boolean {
	return hoveredArrows.length > 0;
}

/**
 * Calculates what arrows should be visible this frame.
 * 
 * Needs to be done every frame, even if the mouse isn't moved,
 * since actions such as rewinding/forwarding may change them,
 * or board velocity.
 * 
 * DOES NOT GENERATE THE MODEL OF THE hovered arrow legal moves.
 * This is so that other script have the opportunity to modify the list of
 * visible arrows before rendering.
 */
function update() {
	if (mode === 0) return; // Arrow indicators are off, nothing is visible.
	if (board.gtileWidth_Pixels(true) < renderZoomLimitVirtualPixels) return; // Too zoomed out, the arrows would be really tiny.

	/**
	 * To be able to test if a piece is offscreen or not,
	 * we need to know the bounding box of the visible board.
	 * 
	 * Even if a tiny portion of the square the piece is on
	 * is visible on screen, we will not create an arrow for it.
	 */
	const { boundingBoxInt, boundingBoxFloat } = getBoundingBoxesOfVisibleScreen();

	/**
	 * Next, we are going to iterate through each slide existing in the game,
	 * and for each of them, iterate through all organized lines of that slope,
	 * for each one of those lines, if they intersect our screen bounding box,
	 * we will iterate through all its pieces, adding an arrow for them
	 * ONLY if they are not visible on screen...
	 */

	/** The object that stores all arrows that should be visible this frame. */
	const slideArrows: SlideArrows = generateAllArrows(boundingBoxInt, boundingBoxFloat);

	// If we are in only-show-attackers mode
	removeUnnecessaryArrows(slideArrows);

	// Calculate what arrows are being hovered over...

	// First we need to add the additional padding to the bounding box,
	// so that the arrows aren't touching the screen edge.
	addArrowsPaddingToBoundingBox(boundingBoxFloat);


	// Calc the model data...


	/** A running list of of piece arrows being hovered over this frame */
	const piecesHoveringOverThisFrame: Array<Piece> = [];

	for (const strline in slideArrows) {
		const line = coordutil.getCoordsFromKey(strline as Vec2Key);
		iterateThroughLines(slideArrows[strline as Vec2Key]!, line);
	}

	function iterateThroughLines(lines: { [lineKey: string]: { l?: Piece; r?: Piece } }, direction: Vec2) {
		for (const lineKey in lines) {
			for (const side in lines[lineKey]) { // 'r' | 'l'
				// @ts-ignore
				const piece: Piece | undefined = lines[lineKey][side]; //
				if (piece === undefined) continue;
				const intersect = Number(lineKey.split("|")[0]); // 'X|C' => X (the nearest X on or after y=0 that the line intersects)
				if (piece.type === 'voidsN') continue;
				const isLeft = side === "l";
				const corner: Corner = math.getAABBCornerOfLine(direction, isLeft);
				const renderCoords = math.getLineIntersectionEntryPoint(direction[0], direction[1], intersect, boundingBoxFloat, corner);
				if (!renderCoords) continue;
				const arrowDirection: Vec2 = isLeft ? [-direction[0],-direction[1]] : direction;
				concatData(data, dataArrows, renderCoords, piece.type, corner, worldWidth, 0, piece.coords, arrowDirection, piecesHoveringOverThisFrame);
			}
		}
	}

	// Do not render line highlights upon arrow hover, when game is rewinded,
	// since calculating their legal moves means overwriting game's move history.
	if (!moveutil.areWeViewingLatestMove(gamefile)) piecesHoveringOverThisFrame.length = 0;

	// Iterate through all pieces in piecesHoveredOver, if they aren't being
	// hovered over anymore, delete them. Stop rendering their legal moves. 
	for (let i = hoveredArrows.length - 1; i >= 0; i--) { // Iterate backwards because we are removing elements as we go
		const thisHoveredArrow = hoveredArrows[i];
		// Is this arrow still being hovered over?
		if (!piecesHoveringOverThisFrame.some(piece => piece.coords === thisHoveredArrow.piece.coords)) hoveredArrows.splice(i, 1) // No longer being hovered over
	}

	if (data.length === 0) return; // No visible arrows, don't generate the model

	for (const pieceHovered of piecesHoveringOverThisFrame) {
		onPieceIndicatorHover(pieceHovered.type, pieceHovered.coords); // Generate their legal moves and highlight model
	}
    
	modelPictures = createModel(data, 2, "TRIANGLES", true, spritesheet.getSpritesheet());
	modelArrows = createModel(dataArrows, 2, "TRIANGLES", true);
}

/**
 * Calculates the visible bounding box of the screen for this frame,
 * both the integer-rounded, and the exact floating point one.
 * 
 * These boxes are used to test whether a piece is visible on-screen or not.
 * As if it's not, it should get an arrow.
 */
function getBoundingBoxesOfVisibleScreen(): { boundingBoxInt: BoundingBox, boundingBoxFloat: BoundingBox } {
	// If any part of the square is on screen, this box rounds outward to contain it.
	const boundingBoxInt: BoundingBox = perspective.getEnabled() ? board.generatePerspectiveBoundingBox(perspectiveDist + 1) : board.gboundingBox(); 
	// Same as above, but doesn't round
	const boundingBoxFloat: BoundingBox = perspective.getEnabled() ? board.generatePerspectiveBoundingBox(perspectiveDist) : board.gboundingBoxFloat();

	// Apply the padding of the navigation and gameinfo bars to the screen bounding box.
	if (!perspective.getEnabled()) {
		let headerPad = space.convertPixelsToWorldSpace_Virtual(guinavigation.getHeightOfNavBar());
		let footerPad = space.convertPixelsToWorldSpace_Virtual(guigameinfo.getHeightOfGameInfoBar());
		// Reverse header and footer pads if we're viewing black's side
		if (!perspective.getEnabled() && !gameslot.isLoadedGameViewingWhitePerspective()) [headerPad, footerPad] = [footerPad, headerPad]; // Swap values
		// TODO: Verify that the values are actually swapped in blacks perspective!!!!!!!!!!!!!!!!!!!!!!!!!!!=================================================
		// Apply the paddings to the bounding box
		boundingBoxFloat.top -= space.convertWorldSpaceToGrid(headerPad);
		boundingBoxFloat.bottom += space.convertWorldSpaceToGrid(footerPad);
		// EXPERIMENTAL: Does applying the padding the the integer bounding box make
		// it so arrows will appear for pieces behind the nav bar?
		boundingBoxInt.top -= space.convertWorldSpaceToGrid(headerPad);
		boundingBoxInt.bottom += space.convertWorldSpaceToGrid(footerPad);
	}

	return { boundingBoxInt, boundingBoxFloat };
}

/**
 * Adds a little bit of padding to the bounding box, so that the arrows of the
 * arrows indicators aren't touching the edge of the screen.
 * 
 * DESTRUCTIVE, modifies the provided BoundingBox.
 */
function addArrowsPaddingToBoundingBox(boundingBoxFloat: BoundingBox) {
	const boardScale = movement.getBoardScale();
	const worldWidth = width * boardScale; // The world-space width of our images
	let padding = (worldWidth / 2) + sidePadding;
	boundingBoxFloat.top -= padding;
	boundingBoxFloat.right -= padding;
	boundingBoxFloat.bottom += padding;
	boundingBoxFloat.left += padding;
}

/**
 * Generates all the arrows for a game, as if All (plus hippogonals) mode was on.
 */
function generateAllArrows(boundingBoxInt: BoundingBox, boundingBoxFloat: BoundingBox): SlideArrows {
	/** The running list of arrows that should be visible */
	const slideArrows: SlideArrows = {};
	/** All lines excluding hippogonals (or ones included in mode 3) */
	const orthogsAndDiags: Vec2[] = [[1,0],[0,1],[1,1],[1,-1]];
	const gamefile = gameslot.getGamefile()!;
	gamefile.startSnapshot.slidingPossible.forEach(slide => { // For each slide direction in the game...
		// Are arrows visible for this slide direction (correct mode enabled)?
		if ((mode === 1 || mode === 2) && !orthogsAndDiags.some(thisSlide => coordutil.areCoordsEqual_noValidate(thisSlide, slide))) {
			console.log(`Skipping calculating arrows for slide ${JSON.stringify(slide)}, it is not visible in the current mode.`);
			return;
		}

		const slideKey = math.getKeyFromVec2(slide);
		const perpendicularSlideDir: Vec2 = [-slide[1], slide[0]]; // Rotates left 90deg
		const boardCornerLeft_AB: Corner = math.getAABBCornerOfLine(perpendicularSlideDir,true);
		const boardCornerRight_AB: Corner = math.getAABBCornerOfLine(perpendicularSlideDir,false);
		const boardCornerLeft: Coords = math.getCornerOfBoundingBox(boundingBoxFloat,boardCornerLeft_AB);
		const boardCornerRight: Coords = math.getCornerOfBoundingBox(boundingBoxFloat,boardCornerRight_AB);
		const boardSlidesRight: number = organizedlines.getCFromLine(slide, boardCornerLeft);
		const boardSlidesLeft: number = organizedlines.getCFromLine(slide, boardCornerRight);
		// The X of the lineKey (`X|C`) with this slide at the very left & right sides of the screen.
		// Any line of this slope that is not within these 2 are outside of our screen,
		// so no arrows will be visible for the piece.
		const boardSlidesStart = Math.min(boardSlidesLeft, boardSlidesRight);
		const boardSlidesEnd = Math.max(boardSlidesLeft, boardSlidesRight);
		// For all our lines in the game with this slope...
		for (const [lineKey, organizedLine] of Object.entries(gamefile.piecesOrganizedByLines[slideKey])) {
			const X = organizedlines.getXFromKey(lineKey as LineKey);
			if (boardSlidesStart > X || boardSlidesEnd < X) continue; // Next line, this one is off-screen, so no piece arrows are visible
			// Calculate the ACTUAL arrows that should be visible for this specific organized line.
			const arrowsLine = calcArrowsLine(boundingBoxInt, boundingBoxFloat, slide, organizedLine as Piece[]);
			if (!slideArrows[slideKey]) slideArrows[slideKey] = {}; // Make sure this exists first
			slideArrows[slideKey][lineKey] = arrowsLine; // Add this arrows line to our object containing all arrows for this frame
		}
	});

	return slideArrows;
}


/**
 * Calculates what arrows should be visible for a single
 * organized line of pieces intersecting our screen.
 * 
 * If the game contains ANY custom blocking functions, which would be true if we were
 * using the Huygens, then there could be a single arrow pointing to multiple pieces,
 * since the Huygens can phase through / skip over other pieces.
 */
function calcArrowsLine(boundingBoxInt: BoundingBox, boundingBoxFloat: BoundingBox, slideDir: Vec2, organizedline: Piece[]): ArrowsLine {

	const rightCorner = math.getCornerOfBoundingBox(boundingBoxFloat, math.getAABBCornerOfLine(slideDir,false));

	let left: Piece[];
	let right: Piece[];
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

	return { left, right };
}

/**
 * Removes asrrows based on the mode.
 * mode == 1 Removes arrows to pieces that cant slide in that direction
 * mode == 2 Like mode 1 but will keep any arrows in directions that a selected piece can move
 * Will not return anything as it alters the object it is given.
 * @param {Object} arrows 
 */
function removeUnnecessaryArrows(arrows: SlideArrows) {
	if (mode === 0) return;

	const gamefile = gameslot.getGamefile()!;
	let attacklines: Array<Vec2Key> = [];
	attack: {
		if (mode !== 2) break attack;
		const piece = selection.getPieceSelected();
		if (!piece) break attack;
		const slidingMoveset = legalmoves.getPieceMoveset(gamefile, piece.type).sliding;
		if (!slidingMoveset) break attack;
		attacklines = Object.keys(slidingMoveset) as Array<Vec2Key>;
	}
	for (const direction in arrows) {
		if (attacklines.includes(direction as Vec2Key)) continue;
		removeTypesWithIncorrectMoveset(arrows[direction as Vec2Key]!, direction as Vec2Key);
		if (jsutil.isEmpty(arrows[direction as Vec2Key]!)) delete arrows[direction as Vec2Key];
	}

	function removeTypesWithIncorrectMoveset(object: { [lineKey: LineKey]: ArrowsLine }, direction: Vec2Key) { // horzRight, vertical/diagonalUp
		for (const key in object) { // LineKey
			for (const side in object[key as LineKey]) { // l: Piece | r: Piece
				// @ts-ignore
				const piece: Piece | undefined = object[key as LineKey][side];
				if (piece === undefined) continue;
				const type = piece.type;
				// @ts-ignore
				if (!doesTypeHaveMoveset(gamefile, type, direction)) delete object[key as LineKey][side];
			}
			if (jsutil.isEmpty(object[key as LineKey]!)) delete object[key as LineKey];
		}
	}

	/** Whether the given type of piece can slide in the direction provided. */
	function doesTypeHaveMoveset(gamefile: gamefile, type: string, direction: Vec2Key) {
		const moveset = legalmoves.getPieceMoveset(gamefile, type);
		if (!moveset.sliding) return false;
		return moveset.sliding[direction] !== undefined;
	}
}

/**
 * 
 * @param data 
 * @param dataArrows 
 * @param renderCoords 
 * @param type 
 * @param paddingDir 
 * @param worldWidth - Of the piece image to render
 * @param padding 
 * @param pieceCoords 
 * @param direction 
 * @param piecesHoveringOverThisFrame 
 */
function concatData(data: number[], dataArrows: number[], renderCoords: Coords, type: string, paddingDir: Corner, worldWidth: number, padding: number, pieceCoords: Coords, direction: Vec2, piecesHoveringOverThisFrame: Array<Piece>) {
	const worldHalfWidth = worldWidth / 2;

	// Convert to world-space
	const worldCoords: Coords = space.convertCoordToWorldSpace(renderCoords) as Coords;

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
		piecesHoveringOverThisFrame.push({ type, coords: pieceCoords } as Piece);
		thisOpacity = 1;
		hovering = true;
		// If we also clicked, then teleport!
		if (input.isMouseDown_Left() || input.getTouchClicked()) {
			const startCoords = movement.getBoardPos();
			let telCoords: Coords;
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
	const points: Coords[] = [
        [dist, -size],
        [dist, +size],
        [dist + size, 0]
    ];

	const angle = Math.atan2(direction[1], direction[0]);
	const ad = applyTransform(points, angle, worldCoords);

	for (let i = 0; i < ad.length; i++) {
		const thisPoint = ad[i]!;
		//                   x             y             color
		dataArrows.push(thisPoint[0], thisPoint[1], 0,0,0, thisOpacity );
	}
}

/**
 * Applies a rotational & translational transformation to an array of points.
 * 
 * TODO: Move to maybe bufferdata?
 */
function applyTransform(points: Coords[], rotation: number, translation: Coords): Coords[] {
	// convert rotation angle to radians
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
    
	// apply rotation matrix and translation vector to each point
	const transformedPoints: Coords[] = points.map(point => {
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
	regenerateModel();

	// if (mode === 0) return;
	if (modelPictures === undefined || modelArrows === undefined) return;

	// render.renderModel(model, undefined, undefined, "TRIANGLES", spritesheet.getSpritesheet())
	modelPictures.render();
	// render.renderModel(modelArrows, undefined, undefined, "TRIANGLES")
	modelArrows.render();
}

function regenerateModel() {
	modelPictures = undefined;
	modelArrows = undefined;

	const data: number[] = [];
	const dataArrows: number[] = [];

}

/**
 * Call when a piece's arrow is hovered over.
 * Calculates their legal moves and model for rendering them.
 * @param type - The type of piece of this arrow indicator
 * @param pieceCoords - The coordinates of the piece the arrow is pointing to
 */
function onPieceIndicatorHover(type: string, pieceCoords: Coords) {
	// Check if their legal moves and mesh have already been stored
	// TODO: Make sure this is still often called
	if (hoveredArrows.some(hoveredArrow => hoveredArrow.piece.coords === pieceCoords)) return; // Legal moves and mesh already calculated.

	// Calculate their legal moves and mesh!
	const gamefile = gameslot.getGamefile()!;
	const thisRider = gamefileutility.getPieceAtCoords(gamefile, pieceCoords)!;
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
	const piece: Piece = { type, coords: pieceCoords } as Piece;
	hoveredArrows.push({ piece, legalMoves: thisPieceLegalMoves, model_NonCapture: NonCaptureModel, model_Capture: CaptureModel, color });
}

/**
 * Tests if the piece type can move in the specified direction in the game.
 * This works even with directions in the negative-x direction.
 * For example, a piece can move [-2,-1] if it has the slide moveset [2,1].
 * @param type - 'knightridersW'
 * @param direction - [dx,dy]  where dx can be negative
 */
function doesTypeHaveDirection(type: string, direction: Vec2) {
	const moveset = legalmoves.getPieceMoveset(gameslot.getGamefile()!, type);
	if (!moveset.sliding) return false;

	const absoluteDirection = absoluteValueOfDirection(direction); // 'dx,dy'  where dx is always positive
	const key = math.getKeyFromVec2(absoluteDirection);
	return key in moveset.sliding;
}

/**
 * Returns the absolute value of the direction/line.
 * If it's in the negative-x direction, it negates it.
 * @param direction - `[dx,dy]`
 */
function absoluteValueOfDirection(direction: Vec2): Vec2 {
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
	const position: [number,number,number] = [
        -boardPos[0] + model_Offset[0], // Add the highlights offset
        -boardPos[1] + model_Offset[1],
        0
    ];
	const boardScale = movement.getBoardScale();
	const scale: [number,number,number] = [boardScale, boardScale, 1];

	hoveredArrows.forEach(hoveredArrow => {
		// Skip it if the piece being hovered over IS the piece selected! (Its legal moves are already being rendered)
		if (selection.isAPieceSelected()) {
			const pieceSelectedCoords = selection.getPieceSelected()!.coords;
			if (coordutil.areCoordsEqual_noValidate(hoveredArrow.piece.coords, pieceSelectedCoords)) return; // Skip (already rendering its legal moves, because it's selected)
		}
		hoveredArrow.model_NonCapture.render(position, scale);
		hoveredArrow.model_Capture.render(position, scale);
	});
}

/**
 * Call when our highlights offset, or render range bounding box, changes.
 * This regenerates the mesh of the piece arrow indicators hovered
 * over to account for the new offset.
 */
function regenModelsOfHoveredPieces() {
	if (hoveredArrows.length === 0) return; // No arrows being hovered over

	console.log("Updating models of hovered piece's legal moves..");

	hoveredArrows.forEach(hoveredArrow => {
		// Calculate the mesh...
		const { NonCaptureModel, CaptureModel } = legalmovehighlights.generateModelsForPiecesLegalMoveHighlights(hoveredArrow.piece.coords, hoveredArrow.legalMoves, hoveredArrow.color);
		// Overwrite the model inside piecesHoveredOver
		hoveredArrow.model_NonCapture = NonCaptureModel;
		hoveredArrow.model_Capture = CaptureModel;
	})
}

/**
 * Erases the list of piece arrows the mouse is currently hovering over & rendering legal moves for.
 * This is typically called when a move is made in-game, so that the arrows' legal moves don't leak from move to move.
 */
function clearListOfHoveredPieces() {
	hoveredArrows.length = 0;
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