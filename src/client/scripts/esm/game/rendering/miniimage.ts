// src/client/scripts/esm/game/rendering/miniimage.ts

/**
 * The interactive game's mini images, the icons its pieces draw as once zoomed out: whether
 * they're on, which pieces show, which the pointer hovers, and drawing them with their hover.
 */

import type { TypeGroup } from '../../../../../shared/chess/util/typeutil.js';
import type { BDCoords, Coords, DoubleCoords } from '../../../../../shared/util/coordutil.js';

import jsutil from '../../../../../shared/util/jsutil.js';
import vectors from '../../../../../shared/util/math/vectors.js';
import typeutil from '../../../../../shared/chess/util/typeutil.js';
import bdcoords from '../../../../../shared/util/bdcoords.js';
import coordutil from '../../../../../shared/util/coordutil.js';
import piecethemes from '../../../../../shared/chess/util/piecethemes.js';
import boardutil, { Piece } from '../../../../../shared/chess/logic/boardutil.js';

import toast from '../../components/toast.js';
import space from '../../board/rendering/space.js';
import mouse from '../mouse.js';
import camera from '../../board/rendering/camera.js';
import gameslot from '../chess/gameslot.js';
import boardpos from '../../board/rendering/boardpos.js';
import premoves from '../chess/premoves.js';
import gamescene from './gamescene.js';
import selection from '../chess/selection.js';
import perspective from './perspective.js';
import { GameBus } from '../../board/GameBus.js';
import frametracker from '../../board/rendering/frametracker.js';
import miniimagerenderer from '../../board/rendering/miniimagerenderer.js';
import snapping, { ENTITY_WIDTH_VPIXELS } from './highlights/snapping.js';

// State -----------------------------------------------------------------------

/** True if we're disabled and not rendering mini images, such as when there's too many pieces. */
let disabled: boolean = false;

// Events ----------------------------------------------------------------------

GameBus.addEventListener('game-unloaded', () => {
	// Re-enable them if the previous game turned them off due to too many pieces.
	enable();
});

// Toggling --------------------------------------------------------------------

/** Whether mini image rendering is turned off. */
function isDisabled(): boolean {
	return disabled;
}

/** Turns mini image rendering on. */
function enable(): void {
	disabled = false;
}

/** Turns mini image rendering off. */
function disable(): void {
	disabled = true;
}

/** Flips mini image rendering on or off, toasting its new state. */
function toggle(): void {
	disabled = !disabled;
	frametracker.onVisualChange();

	if (disabled) toast.show(t.gamegui.icons.off);
	else toast.show(t.gamegui.icons.on);
}

// Enumeration -----------------------------------------------------------------

/** Iterate over every renderable piece (static and animated) and invoke the callback with its board coords and type. */
function forEachRenderablePiece(callback: (coords: BDCoords, type: number) => void): void {
	const board = gamescene.getGameContext();
	miniimagerenderer.forEachRenderablePiece(
		board,
		gameslot.getGamefile()!,
		board.animations,
		callback,
	);
}

/**
 * Returns a list of all pieces that should be rendered when mini-images are disabled.
 * This includes pieces below an annotation snap point, the selected piece, all animated pieces,
 * and the pieces involved in the last and next moves.
 */
function getPiecesShownWhenDisabled(): Piece[] {
	/** Running list of all pieces to render. */
	const piecesToRender: Piece[] = [];

	function pushPieceNoDuplicatesOrVoids(piece: Piece): void {
		if (piecethemes.SVGLESS_TYPES.has(typeutil.getRawType(piece.type))) return; // Skip voids
		if (!piecesToRender.some((p) => coordutil.areCoordsEqual(p.coords, piece.coords))) {
			piecesToRender.push(piece);
		}
	}

	const gamefile = gameslot.getGamefile()!;
	const pieces = gamefile.pieces;
	const mesh = gameslot.getMesh();
	const board = gamescene.getGameContext();

	/** Adds a piece the shared enumerations visit. */
	const pushVisited = (coords: BDCoords, type: number): void =>
		pushPieceNoDuplicatesOrVoids({ coords: bdcoords.coordsToBigInt(coords), type, index: -1 });

	// 1. Add the animated pieces: each moving piece, and the captured pieces still shown
	const activeHides = miniimagerenderer.forEachAnimatedPiece(
		board,
		board.animations,
		pushVisited,
	);

	// Queued premoves must be rewound BEFORE reading the pieces, so they are in the expected locations as the last and next move!
	premoves.rewindPremoves(gamefile, mesh);

	// 2. Get pieces on top of highlights (ray starts, intersections, etc.)
	const annotePoints: Coords[] = snapping
		.getAnnoteSnapPoints(true)
		.map((p) => bdcoords.coordsToBigInt(p));
	annotePoints.forEach((ap) => {
		const piece = boardutil.getPieceFromCoords(pieces, ap);
		if (!piece) return; // No piece beneath this highlight
		const coordsKey = coordutil.getKeyFromCoords(ap);
		if (activeHides.has(coordsKey)) return; // Skip pieces that are being hidden due to animations
		pushPieceNoDuplicatesOrVoids(piece);
	});

	// 3. Add the selected piece, if any
	const pieceSelected = selection.getPieceSelected();
	if (pieceSelected) pushPieceNoDuplicatesOrVoids(jsutil.deepCopyObject(pieceSelected));

	// 4. Add pieces from the last and next moves
	miniimagerenderer.forEachLastAndNextMovePiece(
		gamefile,
		gamefile.moves,
		board.animations,
		pushVisited,
	);

	premoves.applyPremoves(gamefile, mesh);

	return piecesToRender;
}

// Instance Data ---------------------------------------------------------------

/** Generates the instance data for the miniimages of the pieces this frame. */
function getImageInstanceData(): {
	instanceData: TypeGroup<number[]>;
	instanceData_hovered: TypeGroup<number[]>;
} {
	const instanceData: TypeGroup<number[]> = {};
	const instanceData_hovered: TypeGroup<number[]> = {};

	const pointerWorlds = mouse.getAllPointerWorlds();

	const boardsim = gameslot.getGamefile()!;

	const halfWorldWidth: number = snapping.getEntityWidthWorld() / 2;
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScale();
	const areWatchingMousePosition: boolean =
		!perspective.getEnabled() || perspective.isMouseLocked();

	// Prepare empty arrays by type
	boardsim.existingTypes.forEach((type: number) => {
		if (piecethemes.SVGLESS_TYPES.has(typeutil.getRawType(type))) return; // Skip voids

		instanceData[type] = [];
		instanceData_hovered[type] = [];
	});

	if (!disabled) {
		// Enabled => normal behavior
		forEachRenderablePiece(processPiece); // Process each renderable piece
	} else {
		// Disabled (too many pieces) => Only process pieces on highlights or being animated
		const piecesToRender = getPiecesShownWhenDisabled();
		piecesToRender.forEach((p) => {
			const coordsBD = bdcoords.fromCoords(p.coords);
			processPiece(coordsBD, p.type);
		}); // Calculate their instance data
	}

	/** Calculates and appends the instance data of the piece */
	function processPiece(coords: BDCoords, type: number): void {
		const coordsWorld = space.convertCoordToWorldSpace(coords, boardPos, boardScale);
		instanceData[type]!.push(...coordsWorld);

		// Are we hovering over? If so, add the same data to instanceData_hovered
		if (areWatchingMousePosition) {
			for (const pointerWorld of pointerWorlds) {
				if (vectors.chebyshevDistanceDoubles(coordsWorld, pointerWorld) < halfWorldWidth)
					instanceData_hovered[type]!.push(...coordsWorld);
			}
		}
	}

	return { instanceData, instanceData_hovered };
}

// Hovering --------------------------------------------------------------------

/** Returns a list of mini image coordinates that are all being hovered over by the provided world coords. */
function getImagesBelowWorld(
	world: DoubleCoords,
	trackDists: boolean,
): { images: Coords[]; dists?: number[] } {
	const imagesHovered: Coords[] = [];
	const dists: number[] = [];

	const halfWorldWidth: number = snapping.getEntityWidthWorld() / 2;
	const boardPos = boardpos.getBoardPos();
	const boardScale = boardpos.getBoardScale();

	if (!disabled) {
		// Enabled => normal behavior
		// Check static and animated pieces for hover
		forEachRenderablePiece(processPiece);
	} else {
		// Disabled (too many pieces) => Only process pieces on highlights or being animated
		const piecesToConsider = getPiecesShownWhenDisabled();
		piecesToConsider.forEach((p) => {
			const coordsBD = bdcoords.fromCoords(p.coords);
			processPiece(coordsBD);
		}); // Calculate if their underneath the world coords
	}

	function processPiece(coords: BDCoords): void {
		const coordsWorld = space.convertCoordToWorldSpace(coords, boardPos, boardScale);
		if (vectors.chebyshevDistanceDoubles(coordsWorld, world) < halfWorldWidth) {
			const integerCoords = bdcoords.coordsToBigInt(coords);
			imagesHovered.push(integerCoords);
			// Upgrade the distance to euclidean
			if (trackDists) dists.push(vectors.euclideanDistanceDoubles(coordsWorld, world));
		}
	}

	return trackDists ? { images: imagesHovered, dists } : { images: imagesHovered };
}

// Rendering -------------------------------------------------------------------

/** Renders the mini images, while zoomed out far enough to show them. */
function render(): void {
	if (!boardpos.areZoomedOut()) return;

	const gamefile = gameslot.getGamefile()!;
	const inverted = camera.getIsViewingBlackPerspective();
	const { instanceData, instanceData_hovered } = getImageInstanceData();

	miniimagerenderer.render(
		gamescene.getGameContext(),
		gamefile.existingTypes,
		instanceData,
		instanceData_hovered,
		inverted,
		ENTITY_WIDTH_VPIXELS,
	);
}

// Exports ---------------------------------------------------------------------

export default {
	// Toggling
	isDisabled,
	disable,
	toggle,
	// Hovering
	getImagesBelowWorld,
	// Rendering
	render,
};
