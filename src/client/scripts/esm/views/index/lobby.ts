// src/client/scripts/esm/views/index/lobby.ts

/**
 * Manages the lobby seek list: rendering, seek session state (create/cancel/accept),
 * and subscribing/unsubscribing from the server's invites list.
 */

import type { VNode } from 'snabbdom';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { VariantInfo } from '../../../../../shared/chess/variants/variantregistry.js';
import type {
	TimeControl,
	Rating,
	BaseSeek,
	OutSeek,
	SeekVariant,
	GameMode,
	SeekModifier,
	CreateEngineGameBody,
} from '../../../../../shared/types.js';

import { attributesModule, classModule, h, init } from 'snabbdom';

import uuid from '../../../../../shared/util/uuid.js';
import modutil from '../../../../../shared/util/modutil.js';
import clockutil from '../../../../../shared/chess/util/clockutil.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';

import docutil from '../../util/docutil.js';
import idleness from '../../util/idleness.js';
import gamesound from '../../game/misc/gamesound.js';
import socketsubs from '../../websocket/socketsubs.js';
import LocalStorage from '../../util/LocalStorage.js';
import validatorama from '../../util/validatorama.js';
import socketmessages from '../../websocket/socketmessages.js';
import gameSetupModal from './gameSetupModal.js';
import seekPreviewCache from './seekPreviewCache.js';
import variantPreviewTooltip from '../../game/rendering/variantPreviewTooltip.js';

const patch = init([attributesModule, classModule]);

// Types ----------------------------------------------

/** The structure for a single seek in the lobby, with client-side rendering info. */
export type LobbySeek = BaseSeek &
	({ variant: VariantInfo } | { variant: { group: 'custom' } }) & {
		isOurs: boolean;
	};

type CreateSeekOptions = {
	variant: SeekVariant;
	time: TimeControl;
	color: Player | null;
	mode: GameMode;
	modifiers: SeekModifier[];
};

// Constants ------------------------------------------

const element_lobbyTbody = document.getElementById('lobby-tbody')!;
const element_lobbyIdleOverlay = document.getElementById('lobby-overlay')!;
const element_lobbyIngameOverlay = document.getElementById('lobby-ingame-overlay')!;
const element_lobbyIngameJoin = document.getElementById('lobby-ingame-join')!;
const element_lobbyViewerCount = document.getElementById('lobby-viewer-count')!;
/** Buttons disabled while the in-game banner is shown (the user must rejoin their game first). */
const elements_disabledWhileInGame = [
	document.getElementById('btn-create-game')!,
	document.getElementById('btn-challenge-friend')!,
	document.getElementById('btn-play-ai')!,
];
let tbodyVNode: VNode | Element = element_lobbyTbody;

// Constants -----------------------------------------

/** How long, in milliseconds, without page interaction before the user is unsubbed from the lobby. */
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
// const IDLE_TIMEOUT = 10 * 1000; // Testing: 10 seconds

// State ----------------------------------------------

/** The ID of our current seek, if we have one. */
let ourSeekId: string | undefined;
/**
 * Whether we've accepted a seek this page-session and are expecting a game to start.
 * Lets {@link onInGame} auto-navigate the accepter (who owns no seek of their own).
 */
let weAcceptedSeek = false;
/** Live map of all current seeks by id, for fast click-handler lookup. */
const seekMap = new Map<string, OutSeek>();

/** Whether the user is currently idle (lobby unsubbed, overlay visible). */
let isIdle = false;
/** Whether the in-a-game banner is currently shown (set by the server's 'ingame'/'outgame' pushes). */
let inGameBannerShown = false;

// Init -----------------------------------------------

initLobbyClickHandler();
initIdleDetection();

// Preload sounds
gamesound.preload('marimba_c2');
gamesound.preload('marimba_c2_soft');
gamesound.preload('base_staccato_c2');
gamesound.preload('viola_staccato_c3');
gamesound.preload('notify');

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
 * Tracks new seeks across updates: returns the IDs that just appeared (for animation)
 * and plays the opponent-arrival sound for fresh non-own seeks (unless suppressed).
 */
const trackNewSeeks = (() => {
	const COOLDOWN_SECS = 10;
	const recentUsers: Record<string, boolean> = {};
	let idsInLastList = new Set<string>();

	return function (seekList: OutSeek[]): Set<string> {
		let played = false;
		const newIds = new Set<string>();
		const idsToAnimate = new Set<string>();
		for (const seek of seekList) {
			newIds.add(seek.id);
			if (idsInLastList.has(seek.id)) continue;
			if (isSeekOurs(seek)) {
				idsToAnimate.add(seek.id);
				continue;
			}
			const name = seek.player.username;
			if (recentUsers[name]) continue;
			recentUsers[name] = true;
			setTimeout(() => delete recentUsers[name], COOLDOWN_SECS * 1000);
			if (played) continue;
			if (docutil.isMouseSupported()) gamesound.playBase();
			else gamesound.playViola_c3();
			played = true;
			idsToAnimate.add(seek.id);
		}
		idsInLastList = newIds;
		return idsToAnimate;
	};
})();

/**
 * Called when we receive a fresh seek list from the server. Updates state, map, and renders.
 * @param preserveNewSeekTracker - Skips the new-seek tracker so its memory survives the update,
 * so seeks returning after a reconnect aren't treated as new and replay arrival sounds.
 */
function onSeekListUpdate(seeks: OutSeek[], preserveNewSeekTracker = false): void {
	// Reset the flag in case the seek was cancelled immediately before.
	// The server sends the 'ingame' action before the new seek list, so this is safe.
	weAcceptedSeek = false;

	seekMap.clear();
	for (const seek of seeks) seekMap.set(seek.id, seek);
	seekPreviewCache.evictRemovedSeeks(new Set(seekMap.keys()));

	const ourSeek = seeks.find((s) => isSeekOurs(s));
	ourSeekId = ourSeek?.id;

	const newSeekIds = preserveNewSeekTracker ? new Set<string>() : trackNewSeeks(seeks);
	if (ourSeekId !== undefined && newSeekIds.has(ourSeekId)) gamesound.playMarimba();

	renderSeekList(
		seeks.map((s) => outSeekToLobbySeek(s)),
		newSeekIds,
	);
}

/** Called when the server sends an updated lobby viewer count. Displays count minus ourself. */
function onViewerCountUpdate(count: number): void {
	element_lobbyViewerCount.textContent = String(count - 1);
}

/**
 * Called when the server reports we're in game `id` (on seek acceptance, or on lobby resub
 * while already in one). Auto-navigates only if WE initiated it — we own the accepted seek
 * (`ourSeekId`, which survives an in-page reconnect) or accepted one (`weAcceptedSeek`); a
 * fresh page-load mid-game has neither and stays put.
 * @param id - The numeric game id (encoded into the base62 URL).
 */
async function onInGame(id: number): Promise<void> {
	// These are only cleared on receiving a new seek list, but since the server
	// sends the 'ingame' action before then, these should still be accurate.
	if (ourSeekId !== undefined || weAcceptedSeek) {
		// Plays the notify sound and awaits it so the hard-navigate doesn't cut it off.
		// No reverb added here, it makes us wait too long.
		const sound = await gamesound.playNotify(false);
		if (sound) await sound.whenEnded;
		window.location.assign(`/game/${uuid.base10ToBase62(id)}`);
	} else {
		// A fresh page-load while already in a game: stay on the lobby but show a banner
		// letting them rejoin. The server pushes 'outgame' once we leave (see onOutGame).
		showInGameBanner(id);
	}
}

/** Called on the server's 'outgame' push — we've left our game, so hide the banner. */
function onOutGame(): void {
	hideInGameBanner();
}

/** Shows the "you're in a game" banner, pointing its rejoin link at game `id`. */
function showInGameBanner(id: number): void {
	inGameBannerShown = true;
	element_lobbyIngameJoin.setAttribute('href', `/game/${uuid.base10ToBase62(id)}`);
	element_lobbyIngameOverlay.classList.remove('hidden');
	for (const btn of elements_disabledWhileInGame) btn.setAttribute('disabled', '');
}

/** Hides the in-game banner. */
function hideInGameBanner(): void {
	if (!inGameBannerShown) return;
	inGameBannerShown = false;
	element_lobbyIngameOverlay.classList.add('hidden');
	for (const btn of elements_disabledWhileInGame) btn.removeAttribute('disabled');
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
		const variant = { group: 'custom' as const };
		return { ...seek, variant, isOurs };
	} else {
		// @ts-ignore
		throw new Error(`Unknown seek variant kind: ${seek.variant.kind}`);
	}
}

// Creating/Accepting/Canceling Seeks -------------------------------------------

/** Sends a createseek message to the server with the given options. */
function createSeek(options: CreateSeekOptions): void {
	const tag = generateTag();
	socketmessages.send('lobby', 'createseek', { ...options, tag }, true);
}

/**
 * Asks the server to create an engine (vs computer) game over the websocket — an open
 * socket is required, gating bots. Navigation happens on the server's `enginegame` push.
 */
function createEngineGame(body: CreateEngineGameBody): void {
	socketmessages.send('lobby', 'createengine', body, true);
}

/** Called on the server's `enginegame` push: plays the notify sound then navigates to the new game. */
async function onEngineGameCreated(id: number): Promise<void> {
	// Await the sound so the hard-navigate doesn't cut it off (mirrors onInGame).
	const sound = await gamesound.playNotify(false);
	if (sound) await sound.whenEnded;
	window.location.assign(`/game/${uuid.base10ToBase62(id)}`);
}

/** Sends a cancelseek message for our current seek. */
function cancel(seekId: string): void {
	if (ourSeekId === undefined) return;
	LocalStorage.deleteItem('invite-tag');
	socketmessages.send('lobby', 'cancelseek', seekId, true);
}

/** Sends an acceptseek message for an opponent's seek. */
function accept(seekId: string): void {
	weAcceptedSeek = true;
	socketmessages.send('lobby', 'acceptseek', seekId, true);
}

// Subscribing ---------------------------------------------

/** Subscribes to the server's lobby subscription list (seeks, live games). */
async function subscribe(): Promise<void> {
	if (isIdle) return; // Don't resubscribe while idle; the user must interact with the lobby to reconnect
	if (socketsubs.areSubbedToSub('lobby')) return;
	socketsubs.addSub('lobby');
	socketmessages.send('general', 'sub', 'lobby');
}

/** Unsubscribes from the invites list and clears the rendered seek list. */
function unsubscribe(): void {
	clearSeekList();
	socketsubs.unsubFromSub('lobby');
}

// Idle detection ---------------------------------------------

/** Registers the idle listener that will unsub from the lobby after inactivity. */
function initIdleDetection(): void {
	idleness.addListener(IDLE_TIMEOUT, onLobbyIdle);
}

/**
 * Called when the user has been idle for {@link IDLE_TIMEOUT}.
 * If they have an active seek we stay subscribed so they can still be
 * notified when someone accepts it.
 */
function onLobbyIdle(): void {
	if (isIdle) return; // Already idle (timer can re-fire after subsequent activity bursts)
	if (ourSeekId !== undefined) return; // Keep subbed so seek-acceptance sounds reach them
	isIdle = true;
	unsubscribe();
	hideInGameBanner();
	showIdleOverlay();
	gameSetupModal.close();
}

/** Shows the pre-existing idle overlay element, wiring up pointer listeners to dismiss it. */
function showIdleOverlay(): void {
	element_lobbyIdleOverlay.classList.remove('hidden');

	const controller = new AbortController();
	const onReturn = (): void => {
		controller.abort(); // Removes both listeners at once
		exitIdle();
	};
	const opts = { signal: controller.signal };
	element_lobbyIdleOverlay.addEventListener('pointerenter', onReturn, opts);
	element_lobbyIdleOverlay.addEventListener('pointerdown', onReturn, opts);
}

/** Exits the idle state: hides the overlay and resubscribes to the lobby. */
function exitIdle(): void {
	if (!isIdle) return;
	element_lobbyIdleOverlay.classList.add('hidden');
	isIdle = false;
	subscribe();
}

// Snabbdom Rendering ----------------------------------------------

/** Patches the lobby table body with the latest seek rows. */
function renderSeekList(seeks: LobbySeek[], newSeekIds = new Set<string>()): void {
	tbodyVNode = patch(tbodyVNode, createSeekListVNode(seeks, newSeekIds));
}

/**
 * Clears the seek display, tracked state, and viewer count on a socket close,
 * but preserves the new-seek tracker so a reconnect doesn't replay arrival sounds.
 */
function clearSeekList(): void {
	onSeekListUpdate([], true); // Don't clear seek tracker memory
	element_lobbyViewerCount.textContent = '0';
}

/** Creates the keyed snabbdom div vnode for the current seek list. */
function createSeekListVNode(seeks: LobbySeek[], newSeekIds: Set<string>): VNode {
	return h(
		'div#lobby-tbody',
		seeks.map((s) => createSeekRowVNode(s, newSeekIds.has(s.id))),
	);
}

/**
 * Builds one lobby row vnode from a seek object.
 * @param seek - The seek to render.
 * @param isNew - Whether this seek just appeared in the list (for animation).
 */
function createSeekRowVNode(seek: LobbySeek, isNew: boolean): VNode {
	const playerRating = createPlayerRatingVNode(seek.player.rating);
	const sideDot = createSideDotVNode(seek.color);
	const variantIcon = variantregistry.getVariantGroupIconId(seek.variant.group);
	const variantName =
		seek.variant.group === 'custom'
			? t.shared.variant_groups.custom.display_label
			: t.shared.variants[seek.variant.code];
	const speedIcon = clockutil.getSpeedIconId(seek.time);
	const speedCategory = clockutil.getSpeedCategory(seek.time);
	const speedTitle = t.shared.speeds[speedCategory];
	const displayName =
		seek.player.type === 'guest'
			? seek.isOurs
				? t.shared.user_status.you_indicator
				: t.shared.user_status.guest_indicator
			: seek.player.username;

	return h(
		'div.seek-row',
		{
			key: seek.id,
			class: { ours: seek.isOurs },
			attrs: {
				title: seek.isOurs ? t.index.lobby.cancel_seek : t.index.lobby.accept_seek,
				'data-seek-id': seek.id,
			},
			hook: isNew
				? {
						insert: (vnode) => spawnSeekPulse(vnode.elm as HTMLElement, seek.isOurs),
					}
				: undefined,
		},
		[
			h('div.lobby-cell', [
				h('div.cell-flex.text-fade', [
					h('span.username-embed', [
						h('span.username', displayName),
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
						h('div.variant-icons', createVariantCellIconVNodes(variantIcon, seek)),
						h('span', variantName),
					],
				),
			]),
			h('div.lobby-cell', [
				h('div.cell-flex', [
					h('svg.cell-icon', { class: { [speedIcon]: true } }, [
						h('title', speedTitle),
						h('use', { attrs: { href: `#${speedIcon}` } }),
					]),
					clockutil.getTimeControlLabel(seek.time),
				]),
			]),
			h(
				'div.lobby-cell',
				seek.mode === 'rated' ? t.shared.game_modes.rated : t.shared.game_modes.casual,
			),
		],
	);
}

/**
 * Returns the icon vnodes for the variant cell.
 * For standard-group seeks with modifiers, only the modifier icons are shown (group icon omitted).
 */
function createVariantCellIconVNodes(variantIcon: string, seek: LobbySeek): VNode[] {
	const modifiers = seek.modifiers ?? [];
	const showGroupIcon = !(seek.variant.group === 'standard' && modifiers.length > 0);
	return [
		...(showGroupIcon
			? [
					h('svg.cell-icon', { class: { [variantIcon]: true } }, [
						h('use', { attrs: { href: `#${variantIcon}` } }),
					]),
				]
			: []),
		...modifiers.map((m) => {
			const iconId = modutil.getModifierIconId(m.kind);
			return h('svg.cell-icon.modifier-icon', { class: { [iconId]: true } }, [
				h('use', { attrs: { href: `#${iconId}` } }),
			]);
		}),
	];
}

/** Spawns a body-level overlay aligned to the row that pulses outward and fades. */
function spawnSeekPulse(row: HTMLElement, isOurs: boolean): void {
	requestAnimationFrame(() => {
		const rect = row.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		const overlay = document.createElement('div');
		overlay.className = 'seek-pulse-overlay';
		overlay.style.left = `${rect.left}px`;
		overlay.style.top = `${rect.top}px`;
		overlay.style.width = `${rect.width}px`;
		overlay.style.height = `${rect.height}px`;
		const box = document.createElement('div');
		box.className = isOurs ? 'seek-pulse-box ours' : 'seek-pulse-box';
		overlay.appendChild(box);
		document.body.appendChild(overlay);
		box.addEventListener('animationend', () => overlay.remove(), { once: true });
	});
}

/** Fetches and shows the variant preview tooltip for a seek row's variant cell. */
function handleVariantPreviewHover(anchor: HTMLElement, seek: LobbySeek): void {
	if (seek.variant.group === 'custom') {
		void variantPreviewTooltip.showForPosition(anchor, t.shared.variant_groups.custom.display_label, () => seekPreviewCache.getSeekPreview(seek.id), 'below', seek.modifiers); // prettier-ignore
	} else {
		variantPreviewTooltip.showForVariantCode(anchor, seek.variant.code, 'below', seek.modifiers); // prettier-ignore
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
	clearSeekList,
	onSeekListUpdate,
	onViewerCountUpdate,
	onInGame,
	onOutGame,
	createSeek,
	createEngineGame,
	onEngineGameCreated,
	subscribe,
	exitIdle,
};
