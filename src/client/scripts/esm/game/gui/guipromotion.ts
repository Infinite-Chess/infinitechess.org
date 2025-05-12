
/**
 * This script handles our promotion menu, when
 * pawns reach the promotion line.
 */

import type { Player, PlayerGroup, RawType } from '../../chess/util/typeutil.js';

import typeutil from '../../chess/util/typeutil.js';
import selection from '../chess/selection.js';
import svgcache from '../../chess/rendering/svgcache.js';
import { players } from '../../chess/util/typeutil.js';
import { listener_overlay } from '../chess/game.js';
import { Mouse } from '../input2.js';



// Variables --------------------------------------------------------------------

const PromotionGUI: {
	base: HTMLElement,
	players: PlayerGroup<HTMLElement>
} = {
	base: document.getElementById('promote')!,
	players: {
		[players.WHITE]: document.getElementById('promotewhite')!,
		[players.BLACK]: document.getElementById('promoteblack')!
	}
};

let selectionOpen = false; // True when promotion GUI visible. Do not listen to navigational controls in the mean time


// Functions --------------------------------------------------------------------


// Prevent right-clicking on the promotion UI
PromotionGUI.base.addEventListener('contextmenu', (event) => event.preventDefault());


function isUIOpen() { return selectionOpen; }

function open(color: Player) {
	selectionOpen = true;
	PromotionGUI.base.classList.remove('hidden');
	if (!(color in PromotionGUI.players)) throw new Error(`Promotion UI does not support color "${color}"`);
	PromotionGUI.players[color]!.classList.remove('hidden');
}

/** Closes the promotion UI */
function close() {
	// console.error("Closing promotion UI");
	selectionOpen = false;
	for (const element of Object.values(PromotionGUI.players)) {
		element.classList.add('hidden');
	}
	PromotionGUI.base.classList.add('hidden');
}

/**
 * Inits the promotion UI. Hides promotions not allowed, reveals promotions allowed.
 * @param promotionsAllowed - An object that contains the information about what promotions are allowed.
 * It contains 2 properties, `white` and `black`, both of which are arrays which may look like `['queens', 'bishops']`.
 */
async function initUI(promotionsAllowed: PlayerGroup<RawType[]> | undefined) {
	if (promotionsAllowed === undefined) return;

	if (Object.values(PromotionGUI.players).some(element => element.childElementCount > 0)) {
		throw new Error("Must reset promotion UI before initiating it, or promotions leftover from the previous game will bleed through.");
	}

	for (const [playerString, rawtypes] of Object.entries(promotionsAllowed)) {
		const player = Number(playerString) as Player;
		if (!(player in PromotionGUI.players)) {
			console.error(`Player ${player} has a promotion but not promotion UI`);
			continue;
		}
		const svgs = await svgcache.getSVGElements(rawtypes.map(rawPromotion => typeutil.buildType(rawPromotion, player)));
		svgs.forEach(svg => {
			svg.classList.add('promotepiece');
			svg.addEventListener('click', callback_promote);
			PromotionGUI.players[player]!.appendChild(svg);
		});
	}
}

/**
 * Resets the promotion UI by clearing all promotion options.
 */
function resetUI() {
	for (const playerPromo of Object.values(PromotionGUI.players)) {
		while (playerPromo.firstChild) {
			const svg = playerPromo.firstChild;
			svg.removeEventListener('click', callback_promote);
			playerPromo.removeChild(svg);
		}
	}
}

function callback_promote(event: Event) {
	const type = Number((event.currentTarget as HTMLElement).id);
	// TODO: Dispatch a custom 'promote-selected' event!
	// That way this script doesn't depend on selection.js
	selection.promoteToType(type);
	close();
}

/** Closes the UI if the mouse clicks outside it. */
function update() {
	if (!selectionOpen) return;
	if (!listener_overlay.isMouseDown(Mouse.LEFT) && !listener_overlay.isMouseDown(Mouse.RIGHT) && !listener_overlay.isMouseDown(Mouse.MIDDLE)) return;
	// Atleast one mouse button was clicked-down OUTSIDE of the promotion UI
	selection.unselectPiece();
	close();
}

export default {
	isUIOpen,
	open,
	close,
	initUI,
	resetUI,
	update,
};