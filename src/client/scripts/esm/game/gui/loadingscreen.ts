
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
}


export default {
	open,
	close,
};