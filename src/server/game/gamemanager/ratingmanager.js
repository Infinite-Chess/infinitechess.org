import {changeElo, getElo} from "../../controllers/members.js";

/**
 * Type Definitions
 * @typedef {import('../TypeDefinitions.js').Socket} Socket
 * @typedef {import('../TypeDefinitions.js').Game} Game
 */

/**
 * Get the expected score for a game
 * @param {number} Ra
 * @param {number} Rb
 * @returns {number} The expected score
 */
function getExpectedScore(Ra, Rb) {
	return 1 / (1 + Math.pow(10, (Ra - Rb) / 400));
}

/**
 * Update a players ratings given a completed game.
 * @param {Game} game
 */
function updateRatings(game) {
	let outcome = 0.5;
	const K = 32;

	if (game.gameConclusion.startsWith("draw")) outcome = 0.5;
	if (game.gameConclusion.startsWith("white")) outcome = 1;
	if (game.gameConclusion.startsWith("black")) outcome = 0;

	const Pb = getExpectedScore(getElo(game.white.member),getElo(game.black.member));
	const Pa = getExpectedScore(getElo(game.black.member),getElo(game.white.member));
	changeElo(game.white.member, K * (outcome - Pa));
	changeElo(game.black.member, K * ((1 - outcome) - Pb));
}

export default updateRatings;