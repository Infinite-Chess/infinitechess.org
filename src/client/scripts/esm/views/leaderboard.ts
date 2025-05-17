
/*
 * This script:
 *
 * * Fetches the data of the leaderboard page we're viewing
 * so we can display that info.
 */

import { Leaderboards, VariantLeaderboards } from "../chess/variants/leaderboard.js";

// --- DOM Element Selection ---
// const element_LeaderboardTable = document.getElementById('leaderboard-table')!;
const element_supportedVariants = document.getElementById('supported-variants')!;

// --- Initialization ---

(async function loadLeaderboardData(): Promise<void> {
	setSupportedVariantsDisplay();
    
	

	try {
        

	} catch (error) {
		console.error("Error loading leaderboard data:", error);
		// Redirect to a generic error page or display an error message
		// window.location.href = '/500'; // Example
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