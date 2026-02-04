// src/client/scripts/esm/game/misc/invites.ts

/**
 * This script manages the invites on the Play page.
 */

// Type Imports ------------------------------------------------------------------

import type { ServerUsernameContainer } from '../../../../../shared/types.js';
import type { Player } from '../../../../../shared/chess/util/typeutil.js';
import type { TimeControl } from '../../../../../server/game/timecontrol.js';

// Imports -----------------------------------------------------------------------

import websocket from '../websocket.js';
import LocalStorage from '../../util/LocalStorage.js';
import clockutil from '../../../../../shared/chess/util/clockutil.js';
import guiplay from '../gui/guiplay.js';
import loadbalancer from './loadbalancer.js';
import toast from '../gui/toast.js';
import uuid from '../../../../../shared/util/uuid.js';
import validatorama from '../../util/validatorama.js';
import docutil from '../../util/docutil.js';
import usernamecontainer from '../../util/usernamecontainer.js';
import gamesound from './gamesound.js';
import { players } from '../../../../../shared/chess/util/typeutil.js';

// Types -------------------------------------------------------------------------

/**
 * The invite object. NOT an HTML object.
 */
interface Invite {
	/** Who owns the invite. An object of the type UsernameContainer from usernamecontainer.ts. If it's a guest, then "(Guest)". */
	usernamecontainer: ServerUsernameContainer;
	/** A unique identifier */
	id: string;
	/** Used to verify if an invite is your own. */
	tag?: string;
	/** The name of the variant */
	variant: string;
	/** The clock value */
	clock: TimeControl;
	/** The player color (WHITE=1, BLACK=2, NEUTRAL=0) */
	color: Player;
	/** public/private */
	publicity: 'public' | 'private';
	/** rated/casual */
	rated: 'casual' | 'rated';
}

/**
 * Create lobby invite options.
 */
interface InviteOptions {
	variant: string;
	clock: TimeControl;
	color: Player;
	private: 'public' | 'private';
	rated: 'casual' | 'rated';
}

// Elements ----------------------------------------------------------------------

const invitesContainer = document.getElementById('invites')!;
const ourInviteContainer = document.getElementById('our-invite')!;
const element_joinExisting = document.getElementById('join-existing')!;
const element_inviteCodeCode = document.getElementById('invite-code-code')!;

// Variables ---------------------------------------------------------------------

let weHaveInvite = false;
let ourInviteID: string | undefined;

// Constants ---------------------------------------------------------------------

/**
 * Plucks base C2 (audio cue) if the new invites list contains an invite from a new person!
 * Uses a closure to maintain state of recent users and IDs from the last list.
 */
const playBaseIfNewInvite = (() => {
	const cooldownSecs = 10;
	const recentUsers: Record<string, boolean> = {};
	let IDsInLastList: Record<string, boolean> = {};

	return function (inviteList: Invite[]): void {
		let playedSound = false;
		const newIDsInList: Record<string, boolean> = {};
		inviteList.forEach((invite) => {
			const name = invite.usernamecontainer.username;
			const id = invite.id;
			newIDsInList[id] = true;
			if (IDsInLastList[id]) return; // Not a new invite, was there last update.
			if (recentUsers[name]) return; // We recently played a sound for this user
			if (isInviteOurs(invite)) return;
			recentUsers[name] = true;
			setTimeout(() => delete recentUsers[name], cooldownSecs * 1000);
			if (playedSound) return;
			playSoundNewOpponentInvite();
			playedSound = true;
		});
		IDsInLastList = newIDsInList;
	};
})();

// Functions ---------------------------------------------------------------------

function gelement_iCodeCode(): HTMLElement {
	return element_inviteCodeCode;
}

function update(): void {
	if (!guiplay.isOpen()) return; // Not on the play screen
	if (loadbalancer.areWeHibernating())
		toast.show((translations as any).invites.move_mouse, { durationMultiplier: 0.1 });
}

function unsubIfWeNotHave(): void {
	if (!weHaveInvite) unsubFromInvites();
}

/**
 * Unsubscribes from the invites subscriptions list.
 */
function unsubFromInvites(): void {
	clear(true);
	websocket.unsubFromSub('invites');
}

/**
 * Update invites list according to new data!
 * Should be called by websocket script when it receives a
 * message that the server says is for the "invites" subscription
 */
function onmessage(data: { sub: string; action: string; value?: any; id?: string }): void {
	// { sub, action, value, id }
	// Any incoming message will have no effect if we're not on the invites page.
	// This can happen if we have slow network and leave the invites screen before the server sends us an invites-related message.
	if (!guiplay.isOpen()) return;

	switch (data.action) {
		case 'inviteslist':
			// Update the list in the document
			updateInviteList(data.value.invitesList);
			updateActiveGameCount(data.value.currentGameCount);
			break;
		case 'gamecount':
			updateActiveGameCount(data.value);
			break;
		default:
			toast.show(
				`${(translations as any).invites.unknown_action_received_1} ${data.action} ${(translations as any).invites.unknown_action_received_2}`,
				{ error: true },
			);
			break;
	}
}

/**
 * Sends the create invite request message from the given InviteOptions specified on the invite creation screen.
 */
function create(variantOptions: InviteOptions): void {
	if (weHaveInvite)
		return console.error("We already have an existing invite, can't create more.");

	const inviteOptions = {
		variant: variantOptions.variant,
		clock: variantOptions.clock,
		color: variantOptions.color,
		publicity: variantOptions.private, // Only the `private` property is changed to `publicity`
		rated: variantOptions.rated,
	};

	generateTagForInvite(inviteOptions);

	guiplay.lockCreateInviteButton();

	// The function to execute when we hear back the server's response
	const onreplyFunc = guiplay.unlockCreateInviteButton;

	// console.log("Invite options before sending create invite:");
	// console.log(inviteOptions);

	websocket.sendmessage('invites', 'createinvite', inviteOptions, true, onreplyFunc);
}

function cancel(id?: string): void {
	if (!weHaveInvite) return;
	const inviteID = id ?? ourInviteID;
	if (!inviteID) return toast.show((translations as any).invites.cannot_cancel, { error: true });

	LocalStorage.deleteItem('invite-tag');

	guiplay.lockCreateInviteButton();

	// The function to execute when we hear back the server's response
	const onreplyFunc = guiplay.unlockCreateInviteButton;

	websocket.sendmessage('invites', 'cancelinvite', inviteID, true, onreplyFunc);
}

/**
 * Generates a tag id for the invite parameters before we send off action "createinvite" to the server
 */
function generateTagForInvite(inviteOptions: any): void {
	// Create and send invite with a tag so we know which ones ours
	const tag = uuid.generateID_Base62(8);

	// NEW browser storage method!
	LocalStorage.saveItem('invite-tag', tag);

	inviteOptions.tag = tag;
}

/**
 * Updates the invite elements on the invite creation screen according to the new list provided.
 */
function updateInviteList(list: Invite[]): void {
	// { invitesList, currentGameCount }
	if (!list) return;

	const alreadySeenOurInvite = weHaveInvite;
	let alreadyPlayedSound = false;

	// Close all previous event listeners and delete invites from the document
	clear(false);

	// Append latest invites to the document and re-init event listeners.
	let foundOurs = false;
	let privateInviteID: string | undefined = undefined;
	ourInviteID = undefined;
	for (let i = 0; i < list.length; i++) {
		// { usernamecontainer, variant, clock, color, publicity }
		const invite = list[i]!;

		// Is this our own invite?
		const ours = foundOurs ? false : isInviteOurs(invite);
		if (ours) {
			foundOurs = true;
			ourInviteID = invite.id;
			if (!alreadySeenOurInvite) {
				gamesound.playMarimba();
				alreadyPlayedSound = true;
			}
		}

		const classes = ['invite', 'button', 'unselectable'];
		const isPrivate = invite.publicity === 'private';
		if (isPrivate) privateInviteID = invite.id;
		if (ours && !isPrivate) classes.push('ours');
		else if (ours && isPrivate) classes.push('private');

		const newInvite = createDiv(classes, undefined, invite.id);

		// <div class="invite-child">Playername (elo)</div>
		// <div class="invite-child">Standard</div>
		// <div class="invite-child">15m+15s</div>
		// <div class="invite-child">Random</div>
		// <div class="invite-child">Casual</div>
		// <div class="invite-child accept">Accept</div>

		if (invite.usernamecontainer.type === 'guest') {
			// Standardize the name according to our language.
			if (ours) invite.usernamecontainer.username = (translations as any).you_indicator;
			else invite.usernamecontainer.username = (translations as any).guest_indicator;
		}
		const username_item = { value: invite.usernamecontainer.username, openInNewWindow: false };
		const displayelement_usernamecontainer = usernamecontainer.createUsernameContainer(
			invite.usernamecontainer.type,
			username_item,
			invite.usernamecontainer.rating,
		).element;
		displayelement_usernamecontainer.classList.add('invite-child');
		newInvite.appendChild(displayelement_usernamecontainer);

		const variant = createDiv(['invite-child'], (translations as any)[invite.variant]);
		newInvite.appendChild(variant);

		const time = clockutil.getClockFromKey(invite.clock);
		const cloc = createDiv(['invite-child'], time);
		newInvite.appendChild(cloc);

		// prettier-ignore
		const uColor = ours ? invite.color === players.WHITE ? (translations as any).invites.you_are_white : invite.color === players.BLACK ? (translations as any).invites.you_are_black : (translations as any).invites.random
                            : invite.color === players.WHITE ? (translations as any).invites.you_are_black : invite.color === players.BLACK ? (translations as any).invites.you_are_white : (translations as any).invites.random;
		const color = createDiv(['invite-child'], uColor);
		newInvite.appendChild(color);

		const rated = createDiv(['invite-child'], (translations as any)[invite.rated]);
		newInvite.appendChild(rated);

		const a = ours
			? (translations as any).invites.cancel
			: (translations as any).invites.accept;
		const accept = createDiv(['invite-child', 'accept'], a);
		newInvite.appendChild(accept);

		const targetCont = ours ? ourInviteContainer : invitesContainer;
		targetCont.appendChild(newInvite);
	}

	if (!alreadyPlayedSound) playBaseIfNewInvite(list);

	weHaveInvite = foundOurs;
	updateCreateInviteButton();
	updatePrivateInviteCode(privateInviteID);

	guiplay.initListeners_Invites();

	// If we are on "Local" and have an existing invite, IMMEDIATELY cancel it! This can happen with slow network.
	if (weHaveInvite && guiplay.getModeSelected() !== 'online') cancel();
}

function playSoundNewOpponentInvite(): void {
	if (docutil.isMouseSupported()) gamesound.playBase();
	else gamesound.playViola_c3();
}

/**
 * Close all previous event listeners and delete invites from the document
 * @param recentUsersInLastList - If true, resets the local scope variables for next time
 */
function clear(recentUsersInLastList: boolean = false): void {
	guiplay.closeListeners_Invites();
	ourInviteContainer.innerHTML = ''; // Deletes all contained invite elements
	invitesContainer.innerHTML = ''; // Deletes all contained invite elements
	weHaveInvite = false;
	ourInviteID = undefined;
	element_inviteCodeCode.textContent = '';
	// Passing in an empty list resets the local scope variables for next time.
	if (recentUsersInLastList) playBaseIfNewInvite([]);
}

/**
 * Deletes all invites and resets create invite button if on play page
 */
function clearIfOnPlayPage(): void {
	if (!guiplay.isOpen()) return; // Not on the play screen
	clear(false);
	updateCreateInviteButton();
}

/**
 * Tests if an invite belongs to us.
 * @param invite - The invite object, NOT HTML element.
 * @returns true if it is ours
 */
function isInviteOurs(invite: Invite): boolean {
	if (validatorama.areWeLoggedIn()) {
		return (
			invite.usernamecontainer.type === 'player' &&
			validatorama.getOurUsername() === invite.usernamecontainer.username
		);
	}

	if (!invite.tag) return invite.id === ourInviteID; // Tag not present (invite converted from an HTML element), compare ID instead.

	// Compare the tag..

	const localStorageTag = LocalStorage.loadItem('invite-tag');
	if (!localStorageTag) return false;
	if (invite.tag === localStorageTag) return true;
	return false;
}

/**
 * Creates an invite object from the given HTML element.
 * Note: The clock and color fields will be strings since they're parsed from HTML,
 * but they're not used in the context where this function is called (only id, tag, and usernamecontainer are used).
 * @param inviteElement - The invite, as an element.
 * @returns The invite object, parsed from an HTML element.
 */
function getInviteFromElement(inviteElement: HTMLElement): Invite {
	const id = inviteElement.getAttribute('id')!;

	/**
	 * Starting from the first child, the order goes:
	 * Usernamecontainer, Variant, TimeControl, Color, Publicity, Rated
	 * (see the {@link Invite} object)
	 */

	return {
		usernamecontainer: usernamecontainer.extractPropertiesFromUsernameContainerElement(
			inviteElement.children[0] as HTMLDivElement,
		),
		variant: inviteElement.children[1]!.textContent!,
		clock: inviteElement.children[2]!.textContent! as TimeControl,
		color: inviteElement.children[3]!.textContent! as any as Player, // Parsed from HTML, will be string representation
		publicity: inviteElement.children[4]!.textContent! as 'public' | 'private',
		rated: inviteElement.children[5]!.textContent! as 'casual' | 'rated',
		id,
	};
}

function createDiv(classes: string[], textContent?: string, id?: string): HTMLDivElement {
	const element = document.createElement('div');
	for (let i = 0; i < classes.length; i++) {
		element.classList.add(classes[i]!);
	}
	if (textContent) element.textContent = textContent;
	if (id) element.id = id;
	return element;
}

function accept(inviteID: string, isPrivate: boolean): void {
	const inviteinfo = { id: inviteID, isPrivate };

	guiplay.lockAcceptInviteButton();

	// The function to execute when we hear back the server's response
	const onreplyFunc = guiplay.unlockAcceptInviteButton;

	websocket.sendmessage('invites', 'acceptinvite', inviteinfo, true, onreplyFunc);
}

/**
 * A callback that gui fires when an invite document element is clicked!
 */
function click(element: HTMLElement): void {
	const invite = getInviteFromElement(element);
	const isOurs = isInviteOurs(invite);

	if (isOurs) {
		// Only cancel if the Create Invite button isn't disabled
		if (!guiplay.isCreateInviteButtonLocked()) cancel(invite.id!);
	} else {
		// Not our invite, accept the one we clicked
		if (!guiplay.isAcceptInviteButtonLocked()) accept(invite.id!, false);
	}
}

function updateCreateInviteButton(): void {
	if (guiplay.getModeSelected() !== 'online') return;
	if (weHaveInvite)
		guiplay.setElement_CreateInviteTextContent((translations as any).invites.cancel_invite);
	else guiplay.setElement_CreateInviteTextContent((translations as any).invites.create_invite);
}

function updatePrivateInviteCode(privateInviteID: string | undefined): void {
	// If undefined, we know we don't have a "private" invite
	if (guiplay.getModeSelected() === 'local') return;

	if (!weHaveInvite) {
		guiplay.showElement_joinPrivate();
		guiplay.hideElement_inviteCode();
		return;
	}

	// We have an invite...

	// If the classlist of our private invite contains a "private" property of "private",
	// then display our invite code text!

	if (privateInviteID) {
		guiplay.hideElement_joinPrivate();
		guiplay.showElement_inviteCode();
		element_inviteCodeCode.textContent = privateInviteID.toUpperCase();
		return;
	}

	// Else our invite is NOT private, only show the "Private Invite:" display.

	guiplay.showElement_joinPrivate();
	guiplay.hideElement_inviteCode();
}

function updateActiveGameCount(newCount: number): void {
	if (newCount === undefined) throw Error('Need to specify active game count');
	element_joinExisting.textContent = `${(translations as any).invites.join_existing_active_games} ${newCount}`;
}

function doWeHave(): boolean {
	return weHaveInvite;
}

/**
 * Subscribes to the invites list. We will receive updates
 * for incoming and deleted invites from other players.
 * @param ignoreAlreadySubbed - *true* If the socket closed unexpectedly and we need to resub. subs.invites will already be true so we ignore that.
 */
async function subscribeToInvites(ignoreAlreadySubbed?: boolean): Promise<void> {
	// Set to true when we are restarting the connection and need to resub to everything we were to before.
	if (!guiplay.isOpen()) return; // Don't subscribe to invites if we're not on the play page!

	const alreadySubbed = websocket.areSubbedToSub('invites');
	if (!ignoreAlreadySubbed && alreadySubbed) return;
	// console.log("Subbing to invites!");
	websocket.addSub('invites');
	websocket.sendmessage('general', 'sub', 'invites');
}

// Exports -----------------------------------------------------------------------

export default {
	gelement_iCodeCode,
	onmessage,
	update,
	create,
	cancel,
	clear,
	accept,
	click,
	doWeHave,
	clearIfOnPlayPage,
	unsubIfWeNotHave,
	subscribeToInvites,
	unsubFromInvites,
};

export type { Invite, InviteOptions };
