/**
 * HydroChess Engine - Rust WASM Version
 * A JavaScript wrapper for the Rust WASM implementation of HydroChess
 *
 * @author FirePlank
 */

import gameformulator from '../gameformulator.js';
import boardutil from '../../../../../../shared/chess/util/boardutil.js';
import coordutil from '../../../../../../shared/chess/util/coordutil.js';
import legalmoves from '../../../../../../shared/chess/logic/legalmoves.js';
import specialdetect from '../../../../../../shared/chess/logic/specialdetect.js';

// Import WASM glue code statically so esbuild can bundle it and handle the .wasm file
import init, * as wasmBindings from './hydrochess-wasm/pkg/hydrochess_wasm.js';
import wasmUrl from './hydrochess-wasm/pkg/hydrochess_wasm_bg.wasm';

let wasm = wasmBindings;
let wasmInitialized = false;
let wasmInitPromise = null;

// Initializes the WASM module.
// @returns {Promise} Promise that resolves when the WASM module is initialized
async function initWasm() {
	if (!wasmInitPromise) {
		console.debug('[Engine] Initializing HydroChess WASM module');
		wasmInitPromise = init({ module_or_path: wasmUrl })
			.then(() => {
				console.debug('[Engine] HydroChess WASM module initialized');
				try {
					wasmBindings.init_panic_hook();
				} catch (e) {
					console.warn("[Engine] Failed to init panic hook", e);
				}
				wasmInitialized = true;
				postMessage("readyok"); // Signal that the engine is ready
				return true;
			})
			.catch(err => {
				console.error('[Engine] Failed to initialize HydroChess WASM module', err);
				wasmInitialized = false;
				return false;
			});
	}
	// Ensure the promise is awaited and the boolean result is returned
	return await wasmInitPromise;
}

// Initialize WASM when the module is loaded
initWasm();

// Main entry point for the engine
self.onmessage = async function (e) {
	const data = e.data;

	// Ensure WASM is initialized before processing commands
	if (!wasmInitialized) {
		const initialized = await initWasm();
		if (!initialized) {
			console.error("[Engine] WASM module failed to initialize");
			postMessage(null);
			return;
		}
	}

	try {
		// Formulate gamefile from logical format
		const current_gamefile = gameformulator.formulateGame(data.lf);

		if (!current_gamefile) {
			console.error("[Engine] Failed to formulate gamefile from data.lf");
			postMessage(null);
			return;
		}

		// Engine color passed in from enginegame.ts as youAreColor (1 = White, 2 = Black)
		const engineColor = data.youAreColor;

		// Convert to Rust-expected format.
		// engineColor is only used on the JS side to decide when to call the engine;
		// the Rust side just needs the current side-to-move from whosTurn.
		const rustGameState = convertGameToRustFormat(current_gamefile);

		console.debug("[Engine] Creating engine with game state:", rustGameState);

		// Create Engine instance with the game state
		const engine = new wasm.Engine(rustGameState);

		// Find the best move. If a time limit is provided via engineConfig,
		// use the timed search entry point so the Rust engine obeys the
		// same per-move limit as the JS engines.
		let bestMoveResult;
		const timeLimit = data.engineConfig && typeof data.engineConfig.engineTimeLimitPerMoveMillis === 'number'
			? data.engineConfig.engineTimeLimitPerMoveMillis
			: null;
		if (timeLimit !== null && Number.isFinite(timeLimit) && timeLimit > 0) {
			bestMoveResult = engine.get_best_move_with_time(timeLimit);
		} else {
			bestMoveResult = engine.get_best_move();
		}

		// Free the engine
		engine.free();

		if (!bestMoveResult) {
			console.error('[Engine] No best move result returned from WASM');
			postMessage(null);
			return;
		}

		// Convert WASM move format {from: "x,y", to: "x,y", promotion: "q"}
		// to MoveDraft format {startCoords: [BigInt, BigInt], endCoords: [BigInt, BigInt], promotion?: number}
		const moveDraft = convertWasmMoveToMoveDraft(bestMoveResult, engineColor);

		// Reconstruct special move flags (en passant, castling, etc.)
		try {
			attachSpecialFlagsToMoveDraft(current_gamefile, moveDraft);
		} catch (err) {
			console.error('[Engine] Failed to attach special flags to moveDraft:', err);
		}

		console.debug('[Engine] Best move:', moveDraft);

		// return the best move
		postMessage(moveDraft);
	} catch (error) {
		console.error(`[Engine] Error finding best move:`, error);
		postMessage(null);
	}
};

/**
 * Convert FullGame format to the Rust WASM expected format
 * Now includes:
 * - All pieces including neutral/blocker pieces
 * - All special rights (castling + pawn double-move)
 * - Game rules (promotion ranks, allowed promotions)
 * Side-to-move is taken directly from gamefile.basegame.whosTurn.
 */
function convertGameToRustFormat(gamefile) {
	console.debug("[Engine] Converting gamefile. Keys:", Object.keys(gamefile));

	const pieces = [];

	// Prefer the true START position for reconstruction:
	//   - boardsim.startSnapshot.position (normal FullGame)
	//   - gamefile.startSnapshot.position (older formats)
	//   - gamefile.position (very simple/legacy formats)
	const startPosition =
		gamefile.boardsim?.startSnapshot?.position ||
		gamefile.startSnapshot?.position ||
		gamefile.position;
	const piecesObj = gamefile.boardsim?.pieces;

	if (startPosition && typeof startPosition.forEach === 'function') {
		// Iterate over start position map (keys are "x,y").
		startPosition.forEach((pieceValue, coordsKey) => {
			const coords = coordsKey.split(',');
			const { rawType, color } = decodeType(pieceValue);

			pieces.push({
				x: coords[0],
				y: coords[1],
				piece_type: getPieceTypeCodeFromRaw(rawType),
				player: getPlayerCodeFromColor(color)
			});
		});
	} else if (piecesObj && piecesObj.coords) {
		// Fallback: derive starting position from boardsim.pieces (current pieces)
		for (const [coordsKey, idx] of piecesObj.coords) {
			const type = piecesObj.types[idx];
			const coords = coordsKey.split(',');

			const { rawType, color } = decodeType(type);

			pieces.push({
				x: coords[0],
				y: coords[1],
				piece_type: getPieceTypeCodeFromRaw(rawType),
				player: getPlayerCodeFromColor(color)
			});
		}
	} else {
		console.error("[Engine] No position found in gamefile");
		throw new Error("No position found in gamefile");
	}

	console.debug(`[Engine] Extracted ${pieces.length} pieces`);

	// Extract INITIAL special rights - includes both castling (kings/rooks)
	// AND pawn double-move rights. These come from the START position; the
	// Rust engine will update them itself when replaying moves.
	const special_rights = [];
	const specialRightsData = gamefile.boardsim?.startSnapshot?.state_global?.specialRights ||
		gamefile.startSnapshot?.state_global?.specialRights ||
		gamefile.specialRights;

	if (specialRightsData && typeof specialRightsData.forEach === 'function') {
		specialRightsData.forEach((coordsKey) => {
			// Add ALL special rights - Rust engine will handle them appropriately
			special_rights.push(coordsKey);
		});
	}

	// Extract INITIAL en passant - only from the starting snapshot / gamefile,
	// not from the current boardsim state. For normal games this will be null;
	// the Rust engine will recompute en passant squares by replaying moves.
	let en_passant = null;
	const enpassantData = gamefile.startSnapshot?.state_global?.enpassant ||
		gamefile.enpassant;

	if (enpassantData) {
		let square, pawnSquare;

		if (Array.isArray(enpassantData)) {
			// Legacy format: [x, y] - just the en passant square
			const x = String(enpassantData[0]);
			const y = String(enpassantData[1]);
			square = `${x},${y}`;
			// Infer pawn square (one rank behind the en passant capture square)
			const yNum = Number(enpassantData[1]);
			const pawnY = yNum > 4 ? yNum - 1 : yNum + 1;
			pawnSquare = `${x},${pawnY}`;
		} else if (typeof enpassantData === 'string') {
			// Format: "x,y"
			const parts = enpassantData.split(',');
			square = enpassantData;
			const yNum = parseInt(parts[1]);
			const pawnY = yNum > 4 ? yNum - 1 : yNum + 1;
			pawnSquare = `${parts[0]},${pawnY}`;
		} else if (enpassantData.square) {
			// Proper format: { square: [x,y] or "x,y", pawn: [x,y] or "x,y" }
			if (Array.isArray(enpassantData.square)) {
				square = `${enpassantData.square[0]},${enpassantData.square[1]}`;
			} else {
				square = enpassantData.square;
			}

			if (enpassantData.pawn) {
				if (Array.isArray(enpassantData.pawn)) {
					pawnSquare = `${enpassantData.pawn[0]},${enpassantData.pawn[1]}`;
				} else {
					pawnSquare = enpassantData.pawn;
				}
			} else {
				// Infer pawn square if not provided
				const parts = square.split(',');
				const yNum = parseInt(parts[1]);
				const pawnY = yNum > 4 ? yNum - 1 : yNum + 1;
				pawnSquare = `${parts[0]},${pawnY}`;
			}
		}

		if (square && pawnSquare) {
			en_passant = {
				square: square,
				pawn_square: pawnSquare
			};
		}
	}

	// Move clocks - moveRuleState is the halfmove counter for 50-move rule
	const halfmove_clock = gamefile.boardsim?.state?.global?.moveRuleState ??
		gamefile.startSnapshot?.state_global?.moveRuleState ?? 0;

	// fullMove is on basegame, not boardsim.state
	const fullmove_number = gamefile.basegame?.fullMove ??
		gamefile.startSnapshot?.fullMove ?? 1;

	// Extract move history for proper repetition detection
	const move_history = [];
	const moves = gamefile.basegame?.moves ?? [];
	for (const move of moves) {
		if (move.startCoords && move.endCoords) {
			move_history.push({
				from: `${move.startCoords[0]},${move.startCoords[1]}`,
				to: `${move.endCoords[0]},${move.endCoords[1]}`,
				promotion: move.promotion ? getRawTypeStr(move.promotion) : null
			});
		}
	}

	// Extract game rules for variant-specific behavior
	const gameRules = gamefile.basegame?.gameRules;
	let game_rules = null;

	if (gameRules) {
		game_rules = {};

		// Promotion ranks - where pawns promote
		if (gameRules.promotionRanks) {
			game_rules.promotion_ranks = {
				// Convert BigInts to strings for JSON serialization
				white: (gameRules.promotionRanks[1] || []).map(r => String(r)),
				black: (gameRules.promotionRanks[2] || []).map(r => String(r))
			};
		}

		// Allowed promotion piece types
		if (gameRules.promotionsAllowed) {
			game_rules.promotions_allowed = [];
			const whitePromos = gameRules.promotionsAllowed[1] || [];
			for (const rawType of whitePromos) {
				const code = getPieceTypeCodeFromRaw(rawType);
				if (!game_rules.promotions_allowed.includes(code)) {
					game_rules.promotions_allowed.push(code);
				}
			}
		}
	}

	// Starting side for the game: derive from gameRules.turnOrder[0] when present.
	// 1 = White, 2 = Black. This is the color that moved first; the Rust side
	// will reconstruct the current turn by replaying move history.
	let turn = 'w';
	if (gameRules && Array.isArray(gameRules.turnOrder) && gameRules.turnOrder.length > 0) {
		const first = gameRules.turnOrder[0];
		if (first === 2 || first === 'black') {
			turn = 'b';
		} else if (first === 1 || first === 'white') {
			turn = 'w';
		}
	}

	// World bounds from playableRegion (BigInt values). These define the
	// effective "world border" for this game and are used by the Rust side
	// to clamp move generation. Small rounding differences are harmless.
	let world_bounds = null;
	const playable = gamefile.boardsim?.playableRegion;
	if (playable && typeof playable.left === 'bigint') {
		world_bounds = {
			left: String(playable.left),
			right: String(playable.right),
			bottom: String(playable.bottom),
			top: String(playable.top),
		};
	}

	return {
		board: { pieces },
		turn,
		special_rights,
		en_passant,
		halfmove_clock,
		fullmove_number,
		move_history,
		game_rules,
		world_bounds,
	};
}

const NUM_TYPES = 22;

function decodeType(type) {
	return {
		rawType: type % NUM_TYPES,
		color: Math.floor(type / NUM_TYPES)
	};
}

/**
 * Convert raw piece type to single-character code for Rust engine
 * Must match PieceType::from_str() in Rust
 */
function getPieceTypeCodeFromRaw(rawType) {
	const typeMap = {
		0: 'v',  // Void
		1: 'x',  // Obstacle (blocker)
		2: 'k',  // King
		3: 'i',  // Giraffe
		4: 'l',  // Camel
		5: 'z',  // Zebra
		6: 's',  // Knightrider
		7: 'm',  // Amazon
		8: 'q',  // Queen
		9: 'y',  // RoyalQueen
		10: 'h', // Hawk
		11: 'c', // Chancellor
		12: 'a', // Archbishop
		13: 'e', // Centaur
		14: 'd', // RoyalCentaur
		15: 'o', // Rose
		16: 'n', // Knight
		17: 'g', // Guard
		18: 'u', // Huygen
		19: 'r', // Rook
		20: 'b', // Bishop
		21: 'p'  // Pawn
	};
	return typeMap[rawType] || 'p';
}

/**
 * Convert raw type number to string code (for promotions)
 */
function getRawTypeStr(typeCode) {
	const { rawType } = decodeType(typeCode);
	return getPieceTypeCodeFromRaw(rawType);
}

/**
 * Convert player color number to single-character code
 * 0 = Neutral, 1 = White, 2 = Black
 */
function getPlayerCodeFromColor(color) {
	const colorMap = {
		0: 'n',  // Neutral (blockers/obstacles)
		1: 'w',  // White
		2: 'b',  // Black
	};
	return colorMap[color] || 'n';
}

/**
 * Convert WASM move format to JS MoveDraft format
 * WASM: { from: "x,y", to: "x,y", promotion: "q" | null }
 * JS MoveDraft: { startCoords: [BigInt, BigInt], endCoords: [BigInt, BigInt], promotion?: number }
 */
function convertWasmMoveToMoveDraft(wasmMove, engineColor) {
	const fromParts = wasmMove.from.split(',');
	const toParts = wasmMove.to.split(',');

	const startCoords = [BigInt(fromParts[0]), BigInt(fromParts[1])];
	const endCoords = [BigInt(toParts[0]), BigInt(toParts[1])];

	const moveDraft = { startCoords, endCoords };

	// Handle promotion if present
	if (wasmMove.promotion) {
		// Convert piece letter to full typed code (includes color)
		moveDraft.promotion = promotionStringToType(wasmMove.promotion, engineColor);
	}

	return moveDraft;
}

/**
 * Attach special move flags (en passant, castling, etc.) to minimal MoveDraft.
 */
function attachSpecialFlagsToMoveDraft(gamefile, moveDraft) {
	if (!gamefile || !moveDraft) return;
	if (!gamefile.boardsim || !gamefile.boardsim.pieces) return;

	// Find the moving piece on the board
	const piece = boardutil.getPieceFromCoords(gamefile.boardsim.pieces, moveDraft.startCoords);
	if (!piece) return;

	// Get moveset and special moves for this piece
	const moveset = legalmoves.getPieceMoveset(gamefile.boardsim, piece.type);
	const legalSpecialMoves = legalmoves.getEmptyLegalMoves(moveset);
	legalmoves.appendSpecialMoves(gamefile, piece, moveset, legalSpecialMoves, false);

	// Find the special-move coordinate matching our endCoords and transfer its flags
	for (const coord of legalSpecialMoves.individual) {
		if (!coordutil.areCoordsEqual(coord, moveDraft.endCoords)) continue;
		specialdetect.transferSpecialFlags_FromCoordsToMove(coord, moveDraft);
		break;
	}
}

/**
 * Convert promotion piece letter to integer
 */
function promotionStringToType(promotion, engineColor) {
	const promotionMap = {
		'v': 0,   // Void
		'x': 1,   // Obstacle
		'k': 2,   // King
		'i': 3,   // Giraffe
		'l': 4,   // Camel
		'z': 5,   // Zebra
		's': 6,   // Knightrider
		'm': 7,   // Amazon
		'q': 8,   // Queen
		'y': 9,   // RoyalQueen
		'h': 10,  // Hawk
		'c': 11,  // Chancellor
		'a': 12,  // Archbishop
		'e': 13,  // Centaur
		'd': 14,  // RoyalCentaur
		'o': 15,  // Rose
		'n': 16,  // Knight
		'g': 17,  // Guard
		'u': 18,  // Huygen
		'r': 19,  // Rook
		'b': 20,  // Bishop
		'p': 21,  // Pawn
	};

	// raw piece kind (0–21)
	const rawType = promotionMap[promotion.toLowerCase()] ?? 8; // default queen

	// engineColor is 1 (White) or 2 (Black)
	const color = engineColor === 2 ? 2 : 1;

	// Full typed piece code = color * NUM_TYPES + rawType
	return color * NUM_TYPES + rawType;
}