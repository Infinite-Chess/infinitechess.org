// src/client/scripts/esm/views/index/lobby.ts

/**
 * Manages the lobby seek list: rendering, seek session state (create/cancel/accept),
 * and subscribing/unsubscribing from the server's invites list.
 */

import type { VNode } from 'snabbdom';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type {
	VariantGroup,
	VariantInfo,
} from '../../../../../shared/chess/variants/variantregistry.js';
import type {
	TimeControl,
	Rating,
	BaseSeek,
	OutSeek,
	InviteVariant,
	GameMode,
	InviteModifier,
} from '../../../../../shared/types.js';

import { attributesModule, classModule, h, init } from 'snabbdom';

import uuid from '../../../../../shared/util/uuid.js';
import clockutil from '../../../../../shared/chess/util/clockutil.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';

import docutil from '../../util/docutil.js';
import gamesound from '../../game/misc/gamesound.js';
import socketsubs from '../../websocket/socketsubs.js';
import LocalStorage from '../../util/LocalStorage.js';
import validatorama from '../../util/validatorama.js';
import socketmessages from '../../websocket/socketmessages.js';
import seekPreviewCache from './seekPreviewCache.js';
import variantPreviewTooltip from '../../game/rendering/variantPreviewTooltip.js';

const patch = init([attributesModule, classModule]);

// Types ----------------------------------------------

/** The structure for a single seek in the lobby, with client-side rendering info. */
export type LobbySeek = BaseSeek &
	({ variant: VariantInfo } | { variant: { group: 'custom'; name: 'Custom Variant' } }) & {
		isOurs: boolean;
	};

type CreateSeekOptions = {
	variant: InviteVariant;
	time: TimeControl;
	color: Player | null;
	mode: GameMode;
	modifiers: InviteModifier[];
};

// Constants ------------------------------------------

const element_lobbyTbody = document.getElementById('lobby-tbody')!;
let tbodyVNode: VNode | Element = element_lobbyTbody;

// State ----------------------------------------------

/** The ID of our current seek, if we have one. */
let ourSeekId: string | undefined;
/** Live map of all current seeks by id, for fast click-handler lookup. */
const seekMap = new Map<string, OutSeek>();

// Init -----------------------------------------------

initLobbyClickHandler();

// Preload sounds
gamesound.preload('marimba_c2');
gamesound.preload('marimba_c2_soft');
gamesound.preload('base_staccato_c2');
gamesound.preload('viola_staccato_c3');

// Functions ------------------------------------------

/** Sets up a single delegated click listener on the lobby table body. */
function initLobbyClickHandler(): void {
	element_lobbyTbody.addEventListener('click', (e) => {
		const row = (e.target as HTMLElement).closest<HTMLElement>('[data-seek-id]');
		if (!row) return;
		const seekId = row.getAttribute('data-seek-id')!;
		const seek = seekMap.get(seekId);
		if (!seek) return;
		if (isSeekOurs(seek)) cancel(seekId);
		else accept(seekId);
	});
}

/** Generates a fresh 8-char tag and persists it to localStorage for ownership detection. */
function generateTag(): string {
	const tag = uuid.generateID_Base62(8);
	LocalStorage.saveItem('invite-tag', tag);
	return tag;
}

/** Returns true if the given seek was created by the current user. */
function isSeekOurs(seek: OutSeek): boolean {
	if (validatorama.areWeLoggedIn()) {
		return (
			seek.player.type === 'player' && validatorama.getOurUsername() === seek.player.username
		);
	}
	const localTag = LocalStorage.loadItem('invite-tag');
	return seek.tag === localTag;
}

/**
 * Plays a sound when a new opponent's seek appears in the list.
 * Uses a closure to track which seeks and users we've already reacted to.
 */
const trackNewSeekSound = (() => {
	const COOLDOWN_SECS = 10;
	const recentUsers: Record<string, boolean> = {};
	let idsInLastList = new Set<string>();

	return function (seekList: OutSeek[]): void {
		let played = false;
		const newIds = new Set<string>();
		for (const seek of seekList) {
			newIds.add(seek.id);
			if (idsInLastList.has(seek.id)) continue;
			if (isSeekOurs(seek)) continue;
			const name = seek.player.username;
			if (recentUsers[name]) continue;
			recentUsers[name] = true;
			setTimeout(() => delete recentUsers[name], COOLDOWN_SECS * 1000);
			if (played) continue;
			if (docutil.isMouseSupported()) gamesound.playBase();
			else gamesound.playViola_c3();
			played = true;
		}
		idsInLastList = newIds;
	};
})();

/** Called when we receive a fresh seek list from the server. Updates state, map, and renders. */
function onSeekListUpdate(seeks: OutSeek[]): void {
	const prevHadSeek = ourSeekId !== undefined;

	seekMap.clear();
	for (const seek of seeks) seekMap.set(seek.id, seek);
	seekPreviewCache.evictRemovedSeeks(new Set(seekMap.keys()));

	const ourSeek = seeks.find((s) => isSeekOurs(s));
	ourSeekId = ourSeek?.id;

	if (!prevHadSeek && ourSeekId !== undefined) {
		gamesound.playMarimba();
	} else {
		trackNewSeekSound(seeks);
	}

	renderSeekList(seeks.map(outSeekToLobbySeek));
}

/** Converts a server OutSeek into a client LobbySeek with rendering metadata. */
function outSeekToLobbySeek(seek: OutSeek): LobbySeek {
	const isOurs = isSeekOurs(seek);
	if (seek.variant.kind === 'preset') {
		const variant: VariantInfo = {
			group: variantregistry.getVariantGroup(seek.variant.code),
			code: seek.variant.code,
		};
		return { ...seek, variant, isOurs };
	} else if (seek.variant.kind === 'custom') {
		const variant = { group: 'custom', name: 'Custom Variant' } as const;
		return { ...seek, variant, isOurs };
	} else {
		// @ts-ignore
		throw new Error(`Unknown seek variant kind: ${seek.variant.kind}`);
	}
}

// Creating/Accepting/Canceling Seeks -------------------------------------------

/** Sends a createinvite message to the server with the given options. */
function createSeek(options: CreateSeekOptions): void {
	if (ourSeekId !== undefined) return console.error("Already have a seek, can't create another.");
	const tag = generateTag();
	socketmessages.send('lobby', 'createinvite', { ...options, tag }, true);
}

/** Sends a cancelinvite message for our current seek. */
function cancel(seekId: string): void {
	if (ourSeekId === undefined) return;
	LocalStorage.deleteItem('invite-tag');
	socketmessages.send('lobby', 'cancelinvite', seekId, true);
}

/** Sends an acceptinvite message for an opponent's seek. */
function accept(seekId: string): void {
	socketmessages.send('lobby', 'acceptinvite', seekId, true);
}

// Subscribing ---------------------------------------------

/** Subscribes to the server's lobby subscription list (seeks, live games). */
async function subscribe(): Promise<void> {
	if (socketsubs.areSubbedToSub('lobby')) return;
	socketsubs.addSub('lobby');
	socketmessages.send('general', 'sub', 'lobby');
}

/** Unsubscribes from the invites list and clears the rendered seek list. */
function unsubscribe(): void {
	renderSeekList([]);
	socketsubs.unsubFromSub('lobby');
}

// Snabbdom Rendering ----------------------------------------------

/** Formats a time control into a human-readable string. */
function getClockLabel(clock: TimeControl): string | undefined {
	const minutesAndIncrement = clockutil.getMinutesAndIncrementFromClock(clock);
	if (minutesAndIncrement === null) return;
	return `${minutesAndIncrement.minutes}+${minutesAndIncrement.increment}`;
}

/**
 * Returns the symbol ID of the SVG icon that represents the variant group.
 * Includes the `custom` group for custom variants.
 */
function getVariantIcon(group: VariantGroup | 'custom'): string {
	if (group === 'custom') return 'svg-wrench';
	return variantregistry.getVariantGroupIconId(group);
}

/** Patches the lobby table body with the latest seek rows. */
function renderSeekList(seeks: LobbySeek[]): void {
	tbodyVNode = patch(tbodyVNode, createSeekListVNode(seeks));
}

/** Creates the keyed snabbdom div vnode for the current seek list. */
function createSeekListVNode(seeks: LobbySeek[]): VNode {
	return h(
		'div#lobby-tbody',
		seeks.map((s) => createSeekRowVNode(s)),
	);
}

/** Builds one lobby row vnode from a seek object. */
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
		'div.invite-row',
		{
			key: seek.id,
			class: { ours: seek.isOurs },
			attrs: {
				title: seek.isOurs ? 'Cancel seek' : 'Accept invite',
				'data-seek-id': seek.id,
			},
		},
		[
			h('div.lobby-cell', [
				h('div.cell-flex.text-fade', [
					h('span.username-embed', [
						h('span.username', seek.player.username),
						...(playerRating ? [playerRating] : []),
					]),
					...(sideDot ? [sideDot] : []),
				]),
			]),
			h('div.lobby-cell', [
				h(
					'div.cell-flex.seek-variant-anchor',
					{
						attrs: { title: '' }, // Overrides seek's title
						hook: {
							insert: (vnode) => {
								variantPreviewTooltip.attachAnchor(
									vnode.elm as HTMLElement,
									(anchor) => handleVariantPreviewHover(anchor, seek),
								);
							},
						},
					},
					[
						h('svg.cell-icon', { class: { [variantIcon]: true } }, [
							h('use', { attrs: { href: `#${variantIcon}` } }),
						]),
						h('span', variantName),
					],
				),
			]),
			h('div.lobby-cell', [
				h('div.cell-flex', [
					h('svg.cell-icon', { class: { [speedIcon]: true } }, [
						h('use', { attrs: { href: `#${speedIcon}` } }),
					]),
					getClockLabel(seek.time),
				]),
			]),
			h('div.lobby-cell', seek.mode === 'rated' ? 'Rated' : 'Casual'),
		],
	);
}

/** Fetches and shows the variant preview tooltip for a seek row's variant cell. */
async function handleVariantPreviewHover(anchor: HTMLElement, seek: LobbySeek): Promise<void> {
	if (seek.variant.group === 'custom') {
		const variantOptions = await seekPreviewCache.getSeekPreview(seek.id);
		if (variantOptions === undefined) return;
		variantPreviewTooltip.showForPosition(anchor, seek.variant.name, variantOptions, 'below'); // prettier-ignore
	} else {
		variantPreviewTooltip.showForVariantCode(anchor, seek.variant.code, 'below');
	}
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
	const colorName = color === players.WHITE ? 'white' : color === players.BLACK ? 'black' : (() => { throw new Error(`Invalid color: ${color}`); })(); // prettier-ignore
	return h(selector, { attrs: { title: `Invite owner chooses to be ${colorName}` } });
}

// Exports ----------------------------------------------

export default {
	renderSeekList,
	onSeekListUpdate,
	createSeek,
	subscribe,
	unsubscribe,
};
