/**
 * Implementation of Glicko-1 algorithm for calculating rating changes arising from ranked games
 */

import timeutil from '../../../client/scripts/esm/util/timeutil.js';
import { PlayerGroup, type Player } from '../../../client/scripts/esm/chess/util/typeutil.js';

// Default variables, shared across all leaderboards ------------------------------------------------------------------


/** Default elo for a player not contained in a leaderboard. We use the same default across the leaderboards, to avoid confusion. */
const DEFAULT_LEADERBOARD_ELO = 1500.0;

/** Default rating deviation, used for Glicko-1 */
const DEFAULT_LEADERBOARD_RD = 350.0;

/**
 * Minimum rating deviation, used for Glicko-1
 * 
 * 50 => ~+-8 elo change per game played.
 * 50 DV can be reach by playing 7-8 games per day.
 * 
 * See: https://discord.com/channels/1114425729569017918/1260310049889189908/1373014556254670970
*/
const MIMIMUM_LEADERBOARD_RD = 50.0;

/** Rating deviations above this are considered to be too uncertain and the user is excluded from leaderboards */
const UNCERTAIN_LEADERBOARD_RD = 250.0;

/** Constant c, used for Glicko-1 */
const c = 70;

/** Constant q, used for Glicko-1 */
const q = 0.00575646273;

/** Duration of a glicko-1 rating period, in milliseconds */
const RATING_PERIOD_DURATION = 1000 * 60 * 60 * 24 * 15; // 15 days

/** Frequency of automatic RD update in database, in milliseconds */
const RD_UPDATE_FREQUENCY = 1000 * 60 * 60 * 24; // 24 hours
// const RD_UPDATE_FREQUENCY = 1000 * 30; // 30s for dev testing


// Types -------------------------------------------------------------------------------

/** Type containing all relevant rating calculation quantities for a specific player */
type PlayerRatingData = {
	elo_at_game: number;
	rating_deviation_at_game: number;
	rd_last_update_date: string | null; // A date in string format, as used in the database. Can be null if no games played yet
    elo_after_game?: number;
    rating_deviation_after_game?: number;
	elo_change_from_game?: number;
};

/** A dictionary type with Players as keys, containing PlayerRatingData for each player */
type RatingData = PlayerGroup<PlayerRatingData>;


// Functions -------------------------------------------------------------------------------


/**
 * Computes the effective rating deviation for the current rating period, as for Glicko-1 algorithm
 */
function getTrueRD(rating_deviation: number, rd_last_update_date: string | null) : number {
	if (rd_last_update_date === null) return rating_deviation;
	else {
		const last_rated_game_timestamp = timeutil.sqliteToTimestamp(rd_last_update_date);
		const current_timestamp = Date.now();

		// fraction of elapsed time over length of a standard rating period -> noninteger in general
		const rating_periods_elapsed = Math.max(0, (current_timestamp - last_rated_game_timestamp) / RATING_PERIOD_DURATION);

		return Math.max(MIMIMUM_LEADERBOARD_RD, Math.min(DEFAULT_LEADERBOARD_RD, Math.sqrt(rating_deviation ** 2 + rating_periods_elapsed * c ** 2)));
	}
}

/** Function g of Glicko-1 algorithm */
function g(RD: number) : number {
	return 1 / Math.sqrt( 1 + 3 * (q ** 2) * (RD ** 2) / (Math.PI ** 2) );
}

/** Function E of Glicko-1 algorithm: expected outcome of game */
function E(r: number, r_opp: number, RD_opp: number) : number {
	return 1 / ( 1 + 10 ** ( - g(RD_opp) * (r - r_opp) / 400 ) );
}

/** Function d^2 of Glicko-1 algorithm */
function d_squared(r: number, r_opp: number, RD_opp: number) : number {
	const Es = E(r, r_opp, RD_opp);
	return 1 / ( (q ** 2) * (g(RD_opp) ** 2) * Es * (1 - Es) );
}

/** Given a game outcome for a player, his rating r, his RD, and the opponent'S rating r_opp and RD_opp, compute his new rating with glicko-1 */
function new_rating(outcome: 0 | 0.5 | 1, r: number, RD: number, r_opp: number, RD_opp: number) {
	return r + ( q / ( 1 / RD ** 2 + 1 / d_squared(r, r_opp, RD_opp) ) ) * g(RD_opp) * (outcome - E(r, r_opp, RD_opp));
}

/** Given a player's rating r, his RD, and the opponent'S rating r_opp and RD_opp, compute his new rating with glicko-1 */
function new_RD(r: number, RD: number, r_opp: number, RD_opp: number) {
	return Math.max(MIMIMUM_LEADERBOARD_RD, Math.sqrt( 1 / ( 1 / RD ** 2 + 1 / d_squared(r, r_opp, RD_opp) ) ) );
}

/**
 * Takes ratingdata object as an input, with entries: elo_at_game, rating_deviation_at_game and rd_last_update_date.
 * Computes rating data changes and returns ratingdata object by overwriting entries: elo_after_game, rating_deviation_after_game and elo_change_from_game.
 */
function computeRatingDataChanges(ratingdata: RatingData, victor: Player) : RatingData {
	const playerCount = Object.keys(ratingdata).length;

	// Currently, only rating calculations for 2-player games with White vs Black are supported
	if (playerCount !== 2) return ratingdata;
	if (ratingdata[1] === undefined || ratingdata[2] === undefined) return ratingdata;

	const r1 = ratingdata[1].elo_at_game;
	const r2 = ratingdata[2].elo_at_game;
	const RD1 = getTrueRD(ratingdata[1].rating_deviation_at_game, ratingdata[1].rd_last_update_date);
	const RD2 = getTrueRD(ratingdata[2].rating_deviation_at_game, ratingdata[2].rd_last_update_date);
	const outcome_white = (victor === 1 ? 1 : (victor === 2 ? 0 : 0.5 ));
	const outcome_black = (victor === 1 ? 0 : (victor === 2 ? 1 : 0.5 ));

	ratingdata[1].elo_after_game = new_rating(outcome_white, r1, RD1, r2, RD2);
	ratingdata[1].rating_deviation_after_game = new_RD(r1, RD1, r2, RD2);
	ratingdata[1].elo_change_from_game = ratingdata[1].elo_after_game - r1;

	ratingdata[2].elo_after_game = new_rating(outcome_black, r2, RD2, r1, RD1);
	ratingdata[2].rating_deviation_after_game = new_RD(r2, RD2, r1, RD1);
	ratingdata[2].elo_change_from_game = ratingdata[2].elo_after_game - r2;

	return ratingdata;
}


// FOR TESTING ===================================================================


/**
 * DISCUSSION of testing:
 * https://discord.com/channels/1114425729569017918/1260310049889189908/1373014556254670970
 */


// import { players } from '../../../client/scripts/esm/chess/util/typeutil.js';


// type PlayerStats = {
// 	elo: number;
// 	rd: number;
// 	lastUpdateDate: string | null; // Date string in SQLite format
// }

// // --- Simulation State ---
// const player1CurrentStats: PlayerStats = {
// 	elo: DEFAULT_LEADERBOARD_ELO,
// 	rd: 50,
// 	lastUpdateDate: null, // Initially null, set to date string after first game
// };

// const player2CurrentStats: PlayerStats = {
// 	elo: DEFAULT_LEADERBOARD_ELO,
// 	rd: DEFAULT_LEADERBOARD_RD,
// 	lastUpdateDate: null,
// };

// let gameCounter = 0;
// const SIMULATION_GAME_INTERVAL_MS = 1000; // Simulate a game every 3 seconds



// // --- Simulation Function ---
// function runSingleGameSimulation() {
// 	gameCounter++;
// 	console.log(`\n--- Simulating Game #${gameCounter} ---`);

// 	// Prepare RatingData for the game about to be played
// 	const ratingDataForThisGame = {
// 		[players.WHITE]: {
// 			elo_at_game: player1CurrentStats.elo,
// 			rating_deviation_at_game: player1CurrentStats.rd,
// 			rd_last_update_date: player1CurrentStats.lastUpdateDate,
// 		},
// 		[players.BLACK]: {
// 			elo_at_game: player2CurrentStats.elo,
// 			rating_deviation_at_game: player2CurrentStats.rd,
// 			rd_last_update_date: player2CurrentStats.lastUpdateDate,
// 		},
// 	};

// 	console.log(`P1 (White) Current: ELO ${player1CurrentStats.elo.toFixed(2)}, RD ${player1CurrentStats.rd.toFixed(2)}, Last Update: ${player1CurrentStats.lastUpdateDate || 'Never'}`);
// 	console.log(`P2 (Black) Current: ELO ${player2CurrentStats.elo.toFixed(2)}, RD ${player2CurrentStats.rd.toFixed(2)}, Last Update: ${player2CurrentStats.lastUpdateDate || 'Never'}`);
    
// 	// RD values that will actually be used in calculation (after getTrueRD applies time decay)
// 	// Note: getTrueRD is called internally by computeRatingDataChanges. We can also call it here for display.
// 	const rd1ForCalc = getTrueRD(ratingDataForThisGame[players.WHITE].rating_deviation_at_game, ratingDataForThisGame[players.WHITE].rd_last_update_date);
// 	const rd2ForCalc = getTrueRD(ratingDataForThisGame[players.BLACK].rating_deviation_at_game, ratingDataForThisGame[players.BLACK].rd_last_update_date);
// 	console.log(`P1 RD for this game (after time decay): ${rd1ForCalc.toFixed(2)}`);
// 	console.log(`P2 RD for this game (after time decay): ${rd2ForCalc.toFixed(2)}`);

// 	// Simulate a game outcome (randomly)
// 	const randomOutcomeSeed = Math.random();
// 	let victorId;
// 	let outcomeDescription;

// 	if (randomOutcomeSeed < 0.75) { // Player 1 (White) wins
// 		victorId = players.WHITE;
// 		outcomeDescription = "Player 1 (White) wins";
// 	} else if (randomOutcomeSeed < 0.9) { // Player 2 (Black) wins
// 		victorId = players.BLACK;
// 		outcomeDescription = "Player 2 (Black) wins";
// 	} else { // Draw
// 		victorId = players.NEUTRAL; // `computeRatingDataChanges` handles this as a draw
// 		outcomeDescription = "Draw";
// 	}
// 	console.log(`Game Outcome: ${outcomeDescription}`);

// 	// Calculate new ratings using Glicko-1
// 	const GlickoResults = computeRatingDataChanges(ratingDataForThisGame, victorId);

// 	// Update player stats for the next simulated game
// 	// 2 Days
// 	const timeSinceLastGame = 1000 * 60 * 60 * .24; // 1 month
// 	const gameTimestampString = timeutil.timestampToSqlite(Date.now() - timeSinceLastGame);

// 	player1CurrentStats.elo = GlickoResults[players.WHITE]!.elo_after_game!;
// 	player1CurrentStats.rd = GlickoResults[players.WHITE]!.rating_deviation_after_game!;
// 	player1CurrentStats.lastUpdateDate = gameTimestampString;

// 	player2CurrentStats.elo = GlickoResults[players.BLACK]!.elo_after_game!;
// 	player2CurrentStats.rd = GlickoResults[players.BLACK]!.rating_deviation_after_game!;
// 	player2CurrentStats.lastUpdateDate = gameTimestampString;

// 	// Calculate RD changes
// 	const rd1Change = GlickoResults[players.WHITE]!.rating_deviation_after_game! - rd1ForCalc;
// 	const rd2Change = GlickoResults[players.BLACK]!.rating_deviation_after_game! - rd2ForCalc;

// 	// Modified console.log lines
// 	console.log(`P1 (White) New Stats: ELO ${player1CurrentStats.elo.toFixed(2)} (ELO Change: ${GlickoResults[players.WHITE]!.elo_change_from_game!.toFixed(2)}), RD ${player1CurrentStats.rd.toFixed(2)} (RD Change: ${rd1Change.toFixed(2)})`);
// 	console.log(`P2 (Black) New Stats: ELO ${player2CurrentStats.elo.toFixed(2)} (ELO Change: ${GlickoResults[players.BLACK]!.elo_change_from_game!.toFixed(2)}), RD ${player2CurrentStats.rd.toFixed(2)} (RD Change: ${rd2Change.toFixed(2)})`);

// 	// Demonstrate RD increase due to inactivity (illustrative)
// 	// This happens because getTrueRD increases RD if time has passed.
// 	// In our rapid simulation, this effect is small between games.
// 	// Here we show what RD would be after a longer period.
// 	if (gameCounter % 5 === 0 && typeof timeutil !== 'undefined') { // Show every 5 games
// 		const timeDeltaForDemo = 1000 * 60 * 60 * 24 * 30 * 6; // 6 months
        
// 		// We need to simulate 'Date.now()' being in the future for getTrueRD.
// 		// We can do this by preparing inputs for getTrueRD manually.
// 		const p1LastUpdateTimestamp = timeutil.sqliteToTimestamp(player1CurrentStats.lastUpdateDate);
// 		const futureTimestamp = p1LastUpdateTimestamp + timeDeltaForDemo; // Simulate time passed since last game
        
// 		// Calculate what getTrueRD would be if 'current_timestamp' was 'futureTimestamp'
// 		const rating_periods_elapsed_demo = Math.max(0, (futureTimestamp - p1LastUpdateTimestamp) / RATING_PERIOD_DURATION);
// 		const p1_RD_if_inactive_demo = Math.max(MIMIMUM_LEADERBOARD_RD, Math.min(DEFAULT_LEADERBOARD_RD, Math.sqrt(player1CurrentStats.rd ** 2 + rating_periods_elapsed_demo * c ** 2)));

// 		const p1_RD_change = p1_RD_if_inactive_demo - player1CurrentStats.rd;

// 		console.log(`\nDEMO: If P1 (RD ${player1CurrentStats.rd.toFixed(2)}) is inactive for ${timeDeltaForDemo / (1000 * 60 * 60 * 24)} days, their RD would become ~${p1_RD_if_inactive_demo.toFixed(2)}. (Change: ${p1_RD_change.toFixed(2)})`);
// 	}
// }


// // --- Start Simulation ---
// console.log("--- Glicko-1 Rating Simulation Test ---");
// console.log("This test will simulate games between two players and update their ratings.");
// console.log(`A game is simulated every ${SIMULATION_GAME_INTERVAL_MS / 1000} seconds.`);
// console.log("Initial P1 (White): ELO", DEFAULT_LEADERBOARD_ELO, "RD:", DEFAULT_LEADERBOARD_RD);
// console.log("Initial P2 (Black): ELO", DEFAULT_LEADERBOARD_ELO, "RD:", DEFAULT_LEADERBOARD_RD);

// // Run the first game immediately, then set interval
// runSingleGameSimulation();
// const simulationIntervalId = setInterval(runSingleGameSimulation, SIMULATION_GAME_INTERVAL_MS);

// // --- Optional: Stop simulation after some time ---
// const SIMULATION_DURATION_GAMES = 100; // Number of games to simulate before stopping
// const SIMULATION_DURATION_MS = SIMULATION_GAME_INTERVAL_MS * SIMULATION_DURATION_GAMES + 100; // e.g., run for 10 games + buffer
// setTimeout(() => {
// 	if (simulationIntervalId) clearInterval(simulationIntervalId);
// 	console.log(`\n--- Simulation automatically stopped after ${gameCounter} games. ---`);
// 	if (typeof timeutil !== 'undefined') {
// 		// Final check of TrueRDs based on their last game time until "now"
// 		const p1FinalTrueRD = getTrueRD(player1CurrentStats.rd, player1CurrentStats.lastUpdateDate);
// 		const p2FinalTrueRD = getTrueRD(player2CurrentStats.rd, player2CurrentStats.lastUpdateDate);
// 		console.log(`P1 Final State: ELO ${player1CurrentStats.elo.toFixed(2)}, Base RD ${player1CurrentStats.rd.toFixed(2)}, Current TrueRD ${p1FinalTrueRD.toFixed(2)}`);
// 		console.log(`P2 Final State: ELO ${player2CurrentStats.elo.toFixed(2)}, Base RD ${player2CurrentStats.rd.toFixed(2)}, Current TrueRD ${p2FinalTrueRD.toFixed(2)}`);
// 	}
// }, SIMULATION_DURATION_MS);


// ================================================================================


export {
	DEFAULT_LEADERBOARD_ELO,
	DEFAULT_LEADERBOARD_RD,
	UNCERTAIN_LEADERBOARD_RD,
	RD_UPDATE_FREQUENCY,
	getTrueRD,
	computeRatingDataChanges
};

export type {
	RatingData,
};