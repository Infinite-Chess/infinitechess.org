// src/client/scripts/esm/views/checkmatepractice/checkmatepractice.ts

/**
 * This script handles checkmate practice logic
 */

import type { Player } from '../../../../../shared/util/typeutil.js';
import type { GameConclusion } from '../../../../../shared/chess/util/typeschemas.js';
import type { VariantOptions } from '../../../../../shared/chess/logic/gamefile.js';
import type { EngineAndConfig } from '../../../../../shared/chess/util/engine.js';
import type { Coords, CoordsKey } from '../../../../../shared/util/coordutil.js';

import bimath from '../../../../../shared/util/math/bimath.js';
import typeutil from '../../../../../shared/util/typeutil.js';
import coordutil from '../../../../../shared/util/coordutil.js';
import icnposition from '../../../../../shared/chess/logic/icn/icnposition.js';
import variantrules from '../../../../../shared/chess/logic/variantrules.js';
import gamefileutility from '../../../../../shared/chess/logic/gamefileutility.js';
import validcheckmates from '../../../../../shared/chess/util/validcheckmates.js';
import { ENGINE_DICTIONARY } from '../../../../../shared/chess/util/engine.js';
import { players as p, ext as e, rawTypes as r } from '../../../../../shared/util/typeutil.js';

import toast from '../../components/toast.js';
import docutil from '../../util/docutil.js';
import gameslot from '../../game/chess/gameslot.js';
import selection from '../../game/chess/selection.js';
import enginegame from '../../game/misc/enginegame.js';
import gamesession from '../../game/chess/gamesession.js';
import guipractice from './gui/guipractice.js';
import { GameBus } from '../../board/GameBus.js';
import LocalStorage from '../../util/LocalStorage.js';
import movesequence from '../../game/chess/movesequence.js';
import validatorama from '../../util/validatorama.js';
import { retryFetch, RetryFetchOptions } from '../../util/fetchretrier.js';

// Variables -------------------------------------------------------------------

/** These checkmates we may place the black king nearer to the white pieces. */
const checkmatesWithBlackRoyalNearer = [
	'1K1Q1N-1k',
	'1Q1R1N-1k',
	'1Q2N-1k',
	'1Q1N1B-1k',
	'1K1N2B1B-1k',
	'1K2N1B1B-1k',
	'1K1R1N1B-1k',
	'1K1AR1R-1k',
	'1K1CH1N-1k',
	'1K1R2N-1k',
	'2K1R-1k',
	'1K2N6B-1k',
	'1K2HA1B-1k',
	'1K3HA-1k',
];

const nameOfCompletedCheckmatesInStorage: string = 'checkmatePracticeCompletion';
/**
 * A list of checkmate strings we have beaten
 * [ "2Q-1k", "3R-1k", "2CH-1k"]
 *
 * This will be initialized when guipractice calls {@link updateCompletedCheckmates} for the first time!
 * If we initialize it right here, we crash in production, because LocalStorage is not defined yet.
 * @type {string[]}
 */
let completedCheckmates: string[];
const expiryOfCompletedCheckmatesMs: number = 1000 * 60 * 60 * 24 * 365; // 1 year

/** Whether we are in a checkmate practice engine game. */
let inCheckmatePractice: boolean = false;

/** Whether the player is allowed to undo a move in the current position. */
let undoingIsLegal: boolean = false;

GameBus.addEventListener('user-move-played', registerHumanMove);
GameBus.addEventListener('engine-move-played', registerEngineMove);
GameBus.addEventListener('game-concluded', onEngineGameConclude);

// Functions -------------------------------------------------------------------

function setUndoingIsLegal(value: boolean): void {
	undoingIsLegal = value;
	// TODO: reflect undo/restart button state in the new game page's side bar.
}

/**
 * Starts a checkmate practice game
 */
function startCheckmatePractice(checkmateSelectedID: string): void {
	console.log('Loading practice checkmate game.');
	inCheckmatePractice = true;
	setUndoingIsLegal(false);
	initListeners();

	const position = generateCheckmateStartingPosition(checkmateSelectedID);
	const specialRights = new Set<CoordsKey>();
	const variantOptions: VariantOptions = {
		fullMove: 1,
		position,
		state_global: { specialRights },
		gameRules: variantrules.getBareMinimumGameRules(),
	};
	const engine = {
		name: 'engineCheckmatePractice',
		config: {
			checkmateSelectedID,
			engineTimeLimitPerMoveMillis:
				ENGINE_DICTIONARY.engineCheckmatePractice.defaultTimeLimitPerMoveMillis,
		},
	} satisfies EngineAndConfig;

	const options = {
		event: 'Infinite chess checkmate practice',
		timeControl: '-' as const,
		variant: undefined,
		youAreColor: p.WHITE,
		engine,
		variantOptions,
		showGameControlButtons: true as true,
	};

	startEngineGame(options);
}

/**
 * TRIPWIRE — these games currently run on an unbounded board. Every other engine game is played
 * inside a world border, resolved where its gamerules are (`apeironcard.worldBorderForBox` for an
 * explicit position, `worldBorderForVariant` for a preset). Whoever redesigns this page must give
 * its positions one too, or the engine is handed the very board it is promised never to get.
 *
 * The border distance this engine used to declare, kept for whoever gives it one again:
 *   // worldBorderDist: BigInt(Number.MAX_SAFE_INTEGER) // FREEZES the engine if you move to the border
 *   worldBorderDist: BigInt(1e15) // 1 Quadrillion (~11% the distance of Number.MAX_SAFE_INTEGER)
 */
function startEngineGame(options: {
	timeControl: '-';
	variantOptions: VariantOptions;
	youAreColor: Player;
	engine: EngineAndConfig;
}): void {
	gamesession.setSessionGame({ type: 'online', role: options.youAreColor });
	gamesession.loadGame(
		{
			timeControl: options.timeControl,
			variant: undefined,
			dateTimestamp: Date.now(),
			viewWhitePerspective: options.youAreColor === p.WHITE,
			additional: {
				variantOptions: options.variantOptions,
			},
		},
		{
			onLogicalLoaded: () =>
				enginegame.initEngineGame({
					...options,
					workerUrl: window.checkmatePracticePageData.workerUrl,
					engineUrl: window.checkmatePracticePageData.engineUrl,
				}),
			concludeIfOver: true,
		},
	);
}

/** Re-registering the same handler refs on a restart is a no-op, so these are never removed. */
function initListeners(): void {
	document.addEventListener('guigameinfo-undoMove', undoMove);
	document.addEventListener('guigameinfo-restart', restartGame);
}

/**
 * This method generates a random starting position object for a given checkmate practice ID
 * @param checkmateID - a string containing the ID of the selected checkmate practice problem
 * @returns a starting position object corresponding to that ID
 */
function generateCheckmateStartingPosition(checkmateID: string): Map<CoordsKey, number> {
	// error if user somehow submitted invalid checkmate ID
	if (!Object.values(validcheckmates.VALID_CHECKMATES).flat().includes(checkmateID))
		throw Error('User tried to play invalid checkmate practice.');

	// place the black king not so far away for specific variants
	const blackroyalnearer: boolean = checkmatesWithBlackRoyalNearer.includes(checkmateID);

	const position = new Map<CoordsKey, number>(); // the position to be generated
	let blackpieceplaced: boolean = false; // monitors if a black piece has already been placed
	let whitebishopparity: number = Math.floor(Math.random() * 2); // square color of first white bishop batch

	// read the elementID and convert it to a position
	const piecelist: RegExpMatchArray | null = checkmateID.match(/[0-9]+[a-zA-Z]+/g);
	if (!piecelist) return position;

	for (const entry of piecelist) {
		let amount: number = parseInt(entry.match(/[0-9]+/)![0]); // number of pieces to be placed
		const strpiece: string = entry.match(/[a-zA-Z]+/)![0]; // piecetype to be placed
		const piece: number = icnposition.getTypeFromAbbr(strpiece);

		// place amount many pieces of type piece
		while (amount !== 0) {
			if (typeutil.getColorFromType(piece) === p.WHITE) {
				if (blackpieceplaced)
					throw Error('Must place all white pieces before placing black pieces.');

				// randomly generate white piece coordinates in square around origin
				const x: bigint =
					BigInt(Math.floor(Math.random() * (blackroyalnearer ? 7 : 11))) -
					(blackroyalnearer ? 3n : 5n);
				const y: bigint =
					BigInt(Math.floor(Math.random() * (blackroyalnearer ? 7 : 11))) -
					(blackroyalnearer ? 3n : 5n);
				const key: CoordsKey = coordutil.getKeyFromCoords([x, y]);

				// check if square is occupied and white bishop parity is fulfilled
				if (
					!position.has(key) &&
					!(piece === r.BISHOP + e.W && Number((x + y) % 2n) !== whitebishopparity)
				) {
					position.set(key, piece);
					amount -= 1;
				}
			} else {
				// randomly generate black piece coordinates at a distance
				const x: bigint =
					BigInt(Math.floor(Math.random() * 3)) + (blackroyalnearer ? 8n : 12n);
				const y: bigint =
					BigInt(Math.floor(Math.random() * (blackroyalnearer ? 17 : 35))) -
					(blackroyalnearer ? 9n : 17n);
				const key: CoordsKey = coordutil.getKeyFromCoords([x, y]);
				// check if square is occupied or potentially threatened
				if (!position.has(key) && squareNotInSight(key, position)) {
					position.set(key, piece);
					amount -= 1;
					blackpieceplaced = true;
				}
			}
		}

		// flip white bishop parity
		whitebishopparity = 1 - whitebishopparity;
	}

	return position;
}

/**
 * This method checks that the input square is not on the same row, column or diagonal as any key in the position Map
 * It also checks that it is not attacked by a knightrider
 * @param square - square of black piece
 * @param position - position Map containing all white pieces
 * @returns true or false, depending on if the square is in sight or not
 */
function squareNotInSight(square: CoordsKey, position: Map<CoordsKey, number>): boolean {
	const [sx, sy]: Coords = coordutil.getCoordsFromKey(square);
	for (const [key, value] of position) {
		const [x, y]: Coords = coordutil.getCoordsFromKey(key);
		if (x === sx || y === sy || bimath.abs(sx - x) === bimath.abs(sy - y)) return false;
		if (value === r.KNIGHTRIDER + e.W) {
			if (
				bimath.abs(sx - x) === 2n * bimath.abs(sy - y) ||
				2n * bimath.abs(sx - x) === bimath.abs(sy - y)
			) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Only for dev testing
 * Erases checkmate practice progress in local storage
 * Call {@link checkmatepractice.eraseCheckmatePracticeProgressFromLocalStorage} in developer tools to use this
 */
function eraseCheckmatePracticeProgressFromLocalStorage(): void {
	LocalStorage.deleteItem(nameOfCompletedCheckmatesInStorage);
	console.log('DELETED all checkmate practice progress.');
	if (!completedCheckmates) return; // Haven't open the checkmate practice menu yet, so it's not defined.
	completedCheckmates.length = 0;
	guipractice.updateCheckmatesBeaten(completedCheckmates); // Delete the 'beaten' class from all
}

/**
 * Updates completedCheckmates list and redraws the GUI by calling guipractice.updateCheckmatesBeaten()
 */
function updateCompletedCheckmates(): void {
	// Update completedCheckmates according to checkmates_beaten cookie, if it exists, and if we are logged in
	const cookieCheckmates: string | undefined = docutil.getCookieValue('checkmates_beaten');
	if (validatorama.areWeLoggedIn() && cookieCheckmates !== undefined) {
		// console.log("checkmates_beaten cookie was present!");
		completedCheckmates = decodeURIComponent(cookieCheckmates).match(/[^,]+/g) || []; // match() returns null if no matches
	} else {
		// Else, use LocalStorage as a fallback
		completedCheckmates = LocalStorage.loadItem(nameOfCompletedCheckmatesInStorage) || [];
	}
	guipractice.updateCheckmatesBeaten(completedCheckmates);
}

/**
 * Updates the completedCheckmates variable with the beaten checkmatePracticeID,
 * and sends a message to the server if the player is logged in
 */
async function markCheckmateBeaten(checkmatePracticeID: string): Promise<void> {
	if (!completedCheckmates)
		throw Error('Cannot mark checkmate beaten when it was never initialized!');
	if (!Object.values(validcheckmates.VALID_CHECKMATES).flat().includes(checkmatePracticeID))
		throw Error('User completed invalid checkmate practice.');

	// Add the checkmate ID to the beaten list
	if (!completedCheckmates.includes(checkmatePracticeID))
		completedCheckmates.push(checkmatePracticeID);
	console.log('Marked checkmate practice as completed!');

	// Update LocalStorage and exit, if we are not logged in
	if (!validatorama.areWeLoggedIn()) {
		LocalStorage.saveItem(
			nameOfCompletedCheckmatesInStorage,
			completedCheckmates,
			expiryOfCompletedCheckmatesMs,
		);
		return;
	}

	// We ARE logged in. Send a PUT request to tell the server we have beaten a new checkmate!

	// Configure the PUT request
	const fetchInit: RequestInit = {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ new_checkmate_beaten: checkmatePracticeID }),
	};
	const retryOptions: RetryFetchOptions = {
		// With these settings, the fifth attempt occurs 1m 15s after the first.
		maxAttempts: 5,
		initialDelayMs: 5000,
		backoffFactor: 2,
	};

	try {
		// Use retryFetch wrapper to try the same PUT multiple times
		// until it succeeds. This is just in case of a server error,
		// or a server restart at the exact same time, thus making
		// them have to solve the same checkmate again.
		const response: Response = await retryFetch(
			'/api/checkmates-progress',
			fetchInit,
			retryOptions,
		);

		if (response.ok) {
			console.log('Server recorded checkmate completion successfully.');
			// Do this now, since the server will have updated the cookie containing the completed checkmates
			guipractice.updateCheckmatesBeaten(completedCheckmates);
		} else {
			// Handle unsuccessful response
			// This means retries were exhausted on a 500, or it was a non-retryable response (e.g., 400, 401)
			// that the retryFetch logic didn't retry.
			const errorData = await response.json();
			console.error(`Failed to update checkmate list on the server (final status ${response.status}) after all attempts:`, errorData.message || errorData); // prettier-ignore
		}
	} catch (error) {
		// This catch block handles cases where retries were exhausted on network errors.
		console.error('Error sending checkmate list to the server after all attempts (network/unhandled error):', error); // prettier-ignore
	}
}

/** Called when an engine game ends */
function onEngineGameConclude(): void {
	// Were we doing checkmate practice
	if (!inCheckmatePractice) return; // Not in checkmate practice

	const gameConclusion: GameConclusion | undefined = gameslot.getGamefile()!.gameConclusion;
	if (gameConclusion === undefined)
		throw Error('Game conclusion is undefined, should not have called onEngineGameConclude()');

	// Did we win or lose?
	if (gameConclusion.victor === undefined)
		throw Error('Victor should never be undefined when concluding an engine game.');
	if (!(gamesession.getRole() === gameConclusion.victor)) return; // Lost

	// WON!!! 🎉

	// Add the checkmate to the list of completed!
	const checkmatePracticeID: string = guipractice.getCheckmateSelectedID();
	markCheckmateBeaten(checkmatePracticeID);
}

/**
 * This function gets called by enginegame.ts whenever a human player submitted a move
 */
function registerHumanMove(): void {
	if (!inCheckmatePractice) return; // The engine game is not a checkmate practice game

	const gamefile = gameslot.getGamefile()!;
	if (!undoingIsLegal && gamefileutility.isGameOver(gamefile) && gamefile.moves.length > 0) {
		// allow player to undo move if it ended the game
		setUndoingIsLegal(true);
	} else if (undoingIsLegal && !gamefileutility.isGameOver(gamefile)) {
		// don't allow player to undo move while engine thinks
		setUndoingIsLegal(false);
	}
}

/**
 * This function gets called by enginegame.ts whenever an engine player submitted a move
 */
function registerEngineMove(): void {
	if (!inCheckmatePractice) return; // The engine game is not a checkmate practice game

	const gamefile = gameslot.getGamefile()!;
	if (!undoingIsLegal && gamefile.moves.length > 1) {
		// allow player to undo move after engine has moved
		setUndoingIsLegal(true);
	}
}

function undoMove(): void {
	if (!inCheckmatePractice)
		return console.error('Undoing moves is currently not allowed for non-practice mode games');
	const gamefile = gameslot.getGamefile()!;
	const mesh = gameslot.getMesh()!;
	if (
		undoingIsLegal &&
		(gamesession.isItOurTurn() || gamefileutility.isGameOver(gamefile)) &&
		gamefile.moves.length > 0
	) {
		// > 0 catches scenarios where stalemate occurs on the first move
		setUndoingIsLegal(false);

		// go to latest move before undoing moves
		movesequence.viewFront(gamefile, mesh, false);

		// If it's their turn, only rewind one move.
		if (gamesession.isItOurTurn() && gamefile.moves.length > 1)
			movesequence.rewindMove(gamefile, mesh);
		movesequence.rewindMove(gamefile, mesh);
		selection.reselectPiece();
	}
}

function restartGame(): void {
	if (!inCheckmatePractice)
		return console.error('Restarting games is currently not supported for non-practice mode games'); // prettier-ignore
	// Don't stomp an in-flight load — unloading its gamefile would crash its graphical half.
	if (gamesession.isLoading()) return toast.showPleaseWaitForTask();

	startCheckmatePractice(guipractice.getCheckmateSelectedID());
}

// Exports ---------------------------------------------------------------------

export default {
	startCheckmatePractice,
	updateCompletedCheckmates,
	eraseCheckmatePracticeProgressFromLocalStorage,
};
