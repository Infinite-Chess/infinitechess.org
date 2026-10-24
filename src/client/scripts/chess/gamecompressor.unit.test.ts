// src/client/scripts/chess/gamecompressor.unit.test.ts

/**
 * Tests for gamecompressor: the metadata a compressed gamefile is given,
 * and that stepping a position forward zero halfmoves returns it untouched.
 */

import type { GameRules } from '../../../shared/chess/util/gamerules.js';
import type { GameFile, VariantOptions } from '../../../shared/chess/logic/gamefile.js';

import { describe, it, expect } from 'vitest';

import { players as p } from '../../../shared/chess/util/typeutil.js';

import gamecompressor from './gamecompressor.js';

describe('gamecompressor', () => {
	describe('compressGamefile', () => {
		it('should compress a basic gamefile correctly', () => {
			const mockGame: GameFile = {
				timeControl: '-',
				dateTimestamp: Date.UTC(1987, 5, 27, 12, 0, 0),
				whosTurn: p.WHITE,
				untimed: true,
				clocks: undefined,
				startSnapshot: {
					position: new Map(),
					fullMove: 1,
					state_global: {
						specialRights: new Set(),
					},
				},
				// The game rules are essential for the compressor to know the turn order
				gameRules: {
					turnOrder: [p.WHITE, p.BLACK],
				} as any,
				moves: [],
				state: {
					local: {
						moveIndex: -1,
					},
				},
			} as any;

			const result = gamecompressor.compressGamefile(mockGame);

			// Metadata is assembled on demand from the gamefile's source-of-truth props.
			expect(result.metadata).toEqual({
				TimeControl: '-',
				UTCDate: '1987.06.27',
				UTCTime: '12:00:00',
			});
			expect(result.fullMove).toBe(1);
			expect(result.moves).toEqual([]);
		});
	});

	describe('gameToPosition', () => {
		it('should return the same state if halfmoves is 0', () => {
			const initialState: VariantOptions = {
				position: new Map(),
				gameRules: { turnOrder: [p.WHITE, p.BLACK] } as GameRules,
				fullMove: 1,
				state_global: {
					specialRights: new Set(),
				},
			};

			const result = gamecompressor.gameToPosition(initialState, [], 0);
			expect(result).toBe(initialState);
		});
	});
});
