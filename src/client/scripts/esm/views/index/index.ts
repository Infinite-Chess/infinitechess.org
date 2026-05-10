// src/client/scripts/esm/views/index/index.ts

import { LobbySeek } from '../../../../../shared/types.js';
import { players as p } from '../../../../../shared/chess/util/typeutil.js';

import lobby from './lobby.js';

import './gameSetupModal.js';

// TESTING SEEK LIST RENDERING FROM A LIST OF SEEKS.
// DELETE ONCE CONNECTED TO BACKEND AND RENDERING REAL SEEKS.

const EXAMPLE_SEEKS: LobbySeek[] = [
	{
		id: 'seek1',
		tag: 'tag1',
		player: {
			type: 'player',
			username: 'XxSuperChargedxX',
			rating: { value: 1758, confident: false },
		},
		color: null,
		variant: { group: 'standard', name: 'Classical' },
		time: '300+5',
		mode: 'rated',
	},
	{
		id: 'seek2',
		tag: 'tag2',
		player: { type: 'guest', username: '(Guest)' },
		color: p.WHITE,
		variant: { group: 'horde', name: 'Horde Chess' },
		time: '-',
		mode: 'casual',
	},
];

lobby.renderSeekList(EXAMPLE_SEEKS);
