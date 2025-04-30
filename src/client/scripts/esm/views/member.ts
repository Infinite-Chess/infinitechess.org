
/*
 * This script:
 *
 * * Fetches the data of the member's page we're viewing
 * so we can display that info.
 *
 * * Dynamically adjusts the font-size of the username.
 * Resends confirmation emails upon clicking the button.
 *
 * * Deletes account when button clicked and password entered.
 */

import docutil from "../util/docutil.js";
import validatorama from "../util/validatorama.js";
import validcheckmates from "../chess/util/validcheckmates.js";

// --- Type Definitions ---

interface MemberData {
	joined: string;
	seen: string;
	username: string;
	checkmates_beaten: string;
	ranked_elo: string;
	// Only present/relevant if viewing our own profile
	email?: string;
	verified?: boolean;
}

// --- DOM Element Selection ---

const element_verifyErrorElement = document.getElementById('verifyerror')!;
const element_verifyConfirmElement = document.getElementById('verifyconfirm')!;
const element_sendEmail = document.getElementById('sendemail') as HTMLAnchorElement;

const element_member = document.getElementsByClassName('member')[0] as HTMLElement;
const element_memberName = document.getElementById('membername')!;

const element_badgeList = document.getElementById('badgelist')!;
const elements_badges = document.querySelectorAll<HTMLImageElement>('#badgelist img');
const element_checkmateBadgeBronze = document.getElementById('checkmate-badge-bronze') as HTMLImageElement;
const element_checkmateBadgeSilver = document.getElementById('checkmate-badge-silver') as HTMLImageElement;
const element_checkmateBadgeGold = document.getElementById('checkmate-badge-gold') as HTMLImageElement;

const element_showAccountInfo = document.getElementById('show-account-info') as HTMLButtonElement;
const element_deleteAccount = document.getElementById('delete-account') as HTMLButtonElement;
const element_accountInfo = document.getElementById('accountinfo')!;
const element_email = document.getElementById('email')!;
const element_change = document.getElementById('change')!;

// --- Event Listeners Setup ---

element_sendEmail.addEventListener('click', resendConfirmEmail);
element_showAccountInfo.addEventListener('click', showAccountInfo);
// Note: deleteAccount listener added later conditionally

// --- State ---

let isOurProfile: boolean = false;
const member: string = docutil.getLastSegmentOfURL(); // Assuming returns string

// --- Initialization ---

(async function loadMemberData(): Promise<void> {
	// We have to wait for validatorama here because it might be attempting
	// to refresh our session in which case our session cookies will change
	// so our refresh token in this here fetch request here would then be invalid
	await validatorama.waitUntilInitialRequestBack();

	const config: RequestInit = {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
	};
	// Server reads refresh token cookie, no Authorization header needed here as per original comments

	try {
		const response = await fetch(`/member/${member}/data`, config);

		if (response.status === 404) {
			window.location.href = '/404'; // Use href for navigation
			return;
		}
		if (response.status === 500) {
			window.location.href = '/500';
			return;
		}
		if (!response.ok) {
			// Handle other potential errors if needed
			console.error("Failed to fetch member data:", response.status, response.statusText);
			// Potentially redirect to an error page or show a message
			// For now, let's assume it resolves to JSON even on error based on later code
			// but ideally, handle non-JSON error responses too.
			return;
		}

		const result: MemberData = await response.json();
		console.log(result); // { joined, seen, username, email, verified, checkmates_beaten, ranked_elo }

		// Change on-screen data of the member
		element_memberName.textContent = result.username;
		const joinedElement = document.getElementById('joined')!;
		joinedElement.textContent = result.joined;
		const seenElement = document.getElementById('seen')!;
		seenElement.textContent = result.seen;
		updateCompletedCheckmatesInformation(result.checkmates_beaten);

		const eloElement = document.getElementById('ranked_elo')!;
		eloElement.textContent = result.ranked_elo;

		const loggedInAs = validatorama.getOurUsername(); // Assuming returns string | null

		// Is it our own profile?
		if (loggedInAs && loggedInAs === result.username) {
			isOurProfile = true;

			// If this account has not yet confirmed their email, make that error visible.
			// Our json will not contain this parameter if we aren't logged in.
			if (result.verified === true) element_verifyConfirmElement.classList.remove('hidden'); // They just confirmed, tell them it was a success!
			else if (result.verified === false) element_verifyErrorElement.classList.remove('hidden');
			// else: result.verified is undefined, we already verified and have seen the confirmation message.

			// Display elements specific to own profile
			element_showAccountInfo.classList.remove('hidden');
			element_deleteAccount.classList.remove('hidden');
			element_deleteAccount.addEventListener("click", () => removeAccount(true)); // Add listener only if it's our profile
			element_change.classList.remove('hidden');
			element_email.textContent = result.email!; // Use email if available, handle undefined case
		}

		// Change username text size depending on character count
		recalcUsernameSize();

	} catch (error) {
		console.error("Error loading member data:", error);
		// Redirect to a generic error page or display an error message
		// window.location.href = '/500'; // Example
	}
})();

/**
 * Updates the counter on your profile telling you how many total checkmate practices you have beaten.
 * Also updates the badges.
 * "Practice Mode Progress: 3 / 33"
 * @param checkmates_beaten - Comma-delimited string of beaten checkmate IDs.
 */
function updateCompletedCheckmatesInformation(checkmates_beaten: string): void {
	const practiceProgressElement = document.getElementById('practice_progress')!;
	const completedCheckmates = checkmates_beaten ? checkmates_beaten.match(/[^,]+/g) || [] : []; // Handle empty/null string
	const numCompleted = completedCheckmates.length;
	const numTotal = Object.values(validcheckmates.validCheckmates).flat().length;

	practiceProgressElement.textContent = `${numCompleted} / ${numTotal}`;
	let shownBadge: HTMLImageElement | null = null;
	if (numCompleted >= numTotal) shownBadge = element_checkmateBadgeGold;
	else if (numCompleted >= 0.75 * numTotal) shownBadge = element_checkmateBadgeSilver;
	else if (numCompleted >= 0.5 * numTotal) shownBadge = element_checkmateBadgeBronze;

	// Ensure only the correct badge (or none) is shown
	[element_checkmateBadgeBronze, element_checkmateBadgeSilver, element_checkmateBadgeGold].forEach(badge => {
		if (badge === shownBadge) badge.classList.remove("hidden");
		else badge.classList.add("hidden");
	});
}

/** Reveals the account information section. */
function showAccountInfo(): void { // Called from inside the html via event listener
	element_showAccountInfo.classList.add("hidden");
	element_accountInfo.classList.remove("hidden");
}

/**
 * Handles the account deletion process.
 * @param confirmation - Whether to show the initial confirmation dialog.
 */
async function removeAccount(confirmation: boolean): Promise<void> {
	if (confirmation) {
		if (!confirm(translations["js-confirm_delete"])) return; // User cancelled the initial confirmation
	}

	const password = prompt(translations["js-enter_password"]);
	const cancelWasPressed = password === null;
	if (cancelWasPressed) return; // User pressed Cancel in the password prompt

	// Password entered (even if empty string), proceed with deletion attempt
	const config: RequestInit = {
		method: 'DELETE',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
		body: JSON.stringify({ password }), // Send password in body
		credentials: 'same-origin', // Allows cookies (like session/CSRF) to be sent
	};

	try {
		const response = await fetch(`/member/${member}/delete`, config);

		if (!response.ok) { // Probably incorrect password
			// Attempt to parse error message from server
			const result: { message: string } = await response.json();
			alert(result.message); // Show server error message
			// Call removeAccount(false) again to re-prompt for password
			removeAccount(false); // Re-prompt without initial confirmation
		} else {
			// Deletion successful, redirect to homepage
			window.location.href = '/';
		}
	} catch (error) {
		console.error("Network or other error during account deletion:", error);
		alert("An error occurred while trying to delete the account. Please try again.");
	}
}

/** Sends a request to the server to resend the confirmation email. */
function resendConfirmEmail(): void {
	if (!isOurProfile) return; // Only allow resend if viewing own profile

	const config: RequestInit = {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
		credentials: 'same-origin',
	};

	fetch(`/member/${member}/send-email`, config)
		.then((response) => {
			if (response.status === 401) {
				window.location.href = '/401'; // Unauthorized
				return Promise.reject(new Error('Unauthorized')); // Stop processing
			}
			if (!response.ok) {
				// Handle other errors (e.g., rate limiting, server issue)
				console.error("Failed to resend email:", response.status, response.statusText);
				// Optionally show an error message to the user
				alert("Failed to resend confirmation email. Please try again later.");
				return Promise.reject(new Error(`Server error: ${response.status}`));
			}
			return response.json(); // Expecting a success message perhaps?
		})
		.then((result) => { // Email was resent! Reload the page so the user knows something happened.
			console.log("Resend email result:", result); // Log success indication from server if any
			window.location.reload();
		})
		.catch(error => {
			// Catch errors from fetch itself or Promise.reject calls
			if (error.message !== 'Unauthorized' && !error.message.startsWith('Server error:')) {
				console.error("Error resending confirmation email:", error);
				alert("An error occurred while resending the email.");
			}
			// Errors like 401 or server errors are already handled/logged in the .then block
		});
}

/** Recalculates and sets the font size of the username based on window width and text length. */
function recalcUsernameSize(): void {
	const usernameText = element_memberName.textContent;
	if (!usernameText) return; // Exit if no username text

	// Estimate available width (adjust padding/margin values as needed based on actual layout)
	const otherElementsWidth = 185; // Approximate width of other elements on the same line/area
	const availableWidth = (window.innerWidth - otherElementsWidth) * 0.52; // Target width factor

	// Basic scaling - adjust the factor (3) based on desired look
	let fontSize = availableWidth * (3 / usernameText.length);

	// Set limits for font size
	const minFontSize = 12; // Minimum readable font size
	const maxFontSize = 50; // Maximum desired font size
	fontSize = Math.max(minFontSize, Math.min(fontSize, maxFontSize)); // Clamp font size

	element_memberName.style.fontSize = `${fontSize}px`;
}

// --- Global Event Listeners ---

window.addEventListener("resize", recalcUsernameSize);
