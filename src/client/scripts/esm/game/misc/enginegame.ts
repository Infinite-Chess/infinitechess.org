

// This module keeps track of the data of the engine game we are currently in.


import type { Coords } from '../../chess/util/coordutil.js';
import type { CoordsSpecial, MoveDraft } from '../../chess/logic/movepiece.js';


import gamefileutility from '../../chess/util/gamefileutility.js';
import selection from '../chess/selection.js';
import movepiece from '../../chess/logic/movepiece.js';
import checkmatepractice from '../chess/checkmatepractice.js';
import jsutil from '../../util/jsutil.js';
import thread from '../../util/thread.js';
import gameslot from '../chess/gameslot.js';
import movesequence from '../chess/movesequence.js';
// @ts-ignore
import perspective from '../rendering/perspective.js';
// @ts-ignore
import legalmoves from '../../chess/logic/legalmoves.js';


// Variables --------------------------------------------------------------------


/** Whether we are currently in an engine game. */
let inEngineGame: boolean = false;
let ourColor: 'white' | 'black' | undefined;
let currentEngine: string | undefined; // name of the current engine used
let currentEngineMove: Coords | undefined; // currently best move recommended by the engine
let engineConfig: { checkmateSelectedID: string } | undefined; // json that is sent to the engine, giving it extra config information

const engineTimeLimitPerMoveMillis: number = 500; // hard time limit for the engine to think in milliseconds


// Functions ------------------------------------------------------------------------


function areInEngineGame(): boolean {
	return inEngineGame;
}

function getOurColor(): 'white' | 'black' {
	if (!inEngineGame) throw Error("Cannot get our color if we are not in an engine game!");
	return ourColor!;
}

function getCurrentEngine() {
	return currentEngine;
}

/**
 * REPLACE WITH initEngineGame() which is modeled after initOnlineGame(). And initOnlineGame() should be called inside gameloader.ts ---- !!!!!!!!!!!!!!
 * 
 * This has to be called before and separate from {@link initEngineGame}
 * because loading the gamefile and the mesh generation requires this script to know our color.
 * @param {string} color - The color we are in this engine game
 */
function setColorAndGameID(gameOptions: any) {
	inEngineGame = true;
	ourColor = gameOptions.youAreColor;
        
}

/**
 * Inits an engine game. In particular, it needs gameOptions in order to know what engine to use for this enginegame.
 * @param {Object} options - An object that contains the properties `currentEngine` and `engineConfig`
 */
function initEngineGame(options: {
	youAreColor: 'white' | 'black',
	currentEngine: string,
	engineConfig: { checkmateSelectedID: string }
}) {
	inEngineGame = true;
	ourColor = options.youAreColor;
	currentEngine = options.currentEngine;
	currentEngineMove = undefined;
	engineConfig = options.engineConfig;
	console.log(`Started engine game with engine "${currentEngine}".`);
}

// Call when we leave an engine game
function closeEngineGame() {
	inEngineGame = false;
	ourColor = undefined;
	currentEngine = undefined;
	currentEngineMove = undefined;
	engineConfig = undefined;
	perspective.resetRotations(); // Without this, leaving an engine game of which we were black, won't reset our rotation.
}

/**
 * Tests if we are this color in the engine game.
 * @param color - "white" / "black"
 * @returns *true* if we are that color.
 */
function areWeColor(color: string): boolean {
	return color === ourColor;
}

/**
 * This method is called externally when the player submits his move in an engine game
 * It launches an engine webworker and submits the gamefile to the webworker
 * Finally, it closes the webworker again and calls makeEngineMove()
 */
async function submitMove() {
	if (!inEngineGame) return; // Don't do anything if it's not an engine game
	const gamefile = gameslot.getGamefile()!;
	if (gamefile.gameConclusion) return; // Don't do anything if the game is over

	// Initialize the engine as a webworker
	if (!window.Worker) return console.error("Your browser doesn't support web workers.");
	// TODO: What happens if the engine fails / takes too long to load? =============================== !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	// Also TODO: Does this 
	const engineWorker = new Worker(`../scripts/esm/game/chess/${currentEngine}.js`);
	currentEngineMove = undefined;
	engineWorker.onmessage = function(e: MessageEvent) { 
		currentEngineMove = e.data;
		// console.log(`Updated the engine recommended move to ${JSON.stringify(currentEngineMove)}`);
	};

	// Send the gamefile to the engine web worker
	engineWorker.postMessage(JSON.parse(JSON.stringify({ gamefile: gamefile, engineConfig: engineConfig })));

	// give the engine time to think
	await thread.sleep(engineTimeLimitPerMoveMillis);

	// terminate the webworker and make the recommended engine move
	engineWorker.terminate();
	if (!currentEngineMove) return console.error("Engine failed to submit a move within the allocated time limit!");
	makeEngineMove(currentEngineMove);
}

/**
 * This method takes care of all the logic involved in making an engine move
 * It gets called after the engine finishes its calculation
 */
function makeEngineMove(moveDraft: MoveDraft) {
	if (!inEngineGame) return;
	if (!currentEngine) return console.error("Attempting to make engine move, but no engine loaded!");
        
	const gamefile = gameslot.getGamefile()!;
	/**
	 * PERHAPS we don't need this stuff? It's just to find and apply any special move flag
	 * that should go with the move. But shouldn't the engine provide that info with its move?
	 */
	// const piecemoved = gamefileutility.getPieceAtCoords(gamefile, move.startCoords)!;
	// const legalMoves = legalmoves.calculate(gamefile, piecemoved);
	// const endCoordsToAppendSpecial: CoordsSpecial = jsutil.deepCopyObject(move.endCoords);
	// legalmoves.checkIfMoveLegal(legalMoves, move.startCoords, endCoordsToAppendSpecial); // Passes on any special moves flags to the endCoords

	const move = movesequence.makeMove(gamefile, moveDraft);
	movesequence.animateMove(move, true, true);

	selection.reselectPiece(); // Reselect the currently selected piece. Recalc its moves and recolor it if needed.

	// I believe movesequence.makeMove() already does this?
	// if (gamefile.gameConclusion) gameslot.concludeGame();
}

function onGameConclude() {
	if (!inEngineGame) return;
	checkmatepractice.onEngineGameConclude();
}

	
// Export ---------------------------------------------------------------------------------
	

export default {
	areInEngineGame,
	getOurColor,
	getCurrentEngine,
	setColorAndGameID,
	initEngineGame,
	closeEngineGame,
	areWeColor,
	submitMove,
	makeEngineMove,
	onGameConclude
};