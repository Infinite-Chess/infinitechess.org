// src/client/scripts/esm/views/index/index.ts

import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import lobby, { LobbySeek } from './lobby.js';

import './gameSetupModal.js';

// TESTING SEEK LIST RENDERING FROM A LIST OF SEEKS.
// DELETE ONCE CONNECTED TO BACKEND AND RENDERING REAL SEEKS.

const EXAMPLE_SEEKS: LobbySeek[] = [
	// Standard example
	{
		id: 'seek1',
		tag: 'tag1',
		player: {
			type: 'player',
			username: 'XxSuperChargedxX',
			rating: { value: 1758, confident: false },
		},
		color: null,
		variant: { group: 'standard', code: 'Classical' },
		time: '1500+5',
		mode: 'rated',
	},
	// Horde example
	{
		id: 'seek2',
		tag: 'tag2',
		player: { type: 'guest', username: '(Guest)' },
		color: p.WHITE,
		variant: { group: 'horde', code: 'Pawn_Horde' },
		time: '-',
		mode: 'casual',
	},
	// 4D example
	{
		id: 'seek3',
		tag: 'tag3',
		player: {
			type: 'player',
			username: '4DEnthusiast',
			rating: { value: 1900, confident: true },
		},
		color: p.BLACK,
		variant: { group: '4D', code: '5D_Chess' },
		time: '900+10',
		mode: 'rated',
	},
	// Showcase example
	{
		id: 'seek4',
		tag: 'tag4',
		player: {
			type: 'player',
			username: 'ChessMaster3000',
			rating: { value: 2200, confident: true },
		},
		color: null,
		variant: { group: 'showcase', code: 'Omega_Squared' },
		time: '180+1',
		mode: 'rated',
	},
	// Custom example
	{
		id: 'seek5',
		tag: 'tag5',
		player: {
			type: 'player',
			username: 'CustomVariantFan',
			rating: { value: 1500, confident: false },
		},
		color: null,
		variant: { group: 'custom', name: 'Custom Variant' },
		time: '60+1',
		mode: 'casual',
	},
];

lobby.renderSeekList(EXAMPLE_SEEKS);
