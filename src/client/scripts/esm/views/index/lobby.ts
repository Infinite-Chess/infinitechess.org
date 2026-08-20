// src/client/scripts/esm/views/index/lobby.ts

/**
 * Manages the lobby seek list: rendering, seek session state (create/cancel/accept),
 * and subscribing/unsubscribing from the server's invites list.
 */

import type { VNode } from 'snabbdom';
import type { VariantInfo } from '../../../../../shared/chess/variants/variantregistry.js';
import type { Rating, BaseSeek, OutSeek, SeekId } from '../../../../../shared/domain.js';
import type {
	CreateSeekMessage,
	CreateEngineGameMessage,
} from '../../../../../shared/serverbound.js';
import type {
	InGameMessage,
	LobbyStateMessage,
	SeeksMessage,
} from '../../../../../shared/clientbound.js';

import { attributesModule, classModule, h, init } from 'snabbdom';

import modutil from '../../../../../shared/util/modutil.js';
import gameurl from '../../../../../shared/util/gameurl.js';
import clockutil from '../../../../../shared/chess/util/clockutil.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';
import metadatautil from '../../../../../shared/chess/util/metadatautil.js';
import variantregistry from '../../../../../shared/chess/variants/variantregistry.js';

import docutil from '../../util/docutil.js';
import idleness from './idleness.js';
import gamesound from '../../board/gamesound.js';
import socketsubs from '../../socket/socketsubs.js';
import socketsend from '../../socket/socketsend.js';
import socketintents from '../../socket/socketintents.js';
import gameSetupModal from './gameSetupModal.js';
import seekPreviewCache from './seekPreviewCache.js';
import variantPreviewTooltip from '../../board/rendering/variantPreviewTooltip.js';

const patch = init([attributesModule, classModule]);

// Types ----------------------------------------------

/** The structure for a single seek in the lobby, with client-side rendering info. */
export type LobbySeek = BaseSeek &
	({ variant: VariantInfo } | { variant: { group: 'custom' } }) & {
		isOurs: boolean;
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

/**
 * How long after a lobby row loses its occupant that row stays unacceptable,
 * so a click aimed at the vanished seek can't fire on whatever replaces it.
 * KEEP IN SYNC with the game page's action-block grace period (guigameactions.ts).
 */
const GRACE_MILLIS = 667;

// State ----------------------------------------------

/** The ID of our current seek, if we have one. */
let ourSeekId: SeekId | undefined;
/** Live map of all current seeks by id, for fast click-handler lookup. */
const seekMap = new Map<string, OutSeek>();
/** Seeks mid grace period, mapped to the timer that ends it. */
const graceTimers = new Map<string, number>();
/** When each row last lost its occupant. Its grace always ends {@link GRACE_MILLIS} after this. */
const rowVacatedTimes: number[] = [];

/** Whether the user is currently idle (lobby unsubbed, overlay visible). */
let isIdle = false;
/**
 * The id of the game the server says we're in, if any. Set by the lobby state and
 * the live 'ingame'/'outgame' pushes. Seeks are pointless while we're in a game.
 */
let gameIdWeAreIn: number | undefined;

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
		if (graceTimers.has(seekId)) return; // Mid grace period
		if (!seekMap.has(seekId)) return;
		if (seekId === ourSeekId) cancel(seekId);
		else accept(seekId);
	});
}

/** Applies the full lobby snapshot received the moment we (re)subscribe. */
function handleLobbyState(state: LobbyStateMessage): void {
	// In-game status first: the seek intents released after this check it.
	if (state.ingame) void onInGame(state.ingame);
	else onOutGame();
	onSeekListUpdate(state);
	onViewerCountUpdate(state.viewercount);
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
			if (seek.id === ourSeekId) {
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
function onSeekListUpdate(
	{ seekslist: seeks, ourseekid }: SeeksMessage,
	preserveNewSeekTracker = false,
): void {
	const previousSeekIds = [...seekMap.keys()];
	const previousOurSeekId = ourSeekId;
	seekMap.clear();
	for (const seek of seeks) seekMap.set(seek.id, seek);
	seekPreviewCache.evictRemovedSeeks(new Set(seekMap.keys()));

	// Adopted before anything below reads it — ownership drives the arrival sounds and rendering.
	ourSeekId = ourseekid;

	const newSeekIds = preserveNewSeekTracker ? new Set<string>() : trackNewSeeks(seeks);
	if (ourSeekId !== undefined && newSeekIds.has(ourSeekId)) gamesound.playMarimba();

	armGracePeriods(previousSeekIds, previousOurSeekId, seeks);

	renderSeekList(
		seeks.map((s) => outSeekToLobbySeek(s)),
		newSeekIds,
	);
}

/**
 * Grace-periods every seek that didn't already hold its row last update, so a click aimed at
 * whatever the user last saw there can't accept or cancel it. A row's grace always ends
 * {@link GRACE_MILLIS} after its previous occupant left, so a seek taking over a row directly
 * gets the full period, one filling a briefly-empty row gets the remainder, and one filling a
 * long-empty row gets none.
 * @param previousSeekIds - The seek ids by row, as of the previous update.
 * @param previousOurSeekId - The id of our seek, as of the previous update.
 */
function armGracePeriods(
	previousSeekIds: string[],
	previousOurSeekId: SeekId | undefined,
	seeks: OutSeek[],
): void {
	const now = Date.now();
	for (let row = 0; row < previousSeekIds.length; row++) {
		if (previousSeekIds[row] !== seeks[row]?.id) rowVacatedTimes[row] = now;
	}

	seeks.forEach((seek, row) => {
		if (previousSeekIds[row] === seek.id) return; // Held this row already
		// Exception: One of our seeks replacing another: a click here cancels our seek either way.
		if (previousOurSeekId !== undefined && previousSeekIds[row] === previousOurSeekId && seek.id === ourSeekId) return; // prettier-ignore
		const vacatedAt = rowVacatedTimes[row];
		if (vacatedAt === undefined) return; // Row has never held a seek
		const remaining = vacatedAt + GRACE_MILLIS - now;
		if (remaining <= 0) return; // Empty long enough that nothing was there to be clicked
		// A seek moved again mid-grace gets its new row's remainder, not the old row's.
		clearTimeout(graceTimers.get(seek.id));
		const timer = window.setTimeout(() => {
			graceTimers.delete(seek.id);
			// Skipped once the seek has left the list, where the re-render would be a no-op.
			if (seekMap.has(seek.id)) renderSeekList([...seekMap.values()].map(outSeekToLobbySeek));
		}, remaining);
		graceTimers.set(seek.id, timer);
	});
}

/** Called when the server sends an updated lobby viewer count. Displays count minus ourself. */
function onViewerCountUpdate(count: number): void {
	element_lobbyViewerCount.textContent = String(count - 1);
}

/**
 * Called when the server reports we're in a game (on seek acceptance, bot game creation,
 * or on lobby resub while already in one). Its URL pins the board to the side we're playing.
 */
async function onInGame(ingame: InGameMessage): Promise<void> {
	gameIdWeAreIn = ingame.id;
	if (ingame.navigate) {
		await gamesound.playNotifyToCompletion();
		window.location.assign(gameurl.getGameUrl(ingame.id, ingame.role));
	} else {
		// We already know of this game (another tab of ours, or a page-load mid-game): stay on
		// the lobby, but show a banner letting them rejoin. The server pushes 'outgame' once it ends.
		showInGameBanner(ingame);
	}
}

/** Called when the server reports we're in no game — its 'outgame' push, or a snapshot without one. */
function onOutGame(): void {
	gameIdWeAreIn = undefined;
	hideInGameBanner();
}

/** Shows the "you're in a game" banner, pointing its rejoin link at the game. */
function showInGameBanner(ingame: InGameMessage): void {
	element_lobbyIngameJoin.setAttribute('href', gameurl.getGameUrl(ingame.id, ingame.role));
	element_lobbyIngameOverlay.classList.remove('hidden');
	for (const btn of elements_disabledWhileInGame) btn.setAttribute('disabled', '');
	gameSetupModal.close();
}

/** Hides the in-game banner. */
function hideInGameBanner(): void {
	element_lobbyIngameOverlay.classList.add('hidden');
	for (const btn of elements_disabledWhileInGame) btn.removeAttribute('disabled');
}

/** Converts a server OutSeek into a client LobbySeek with rendering metadata. */
function outSeekToLobbySeek(seek: OutSeek): LobbySeek {
	const isOurs = seek.id === ourSeekId;
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
		throw new Error(`Unknown seek variant: ${JSON.stringify(seek.variant satisfies never)}`);
	}
}

// Creating/Accepting/Canceling Seeks -------------------------------------------

/** Sends a createseek message to the server with the given options. */
function createSeek(options: CreateSeekMessage): void {
	socketintents.submit('lobby', 'createseek', options, () => gameIdWeAreIn === undefined);
}

/**
 * Asks the server to create an engine (vs computer) game over the websocket — an open
 * socket is required, gating bots. Navigation happens on the server's `ingame` push.
 */
function createEngineGame(body: CreateEngineGameMessage): void {
	socketintents.submit('lobby', 'createengine', body, () => gameIdWeAreIn === undefined);
}

/** Sends a cancelseek message for our current seek. */
function cancel(seekId: SeekId): void {
	// Nothing to cancel if it's no longer ours by the time we're back in sync.
	socketintents.submit('lobby', 'cancelseek', seekId, () => seekId === ourSeekId);
}

/** Sends an acceptseek message for an opponent's seek. */
function accept(seekId: SeekId): void {
	socketintents.submit('lobby', 'acceptseek', seekId, () => gameIdWeAreIn === undefined && seekMap.has(seekId)); // prettier-ignore
}

// Subscribing ---------------------------------------------

/** Subscribes to the server's lobby subscription list (seeks, live games). */
async function subscribe(): Promise<void> {
	if (isIdle) return; // Don't resubscribe while idle; the user must interact with the lobby to reconnect
	if (socketsubs.isSubbedTo('lobby')) return;
	socketsubs.addSub('lobby');
	void socketsend.send('general', 'sub', 'lobby');
}

/** Unsubscribes from the invites list and clears the rendered seek list. */
function unsubscribe(): void {
	clearSeekList();
	socketsubs.unsubFromLobby();
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
	onSeekListUpdate({ seekslist: [] }, true); // Don't clear seek tracker memory
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
				'aria-disabled': String(graceTimers.has(seek.id)),
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
		void variantPreviewTooltip.showForPosition(anchor, t.shared.variant_groups.custom.display_label, () => seekPreviewCache.getSeekPreview(seek.id), 'below', { modifiers: seek.modifiers }); // prettier-ignore
	} else {
		variantPreviewTooltip.showForVariantCode(anchor, seek.variant.code, 'below', { modifiers: seek.modifiers }); // prettier-ignore
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
	handleLobbyState,
	onSeekListUpdate,
	onViewerCountUpdate,
	onInGame,
	onOutGame,
	createSeek,
	createEngineGame,
	subscribe,
	exitIdle,
};
