// src/client/scripts/esm/views/index/lobby.ts

import type { VNode } from 'snabbdom';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { TimeControl, ServerUsernameContainer, Rating } from '../../../../../shared/types.js';

import { attributesModule, h, init } from 'snabbdom';

import clockutil from '../../../../../shared/chess/util/clockutil.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';

import { VariantGroup } from '../gameSetupModal.js';

const patch = init([attributesModule]);

// Types ----------------------------------------------

export type LobbySeek = {
	id: string;
	tag?: string;
	player: ServerUsernameContainer;
	color: Player | null;
	variant: {
		group: VariantGroup;
		name: string;
	};
	time: TimeControl;
	mode: 'casual' | 'rated';
};

// Constants ------------------------------------------

const element_lobbyTbody = document.getElementById('lobby-tbody')!;
let tbodyVNode: VNode | Element = element_lobbyTbody;

// Functions ----------------------------------------------

function getClockLabel(clock: TimeControl): string | undefined {
	const minutesAndIncrement = clockutil.getMinutesAndIncrementFromClock(clock);
	if (minutesAndIncrement === null) return;
	return `${minutesAndIncrement.minutes}+${minutesAndIncrement.increment}`;
}

/** Returns the symbol ID of the SVG icon that represents the variant group. */
function getVariantIconId(group: VariantGroup): string {
	switch (group) {
		case 'standard':
			return '#svg-pawn';
		case 'horde':
			return '#svg-horde';
		case '4D':
			return '#svg-tesseract';
		case 'showcase':
			return '#svg-trophy';
		case 'custom':
			return '#svg-wrench';
	}
}

// Snabbdom Rendering ----------------------------------------------

function renderSeekList(seeks: LobbySeek[]): void {
	tbodyVNode = patch(tbodyVNode, createSeekListVNode(seeks));
}

function createSeekListVNode(seeks: LobbySeek[]): VNode {
	return h(
		'tbody#lobby-tbody',
		seeks.map((s) => createSeekRowVNode(s)),
	);
}

function createSeekRowVNode(seek: LobbySeek): VNode {
	const playerRating = createPlayerRatingVNode(seek.player.rating);
	const sideDot = createSideDotVNode(seek.color);

	return h(
		'tr.invite-row',
		{
			key: seek.id,
			attrs: {
				title: 'Accept invite',
				'data-seek-id': seek.id,
			},
		},
		[
			h('td', [
				h('div.cell-flex', [
					h('span.username-embed', [
						h('span.username', seek.player.username),
						...(playerRating ? [playerRating] : []),
					]),
					...(sideDot ? [sideDot] : []),
				]),
			]),
			h('td', [
				h('div.cell-flex', [
					h('svg.cell-icon', [
						h('use', { attrs: { href: getVariantIconId(seek.variant.group) } }),
					]),
					seek.variant,
				]),
			]),
			h('td', [
				h('div.cell-flex', [
					h('svg.cell-icon', [
						h('use', {
							attrs: { href: `#${clockutil.getSpeedIconId(seek.time)}` },
						}),
					]),
					getClockLabel(seek.time),
				]),
			]),
			h('td', seek.mode === 'rated' ? 'Rated' : 'Casual'),
		],
	);
}

function createPlayerRatingVNode(rating: Rating | undefined): VNode | null {
	if (rating === undefined) return null;
	return h('span.elo', metadatautil.getFormattedElo(rating));
}

function createSideDotVNode(color: LobbySeek['color']): VNode | null {
	if (color === null) return null;
	const selector = color === players.BLACK ? 'div.side-dot.black' : 'div.side-dot';
	return h(selector);
}

// Exports ----------------------------------------------

export default { renderSeekList };
