/**
 * JS Bridge for HydroChess WASM Engine
 * This file contains JavaScript functions that are called from Rust via wasm_bindgen
 */

// Import required modules (assuming these are properly imported in the main file)
// This file serves as a bridge to re-export Javascript functions
// so that WASM modules can import them from a known location

// Imports from boardutil
import boardutil from "../../../../../../../chess/util/boardutil.js";
// Imports from typeutil
import typeutil, { rawTypes, players }  from "../../../../../../../chess/util/typeutil.js";
import movepiece from "../../../../../../../chess/logic/movepiece.js";
import legalmoves from "../../../../../../../chess/logic/legalmoves.js";
import specialdetect from "../../../../../../../chess/logic/specialdetect.js";

// ===== Board utility functions =====

// Get a piece object from coordinates
export function getPieceFromCoords(pieces, coords) {
    try {
        // Try to use boardutil first if available
        if (boardutil && typeof boardutil.getPieceFromCoords === 'function') {
            try {
                const piece = boardutil.getPieceFromCoords(pieces, coords);
                if (piece) {
                    return piece;
                }
            } catch (error) {
                console.warn(`[JS Bridge] Error using boardutil.getPieceFromCoords: ${error.message}`);
                // Continue with fallbacks
            }
        }

        // Fallback implementation
        // Check if we have a valid pieces object with the necessary arrays
        if (pieces && pieces.XPositions && pieces.YPositions && pieces.types &&
            Array.isArray(pieces.XPositions) && Array.isArray(pieces.YPositions) && Array.isArray(pieces.types)) {

            // Ensure coords is valid
            if (!coords || !Array.isArray(coords) || coords.length < 2) {
                console.debug("[JS Bridge] Invalid coordinates", coords);
                return null;
            }

            const x = coords[0];
            const y = coords[1];

            // Find the piece at the exact coordinates
            const length = Math.min(pieces.XPositions.length, pieces.YPositions.length, pieces.types.length);
            for (let i = 0; i < length; i++) {
                if (pieces.XPositions[i] === x && pieces.YPositions[i] === y) {
                    return {
                        type: pieces.types[i],
                        coords: [x, y]
                    };
                }
            }

            // No piece found at these coordinates in the arrays
        }

        // If we don't have the array structure, check for coords array directly
        if (pieces && pieces.coords && Array.isArray(pieces.coords)) {
            // Ensure coords is valid
            if (!coords || !Array.isArray(coords) || coords.length < 2) {
                console.debug("[JS Bridge] Invalid coordinates", coords);
                return null;
            }

            const x = coords[0];
            const y = coords[1];

            // Try to find the piece in the coords array
            for (let i = 0; i < pieces.coords.length; i++) {
                const pieceCoords = pieces.coords[i];

                // Check for the new format where pieceCoords has embedded type info
                if (pieceCoords && typeof pieceCoords === 'object') {
                    // Match coordinates whether they're accessed by numeric index or string keys
                    const pieceX = ('0' in pieceCoords) ? pieceCoords['0'] : (0 in pieceCoords ? pieceCoords[0] : null);
                    const pieceY = ('1' in pieceCoords) ? pieceCoords['1'] : (1 in pieceCoords ? pieceCoords[1] : null);

                    if (pieceX === x && pieceY === y) {
                        // If piece has type property embedded in the object (new format)
                        if ('type' in pieceCoords) {
                            return {
                                type: pieceCoords.type,
                                coords: [x, y]
                            };
                        }
                    }
                }
                // Check for old array format
                else if (pieceCoords && Array.isArray(pieceCoords) &&
                    pieceCoords.length >= 2 &&
                    pieceCoords[0] === x && pieceCoords[1] === y) {

                    // If we have a types array that matches the coords array,
                    // use it to determine the type
                    if (pieces.types && Array.isArray(pieces.types) && pieces.types.length > i) {
                        return {
                            type: pieces.types[i],
                            coords: [x, y]
                        };
                    }

                    // Otherwise return with a default type
                    return {
                        type: 6, // Default to a king (6) - just a placeholder
                        coords: [x, y]
                    };
                }
            }
        }

        // If we have coordsTypes array alongside coords array
        if (pieces && pieces.coords && Array.isArray(pieces.coords) &&
            pieces.coordsTypes && Array.isArray(pieces.coordsTypes)) {

            for (let i = 0; i < pieces.coords.length; i++) {
                const pieceCoords = pieces.coords[i];
                // Use similar matching logic as above but with the coordsTypes array
                const pieceX = typeof pieceCoords === 'object' ?
                    (pieceCoords['0'] || pieceCoords[0]) :
                    (Array.isArray(pieceCoords) ? pieceCoords[0] : null);

                const pieceY = typeof pieceCoords === 'object' ?
                    (pieceCoords['1'] || pieceCoords[1]) :
                    (Array.isArray(pieceCoords) ? pieceCoords[1] : null);

                if (pieceX === x && pieceY === y && pieces.coordsTypes[i]) {
                    return {
                        type: pieces.coordsTypes[i],
                        coords: [x, y]
                    };
                }
            }
        }

        // No implementation available or piece not found
        return null;
    } catch (error) {
        console.error(`[JS Bridge] Error in getPieceFromCoords: ${error.message}`);
        return null;
    }
}

// Get coordinates of all pieces on the board
export function getCoordsOfAllPieces(game) {
    if (!game) {
        console.warn("[JS Bridge] Invalid game object passed to getCoordsOfAllPieces", game);
        return [];
    }

    try {
        // Always try to use boardutil's implementation first if available
        if (boardutil && typeof boardutil.getCoordsOfAllPieces === 'function') {
            try {
                const result = boardutil.getCoordsOfAllPieces(game.pieces || game);
                if (result && Array.isArray(result) && result.length > 0) {
                    return result;
                }
            } catch (error) {
                console.warn("[JS Bridge] Error using boardutil's getCoordsOfAllPieces:", error);
                // Continue with fallbacks
            }
        }

        // Fallback implementation if boardutil fails or isn't available
        const pieces = game.pieces || game;

        // Debug what structure we have
        console.debug(`[JS Bridge] Pieces structure keys: ${Object.keys(pieces).join(', ')}`);

        // If the game has the array-based structure with coords and types properties
        if (pieces.coords && Array.isArray(pieces.coords)) {
            console.debug(`[JS Bridge] Using coords array directly with ${pieces.coords.length} elements`);

            // Handle both formats: arrays of arrays [x,y] and objects with type info
            const result = [];
            for (const coord of pieces.coords) {
                if (coord) {
                    // If coord is an array like [x,y]
                    if (Array.isArray(coord) && coord.length >= 2) {
                        result.push([coord[0], coord[1]]);
                    }
                    // If coord is an object with 0,1 properties (our new format)
                    else if (typeof coord === 'object' && '0' in coord && '1' in coord) {
                        result.push([coord[0], coord[1]]);
                    }
                    // Special case for numeric properties
                    else if (typeof coord === 'object' && 0 in coord && 1 in coord) {
                        result.push([coord[0], coord[1]]);
                    }
                }
            }

            console.debug(`[JS Bridge] Extracted ${result.length} coordinates from coords array`);
            return result;
        }

        // Check if we have the XPositions/YPositions/types structure (newer structure)
        if (pieces && pieces.XPositions && pieces.YPositions && pieces.types &&
            Array.isArray(pieces.XPositions) && Array.isArray(pieces.YPositions) && Array.isArray(pieces.types)) {

            const result = [];
            const length = Math.min(pieces.XPositions.length, pieces.YPositions.length, pieces.types.length);

            for (let i = 0; i < length; i++) {
                if (pieces.types[i] !== 0) { // Only include non-zero types (actual pieces)
                    result.push([pieces.XPositions[i], pieces.YPositions[i]]);
                }
            }

            // Log for debugging
            if (result.length > 0) {
                console.debug("[JS Bridge] Successfully extracted", result.length, "piece coordinates from arrays");
            } else {
                console.debug("[JS Bridge] No pieces found with XPositions/YPositions/types arrays");
            }

            return result;
        }

        // If we get here, we don't have a valid structure
        console.warn("[JS Bridge] Could not extract coordinates from pieces object");
        return [];
    } catch (error) {
        console.error("[JS Bridge] Error in getCoordsOfAllPieces:", error);
        return [];
    }
}

// Get piece type from coordinates
export function getTypeFromCoords(pieces, coords) {
    return boardutil.getTypeFromCoords(pieces, coords);
}

// Get the color of a piece at given coordinates
export function getPieceColorAt(pieces, coords) {
    const piece = getPieceFromCoords(pieces, coords);
    return piece ? typeutil.getColorFromType(piece.type) : null;
}

// Count pieces in the game matching a type pattern
export function getPieceCountOfGame(game) {
    return boardutil.getPieceCountOfGame(game.pieces, "major_or_minor");
}

// ===== Type utility functions =====

// Get color from piece type
export function getColorFromType(pieceType) {
    return typeutil.getColorFromType(pieceType);
}

// Get raw type (pawn=1, knight=2, etc.) from piece type
export function getRawType(pieceType) {
    return typeutil.getRawType(pieceType);
}

// Build a type from raw type and color
export function buildType(rawType, color) {
    return typeutil.buildType(rawType, color);
}

// Invert player (1->2, 2->1)
export function invertPlayer(player) {
    return typeutil.invertPlayer(player);
}

// ===== Move generation and validation =====

// Get all legal moves for a player
export function getLegalMoves(lf, player) {
    const legalMoves = [];
    const allPieceCoords = boardutil.getCoordsOfAllPieces(lf.pieces);

    for (const coords of allPieceCoords) {
        const piece = boardutil.getPieceFromCoords(lf.pieces, coords);

        // Check if the piece exists and belongs to the current player
        if (!piece || typeutil.getColorFromType(piece.type) !== player) {
            continue;
        }

        // Get legal moves for this piece
        const legalMovesResult = legalmoves.calculate(lf, piece);

        // --- Calculate Individual Moves ---
        for (const endCoords of legalMovesResult.individual) {
            const validEndCoords = endCoords;
            const moveDraft = { startCoords: piece.coords, endCoords: validEndCoords };

            // Check and transfer special move flags (castling, en passant)
            specialdetect.transferSpecialFlags_FromCoordsToMove(endCoords, moveDraft);

            // Handle Pawn Promotion
            if (endCoords.promoteTrigger) {
                // Add moves for queen and knight
                moveDraft.promotion = typeutil.buildType(rawTypes.QUEEN, player);
                legalMoves.push({ startCoords: piece.coords, endCoords: validEndCoords, promotion: typeutil.buildType(rawTypes.QUEEN, player) });
                moveDraft.promotion = typeutil.buildType(rawTypes.KNIGHT, player);
                legalMoves.push({ startCoords: piece.coords, endCoords: validEndCoords, promotion: typeutil.buildType(rawTypes.KNIGHT, player) });
                continue; // Skip adding the non-promoted move
            }

            // Add regular or other special moves (castling/en passant) to the list
            legalMoves.push(moveDraft);
        }

        // --- Calculate Sliding Moves ---
        // (Sliding moves don't involve castling, en passant, or promotion)
        if (legalMovesResult.sliding) {
            for (const key in legalMovesResult.sliding) {
                const direction = key.split(',').map(Number);
                const [minSteps, maxSteps] = legalMovesResult.sliding[key];

                // Collect valid distances considering blocking pieces
                const distancesToCheck = collectSlidingDistances(
                    lf,
                    piece.coords,
                    direction,
                    maxSteps,
                    minSteps
                );

                // Add valid moves from the collected distances
                for (const distance of distancesToCheck) {
                    const endCoords = [
                        piece.coords[0] + direction[0] * distance,
                        piece.coords[1] + direction[1] * distance
                    ];
                    // Directly add the move and its score
                    legalMoves.push({ startCoords: piece.coords, endCoords: endCoords });
                }
            }
        }
    }
    return legalMoves;
}

// ===== Special flag handling =====

// Transfer special flags from coordinates to move
export function transferSpecialFlags(coords, move) {
    specialdetect.transferSpecialFlags_FromCoordsToMove(coords, move);
}

// Constants for sliding move calculation
const WIGGLE_ROOM = 3; // How far off the direct path to check for nearby pieces
const MAX_ENGINE_SLIDE_CHECK = 50; // Absolute max distance to check for infinite sliders

/**
 * Collects the valid move distances along a sliding direction, respecting blocking pieces.
 *
 * @param game Game file state.
 * @param startCoords The starting coordinates of the piece.
 * @param moveDir The direction of the move.
 * @param maxSteps The maximum steps allowed (Infinity for infinite sliders).
 * @param minSteps The minimum steps allowed (usually <= 0, must be >= 1).
 * @returns A Set of potential distances to check.
 */
export function collectSlidingDistances(game, startCoords, moveDir, maxSteps, minSteps) {
    try {
        const distancesToCheck = new Set();

        // --- Calculate limit based on nearby pieces ---
        const [startX, startY] = startCoords;
        const [dirX, dirY] = moveDir;
        let maxDistWithNearbyPiece = 0; // Furthest projected distance 'd' with a piece nearby

        const allPieceCoords = getCoordsOfAllPieces(game);

        for (const targetCoord of allPieceCoords) {
            const [targetX, targetY] = targetCoord;

            // Skip self
            if (targetX === startX && targetY === startY) continue;

            const dx = targetX - startX;
            const dy = targetY - startY;

            let d_proj = 0;
            let in_correct_direction = false;
            let is_diagonal = false;

            // Determine projected distance based on move direction
            if (dirY === 0) { // Horizontal move
                in_correct_direction = (Math.sign(dx) === Math.sign(dirX) && dx !== 0);
                if (in_correct_direction) {
                    d_proj = Math.abs(dx);
                }
            } else if (dirX === 0) { // Vertical move
                in_correct_direction = (Math.sign(dy) === Math.sign(dirY) && dy !== 0);
                if (in_correct_direction) {
                    d_proj = Math.abs(dy);
                }
            } else if (Math.abs(dirX) === Math.abs(dirY)) { // Diagonal move
                const dx_sign = Math.sign(dx);
                const dy_sign = Math.sign(dy);
                in_correct_direction = (dx_sign === Math.sign(dirX) || dx === 0) &&
                    (dy_sign === Math.sign(dirY) || dy === 0) &&
                    (dx !== 0 || dy !== 0); // Ensure it's not the start square
                is_diagonal = true;
                if (in_correct_direction) {
                    d_proj = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance along diagonal
                }
            }

            if (in_correct_direction) {
                let within_wiggle = false;
                if (is_diagonal) {
                    // Diagonal check
                    const projX = startX + dirX * d_proj;
                    const projY = startY + dirY * d_proj;
                    const d_perp_x = Math.abs(targetX - projX);
                    const d_perp_y = Math.abs(targetY - projY);
                    within_wiggle = (d_perp_x <= WIGGLE_ROOM || d_perp_y <= WIGGLE_ROOM);
                } else if (dirY === 0) { // Horizontal move check
                    within_wiggle = (Math.abs(dy) <= WIGGLE_ROOM);
                } else { // Vertical move check (dirX === 0)
                    within_wiggle = (Math.abs(dx) <= WIGGLE_ROOM);
                }

                if (within_wiggle) {
                    maxDistWithNearbyPiece = Math.max(maxDistWithNearbyPiece, d_proj);
                }
            }
        }

        // --- Determine the unified upper bound ---
        const nearbyLimit = maxDistWithNearbyPiece + WIGGLE_ROOM;
        // Consider maxSteps (if finite), nearbyLimit, and the absolute engine check limit
        const upperBound = Math.min(
            Number.isFinite(maxSteps) ? maxSteps : Infinity, // Use actual maxSteps if finite
            nearbyLimit,
            MAX_ENGINE_SLIDE_CHECK
        );

        // --- Generate distances up to the calculated limit ---
        const startDistance = Math.max(1, minSteps);
        for (let d = startDistance; d <= upperBound; d++) {
            distancesToCheck.add(d);
        }

        // --- Ensure max check distance is included for infinite sliders ---
        if (!Number.isFinite(maxSteps)) {
            // Always add the maximum check distance for infinite sliders
            distancesToCheck.add(MAX_ENGINE_SLIDE_CHECK);
        }

        return distancesToCheck;
    } catch (error) {
        console.error("[JS Bridge] Error in collectSlidingDistances:", error);
        return new Set([1]); // Return at least one step as fallback
    }
}

// ===== Move application functions =====

// Make a move
export function makeMove(game, move) {
    movepiece.makeMove(game, move);
}

// Rewind (undo) a move
export function rewindMove(game) {
    movepiece.rewindMove(game);
}

// Generate and apply a null move (just switching turns)
export function makeNullMove(game) {
    const nullMove = movepiece.generateNullMove(game);
    // Apply the null move to the game state
    movepiece.makeMove(game, nullMove);
}

// Decay history scores - called after each search depth
export function decayHistoryScores(historyTable) {
    try {
        // Create a new object to hold the decayed values
        const result = {};
        
        // For each key in the history table, decay its value
        for (const key in historyTable) {
            if (typeof historyTable[key] === 'number') {
                // Divide by 2 to decay the value (standard practice)
                result[key] = Math.floor(historyTable[key] / 2);
            } else {
                // If not a number, just copy as is
                result[key] = historyTable[key];
            }
        }
        
        return result;
    } catch (error) {
        console.error(`[JS Bridge] Error in decayHistoryScores: ${error.message}`);
        return historyTable; // Return original if there's an error
    }
}


// Order moves based on heuristics
// export function orderMovesJs(moves, game, ply) {
//     try {
//         // Clone the array to avoid modifying the original
//         const movesArray = Array.from(moves);
//
//         // Sort by the scoring function
//         return movesArray.sort((a, b) => {
//             return scoreMove(b, game, {ply}) - scoreMove(a, game, {ply});
//         });
//     } catch (err) {
//         console.error('[JS Bridge] Error in orderMovesJs:', err);
//         return Array.from(moves);
//     }
// }

// Filter to get only capture moves
export function filterCaptureMovesJs(moves, game) {
    try {
        // Validate moves input
        if (!moves) {
            console.warn('[filterCaptureMovesJs] Received null/undefined moves array');
            return [];
        }
        
        if (!Array.isArray(moves)) {
            console.warn('[filterCaptureMovesJs] Received non-array value:', typeof moves);
            return [];
        }
        
        if (moves.length === 0) {
            // This is expected sometimes, no need to warn
            return [];
        }
        
        // Filter out moves that are not captures
        const captureMoves = moves.filter(move => {
            if (!move) return false;
            
            // Check if the move is a capture
            return move.capture === true;
        });
        
        return captureMoves;
    } catch (err) {
        console.error('[filterCaptureMovesJs] Error filtering capture moves:', err);
        console.log('Input moves:', moves);
        // Return empty array as fallback
        return [];
    }
}

// Generate a move from a draft
export function generateMoveJs(game, moveDraft) {
    return movepiece.generateMove(game, moveDraft);
}

// Order moves based on score for better pruning
export function orderMovesJs(moves, game, best_move) {
    try {
        // Validate moves input
        if (!moves) {
            console.warn('[orderMovesJs] Received null/undefined moves array');
            return [];
        }
        
        if (!Array.isArray(moves)) {
            console.warn('[orderMovesJs] Received non-array value:', typeof moves);
            return [];
        }
        
        if (moves.length === 0) {
            // This is normal during quiescence search when there are no captures
            console.debug('[orderMovesJs] Empty moves array to order');
            return [];
        }
        
        // Clone the array to avoid modifying the original
        const movesCopy = [...moves];
        
        // Score each move
        const scoredMoves = movesCopy.map(move => {
            // Make sure move object is complete and has coordinates
            if (!move) {
                console.warn('[orderMovesJs] Null move object');
                return { move, score: -9999 };
            }
            
            if (!move.startCoords || !move.endCoords) {
                console.warn('[orderMovesJs] Move missing required coordinates:', move);
                return { move, score: -9999 };
            }
            
            // Initialize score based on move type
            let score = 0;
            
            // Check if it's a capture
            const isCapture = move.capture || false;
            if (isCapture) {
                // Get values of captured piece and capturing piece
                const capturedPieceType = move.capturedPieceType || 0;
                const capturingPieceType = move.pieceType || 0;
                
                // Piece values (matching the PIECE_VALUES in Rust)
                const pieceValues = {
                    0: 0,    // Empty
                    1: 100,  // Pawn
                    2: 320,  // Knight
                    3: 330,  // Bishop
                    4: 500,  // Rook
                    5: 900,  // Queen
                    6: 2000  // King
                };
                
                // Get absolute piece values
                const capturedValue = pieceValues[Math.abs(capturedPieceType)] || 0;
                const capturingValue = pieceValues[Math.abs(capturingPieceType)] || 100; // Default to pawn value
                
                // MVV-LVA scoring (Most Valuable Victim - Least Valuable Aggressor)
                // Higher score for capturing valuable pieces with less valuable pieces
                score += capturedValue * 10 - capturingValue / 10;
                
                // Prioritize captures overall
                score += 1000;
            }
            
            // Check for check or checkmate
            if (move.check) {
                score += 30;
            }
            if (move.checkmate) {
                score += 20000; // Very high priority for checkmate
            }
            
            // Add history heuristic if available
            if (typeof historyTable !== 'undefined') {
                const from = move.startCoords;
                const to = move.endCoords;
                if (from && to) {
                    const moveKey = `${from[0]},${from[1]}-${to[0]},${to[1]}`;
                    const historyScore = historyTable.get(moveKey) || 0;
                    score += historyScore;
                }
            }
            
            return { move, score };
        });
        
        // Sort by score (descending)
        scoredMoves.sort((a, b) => b.score - a.score);
        
        // Return the ordered moves
        return scoredMoves.map(scoredMove => scoredMove.move);
    } catch (err) {
        console.error('[orderMovesJs] Error ordering moves:', err);
        // Return an empty array instead of the original array if there's an error
        // This helps prevent propagating invalid data
        return [];
    }
}