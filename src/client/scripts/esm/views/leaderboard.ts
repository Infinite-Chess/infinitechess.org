
/*
 * This script:
 *
 * * Fetches the data of the leaderboard page we're viewing
 * so we can display that info.
 */

import { Leaderboards, VariantLeaderboards } from "../chess/variants/validleaderboard.js";
import usernamecontainer from "../util/usernamecontainer.js";
import validatorama from "../util/validatorama.js";

import type { UsernameContainer, UsernameContainerDisplayOptions } from '../util/usernamecontainer.js';

// --- DOM Element Selection ---
const element_LeaderboardContainer = document.getElementById('leaderboard-table')!;
const element_supportedVariants = document.getElementById('supported-variants')!;
const element_ShowMoreButton = document.getElementById('show_more_button')!;


// --- Variables ---
/** Number of players to be shown on leaderboard page load */
let n_players = 50;
/** Number of players to be added on show more button press */
const showMoreButtonIncrement = 25;
/** Leaderboard to be displayed */
const leaderboard_id = Leaderboards.INFINITY;


// --- Initialization ---


(async function loadLeaderboardData(): Promise<void> {
	// We have to wait for validatorama here because it might be attempting
	// to refresh our session in which case our session cookies will change
	// so our refresh token in this here fetch request here would then be invalid
	await validatorama.waitUntilInitialRequestBack();

	setSupportedVariantsDisplay();
	await makeLeaderboardTable();

	element_ShowMoreButton.addEventListener('click', showMorePlayers);
})();



// --- Functions ---


/**
 * Set the text below the leaderboard table, explaining which variants belong to it
 */
function setSupportedVariantsDisplay() {
	// Set the text above the list:
	element_supportedVariants.textContent = translations["supported_variants"];

	const valid_variants = Object.keys(VariantLeaderboards);
	
	// Create a <ul> element and append <li> items
	const ul = document.createElement("ul");
	valid_variants.forEach((variant: string | null) => {
		if (variant === null || VariantLeaderboards[variant] !== leaderboard_id) return;
		const li = document.createElement("li");
		li.textContent = translations[variant] ? translations[variant] : variant;
		ul.appendChild(li);
	});

	// Add the list to the page
	element_supportedVariants.appendChild(ul);
}

/**
 * Create the leaderboard table for the chosen leaderboard, with the top n players
 */
async function makeLeaderboardTable() {
	const config: RequestInit = {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
	};

	try {
		// We need to fetch n_players + 1 and only display n_players in order to know whether the "Show more" button needs to be hidden
		const response = await fetch(`/leaderboard/${leaderboard_id}/${n_players + 1}`, config);

		if (response.status === 404 || response.status === 500 || !response.ok) {
			console.error("Failed to fetch leaderboard data:", response.status, response.statusText);
			return;
		}

		const results = await response.json();
		console.log(results);

		// Create table
		const table = document.createElement("table");
		// Create header of table
		const thead = document.createElement("thead");
		thead.innerHTML = `
            <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Rating</th>
            </tr>
        `;
		table.appendChild(thead);

		// Create body of table
		const tbody = document.createElement("tbody");
		let rank = 1;
		results.forEach((player: { username: string; elo: string }) => {
			if (rank > n_players) return;
			const row = document.createElement("tr");

			// Create and append <td> for rank
			const rankCell = document.createElement("td");
			rankCell.textContent = `${rank}`;
			row.appendChild(rankCell);

			// Create and append <td> for username
			const usernameCell = document.createElement("td");
			const usernamecontainer_object: UsernameContainer = { username: player.username };
			const usernamecontainer_options: UsernameContainerDisplayOptions = { makehyperlink: true, hyperlinktarget: "_self" };
			const usernamecontainer_display = usernamecontainer.createUsernameContainerDisplay(usernamecontainer_object, usernamecontainer_options);
			usernamecontainer.embedUsernameContainerDisplayIntoParent(usernamecontainer_display, usernameCell);
			row.appendChild(usernameCell);

			// Create and append <td> for elo
			const eloCell = document.createElement("td");
			eloCell.textContent = player.elo;
			row.appendChild(eloCell);

			// Append the completed row to the table body
			tbody.appendChild(row);

			// Color row of logged in user
			const loggedInAs = validatorama.getOurUsername();
			if (loggedInAs === player.username) row.classList.add("logged_in_user_entry");

			rank++;
		});

		table.appendChild(tbody);

		// Clear all other content of element_LeaderboardContainer and add table
		while (element_LeaderboardContainer.firstChild) {
			element_LeaderboardContainer.removeChild(element_LeaderboardContainer.firstChild);
		}
		element_LeaderboardContainer.appendChild(table);

		// Hide "show more" button if not enough players are shown
		if (results.length < n_players + 1) element_ShowMoreButton.classList.add("hidden");
		else element_ShowMoreButton.classList.remove("hidden");

	} catch (error) {
		console.error("Error loading leaderboard data:", error);
	}
}

/**
 * Increase n_players and redraw the leaderboard table
 */
async function showMorePlayers() {
	n_players += showMoreButtonIncrement;
	await makeLeaderboardTable();
}
