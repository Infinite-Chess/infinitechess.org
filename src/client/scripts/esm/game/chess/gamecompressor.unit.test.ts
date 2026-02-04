// src/client/scripts/esm/game/chess/gamecompressor.unit.test.ts

import type { FullGame } from '../../../../../shared/chess/logic/gamefile.js';
import type { SimplifiedGameState } from './gamecompressor.js';

import { describe, it, expect } from 'vitest';

import gamecompressor from './gamecompressor.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';

describe('gamecompressor', () => {
	describe('compressGamefile', () => {
		it('should compress a basic gamefile correctly', () => {
			const mockMetaData = {
				Event: 'Boston Infinite Chess Party',
				Site: 'https://www.infinitechess.org/',
				TimeControl: '-',
				Round: '-',
				UTCDate: '1987.06.27',
				UTCTime: '12:00:00',
				Variant: 'standard',
				White: 'Rick',
				Black: 'Waterman',
			} as const;

			const mockGame: FullGame = {
				basegame: {
					metadata: mockMetaData,
					// The game rules are essential for the compressor to know the turn order
					gameRules: {
						turnOrder: [players.WHITE, players.BLACK],
					} as any,
					moves: [],
					whosTurn: players.WHITE,
					untimed: true,
					clocks: undefined,
				},
				boardsim: {
					startSnapshot: {
						position: new Map(),
						fullMove: 1,
						state_global: {
							specialRights: new Set(),
						},
					},
					moves: [],
					state: {
						local: {
							moveIndex: -1,
						},
					},
				} as any,
			};

			const result = gamecompressor.compressGamefile(mockGame);

			expect(result.metadata).toEqual(mockGame.basegame.metadata);
			expect(result.fullMove).toBe(1);
			expect(result.moves).toEqual([]);
		});
	});

	describe('GameToPosition', () => {
		it('should return the same state if halfmoves is 0', () => {
			const initialState: SimplifiedGameState = {
				position: new Map(),
				turnOrder: [players.WHITE, players.BLACK],
				fullMove: 1,
				state_global: {
					specialRights: new Set(),
				},
			};

			const result = gamecompressor.GameToPosition(initialState, [], 0);
			expect(result).toBe(initialState);
		});
	});
});
