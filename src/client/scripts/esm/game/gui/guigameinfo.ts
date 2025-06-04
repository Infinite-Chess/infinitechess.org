
/**
 * This script handles the game info bar, during a game,
 * displaying the clocks, and whos turn it currently is.
 */

import type { MetaData } from '../../chess/util/metadata.js';
import type { RatingItem, UsernameContainer, UsernameItem } from '../../util/usernamecontainer.js';
import type { PlayerRatingChangeInfo } from '../misc/onlinegame/onlinegamerouter.js';
import type { Rating } from '../../../../../server/database/leaderboardsManager.js';


// @ts-ignore
import winconutil from '../../chess/util/winconutil.js';
import onlinegame from '../misc/onlinegame/onlinegame.js';
import frametracker from '../rendering/frametracker.js';
import gamefileutility from '../../chess/util/gamefileutility.js';
import gameslot from '../chess/gameslot.js';
import gameloader from '../chess/gameloader.js';
import enginegame from '../misc/enginegame.js';
import { PlayerGroup, players } from '../../chess/util/typeutil.js';
import usernamecontainer from '../../util/usernamecontainer.js';
import metadata from '../../chess/util/metadata.js';



// Variables

const element_gameInfoBar = document.getElementById('game-info-bar')!;

const element_whosturn = document.getElementById('whosturn')!;
const element_playerWhiteContainer = document.querySelector('.player-container.left')!;
const element_playerBlackContainer = document.querySelector('.player-container.right')!;
const element_playerWhite = document.getElementById('playerwhite')!;
const element_playerBlack = document.getElementById('playerblack')!;
const element_practiceButtons = document.querySelector('.practice-engine-buttons')!;
const element_undoButton: HTMLButtonElement = document.getElementById('undobutton')! as HTMLButtonElement;
const element_restartButton: HTMLButtonElement = document.getElementById('restartbutton')! as HTMLButtonElement;

let isOpen = false;
/** Whether to show the practice mode game control buttons - undo move and restart. */
let showButtons = false;

// Username container objects and their respective display options:
let usernamecontainer_white: UsernameContainer | undefined;
let usernamecontainer_black: UsernameContainer | undefined;

// Functions

/**
 * 
 * @param metadata - The metadata of the gamefile, with its respective White and Black player names
 * @param {boolean} showGameControlButtons
 */
function open(metadata: MetaData, showGameControlButtons?: boolean) {
	// console.log("Opening game info bar");

	if (showGameControlButtons) showButtons = showGameControlButtons;
	else showButtons = false;

	// Generate username containers
	embedUsernameContainers(metadata);

	updateWhosTurn();
	element_gameInfoBar.classList.remove('hidden');

	if (showButtons) {
		element_practiceButtons.classList.remove('hidden');
		initListeners_Gamecontrol();
	} else element_practiceButtons.classList.add('hidden');

	isOpen = true;
}

function embedUsernameContainers(gameMetadata: MetaData) {
	// console.log("Embedding username containers");

	const { white, black, white_type, black_type } = getPlayerNamesForGame(gameMetadata);
	const playerRatings: PlayerGroup<Rating> | undefined = gameloader.getPlayerRatings();

	// Set white username container
	const username_item_white: UsernameItem = { value: white, openInNewWindow: true };
	const change_white = gameMetadata.WhiteRatingDiff ? Number(gameMetadata.WhiteRatingDiff) : undefined;
	const rating_item_white: RatingItem | undefined = white_type === 'player' && playerRatings?.[players.WHITE] ? {
		value: playerRatings[players.WHITE]!.value + (change_white ?? 0),
		confident: playerRatings[players.WHITE]!.confident,
		change: change_white,
	} : undefined;
	usernamecontainer_white = usernamecontainer.createUsernameContainer(white_type, username_item_white, rating_item_white);
	usernamecontainer.embedUsernameContainerDisplayIntoParent(usernamecontainer_white.element, element_playerWhite);

	// Set black username container
	const username_item_black: UsernameItem = { value: black, openInNewWindow: true };
	const change_black = gameMetadata.BlackRatingDiff ? Number(gameMetadata.BlackRatingDiff) : undefined;
	const rating_item_black: RatingItem | undefined = black_type === 'player' && playerRatings?.[players.BLACK] ? {
		value: playerRatings[players.BLACK]!.value + (change_black ?? 0),
		confident: playerRatings[players.BLACK]!.confident,
		change: change_black
	} : undefined;
	usernamecontainer_black = usernamecontainer.createUsernameContainer(black_type, username_item_black, rating_item_black);
	usernamecontainer.embedUsernameContainerDisplayIntoParent(usernamecontainer_black.element, element_playerBlack);

	// Need to set a timer to allow the document to repaint, because we need to read the updated element widths.
	setTimeout(updateAlignmentUsernames, 0);
}

/**
 * Hides the game info bar.
 * Does NOT clear/erase the username containers.
 */
function close() {
	// console.log("Closing game info bar");

	// Restore the whosturn marker to original content
	element_whosturn.textContent = '';
	
	// Hide the whole bar
	element_gameInfoBar.classList.add('hidden');
	
	// Close button listeners
	closeListeners_Gamecontrol();
	element_practiceButtons.classList.add('hidden');

	isOpen = false;
}

/** Erases the username containers, removing them from the document. */
function clearUsernameContainers() {
	console.log("Clearing username containers");

	// Stop any running number animations
	usernamecontainer_white!.animationCancels.forEach(fn => fn());
	usernamecontainer_black!.animationCancels.forEach(fn => fn());

	usernamecontainer_white!.element.remove();
	usernamecontainer_black!.element.remove();
	usernamecontainer_white = undefined;
	usernamecontainer_black = undefined;
}

function initListeners_Gamecontrol() {
	element_undoButton.addEventListener('click', undoMove);
	element_restartButton.addEventListener('click', restartGame);
	// For some reason we need this in order to stop the undo button from getting focused when clicked??
	element_undoButton.addEventListener('mousedown', preventFocus);
}

function closeListeners_Gamecontrol() {
	element_undoButton.removeEventListener('click', undoMove);
	element_restartButton.removeEventListener('click', restartGame);
	element_undoButton.removeEventListener('mousedown', preventFocus);
}

function undoMove() {
	const event = new Event("guigameinfo-undoMove");
	document.dispatchEvent(event);
}

function restartGame() {
	const event = new Event("guigameinfo-restart");
	document.dispatchEvent(event);
}

/**
 * Disables / Enables the "Undo Move" button
 */
function update_GameControlButtons(undoingIsLegal: boolean) {
	if (undoingIsLegal) {
		element_undoButton.classList.remove('opacity-0_5');
		element_undoButton.style.cursor = "pointer";
		element_undoButton.disabled = false;
	}
	else {
		element_undoButton.classList.add('opacity-0_5');
		element_undoButton.style.cursor = "not-allowed";
		element_undoButton.disabled = true; // Disables the 'click' event from firing when it is pressed
	}
}

function preventFocus(event: Event) {
	event.preventDefault();
}

/** Reveales the player names. Typically called after the draw offer UI is closed */
function revealPlayerNames() {
	element_playerWhiteContainer.classList.remove('hidden');
	element_playerBlackContainer.classList.remove('hidden');
}

/** Hides the player names. Typically to make room for the draw offer UI */
function hidePlayerNames() {
	element_playerWhiteContainer.classList.add('hidden');
	element_playerBlackContainer.classList.add('hidden');
}

function toggle() {
	if (isOpen) close();
	else open(gameslot.getGamefile()!.basegame.metadata, showButtons);
	// Flag next frame to be rendered, since the arrows indicators may change locations with the bars toggled.
	frametracker.onVisualChange();
}

/**
 * Given a metadata object, determines the names of the players to be displayed, as well as the type of player,
 * which determines the svg of the username container, and whether it should hyperlink or not.
 */
function getPlayerNamesForGame(metadata: MetaData): { white: string, black: string, white_type: 'player' | 'guest' | 'engine', black_type: 'player' | 'guest' | 'engine' } {
	if (gameloader.getTypeOfGameWeIn() === 'local') {
		const white = metadata['White'] ?? translations['player_name_white_generic'];
		const black = metadata['Black'] ?? translations['player_name_black_generic'];
		return {
			white: white,
			black: black,
			white_type: metadata['White'] && metadata['WhiteID'] ? 'player' : (white === translations['engine_indicator'] ? 'engine' : 'guest'),
			black_type: metadata['Black'] && metadata['BlackID'] ? 'player' : (black === translations['engine_indicator'] ? 'engine' : 'guest'),
		};
	} else if (onlinegame.areInOnlineGame()) {	
		if (metadata.White === undefined || metadata.Black === undefined) throw Error('White or Black metadata not defined when getting player names for online game.');
		// If you are a guest, then we want your name to be "(You)" instead of "(Guest)"
		const white = onlinegame.areWeColorInOnlineGame(players.WHITE) && metadata['White'] === translations['guest_indicator'] ? translations['you_indicator'] : metadata['White'];
		const black = onlinegame.areWeColorInOnlineGame(players.BLACK) && metadata['Black'] === translations['guest_indicator'] ? translations['you_indicator'] : metadata['Black'];
		return {
			white: white,
			black: black,
			white_type: metadata['WhiteID'] ? 'player' : 'guest',
			black_type: metadata['BlackID'] ? 'player' : 'guest',
		};
	} else if (enginegame.areInEngineGame()) {
		return {
			white: metadata.White!,
			black: metadata.Black!,
			white_type: metadata.White === translations['you_indicator'] ? 'guest' : 'engine',
			black_type: metadata.Black === translations['you_indicator'] ? 'guest' : 'engine',
		};
	} else throw Error('Cannot get player names for game when not in a local, online, or engine game.');
}

/**
 * Updates the text at the bottom of the screen displaying who's turn it is now.
 * Call this after flipping the gamefile's `whosTurn` property.
 */
function updateWhosTurn() {
	const { basegame } = gameslot.getGamefile()!;

	// In the scenario we forward the game to front after the game has adjudicated,
	// don't modify the game over text saying who won!
	if (gamefileutility.isGameOver(basegame)) return gameEnd(basegame.gameConclusion);

	const color = basegame.whosTurn;

	if (color !== players.WHITE && color !== players.BLACK) throw Error(`Cannot set the document element text showing whos turn it is when color is neither white nor black! ${color}`);

	let textContent = "";
	if (!gameloader.areInLocalGame()) {
		const ourTurn = gameloader.isItOurTurn();
		textContent = ourTurn ? translations['your_move'] : translations['their_move'];
	} else textContent = color === players.WHITE ? translations['white_to_move'] : translations['black_to_move'];

	element_whosturn.textContent = textContent;
}

/** Updates the whosTurn text to say who won! */
function gameEnd(conclusion?: string) {
	// '1 checkmate' / '2 resignation' / '0 stalemate'  time/resignation/stalemate/repetition/checkmate/disconnect/agreement
	if (conclusion === undefined) throw Error("Should not call gameEnd when game isn't over.");

	const { victor, condition } = winconutil.getVictorAndConditionFromGameConclusion(conclusion);
	const resultTranslations = translations['results'];

	const { basegame } = gameslot.getGamefile()!;

	if (onlinegame.areInOnlineGame() && onlinegame.doWeHaveRole()) {

		if (victor !== undefined && onlinegame.areInOnlineGame() && onlinegame.getOurColor() === victor) element_whosturn.textContent = condition === 'checkmate' ? resultTranslations.you_checkmate
                                                                            : condition === 'time' ? resultTranslations.you_time
                                                                            : condition === 'resignation' ? resultTranslations.you_resignation
                                                                            : condition === 'disconnect' ? resultTranslations.you_disconnect
                                                                            : condition === 'royalcapture' ? resultTranslations.you_royalcapture
                                                                            : condition === 'allroyalscaptured' ? resultTranslations.you_allroyalscaptured
                                                                            : condition === 'allpiecescaptured' ? resultTranslations.you_allpiecescaptured
                                                                            : condition === 'koth' ? resultTranslations.you_koth
                                                                            : resultTranslations.you_generic;
		else if (victor === players.NEUTRAL) element_whosturn.textContent = condition === 'stalemate' ? resultTranslations.draw_stalemate
                                                                    : condition === 'repetition' ? resultTranslations.draw_repetition
                                                                    : condition === 'moverule' ? `${resultTranslations.draw_moverule[0]}${(basegame.gameRules.moveRule! / 2)}${resultTranslations.draw_moverule[1]}`
                                                                    : condition === 'insuffmat' ? resultTranslations.draw_insuffmat
                                                                    : condition === 'agreement' ? resultTranslations.draw_agreement
                                                                    : resultTranslations.draw_generic;
		else if (condition === 'aborted') element_whosturn.textContent = resultTranslations.aborted;
		else /* loss */ element_whosturn.textContent = condition === 'checkmate' ? resultTranslations.opponent_checkmate
                                                            : condition === 'time' ? resultTranslations.opponent_time
                                                            : condition === 'resignation' ? resultTranslations.opponent_resignation
                                                            : condition === 'disconnect' ? resultTranslations.opponent_disconnect
                                                            : condition === 'royalcapture' ? resultTranslations.opponent_royalcapture
                                                            : condition === 'allroyalscaptured' ? resultTranslations.opponent_allroyalscaptured
                                                            : condition === 'allpiecescaptured' ? resultTranslations.opponent_allpiecescaptured
                                                            : condition === 'koth' ? resultTranslations.opponent_koth
                                                            : resultTranslations.opponent_generic;
	} else { // Local game, OR spectating an online game
		if (condition === 'checkmate') element_whosturn.textContent = victor === players.WHITE ? resultTranslations.white_checkmate
                                                                    : victor === players.BLACK ? resultTranslations.black_checkmate
                                                                    : `${resultTranslations.bug_generic} Ending: checkmate`;
		else if (condition === 'time') element_whosturn.textContent = victor === players.WHITE ? resultTranslations.white_time
                                                                    : victor === players.BLACK ? resultTranslations.black_time
                                                                    : `${resultTranslations.bug_generic} Ending: time`;
		else if (condition === 'resignation') element_whosturn.textContent = victor === players.WHITE ? resultTranslations.white_resignation
																		   : victor === players.BLACK ? resultTranslations.black_resignation
																		   : `${resultTranslations.bug_generic} Ending: resignation`;
		else if (condition === 'disconnect') element_whosturn.textContent = victor === players.WHITE ? resultTranslations.white_disconnect
																			: victor === players.BLACK ? resultTranslations.black_disconnect
																			: `${resultTranslations.bug_generic} Ending: disconnect`;
		else if (condition === 'royalcapture') element_whosturn.textContent = victor === players.WHITE ? resultTranslations.white_royalcapture
                                                                            : victor === players.BLACK ? resultTranslations.black_royalcapture
                                                                            : `${resultTranslations.bug_generic} Ending: royalcapture`;
		else if (condition === 'allroyalscaptured') element_whosturn.textContent = victor === players.WHITE ? resultTranslations.white_allroyalscaptured
                                                                                : victor === players.BLACK ? resultTranslations.black_allroyalscaptured
                                                                                : `${resultTranslations.bug_generic} Ending: allroyalscaptured`;
		else if (condition === 'allpiecescaptured') element_whosturn.textContent = victor === players.WHITE ? resultTranslations.white_allpiecescaptured
                                                                                : victor === players.BLACK ? resultTranslations.black_allpiecescaptured
                                                                                : `${resultTranslations.bug_generic} Ending: allpiecescaptured`;
		else if (condition === 'koth') element_whosturn.textContent = victor === players.WHITE ? resultTranslations.white_koth
                                                                    : victor === players.BLACK ? resultTranslations.black_koth
                                                                    : `${resultTranslations.bug_generic} Ending: koth`;
		else if (condition === 'stalemate') element_whosturn.textContent = resultTranslations.draw_stalemate;
		else if (condition === 'repetition') element_whosturn.textContent = resultTranslations.draw_repetition;
		else if (condition === 'moverule') element_whosturn.textContent = `${resultTranslations.draw_moverule[0]}${(basegame.gameRules.moveRule! / 2)}${resultTranslations.draw_moverule[1]}`;
		else if (condition === 'insuffmat') element_whosturn.textContent = resultTranslations.draw_insuffmat;
		else if (condition === 'agreement') element_whosturn.textContent = resultTranslations.draw_agreement;
		else if (condition === 'aborted') element_whosturn.textContent = resultTranslations.aborted;
		else {
			element_whosturn.textContent = resultTranslations.bug_generic;
			console.error(`Game conclusion: "${conclusion}"\nVictor: ${victor}\nCondition: ${condition}`);
		}
	}
}

/** Returns the height of the game info bar in the document, in virtual pixels. */
function getHeightOfGameInfoBar(): number {
	return element_gameInfoBar.getBoundingClientRect().height;
}

/**
 * Wide screen => Right-aligns black's username container
 * Narrow screen => Left-aligns black's username container and adds a fade effect on the right overflow
 * Fades either if they exceed the width of their parent.
 */
function updateAlignmentUsernames() {
	if (!usernamecontainer_white || !usernamecontainer_black) return; // Not in a game

	// Player white
	if (usernamecontainer_white!.element.clientWidth > element_playerWhite.clientWidth) {
		element_playerWhite.classList.add('fade-element');
	} else {
		element_playerWhite.classList.remove('fade-element');
	}

	// Player black
	if (usernamecontainer_black!.element.clientWidth > element_playerBlack.clientWidth) {
		element_playerBlack.classList.remove('justify-content-right');
		element_playerBlack.classList.add('justify-content-left');
		element_playerBlack.classList.add('fade-element');
	} else {
		element_playerBlack.classList.add('justify-content-right');
		element_playerBlack.classList.remove('justify-content-left');
		element_playerBlack.classList.remove('fade-element');
	}
}

/**
 * This gets called when the client receives a "gameratingchange" message from a websocket
 * Displays the rating changes from the game in the existing username containers, while keeping all display options the same
 */
function addRatingChangeToExistingUsernameContainers(ratingChanges: PlayerGroup<PlayerRatingChangeInfo>) {
	// Add the WhiteRatingDiff and BlackRatingDiff metadata to the gamefile
	const { basegame } = gameslot.getGamefile()!;
	basegame.metadata.WhiteRatingDiff = metadata.getWhiteBlackRatingDiff(ratingChanges[players.WHITE]!.change);
	basegame.metadata.BlackRatingDiff = metadata.getWhiteBlackRatingDiff(ratingChanges[players.BLACK]!.change);

	// Update username containers
	usernamecontainer.createEloChangeItem(usernamecontainer_white!, ratingChanges[players.WHITE]!.newRating, ratingChanges[players.WHITE]!.change);
	usernamecontainer.createEloChangeItem(usernamecontainer_black!, ratingChanges[players.BLACK]!.newRating, ratingChanges[players.BLACK]!.change);

	// Need to set a timer to allow the document to repaint, because we need to read the updated element widths.
	setTimeout(updateAlignmentUsernames, 0);
}

export default {
	open,
	close,
	clearUsernameContainers,
	update_GameControlButtons,
	revealPlayerNames,
	hidePlayerNames,
	toggle,
	updateWhosTurn,
	gameEnd,
	getHeightOfGameInfoBar,
	updateAlignmentUsernames,
	addRatingChangeToExistingUsernameContainers
};