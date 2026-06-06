// src/client/scripts/esm/views/index/index.ts

/**
 * Entry point for the index (home) page.
 *
 * Subscribes to lobby updates and resubscribes after socket reconnections.
 */

import type { LobbyMessage } from '../../websocket/socketschemas.js';

import lobby from './lobby.js';
import flashToast from '../../util/flashToast.js';
import { SocketBus } from '../../websocket/SocketBus.js';

import './newPrompt.js';
import './gameSetupModal.js';

// Initial setup -----------------------------------------------------

// Show any toast queued before a redirect here (e.g. "Account activated!" after registering).
flashToast.consume();

lobby.subscribe();
SocketBus.addEventListener('reconnected', () => lobby.subscribe());
SocketBus.addEventListener('closed', () => lobby.clearSeekList());

SocketBus.addEventListener('lobby', (e) => onLobbyMessage(e.detail));

function onLobbyMessage(contents: LobbyMessage): void {
	switch (contents.action) {
		case 'lobbysnapshot':
			lobby.onSeekListUpdate(contents.value.seekslist);
			lobby.onViewerCountUpdate(contents.value.viewercount);
			break;
		case 'seekslist':
			lobby.onSeekListUpdate(contents.value.seeksList);
			break;
		case 'viewercount':
			lobby.onViewerCountUpdate(contents.value);
			break;
		default:
			// @ts-ignore
			console.error(`Unknown lobby action: ${contents.action}`);
	}
}

// TESTING SEEK LIST RENDERING FROM A LIST OF SEEKS.
// DELETE ONCE CONNECTED TO BACKEND AND RENDERING REAL SEEKS.

// const EXAMPLE_SEEKS: LobbySeek[] = [
// 	// Standard example
// 	{
// 		id: 'seek1',
// 		tag: 'tag1',
// 		player: {
// 			type: 'player',
// 			username: 'XxSuperChargedxX',
// 			rating: { value: 1758, confident: false },
// 		},
// 		color: null,
// 		variant: { group: 'standard', code: 'CoaIP_HO' },
// 		time: '1500+5',
// 		mode: 'rated',
// 	},
// 	// Horde example
// 	{
// 		id: 'seek2',
// 		tag: 'tag2',
// 		player: { type: 'guest', username: '(Guest)' },
// 		color: p.WHITE,
// 		variant: { group: 'horde', code: 'Pawn_Horde' },
// 		time: '-',
// 		mode: 'casual',
// 	},
// 	// 4D example
// 	{
// 		id: 'seek3',
// 		tag: 'tag3',
// 		player: {
// 			type: 'player',
// 			username: '4DEnthusiast',
// 			rating: { value: 1900, confident: true },
// 		},
// 		color: p.BLACK,
// 		variant: { group: '4D', code: '5D_Chess' },
// 		time: '900+10',
// 		mode: 'rated',
// 	},
// 	// Showcase example
// 	{
// 		id: 'seek4',
// 		tag: 'tag4',
// 		player: {
// 			type: 'player',
// 			username: 'ChessMaster300056674',
// 			rating: { value: 2200, confident: true },
// 		},
// 		color: null,
// 		variant: { group: 'showcase', code: 'Omega_Squared' },
// 		time: '180+1',
// 		mode: 'rated',
// 	},
// 	// Custom example
// 	{
// 		id: 'seek5',
// 		tag: 'tag5',
// 		player: {
// 			type: 'player',
// 			username: 'CustomVariantFan',
// 			rating: { value: 1500, confident: false },
// 		},
// 		color: null,
// 		variant: { group: 'custom', name: 'Custom Variant' },
// 		time: '60+1',
// 		mode: 'casual',
// 	},
// ];

// lobby.renderSeekList(EXAMPLE_SEEKS);
