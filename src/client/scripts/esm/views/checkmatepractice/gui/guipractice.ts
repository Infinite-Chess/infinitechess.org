// src/client/scripts/esm/views/checkmatepractice/gui/guipractice.ts

/** Handles our Practice page, containing our practice selection menu. */

import validcheckmates from '../../../../../../shared/chess/util/validcheckmates.js';
import typeutil, {
	players as p,
	ext as e,
	rawTypes as r,
} from '../../../../../../shared/chess/util/typeutil.js';

import svgcache from '../../../chess/rendering/svgcache.js';
import validatorama from '../../../util/validatorama.js';
import { SettingsBus } from '../../../util/SettingsBus.js';
import checkmatepractice from '../checkmatepractice.js';

// Types -----------------------------------------------------------------------

/** A practice checkmate difficulty, like `easy`. */
type Difficulty = keyof typeof validcheckmates.BY_DIFFICULTY;

// Elements --------------------------------------------------------------------

const element_menuExternalLinks: HTMLElement = document.getElementById('menu-external-links')!;

const element_practiceSelection: HTMLElement = document.getElementById('practice-selection')!;
const element_practiceBack: HTMLElement = document.getElementById('practice-back')!;
const element_practicePlay: HTMLElement = document.getElementById('practice-play')!;
const element_progress = document.querySelector<HTMLElement>('.checkmate-progress')!;
const element_progressBar = document.querySelector<HTMLElement>('.checkmate-progress-bar')!;
const element_checkmateList = document.querySelector<HTMLElement>('.checkmate-list')!;
const element_checkmates: HTMLElement = document.getElementById('checkmates')!;

const element_checkmateBadgeBronze = document.getElementById('checkmate-badge-bronze')!;
const element_checkmateBadgeBronzeImage = document.querySelector<HTMLElement>(
	'#checkmate-badge-bronze img',
)!;
const elements_checkmateBadgeBronzeShine = document.querySelectorAll(
	'#checkmate-badge-bronze .shine-clockwise, #checkmate-badge-bronze .shine-anticlockwise',
);
const element_checkmateBadgeSilver = document.getElementById('checkmate-badge-silver')!;
const element_checkmateBadgeSilverImage = document.querySelector<HTMLElement>(
	'#checkmate-badge-silver img',
)!;
const elements_checkmateBadgeSilverShine = document.querySelectorAll(
	'#checkmate-badge-silver .shine-clockwise, #checkmate-badge-silver .shine-anticlockwise',
);
const element_checkmateBadgeGold = document.getElementById('checkmate-badge-gold')!;
const element_checkmateBadgeGoldImage = document.querySelector<HTMLElement>(
	'#checkmate-badge-gold img',
)!;
const elements_checkmateBadgeGoldShine = document.querySelectorAll(
	'#checkmate-badge-gold .shine-clockwise, #checkmate-badge-gold .shine-anticlockwise',
);

// Constants -------------------------------------------------------------------

/** The momentum the checkmate list keeps scrolling with after a drag is released. */
const MOMENTUM = {
	/** Multiplies the velocity every step. */
	friction: 0.9,
	/** The speed, in pixels per step, below which the momentum stops. */
	minSpeed: 0.5,
	/** Approx. 60fps */
	stepMs: 16,
};

// State -----------------------------------------------------------------------

/** The id of the selected checkmate. */
let checkmateSelectedID: string = validcheckmates.BY_DIFFICULTY.easy[0]!;
/** Whether the checkmates list has been appended to the doc */
let generatedHTML: boolean = false;
/** Whether the svgs of all the pieces in the checkmates list have been appended to the doc */
let generatedIcons: boolean = false;
/** Whether the practice page is open */
let isOpen: boolean = false;

/** A drag-scroll of the checkmate list, and the momentum it leaves behind. */
const listScroll: {
	mouseIsDown: boolean;
	mouseMovedAfterClick: boolean;
	scrollTop: number;
	startY: number;
	lastY: number;
	velocity: number;
	momentumInterval: ReturnType<typeof setInterval> | undefined;
} = {
	mouseIsDown: false,
	mouseMovedAfterClick: true,
	scrollTop: 0,
	startY: 0,
	lastY: 0,
	velocity: 0,
	momentumInterval: undefined,
};

// Events ----------------------------------------------------------------------

// Set an event listener, for when the theme changes, to re-generate the icons, as their color may change
SettingsBus.addEventListener('theme-change', () => {
	removePieceIcons(); // Remove the existing icons
	if (isOpen) addPieceIcons(); // Regenerate the icons so they can update their color, if the new theme has different color arguments
});

// Opening & Closing -----------------------------------------------------------

/** Opens the practice page, generating its checkmates list the first time. */
function open(): void {
	isOpen = true;
	element_practiceSelection.classList.remove('hidden');
	element_menuExternalLinks.classList.remove('hidden');
	if (!generatedHTML) createPracticeHTML();
	if (!generatedIcons) addPieceIcons();
	changeCheckmateSelected(checkmateSelectedID);
	updateCheckmatesBeaten(checkmatepractice.getCompletedCheckmates());
	initListeners();
}

/** Closes the practice page. */
function close(): void {
	isOpen = false;
	clearScrollMomentumInterval();
	element_practiceSelection.classList.add('hidden');
	element_menuExternalLinks.classList.add('hidden');
	closeListeners();
}

// Checkmates List -------------------------------------------------------------

/** On first practice page load, generates the list of checkmate elements shown on the page. */
function createPracticeHTML(): void {
	const entries = Object.entries(validcheckmates.BY_DIFFICULTY) as [Difficulty, string[]][];
	for (const [difficulty, checkmates] of entries) {
		checkmates.forEach((checkmateID) =>
			element_checkmates.appendChild(createCheckmateElement(checkmateID, difficulty)),
		);
	}
	generatedHTML = true;
}

/** Creates a checkmate's list entry: its white pieces versus its black ones, and its difficulty. */
function createCheckmateElement(checkmateID: string, difficulty: Difficulty): HTMLElement {
	const checkmatePuzzle = document.createElement('div');
	checkmatePuzzle.className = 'checkmate unselectable';
	checkmatePuzzle.id = checkmateID;

	const completionMark = document.createElement('div');
	completionMark.className = 'completion-mark';

	const piecelistW = document.createElement('div');
	piecelistW.className = 'piecelistW';

	const versusText = document.createElement('div');
	versusText.className = 'checkmate-child versus';
	versusText.textContent = translations.versus;

	const piecelistB = document.createElement('div');
	piecelistB.className = 'piecelistB';

	const checkmateDifficulty = document.createElement('div');
	checkmateDifficulty.className = 'checkmate-difficulty';
	checkmateDifficulty.textContent = translations[difficulty];

	appendPieceContainers(checkmateID, piecelistW, piecelistB);
	checkmatePuzzle.appendChild(completionMark);
	checkmatePuzzle.appendChild(piecelistW);
	checkmatePuzzle.appendChild(versusText);
	checkmatePuzzle.appendChild(piecelistB);
	checkmatePuzzle.appendChild(checkmateDifficulty);
	return checkmatePuzzle;
}

/** Appends a container for each piece of a checkmate ID like `2Q-1k` to its player's list. */
function appendPieceContainers(
	checkmateID: string,
	piecelistW: HTMLElement,
	piecelistB: HTMLElement,
): void {
	for (const { amount, type } of checkmatepractice.getPieceRuns(checkmateID)) {
		const piecelist = typeutil.getColorFromType(type) === p.WHITE ? piecelistW : piecelistB;

		for (let j = 0; j < amount; j++) {
			const pieceDiv = document.createElement('div');
			pieceDiv.className = `checkmatepiece ${type}`;

			const containerDiv = document.createElement('div');
			// prettier-ignore
			const collation = (j === 0 ? '' : (type === r.QUEEN + e.W || type === r.AMAZON + e.W ? ' collated' : ' collated-strong'));
			containerDiv.className = `checkmate-child checkmatepiececontainer${collation}`;
			containerDiv.appendChild(pieceDiv);
			piecelist.appendChild(containerDiv);
		}
	}
}

// Piece Icons -----------------------------------------------------------------

/** Appends the svg of each piece in the checkmates list that shows one. */
async function addPieceIcons(): Promise<void> {
	const holders = getIconHolders();
	const pieceTypes = new Set(holders.map((holder) => Number(getHolderType(holder))));
	const svgs = await svgcache.getSVGElements([...pieceTypes]);
	const svgsByID = new Map(svgs.map((svg) => [svg.id, svg]));
	holders.forEach((holder) =>
		holder.appendChild(svgsByID.get(getHolderType(holder))!.cloneNode(true)),
	);
	generatedIcons = true;
}

/** The piece elements that show an icon: every white piece, and each checkmate's first black one. */
function getIconHolders(): Element[] {
	return [...element_checkmates.children].flatMap((checkmate) => [
		...checkmate.querySelectorAll('.piecelistW .checkmatepiece'),
		checkmate.querySelector('.piecelistB .checkmatepiece')!,
	]);
}

/** The piece type an icon holder shows, as its id string. */
function getHolderType(holder: Element): string {
	return holder.className.split(' ')[1]!;
}

/** Removes the piece icons from the checkmates list. Called when the theme changes. */
function removePieceIcons(): void {
	getIconHolders().forEach((holder) => holder.replaceChildren());
	generatedIcons = false; // Reset the icon generation flag
}

// Listeners -------------------------------------------------------------------

/** Adds the practice page's listeners. */
function initListeners(): void {
	element_practiceBack.addEventListener('click', close);
	element_practicePlay.addEventListener('click', callback_practicePlay);
	document.addEventListener('keydown', callback_keyPress);

	document.addEventListener('mouseup', callback_mouseUp);
	document.addEventListener('mousemove', callback_mouseMove);
	element_checkmateList.addEventListener('mousedown', callback_mouseDown);
	for (const element of element_checkmates.children) {
		(element as HTMLElement).addEventListener('mouseup', callback_mouseUp);
		element.addEventListener('dblclick', callback_practicePlay); // Simulate clicking "Play"
	}
}

/** Removes the practice page's listeners. */
function closeListeners(): void {
	element_practiceBack.removeEventListener('click', close);
	element_practicePlay.removeEventListener('click', callback_practicePlay);
	document.removeEventListener('keydown', callback_keyPress);

	document.removeEventListener('mouseup', callback_mouseUp);
	document.removeEventListener('mousemove', callback_mouseMove);
	element_checkmateList.removeEventListener('mousedown', callback_mouseDown);
	for (const element of element_checkmates.children) {
		(element as HTMLElement).removeEventListener('mouseup', callback_mouseUp);
		element.removeEventListener('dblclick', callback_practicePlay); // Simulate clicking "Play"
	}
}

// Scrolling list with the left mouse button -----------------------------------

/** Starts a drag-scroll of the checkmates list, halting any momentum. */
function callback_mouseDown(event: MouseEvent): void {
	listScroll.mouseIsDown = true;
	listScroll.mouseMovedAfterClick = false;
	listScroll.startY = event.pageY - element_checkmateList.offsetTop;
	listScroll.scrollTop = element_checkmateList.scrollTop;

	listScroll.velocity = 0;
	clearScrollMomentumInterval();
}

/** Ends a drag-scroll with momentum, or, if released over a checkmate without moving, selects it. */
function callback_mouseUp(event: MouseEvent): void {
	listScroll.mouseIsDown = false;
	const target = event.currentTarget;
	if (!(target instanceof HTMLElement)) return; // The document's listener, not a checkmate's
	if (listScroll.mouseMovedAfterClick) {
		applyMomentum();
		return;
	}
	changeCheckmateSelected(target.id);
}

/** Scrolls the checkmates list along with a drag, tracking its velocity. */
function callback_mouseMove(event: MouseEvent): void {
	listScroll.mouseMovedAfterClick = true;
	if (!listScroll.mouseIsDown) return;
	event.preventDefault();
	const y = event.pageY - element_checkmateList.offsetTop;
	const walkY = y - listScroll.startY;
	element_checkmateList.scrollTop = listScroll.scrollTop - walkY;

	listScroll.velocity = event.pageY - listScroll.lastY;
	listScroll.lastY = event.pageY;
}

/** Keeps the checkmates list scrolling after a drag, slowing until it stops. */
function applyMomentum(): void {
	listScroll.momentumInterval = setInterval(() => {
		if (Math.abs(listScroll.velocity) < MOMENTUM.minSpeed) {
			clearScrollMomentumInterval();
			return;
		}
		element_checkmateList.scrollTop -= listScroll.velocity;
		listScroll.velocity *= MOMENTUM.friction;
	}, MOMENTUM.stepMs);
}

/** Halts the checkmates list's scroll momentum. */
function clearScrollMomentumInterval(): void {
	clearInterval(listScroll.momentumInterval);
	listScroll.momentumInterval = undefined;
}

// Progress --------------------------------------------------------------------

/**
 * Updates each checkmate practice element's 'beaten' class, along with the progress bar on top.
 * Checkmates that have the 'beaten' class are green with a checkmark on the left.
 * @param completedCheckmates - A list of checkmate strings we have beaten: `[ "2Q-1k", "3R-1k", "2CH-1k"]`
 */
function updateCheckmatesBeaten(completedCheckmates: string[]): void {
	let numCompleted = 0;
	for (const element of element_checkmates.children) {
		// What is the id string of this checkmate?
		const idString = element.id; // "2Q-1k"
		// If this id is inside our list of beaten checkmates, add the beaten class
		if (completedCheckmates.includes(idString)) {
			element.classList.add('beaten');
			numCompleted++;
		} else element.classList.remove('beaten');
	}

	// Update the progress and progress bar
	const numTotal = Object.values(validcheckmates.BY_DIFFICULTY).flat().length;
	element_progress.textContent = `${numCompleted} / ${numTotal}`;
	const percentageBeaten = (100 * numCompleted) / numTotal;
	element_progressBar.style.background = `linear-gradient(to right, rgba(0, 163, 0, 0.3) ${percentageBeaten}%, transparent ${percentageBeaten}%)`;

	// Update the badges
	updateBadges(numCompleted, numTotal);
}

/**
 * Updates the styling of the badges on the progress bar,
 * to grey-out the unearned ones and shine the earned ones.
 * And also update their tooltips.
 * @param numCompleted - Number of checkmates completed
 * @param numTotal - Total number of checkmates
 */
function updateBadges(numCompleted: number, numTotal: number): void {
	const areLoggedIn = validatorama.areWeLoggedIn();

	// Configuration for each badge type
	const badgeConfigs = [
		{
			element: element_checkmateBadgeBronze,
			image: element_checkmateBadgeBronzeImage,
			shines: elements_checkmateBadgeBronzeShine,
			threshold: 0.5,
			earnedKey: 'checkmate_bronze',
			unearnedKey: 'checkmate_bronze_unearned',
		},
		{
			element: element_checkmateBadgeSilver,
			image: element_checkmateBadgeSilverImage,
			shines: elements_checkmateBadgeSilverShine,
			threshold: 0.75,
			earnedKey: 'checkmate_silver',
			unearnedKey: 'checkmate_silver_unearned',
		},
		{
			element: element_checkmateBadgeGold,
			image: element_checkmateBadgeGoldImage,
			shines: elements_checkmateBadgeGoldShine,
			threshold: 1,
			earnedKey: 'checkmate_gold',
			unearnedKey: 'checkmate_gold_unearned',
		},
	] as const;

	badgeConfigs.forEach((config) => {
		const isEarned = numCompleted >= config.threshold * numTotal && areLoggedIn;
		const tooltip = isEarned
			? translations[config.earnedKey]
			: areLoggedIn
				? translations[config.unearnedKey]
				: translations.checkmate_logged_out;

		config.element.setAttribute('data-tooltip', tooltip); // Update tooltip
		config.image.classList.toggle('unearned', !isEarned); // Update badge appearance
		config.shines.forEach((shine) => shine.classList.toggle('hidden', !isEarned)); // Update shine elements
	});
}

// Selection -------------------------------------------------------------------

/** Selects the checkmate of the given id, scrolling it into view. */
function changeCheckmateSelected(checkmateid: string): void {
	for (const element of element_checkmates.children) {
		if (checkmateid === element.id) {
			element.classList.add('selected');
			checkmateSelectedID = checkmateid;
			element.scrollIntoView({ behavior: 'instant', block: 'nearest' });
		} else {
			element.classList.remove('selected');
		}
	}
}

/** Starts the selected checkmate's practice game. */
function callback_practicePlay(): void {
	close();
	checkmatepractice.startCheckmatePractice(checkmateSelectedID);
}

/** If enter is pressed, click Play. Or if arrow keys are pressed, move up and down selection */
function callback_keyPress(event: KeyboardEvent): void {
	if (event.key === 'Enter') callback_practicePlay();
	else if (event.key === 'ArrowDown') moveSelection(event, 1);
	else if (event.key === 'ArrowUp') moveSelection(event, -1);
}

/** Moves the selection one checkmate down (1) or up (-1) the list, stopping at its ends. */
function moveSelection(event: Event, step: 1 | -1): void {
	event.preventDefault();
	const checkmates = [...element_checkmates.children];
	const selectedIndex = checkmates.findIndex((element) => element.id === checkmateSelectedID);
	const newSelection = checkmates[selectedIndex + step];
	if (!newSelection) return;
	clearScrollMomentumInterval();
	changeCheckmateSelected(newSelection.id);
}

// Exports ---------------------------------------------------------------------

export default {
	open,
};
