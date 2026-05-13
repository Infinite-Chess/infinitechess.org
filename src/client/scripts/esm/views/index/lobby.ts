// src/client/scripts/esm/views/index/lobby.ts

import type { VNode } from 'snabbdom';
import type { TimeControl, Rating, BaseSeek } from '../../../../../shared/types.js';
import type {
	VariantGroup,
	VariantInfo,
} from '../../../../../shared/chess/variants/variantregistry.js';

import { attributesModule, classModule, h, init } from 'snabbdom';

import clockutil from '../../../../../shared/chess/util/clockutil.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';

const patch = init([attributesModule, classModule]);

// Types ----------------------------------------------

/** [CLIENT] The structure for a single seek in the lobby. */
export type LobbySeek = BaseSeek &
	(
		| {
				variant: VariantInfo;
		  }
		| {
				variant: { group: 'custom'; name: 'Custom Variant' };
		  }
	);

// Constants ------------------------------------------

const element_lobbyTbody = document.getElementById('lobby-tbody')!;
let tbodyVNode: VNode | Element = element_lobbyTbody;

// Functions ----------------------------------------------

/**Formats a time control into a human-readable string. */
function getClockLabel(clock: TimeControl): string | undefined {
	const minutesAndIncrement = clockutil.getMinutesAndIncrementFromClock(clock);
	if (minutesAndIncrement === null) return;
	return `${minutesAndIncrement.minutes}+${minutesAndIncrement.increment}`;
}

/** Returns the symbol ID of the SVG icon that represents the variant group. */
function getVariantIcon(group: VariantGroup | 'custom'): string {
	switch (group) {
		case 'standard':
			return 'svg-pawn';
		case 'horde':
			return 'svg-keypad';
		case '4D':
			return 'svg-tesseract';
		case 'showcase':
			return 'svg-trophy';
		case 'custom':
			return 'svg-wrench';
	}
}

// Snabbdom Rendering ----------------------------------------------

/** Patches the lobby table body with the latest seek rows. */
function renderSeekList(seeks: LobbySeek[]): void {
	tbodyVNode = patch(tbodyVNode, createSeekListVNode(seeks));
}

/** Creates the keyed snabbdom tbody vnode for the current seek list. */
function createSeekListVNode(seeks: LobbySeek[]): VNode {
	return h(
		'tbody#lobby-tbody',
		seeks.map((s) => createSeekRowVNode(s)),
	);
}

/** Builds one lobby table row vnode from a seek object. */
function createSeekRowVNode(seek: LobbySeek): VNode {
	const playerRating = createPlayerRatingVNode(seek.player.rating);
	const sideDot = createSideDotVNode(seek.color);
	const variantIcon = getVariantIcon(seek.variant.group);
	const variantName =
		seek.variant.group === 'custom'
			? seek.variant.name
			: variantregistry.getVariantName(seek.variant.code);
	const speedIcon = clockutil.getSpeedIconId(seek.time);

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
					h('svg.cell-icon', { class: { [variantIcon]: true } }, [
						h('use', { attrs: { href: `#${variantIcon}` } }),
					]),
					variantName,
				]),
			]),
			h('td', [
				h('div.cell-flex', [
					h('svg.cell-icon', { class: { [speedIcon]: true } }, [
						h('use', { attrs: { href: `#${speedIcon}` } }),
					]),
					getClockLabel(seek.time),
				]),
			]),
			h('td', seek.mode === 'rated' ? 'Rated' : 'Casual'),
		],
	);
}

/** Creates the optional rating vnode shown beside usernames. */
function createPlayerRatingVNode(rating: Rating | undefined): VNode | null {
	if (rating === undefined) return null;
	return h('span.elo', metadatautil.getFormattedElo(rating));
}

/** Creates the optional side (color choice) indicator dot vnode for fixed-color seeks. */
function createSideDotVNode(color: LobbySeek['color']): VNode | null {
	if (color === null) return null;
	const selector = color === players.BLACK ? 'div.side-dot.black' : 'div.side-dot';
	const colorName = color === players.WHITE ? 'white' : color === players.BLACK ? 'black' : (() => { throw new Error(`Invalid color: ${color}`) })(); // prettier-ignore
	return h(selector, { attrs: { title: `Invite owner chooses to be ${colorName}` } });
}

// Exports ----------------------------------------------

export default { renderSeekList };
