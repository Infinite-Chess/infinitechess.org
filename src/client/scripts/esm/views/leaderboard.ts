
/*
 * This script:
 *
 * * Fetches the data of the leaderboard page we're viewing
 * so we can display that info.
 */

import { Leaderboards, VariantLeaderboards } from "../chess/variants/leaderboard.js";
import usernamecontainer from "../util/usernamecontainer.js";

import type { UsernameContainer, UsernameContainerDisplayOptions } from '../util/usernamecontainer.js';

// --- DOM Element Selection ---
const element_LeaderboardContainer = document.getElementById('leaderboard-table')!;
const element_supportedVariants = document.getElementById('supported-variants')!;

// --- Initialization ---

(async function loadLeaderboardData(): Promise<void> {
	const leaderboard_id = Leaderboards.INFINITY;

	setSupportedVariantsDisplay();
    
	const config: RequestInit = {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
	};

	try {

		const n_players = 100;
		const response = await fetch(`/leaderboard/${leaderboard_id}/${n_players}`, config);

		if (response.status === 404 || response.status === 500 || !response.ok) {
			console.error("Failed to fetch leaderboard data:", response.status, response.statusText);
			return;
		}

		const results = await response.json();

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
			rank++;
		});

		table.appendChild(tbody);
		element_LeaderboardContainer.appendChild(table);

	} catch (error) {
		console.error("Error loading leaderboard data:", error);
	}
})();


function setSupportedVariantsDisplay() {
	// Set the text above the list:
	element_supportedVariants.textContent = translations["supported_variants"];

	const valid_variants = Object.keys(VariantLeaderboards);
	
	// Create a <ul> element and append <li> items
	const ul = document.createElement("ul");
	valid_variants.forEach((variant: string | null) => {
		if (variant === null || VariantLeaderboards[variant] !== Leaderboards.INFINITY) return;
		const li = document.createElement("li");
		li.textContent = translations[variant] ? translations[variant] : variant;
		ul.appendChild(li);
	});

	// Add the list to the page
	element_supportedVariants.appendChild(ul);
}