
/**
 * This script adds event listeners for our main overlay html element that
 * contains all of our gui pages.
 * 
 * We also prepare the board here whenever ANY gui page (non-game) is opened.
 */

// @ts-ignore
import statustext from './statustext.js';
// @ts-ignore
import loadbalancer from '../misc/loadbalancer.js';
import boardpos from '../rendering/boardpos.js';
import guititle from './guititle.js';
import vectors from '../../util/math/vectors.js';
import bigdecimal from '../../util/bigdecimal/bigdecimal.js';



// Functions ------------------------------------------------------------------------------



/**
 * Call when we first load the page, or leave any game. This prepares the board
 * for either the title screen or lobby (any screen that's not in a game)
 */
function prepareForOpen(): void {
	// Randomize pan velocity direction for the title screen and lobby menus
	randomizePanVelDir();
	const amount = bigdecimal.FromNumber(1.8); // Default: 1.8
	boardpos.setBoardScale(amount);
	loadbalancer.restartAFKTimer();
}

// Sets panVel to a random direction, and sets speed to titleBoardVel. Called when the title screen is initiated.
function randomizePanVelDir(): void {
	const randTheta = Math.random() * 2 * Math.PI;
	const XYComponents = vectors.getXYComponents_FromAngle(randTheta);
	boardpos.setPanVel([
		XYComponents[0] * guititle.boardVel,
		XYComponents[1] * guititle.boardVel
	]);
}

/** Displays the status message on screen "Feature is planned". */
function displayStatus_FeaturePlanned(): void {
	statustext.showStatus(translations['planned_feature']);
}


export default {
	prepareForOpen,
	displayStatus_FeaturePlanned,
};