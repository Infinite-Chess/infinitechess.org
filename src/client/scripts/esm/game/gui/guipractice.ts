
/*
 * This script handles our Practice page, containing
 * our practice selection menu.
 */


import checkmatepractice from '../chess/checkmatepractice.js';
import gui from './gui.js';
import guititle from './guititle.js';
import spritesheet from '../rendering/spritesheet.js';
import colorutil from '../../chess/util/colorutil.js';
// @ts-ignore
import style from './style.js';
// @ts-ignore
import formatconverter from '../../chess/logic/formatconverter.js';
import svgcache from '../../chess/rendering/svgcache.js';


// Variables ----------------------------------------------------------------------------


const element_menuExternalLinks: HTMLElement = document.getElementById('menu-external-links')!;

const element_practiceSelection: HTMLElement = document.getElementById('practice-selection')!;
const element_practiceName: HTMLElement = document.getElementById('practice-name')!;
const element_practiceBack: HTMLElement = document.getElementById('practice-back')!;
const element_practicePlay: HTMLElement = document.getElementById('practice-play')!;
const element_progressBar: HTMLElement = document.querySelector('.checkmate-progress-bar')!;
const element_checkmateList: HTMLElement = document.querySelector('.checkmate-list')!;
const element_checkmates: HTMLElement = document.getElementById('checkmates')!;

let checkmateSelectedID: string = checkmatepractice.validCheckmates.easy[0]!; // id of selected checkmate
let indexSelected: number = 0; // index of selected checkmate among its brothers and sisters
let generatedHTML: boolean = false;
let generatedIcons: boolean = false;

// Variables for controlling the scrolling of the checkmate list
let mouseIsDown: boolean = false;
let mouseMovedAfterClick: boolean = true;
let scrollTop: number;
let startY : number;
let lastY: number;
let velocity: number;
let momentumInterval: ReturnType<typeof setInterval>;
const friction: number = 0.9;

// Functions ------------------------------------------------------------------------


/**
 * Returns the last selected checkmate practce. Useful
 * for knowing which one we just beat.
 */
function getCheckmateSelectedID() {
	return checkmateSelectedID;
}

function open() {
	element_practiceSelection.classList.remove("hidden");
	element_menuExternalLinks.classList.remove("hidden");
	if (!generatedHTML) createPracticeHTML();
	changeCheckmateSelected(checkmateSelectedID);
	updateCheckmatesBeaten();
	if (!generatedIcons) addPieceIcons();
	initListeners();
}

function close() {
	element_practiceSelection.classList.add("hidden");
	element_menuExternalLinks.classList.add("hidden");
	closeListeners();
}

/**
 * On first practice page load, generate list of checkmate HTML elements to be shown on page
 */
function createPracticeHTML() {
	for (const [difficulty, checkmates] of Object.entries(checkmatepractice.validCheckmates)) {
		checkmates.forEach((checkmateID: string) => {
			const piecelist: RegExpMatchArray | null = checkmateID.match(/[0-9]+[a-zA-Z]+/g);
			if (!piecelist) return;

			const checkmatePuzzle = document.createElement('div');
			checkmatePuzzle.className = 'checkmate unselectable';
			checkmatePuzzle.id = checkmateID;

			const completionMark = document.createElement('div');
			completionMark.className = 'completion-mark';

			const piecelistW = document.createElement('div');
			piecelistW.className = 'piecelistW';

			const versusText = document.createElement('div');
			versusText.className = 'checkmate-child versus';
			versusText.textContent = translations['versus'];

			const piecelistB = document.createElement('div');
			piecelistB.className = 'piecelistB';

			const checkmateDifficulty = document.createElement('div');
			checkmateDifficulty.className = 'checkmate-difficulty';
			checkmateDifficulty.textContent = translations[difficulty];

			for (const entry of piecelist) {
				const amount: number = parseInt(entry.match(/[0-9]+/)![0]); // number of pieces to be placed
				const shortPiece: string = entry.match(/[a-zA-Z]+/)![0]; // piecetype to be placed
				const longPiece = formatconverter.ShortToLong_Piece(shortPiece);

				for (let j = 0; j < amount; j++) {
					const pieceDiv = document.createElement('div');
					pieceDiv.className = `checkmatepiece ${longPiece}`;

					const containerDiv = document.createElement('div');
					const collation = (j === 0 ? "" : (shortPiece === "Q" || shortPiece === "AM" ? " collated" : " collated-strong"));
					containerDiv.className = `checkmate-child checkmatepiececontainer${collation}`;
					containerDiv.appendChild(pieceDiv);

					if (colorutil.getPieceColorFromType(longPiece) === "white") piecelistW.appendChild(containerDiv);
					else piecelistB.appendChild(containerDiv);
				}
			}
			checkmatePuzzle.appendChild(completionMark);
			checkmatePuzzle.appendChild(piecelistW);
			checkmatePuzzle.appendChild(versusText);
			checkmatePuzzle.appendChild(piecelistB);
			checkmatePuzzle.appendChild(checkmateDifficulty);
			element_checkmates.appendChild(checkmatePuzzle);
		});
	}
	generatedHTML = true;
}

async function addPieceIcons() {
	// let sprites = await svgcache.getSVGElements();
	const spritenames = new Set<string>;
	const sprites: { [pieceType: string]: SVGElement } = {};
	for (const checkmate of element_checkmates.children) {
		for (const piece of checkmate.getElementsByClassName('piecelistW')[0]!.getElementsByClassName('checkmatepiececontainer')) {
			const actualpiece = piece.getElementsByClassName('checkmatepiece')[0]!;
			spritenames.add(actualpiece.className.split(' ')[1]!);
		}
		const pieceBlack = checkmate.getElementsByClassName('piecelistB')[0]!.getElementsByClassName('checkmatepiececontainer')[0]!;
		const actualpieceBlack = pieceBlack.getElementsByClassName('checkmatepiece')[0]!;
		spritenames.add(actualpieceBlack.className.split(' ')[1]!);
	}
	const spriteSVGs = await svgcache.getSVGElements([...spritenames]);
	for (const svg of spriteSVGs) {
		sprites[svg.id] = svg;
	}
	for (const checkmate of element_checkmates.children) {
		for (const piece of checkmate.getElementsByClassName('piecelistW')[0]!.getElementsByClassName('checkmatepiececontainer')) {
			const actualpiece = piece.getElementsByClassName('checkmatepiece')[0]!;
			actualpiece.appendChild(sprites[actualpiece.className.split(' ')[1]!]!.cloneNode(true));
		}
		const pieceBlack = checkmate.getElementsByClassName('piecelistB')[0]!.getElementsByClassName('checkmatepiececontainer')[0]!;
		const actualpieceBlack = pieceBlack.getElementsByClassName('checkmatepiece')[0]!;
		const spriteBlack = sprites[actualpieceBlack.className.split(' ')[1]!]!.cloneNode(true);
		actualpieceBlack.appendChild(spriteBlack);
	}
	generatedIcons = true;
}

function initListeners() {
	element_practiceBack.addEventListener('click', callback_practiceBack);
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

function closeListeners() {
	element_practiceBack.removeEventListener('click', callback_practiceBack);
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

function callback_mouseDown(event: MouseEvent) {
	mouseIsDown = true;
	mouseMovedAfterClick = false;
	startY = event.pageY - element_checkmateList.offsetTop;
	scrollTop = element_checkmateList.scrollTop;

	velocity = 0;
	clearInterval(momentumInterval);
}

function callback_mouseUp(event: MouseEvent) {
	mouseIsDown = false;
	if (!(event.currentTarget as HTMLElement).id) return; // mouse not on checkmate target
	if (mouseMovedAfterClick) {
		applyMomentum();
		return;
	}
	changeCheckmateSelected((event.currentTarget as HTMLElement).id);
	indexSelected = style.getElementIndexWithinItsParent((event.currentTarget as HTMLElement));
}

function callback_mouseMove(event: MouseEvent) {
	mouseMovedAfterClick = true;
	if (!mouseIsDown) return;
	event.preventDefault();
	const y = event.pageY - element_checkmateList.offsetTop;
	const walkY = y - startY;
	element_checkmateList.scrollTop = scrollTop - walkY;

	velocity = event.pageY - lastY;
	lastY = event.pageY;
}

function applyMomentum() {
	momentumInterval = setInterval(() => {
		if (Math.abs(velocity) < 0.5) {
			clearInterval(momentumInterval);
			return;
		}
		element_checkmateList.scrollTop -= velocity;
		velocity *= friction;
	}, 16); // Approx. 60fps
}

function changeCheckmateSelected(checkmateid: string) {
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

/**
 * Updates each checkmate practice element's 'beaten' class, along with the progress bar on top.
 * @param completedCheckmates - A list of checkmate strings we have beaten: `[ "2Q-1k", "3R-1k", "2CH-1k"]`
 */
function updateCheckmatesBeaten() {
	let amountBeaten = 0;
	const completedCheckmates = checkmatepractice.getCompletedCheckmates();
	for (const element of element_checkmates.children) {
		// What is the id string of this checkmate?
		const id_string = element.id; // "2Q-1k"
		// If this id is inside our list of beaten checkmates, add the beaten class
		if (completedCheckmates.includes(id_string)) {
			element.classList.add('beaten');
			amountBeaten++;
		} else element.classList.remove('beaten');
	}
	// Update the progress bar
	element_progressBar.textContent = `${translations['progress_checkmate']}: ${amountBeaten} / ${element_checkmates.children.length}`;
	const percentageBeaten = 100 * amountBeaten / element_checkmates.children.length;
	element_progressBar.style.background = `linear-gradient(to right, rgba(0, 163, 0, 0.3) ${percentageBeaten}%, transparent ${percentageBeaten}%)`;
}

function callback_practiceBack(event: Event) {
	close();
	guititle.open();
}

function callback_practicePlay() {
	close();
	checkmatepractice.startCheckmatePractice(checkmateSelectedID);
}

/** If enter is pressed, click Play. Or if arrow keys are pressed, move up and down selection */
function callback_keyPress(event: KeyboardEvent) {
	if (event.key === 'Enter') callback_practicePlay();
	else if (event.key === 'ArrowDown') moveDownSelection(event);
	else if (event.key === 'ArrowUp') moveUpSelection(event);
}

function moveDownSelection(event: Event) {
	event.preventDefault();
	if (indexSelected >= element_checkmates.children.length - 1) return;
	indexSelected++;
	const newSelectionElement = element_checkmates.children[indexSelected]!;
	changeCheckmateSelected(newSelectionElement.id);
}

function moveUpSelection(event: Event) {
	event.preventDefault();
	if (indexSelected <= 0) return;
	indexSelected--;
	const newSelectionElement = element_checkmates.children[indexSelected]!;
	changeCheckmateSelected(newSelectionElement.id);
}


// Exports ------------------------------------------------------------------------


export default {
	getCheckmateSelectedID,
	open,
	updateCheckmatesBeaten,
};