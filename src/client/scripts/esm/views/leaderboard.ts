// src/client/scripts/esm/views/leaderboard.ts

/**
 * Builds the leaderboard page's ranking table, loading 50 players at a time as
 * "Show more" is pressed, and showing our own world ranking above it when signed in.
 */

import type { VariantCode } from '../../../../shared/chess/util/variantcodes.js';
import type { UsernameItem } from '../components/usernamecontainer.js';

import leaderboardregistry from '../../../../shared/chess/variants/leaderboardregistry.js';

import validatorama from '../util/validatorama.js';
import { serverfetch } from '../util/serverfetch.js';
import usernamecontainer from '../components/usernamecontainer.js';

// Elements --------------------------------------------------------------------

const element_LeaderboardContainer = document.getElementById('leaderboard-table')!;
const element_supportedVariants = document.getElementById('supported-variants')!;
const element_ShowMoreButton: HTMLButtonElement = document.getElementById(
	'show_more_button',
)! as HTMLButtonElement;
const element_UserRankingText = document.getElementById('user_ranking_text')!;
const element_UserRanking = document.getElementById('user_ranking')!;

// Constants -------------------------------------------------------------------

/** Number of players to be shown on leaderboard page load */
const LEADERBOARD_LENGTH_ON_LOAD = 50;
/** Number of players to be added on show more button press */
const LEADERBOARD_SHOW_MORE_BUTTON_INCREMENT = 50;
/** Leaderboard to be displayed */
const LEADERBOARD_ID = leaderboardregistry.IDS.INFINITY;

// State -----------------------------------------------------------------------

/** Body of leaderboard table, as created in createEmptyLeaderboardTable() */
let element_LeaderboardTableBody: HTMLTableSectionElement;
/** Running start rank: highest leaderboard position not shown on leaderboard yet */
let runningStartRank = 1;
/**
 * Username of the player, if they are logged in, else undefined,
 * AT THE TIME OF THE initial request for our world ranking.
 */
let loggedInAs: string | undefined;
/** Whether the page has already been initialized once */
let initialized = false;

// Initialization --------------------------------------------------------------

(async function loadLeaderboardData(): Promise<void> {
	setSupportedVariantsDisplay();
	createEmptyLeaderboardTable();

	loggedInAs = validatorama.getOurUsername();

	await populateTable(LEADERBOARD_LENGTH_ON_LOAD);
	initialized = true;

	element_ShowMoreButton.addEventListener('click', showMorePlayers);
})();

// Functions -------------------------------------------------------------------

/** Sets the text below the leaderboard table, explaining which variants belong to it. */
function setSupportedVariantsDisplay(): void {
	const variantsList: string[] = [];
	Object.entries(leaderboardregistry.BY_VARIANT).forEach(([variant, leaderboard]) => {
		if (leaderboard !== LEADERBOARD_ID) return;
		variantsList.push(variant in translations ? translations[variant as VariantCode] : variant);
	});
	element_supportedVariants.textContent = `${translations.supported_variants} ${variantsList.join(', ')}.`;
}

/** Creates an empty leaderboard table upon page initialization. */
function createEmptyLeaderboardTable(): void {
	// Create table
	const table = document.createElement('table');
	// Create header of table
	const thead = document.createElement('thead');
	thead.innerHTML = `
		<tr>
		<th>${translations.rank}</th>
		<th>${translations.player}</th>
		<th>${translations.rating}</th>
		</tr>
	`;
	table.appendChild(thead);

	// Create body of table
	element_LeaderboardTableBody = document.createElement('tbody');
	table.appendChild(element_LeaderboardTableBody);
	element_LeaderboardContainer.appendChild(table);
}

/**
 * Populate the leaderboard table for the chosen leaderboard by adding the next top n players.
 * If initialized === false, then this function also populates the "global ranking" element at the top
 * @param nPlayers - number of players to add to table
 */
async function populateTable(nPlayers: number): Promise<void> {
	const config: RequestInit = { method: 'GET' };

	try {
		// Make server request
		// We need to fetch nPlayers + 1 and only display nPlayers in order to know whether the "Show more" button needs to be hidden
		// If initialized === false and the player is logged in, we also request the requester's rank on the first page load
		const includeRequesterRank = !initialized && loggedInAs !== undefined;
		const params = new URLSearchParams({
			start_rank: String(runningStartRank),
			n_players: String(nPlayers + 1),
			include_requester_rank: String(includeRequesterRank),
		});
		const response = await serverfetch(
			`/api/leaderboards/${LEADERBOARD_ID}/top?${params}`,
			config,
		);

		if (response.status === 404 || response.status === 500 || !response.ok) {
			console.error('Failed to fetch leaderboard data:', response.status, response.statusText); // prettier-ignore
			return;
		}

		const results = await response.json();

		// Now populate the "your global rank" text at the top if possible
		if (!initialized && results.requesterData?.rank_string !== undefined) {
			element_UserRankingText.classList.remove('hidden');
			element_UserRanking.textContent = results.requesterData.rank_string;
		}

		// Iterate through all results.leaderboardData and add a row to the table body for each of them
		let rank = runningStartRank;
		results.leaderboardData.forEach((player: { username: string; elo: string }) => {
			if (rank >= runningStartRank + nPlayers) return;
			const row = document.createElement('tr');

			// Create and append <td> for rank
			const rankCell = document.createElement('td');
			rankCell.textContent = `${rank}`;
			row.appendChild(rankCell);

			// Create and append <td> for username
			const usernameCell = document.createElement('td');
			const usernameItem: UsernameItem = { value: player.username, openInNewWindow: false };
			const usernameContainer = usernamecontainer.createUsernameContainer(
				'player',
				usernameItem,
			);
			usernamecontainer.embedUsernameContainerDisplayIntoParent(
				usernameContainer.element,
				usernameCell,
			);
			usernameCell.classList.add('fade-element'); // Usernames fade out instead of overflowing their container
			row.appendChild(usernameCell);

			// Create and append <td> for elo
			const eloCell = document.createElement('td');
			eloCell.textContent = player.elo;
			row.appendChild(eloCell);

			// Append the completed row to the table body
			element_LeaderboardTableBody.appendChild(row);

			// Color row of logged in user
			if (loggedInAs === player.username) row.classList.add('logged_in_user_entry');

			rank++;
		});

		// Update runningStartRank
		runningStartRank += nPlayers;

		// Hide "show more" button if not enough players were returned by server
		if (results.leaderboardData.length < nPlayers + 1)
			element_ShowMoreButton.classList.add('hidden');
		else element_ShowMoreButton.classList.remove('hidden');
	} catch (error) {
		console.error('Error loading leaderboard data:', error);
	}
}

/** Populates the leaderboard table with the next highest rated players. */
async function showMorePlayers(): Promise<void> {
	// disable the button so it can’t be clicked again while we’re fetching
	element_ShowMoreButton.disabled = true;
	try {
		await populateTable(LEADERBOARD_SHOW_MORE_BUTTON_INCREMENT);
	} finally {
		// re-enable regardless of success or failure
		element_ShowMoreButton.disabled = false;
	}
}
