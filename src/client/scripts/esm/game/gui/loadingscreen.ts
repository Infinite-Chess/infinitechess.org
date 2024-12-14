
/**
 * This script manages the spinny pawn loading animation
 * while a game is loading a gamefile and generating the spritesheet
 */

// @ts-ignore
import preferences from "../../components/header/preferences.js";
// @ts-ignore
import themes from "../../components/header/themes.js";
// @ts-ignore
import style from "./style.js";


const loadingScreen: HTMLElement = (document.querySelector('.game-loading-screen') as HTMLElement);

/** Lower = loading checkerboard closer to black */
const darknessLevel = 0.22;
/** Percentage of the viewport minimum. 0-100 */
const widthOfTiles = 16;

const element_spinnyPawn = document.querySelector('.game-loading-screen .spinny-pawn');
const element_loadingError = document.querySelector('.game-loading-screen .loading-error');
const element_loadingErrorText = document.querySelector('.game-loading-screen .loading-error-text');


(function init() {

	initColorOfLoadingBackground();
	document.addEventListener('theme-change', initColorOfLoadingBackground);

})();

function initColorOfLoadingBackground() {
	const theme = preferences.getTheme();
	const lightTiles = themes.getPropertyOfTheme(theme, 'lightTiles'); lightTiles[3] = 1;
	const darkTiles = themes.getPropertyOfTheme(theme, 'darkTiles'); darkTiles[3] = 1;

	for (let i = 0; i < 3; i++) { // Darken the color
		lightTiles[i]! *= darknessLevel;
		darkTiles[i]! *= darknessLevel;
	}

	const lightTilesCSS = style.arrayToCssColor(lightTiles);
	const darkTilesCSS = style.arrayToCssColor(darkTiles);

	loadingScreen!.style.background = `repeating-conic-gradient(${darkTilesCSS} 0% 25%, ${lightTilesCSS} 0% 50%) 50% / ${widthOfTiles}vmin ${widthOfTiles}vmin`;
}

function open() {
	loadingScreen.classList.remove('transparent');
}

function close() {
	loadingScreen.classList.add('transparent');

	// Hide the error text and show the spinny pawn
	element_spinnyPawn!.classList.remove('hidden');
	element_loadingError!.classList.add('hidden');
}

function onError(event: Event) {
	// const type = event.type; // Event type: "error"/"abort"
	// const target = event.target; // Element that triggered the event
	// const elementType = target?.tagName.toLowerCase();
	// const sourceURL = target?.src || target?.href; // URL of the resource that failed to load
	// console.error(`Event ${type} ocurred loading ${elementType} at ${sourceURL}.`);

	element_spinnyPawn!.classList.add('hidden');

	// Show the ERROR text
	element_loadingError!.classList.remove('hidden');
	// const lostNetwork = !navigator.onLine;
	// element_loadingErrorText!.textContent = lostNetwork ? translations['lost_network'] : translations['failed_to_load'];
	element_loadingErrorText!.textContent = translations['failed_to_load'];
}

export default {
	open,
	close,
	onError,
};