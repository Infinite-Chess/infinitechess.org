// src/client/scripts/esm/game/gui/boardeditor/guistartenginegame.ts

/**
 * Manages the GUI popup window for the Start engine game button of the Board Editor
 */

import type { Player } from '../../../../../../shared/chess/util/typeutil';
import type { TimeControl } from '../../../../../../shared/chess/util/metadata';

import eactions from '../../boardeditor/actions/eactions';
import gameslot from '../../chess/gameslot';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter';
import guifloatingwindow from './guifloatingwindow';
import { players } from '../../../../../../shared/chess/util/typeutil';

interface EngineUIConfig {
	youAreColor: Player;
	TimeControl: TimeControl;
	strengthLevel: 1 | 2 | 3;
	setDefaultWorldBorder: boolean;
}

// Constants ----------------------------------------------------------

const timeControlRegex = new RegExp(
	String.raw`^${icnconverter.wholeNumberSource}\+${icnconverter.wholeNumberSource}$`,
);

// Elements ----------------------------------------------------------

/** The button the toggles visibility of the Start engine game popup window. */
const element_enginegamebutton = document.getElementById('start-engine-game')!;

/** The actual window of the Game Rules popup. */
const element_window = document.getElementById('engine-game-UI')!;
const element_header = document.getElementById('engine-game-UI-header')!;
const element_closeButton = document.getElementById('close-engine-game-UI')!;

const noButton = document.getElementById('start-engine-game-no')!;
const yesButton = document.getElementById('start-engine-game-yes')!;

const element_white = document.getElementById('engine-game-white')! as HTMLInputElement;
const element_black = document.getElementById('engine-game-black')! as HTMLInputElement;

const element_timecontrol = document.getElementById('engine-game-timecontrol')! as HTMLInputElement;

const element_easy = document.getElementById('engine-game-easy')! as HTMLInputElement;
const element_medium = document.getElementById('engine-game-medium')! as HTMLInputElement;
const element_hard = document.getElementById('engine-game-hard')! as HTMLInputElement;

const element_noborder = document.getElementById('engine-game-border-no')! as HTMLInputElement;
const element_yesborder = document.getElementById('engine-game-border-yes')! as HTMLInputElement;

const elements_selectionList: HTMLInputElement[] = [
	element_white,
	element_black,
	element_timecontrol,
	element_easy,
	element_medium,
	element_hard,
	element_noborder,
	element_yesborder,
];

// Create floating window ----------------------------------------------------

const floatingWindow = guifloatingwindow.create({
	windowEl: element_window,
	headerEl: element_header,
	closeButtonEl: element_closeButton,
	inputElList: elements_selectionList,
	onOpen,
	onClose,
});

// Toggling ------------------------------------------------------------

function onOpen(): void {
	updateEngineUIcontents();
	element_enginegamebutton.classList.add('active');
	initEngineGameUIListeners();
}

function onClose(resetPositioning = false): void {
	if (resetPositioning) floatingWindow.resetPositioning();
	element_enginegamebutton.classList.remove('active');
	closeEngineGameUIListeners();
}

// Enginegame-UI-specific listeners -------------------------------------------

function initEngineGameUIListeners(): void {
	elements_selectionList.forEach((el) => {
		el.addEventListener('blur', readEngineUIConfig);
	});
	yesButton.addEventListener('click', onYesButtonPress);
	noButton.addEventListener('click', onNoButtonPress);
}

function closeEngineGameUIListeners(): void {
	elements_selectionList.forEach((el) => {
		el.removeEventListener('blur', readEngineUIConfig);
	});
	yesButton.removeEventListener('click', onYesButtonPress);
	noButton.removeEventListener('click', onNoButtonPress);
}

// Utilities ----------------------------------------------------------------------

function onYesButtonPress(): void {
	const engineUIConfig = readEngineUIConfig();
	eactions.startEngineGame(engineUIConfig);
}

function onNoButtonPress(): void {
	floatingWindow.close(false);
}

/** Updates the engineconfig UI values when opened */
function updateEngineUIcontents(): void {
	const existingBorder = gameslot.getGamefile()?.basegame.gameRules.worldBorder !== undefined;
	element_noborder.checked = existingBorder;
	element_yesborder.checked = !existingBorder;
}

/** Constructs the engineconfig by reading the input boxes, and validating them */
function readEngineUIConfig(): EngineUIConfig {
	// Player color
	const youAreColor = element_white.checked ? players.WHITE : players.BLACK;

	// Time control
	let TimeControl: TimeControl = '-';
	const timeControlRaw = element_timecontrol.value;
	if (timeControlRaw === '-' || timeControlRaw === '') {
		element_timecontrol.classList.remove('invalid-input');
	} else if (timeControlRegex.test(timeControlRaw)) {
		const [a, b] = timeControlRaw.split('+').map(Number);
		if (a !== undefined && b !== undefined && Number.isFinite(a) && Number.isFinite(b)) {
			TimeControl = `${a}+${b}`;
			element_timecontrol.classList.remove('invalid-input');
		} else {
			element_timecontrol.classList.add('invalid-input');
		}
	} else {
		element_timecontrol.classList.add('invalid-input');
	}

	// Strength level
	const strengthLevel = element_hard.checked ? 3 : element_medium.checked ? 2 : 1;

	// Set default world border
	const setDefaultWorldBorder = element_yesborder.checked ? true : false;

	return { youAreColor, TimeControl, strengthLevel, setDefaultWorldBorder };
}

// Exports -----------------------------------------------------------------

export default {
	open: floatingWindow.open,
	close: floatingWindow.close,
	isOpen: floatingWindow.isOpen,
};

export type { EngineUIConfig };
