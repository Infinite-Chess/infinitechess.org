/**
 * HydroChess Engine - WASM Version
 * A JavaScript wrapper for the WASM implementation of HydroChess
 *
 * @author FirePlank
 */

import type { FullGame } from '../../../../../../shared/chess/logic/gamefile.js';
import type { LongFormatIn } from '../../../../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../../../../shared/chess/util/typeutil.js';
import gameformulator from '../gameformulator.js';

// Import WASM glue code statically so esbuild can bundle it and handle the .wasm file
// @ts-ignore
import init, * as wasmBindings from '../../../../../pkg/hydrochess/pkg/hydrochess_wasm.js';
// @ts-ignore
import wasmUrl from '../../../../../pkg/hydrochess/pkg/hydrochess_wasm_bg.wasm';

const wasm = wasmBindings as typeof wasmBindings;
let wasmInitialized = false;
let wasmInitPromise: Promise<boolean> | null = null;

interface EngineConfig {
	engineTimeLimitPerMoveMillis?: number;
	strengthLevel?: number;
	multiPv?: number;
}

interface EngineWorkerMessage {
	stringGamefile: string;
	lf: LongFormatIn;
	engineConfig?: EngineConfig;
	youAreColor: number;
	wtime?: number;
	btime?: number;
	winc?: number;
	binc?: number;
	requestGeneratedMoves?: boolean;
}

interface RustClockTiming {
	wtime: number;
	btime: number;
	winc: number;
	binc: number;
}

interface RustEnPassantInfo {
	square: string;
	pawn_square: string;
}

interface RustMoveHistoryItem {
	from: string;
	to: string;
	promotion: string | null;
}

interface RustGameRules {
	promotion_ranks?: {
		white: string[];
		black: string[];
	};
	promotions_allowed?: string[];
	move_rule?: number;
	win_conditions?: {
		white: string[];
		black: string[];
	};
}

interface RustWorldBounds {
	left: string;
	right: string;
	bottom: string;
	top: string;
}

interface RustClockInfo {
	wtime: number;
	btime: number;
	winc: number;
	binc: number;
}

interface RustPieceEntry {
	x: string;
	y: string;
	piece_type: string;
	player: string;
}

interface RustGameState {
	board: { pieces: RustPieceEntry[] };
	turn: 'w' | 'b';
	special_rights: string[];
	en_passant: RustEnPassantInfo | null;
	halfmove_clock: number;
	fullmove_number: number;
	move_history: RustMoveHistoryItem[];
	game_rules: RustGameRules | null;
	world_bounds: RustWorldBounds | null;
	clock: RustClockInfo | null;
	variant: string | null;
	strength_level: number;
}

interface WasmBestMoveResult {
	from: string;
	to: string;
	promotion?: string | null;
	// eval and depth are present but not used here
	// eval?: number;
	// depth?: number;
}

// Initializes the WASM module.
// @returns Promise that resolves when the WASM module is initialized
async function initWasm(): Promise<boolean> {
	if (!wasmInitPromise) {
		console.debug('[Engine] Initializing HydroChess WASM module');
		wasmInitPromise = init({ module_or_path: wasmUrl })
			.then(async () => {
				console.debug('[Engine] HydroChess WASM module initialized');
				wasmInitialized = true;

				postMessage('readyok');
				return true;
			})
			.catch((err: unknown) => {
				console.error('[Engine] Failed to initialize HydroChess WASM module', err);
				wasmInitialized = false;
				return false;
			});
	}
	return wasmInitPromise!;
}

// Initialize WASM when the module is loaded
void initWasm();

// Main entry point for the engine
self.onmessage = async function (e: MessageEvent<EngineWorkerMessage>): Promise<void> {
	const data = e.data;

	// Ensure WASM is initialized before processing commands
	if (!wasmInitialized) {
		const initialized = await initWasm();
		if (!initialized) {
			console.error('[Engine] WASM module failed to initialize');
			postMessage({ type: 'move', data: null });
			return;
		}
	}

	try {
		// Formulate gamefile from logical format
		const current_gamefile = gameformulator.formulateGame(data.lf);

		if (!current_gamefile) {
			console.error('[Engine] Failed to formulate gamefile from data.lf');
			postMessage({ type: 'move', data: null });
			return;
		}

		// Engine color passed in from enginegame.ts as youAreColor (1 = White, 2 = Black)
		const engineColor = data.youAreColor;

		// Convert to Rust-expected format.
		// engineColor is only used on the JS side to decide when to call the engine;
		// the Rust side just needs the current side-to-move from whosTurn.
		// Also pass through timing information (wtime/btime/winc/binc) if provided.
		let timeLimit: number | null = null;
		if (
			data.engineConfig &&
			typeof data.engineConfig.engineTimeLimitPerMoveMillis === 'number'
		) {
			timeLimit = data.engineConfig.engineTimeLimitPerMoveMillis;
		}

		// Strength level from UI: 1 = Easy, 2 = Medium, 3 = Hard.
		let strengthLevel = 3;
		if (data.engineConfig && typeof data.engineConfig.strengthLevel === 'number') {
			strengthLevel = data.engineConfig.strengthLevel;
		}
		if (!Number.isFinite(strengthLevel)) strengthLevel = 3;
		strengthLevel = Math.max(1, Math.min(3, Math.floor(strengthLevel)));

		let multiPv = 1;
		if (data.engineConfig && typeof data.engineConfig.multiPv === 'number') {
			multiPv = data.engineConfig.multiPv;
		}
		if (!Number.isFinite(multiPv)) multiPv = 1;
		multiPv = Math.max(1, Math.min(10, Math.floor(multiPv)));

		const hasTiming =
			Number.isFinite(data.wtime) &&
			Number.isFinite(data.btime) &&
			(data.wtime as number) >= 0 &&
			(data.btime as number) >= 0;
		// prettier-ignore
		const timing: RustClockTiming | undefined = hasTiming ? {
			wtime: data.wtime as number,
			btime: data.btime as number,
			winc: Number.isFinite(data.winc) ? (data.winc as number) : 0,
			binc: Number.isFinite(data.binc) ? (data.binc as number) : 0,
		} : undefined;

		const rustGameState: RustGameState = convertGameToRustFormat(
			current_gamefile,
			timing,
			strengthLevel,
		);

		let bestMoveResult: WasmBestMoveResult | null;
		const engine = new wasm.Engine(rustGameState as any);

		// If the main code requested the generated moves for debugging, send those here.
		if (data.requestGeneratedMoves === true) {
			const legalMoves: WasmBestMoveResult[] = engine.get_legal_moves_js();
			// console.log('Rust legal moves: ', legalMoves);
			const formattedMoves: string[] = legalMoves.map((m) => `${m.from}>${m.to}`); // ["x,y>x,y", ...]
			// Send the generated moves back to the main thread for rendering
			postMessage({ type: 'generatedMoves', data: formattedMoves });
			engine.free();
			return;
		}

		if (timeLimit !== null && Number.isFinite(timeLimit) && timeLimit > 0) {
			bestMoveResult = engine.get_best_move_with_time(timeLimit, true, undefined);
		} else {
			bestMoveResult = engine.get_best_move();
		}
		engine.free();

		if (!bestMoveResult) {
			console.error('[Engine] No best move result returned from WASM');
			postMessage({ type: 'move', data: null });
			return;
		}

		// Format: "x,y>x,y" or "x,y>x,y=Q" (promotion)
		const from = bestMoveResult.from;
		const to = bestMoveResult.to;
		let moveString = `${from}>${to}`;
		if (bestMoveResult.promotion) {
			const promoAbbr = mapRustPromotionToSiteAbbr(bestMoveResult.promotion, engineColor);
			moveString += `=${promoAbbr}`;
		}

		postMessage({ type: 'move', data: moveString });
	} catch (error) {
		console.error(`[Engine] Error finding best move:`, error);
		postMessage({ type: 'move', data: null });
	}
};

function convertGameToRustFormat(
	gamefile: FullGame,
	timing: RustClockTiming | undefined,
	strengthLevel: number,
): RustGameState {
	const pieces: RustPieceEntry[] = [];

	const startPosition = gamefile.boardsim.startSnapshot.position;
	const piecesObj = gamefile.boardsim.pieces;

	if (startPosition && typeof startPosition.forEach === 'function') {
		startPosition.forEach((pieceValue: number, coordsKey: string) => {
			const coords = coordsKey.split(',');
			const { rawType, color } = decodeType(pieceValue);

			pieces.push({
				x: coords[0]!,
				y: coords[1]!,
				piece_type: getPieceTypeCodeFromRaw(rawType),
				player: getPlayerCodeFromColor(color),
			});
		});
	} else if (piecesObj && piecesObj.coords) {
		// coords is a Map from CoordsKey (string) to piece index
		for (const [coordsKey, idx] of piecesObj.coords) {
			const type = piecesObj.types[idx]!;
			const coords = coordsKey.split(',');
			const { rawType, color } = decodeType(type);

			pieces.push({
				x: coords[0]!,
				y: coords[1]!,
				piece_type: getPieceTypeCodeFromRaw(rawType),
				player: getPlayerCodeFromColor(color),
			});
		}
	} else {
		console.error('[Engine] No position found in gamefile');
		throw new Error('No position found in gamefile');
	}

	const special_rights: string[] = [];
	const specialRightsData = gamefile.boardsim.startSnapshot.state_global.specialRights;

	if (specialRightsData && typeof specialRightsData.forEach === 'function') {
		specialRightsData.forEach((coordsKey: string) => {
			special_rights.push(coordsKey);
		});
	}

	let en_passant: RustEnPassantInfo | null = null;
	const enpassantData = gamefile.boardsim.startSnapshot.state_global.enpassant;

	if (enpassantData) {
		const [sqX, sqY] = enpassantData.square;
		const [pawnX, pawnY] = enpassantData.pawn;
		const square = `${sqX},${sqY}`;
		const pawnSquare = `${pawnX},${pawnY}`;
		en_passant = {
			square,
			pawn_square: pawnSquare,
		};
	}

	const halfmove_clock: number = gamefile.boardsim.state.global.moveRuleState ?? 0;

	// Derive the current fullmove number from the starting fullMove and number of moves played.
	const startFullMove = gamefile.boardsim.startSnapshot.fullMove;
	const plyPerFullMove = gamefile.basegame.gameRules.turnOrder.length ?? 2;
	const fullmove_number =
		startFullMove + Math.floor(gamefile.basegame.moves.length / plyPerFullMove);

	const move_history: RustMoveHistoryItem[] = [];
	const moves = gamefile.basegame?.moves ?? [];
	for (const move of moves) {
		if (move.startCoords && move.endCoords) {
			move_history.push({
				from: `${move.startCoords[0]},${move.startCoords[1]}`,
				to: `${move.endCoords[0]},${move.endCoords[1]}`,
				promotion: move.promotion ? getRawTypeStr(move.promotion) : null,
			});
		}
	}

	const gameRules = gamefile.basegame.gameRules;
	let game_rules: RustGameRules | null = null;

	if (gameRules) {
		game_rules = {};

		if (gameRules.promotionRanks) {
			game_rules.promotion_ranks = {
				white: (gameRules.promotionRanks[p.WHITE] || []).map((r: bigint) => String(r)),
				black: (gameRules.promotionRanks[p.BLACK] || []).map((r: bigint) => String(r)),
			};
		}

		if (gameRules.promotionsAllowed) {
			game_rules.promotions_allowed = [];
			const whitePromos = gameRules.promotionsAllowed[p.WHITE] || [];
			for (const rawType of whitePromos) {
				const code = getPieceTypeCodeFromRaw(rawType);
				if (!game_rules.promotions_allowed.includes(code)) {
					game_rules.promotions_allowed.push(code);
				}
			}
		}

		if (typeof gameRules.moveRule !== 'undefined') {
			game_rules.move_rule = Number(gameRules.moveRule);
		}

		game_rules.win_conditions = {
			white: gameRules.winConditions[p.WHITE] || [],
			black: gameRules.winConditions[p.BLACK] || [],
		};
	}

	let turn: 'w' | 'b' = 'w';
	if (gameRules && Array.isArray(gameRules.turnOrder) && gameRules.turnOrder.length > 0) {
		const first = gameRules.turnOrder[0];
		if (first === p.BLACK) {
			turn = 'b';
		} else if (first === p.WHITE) {
			turn = 'w';
		}
	}

	let world_bounds: RustWorldBounds | null = null;
	const worldBorder = gamefile.basegame.gameRules.worldBorder;
	if (worldBorder) {
		world_bounds = {
			left: String(worldBorder.left),
			right: String(worldBorder.right),
			bottom: String(worldBorder.bottom),
			top: String(worldBorder.top),
		};
	}

	let clock: RustClockInfo | null = null;
	if (timing && typeof timing === 'object') {
		const { wtime, btime, winc, binc } = timing;
		if (Number.isFinite(wtime) && Number.isFinite(btime) && wtime >= 0 && btime >= 0) {
			clock = {
				wtime: Math.floor(wtime),
				btime: Math.floor(btime),
				winc: Number.isFinite(winc) ? Math.floor(winc) : 0,
				binc: Number.isFinite(binc) ? Math.floor(binc) : 0,
			};
		}
	}

	const variant: string | null = gamefile.basegame?.metadata?.Variant || null;

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
		clock,
		variant,
		strength_level: strengthLevel,
	};
}

const NUM_TYPES = 22;

function decodeType(type: number): { rawType: number; color: number } {
	return {
		rawType: type % NUM_TYPES,
		color: Math.floor(type / NUM_TYPES),
	};
}

function getPieceTypeCodeFromRaw(rawType: number): string {
	const typeMap: Record<number, string> = {
		0: 'v',
		1: 'x',
		2: 'k',
		3: 'i',
		4: 'l',
		5: 'z',
		6: 's',
		7: 'm',
		8: 'q',
		9: 'y',
		10: 'h',
		11: 'c',
		12: 'a',
		13: 'e',
		14: 'd',
		15: 'o',
		16: 'n',
		17: 'g',
		18: 'u',
		19: 'r',
		20: 'b',
		21: 'p',
	};
	return typeMap[rawType] || 'p';
}

function getRawTypeStr(typeCode: number): string {
	const { rawType } = decodeType(typeCode);
	return getPieceTypeCodeFromRaw(rawType);
}

function getPlayerCodeFromColor(color: number): string {
	const colorMap: Record<number, string> = {
		0: 'n',
		1: 'w',
		2: 'b',
	};
	return colorMap[color] || 'n';
}

function mapRustPromotionToSiteAbbr(
	promotion: string | null | undefined,
	engineColor: number,
): string {
	const code = String(promotion ?? '').toLowerCase();
	const isWhite = engineColor === 1;
	const map: Record<string, { w: string; b: string }> = {
		q: { w: 'Q', b: 'q' },
		r: { w: 'R', b: 'r' },
		b: { w: 'B', b: 'b' },
		n: { w: 'N', b: 'n' },
		m: { w: 'AM', b: 'am' },
		h: { w: 'HA', b: 'ha' },
		c: { w: 'CH', b: 'ch' },
		a: { w: 'AR', b: 'ar' },
		e: { w: 'CE', b: 'ce' },
		g: { w: 'GU', b: 'gu' },
		l: { w: 'CA', b: 'ca' },
		i: { w: 'GI', b: 'gi' },
		z: { w: 'ZE', b: 'ze' },
		y: { w: 'RQ', b: 'rq' },
		d: { w: 'RC', b: 'rc' },
		s: { w: 'NR', b: 'nr' },
		u: { w: 'HU', b: 'hu' },
		o: { w: 'RO', b: 'ro' },
		k: { w: 'K', b: 'k' },
		p: { w: 'P', b: 'p' },
	};
	const entry = map[code];
	if (!entry) return isWhite ? 'Q' : 'q';
	return isWhite ? entry.w : entry.b;
}

export {};
