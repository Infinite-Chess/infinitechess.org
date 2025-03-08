
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


const element_verifyErrorElement = document.getElementById('verifyerror');
const element_verifyConfirmElement = document.getElementById('verifyconfirm');
const element_sendEmail = document.getElementById('sendemail');
// Create a listener for if they push the 'send it again' link
element_sendEmail.addEventListener('click', resendConfirmEmail);

const element_member = document.getElementsByClassName('member')[0];
const element_memberName = document.getElementById('membername');

const element_showAccountInfo = document.getElementById('show-account-info'); // Button
const element_deleteAccount = document.getElementById('delete-account');
const element_accountInfo = document.getElementById('accountinfo');
const element_email = document.getElementById('email');
const element_change = document.getElementById('change');

element_showAccountInfo.addEventListener('click', showAccountInfo);

// If we're logged in, the log in button will change to their profile,
// and create account will change to log out...

let isOurProfile = false;

const member = docutil.getLastSegmentOfURL();

(async function loadMemberData() {
	// We have to wait for validatorama here because it might be attempting
	// to refresh our session in which case our session cookies will change
	// so our refresh token in this here fetch request here would then be invalid
	await validatorama.waitUntilInitialRequestBack();

	const config = {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
	};
	// Add the access token if we don't want to verify using the refresh token
	// const token = await validatorama.getAccessToken();
	// if (token) {
	// 	config.headers.Authorization = `Bearer ${token}`;
	// }

	// If we're logged in, include authorization
	// if (token) config.headers.Authorization = `Bearer ${token}`; // DON'T NEED, server reads our refresh token cookie

	fetch(`/member/${member}/data`, config)
		.then((response) => {
			if (response.status === 404) window.location = '/404';
			if (response.status === 500) window.location = '/500';
			return response.json();
		})
		.then(async(result) => { // result.verified = true/false
			console.log(result); // { joined, seen, username, email, verified, checkmates_beaten }

			// Change on-screen data of the member
			element_memberName.textContent = result.username;
			const joinedElement = document.getElementById('joined');
			joinedElement.textContent = result.joined;
			const seenElement = document.getElementById('seen');
			seenElement.textContent = result.seen;
			const practiceProgressElement = document.getElementById('practice_progress');
			const completedCheckmates = ( result.checkmates_beaten.match(/[^,]+/g) || [] );
			let amountBeaten = 0;
			for (const checkmateID of Object.values(validcheckmates.validCheckmates).flat()) {
				if (completedCheckmates.includes(checkmateID)) amountBeaten++;
			}
			practiceProgressElement.textContent = `${amountBeaten} / ${Object.values(validcheckmates.validCheckmates).flat().length}`;

			const loggedInAs = validatorama.getOurUsername();

			// Is it our own profile?
			if (loggedInAs === result.username) {
				isOurProfile = true;

				// If this account has not yet confirmed their email, make that error visible.
				// Our json will not contain this parameter if we aren't logged in.
				if (result.verified === true) element_verifyConfirmElement.classList.remove('hidden'); // They just confirmed, tell them it was a success!
				else if (result.verified === false) element_verifyErrorElement.classList.remove('hidden');

				// Display email
				element_showAccountInfo.classList.remove('hidden');
				// Display remove button
				element_deleteAccount.classList.remove('hidden');
				element_deleteAccount.addEventListener("click", () => removeAccount(true));
				// revealElement(element_accountInfo)
				element_change.classList.remove('hidden');
				element_email.textContent = result.email;
			}

			// Change username text size depending on character count
			recalcUsernameSize();
		});
})();

function showAccountInfo() { // Called from inside the html
	element_showAccountInfo.classList.add("hidden");
	element_accountInfo.classList.remove("hidden");
}

async function removeAccount(confirmation) {
	if (!confirmation || confirm(translations["js-confirm_delete"])) {
		const password = prompt(translations["js-enter_password"]);
		const cancelWasPressed = password === null;
		if (cancelWasPressed) return; // Don't delete account

		const config = {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
				"is-fetch-request": "true" // Custom header
			},
			body: JSON.stringify({ password }),
			credentials: 'same-origin', // Allows cookie to be set from this request
		};

		const response = await fetch(`/member/${member}/delete`, config);
		if (!response.ok) {
			// translate the message from the server if a translation is available
			const result = await response.json();
			alert(result.message);
			removeAccount(false);
		} else {
			window.location.href = '/';
		}
	}
}

function resendConfirmEmail() {

	if (!isOurProfile) return; // Only request if we know this is our profile page

	const config = { // Send with our access token
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			"is-fetch-request": "true" // Custom header
		},
		credentials: 'same-origin', // Allows cookie to be set from this request
	};

	fetch(`/member/${member}/send-email`, config)
		.then((response) => {
			if (response.status === 401) window.location = '/401';
			return response.json();
		})
		.then((result) => { // Email was resent! Reload the page
			window.location.reload();
		});
}

function recalcUsernameSize() {
	// Change username text size depending on character count
	// const memberElementPadding = parseInt((window.getComputedStyle(element_member, null).getPropertyValue('padding-left')), 10) // parseInt() converts px to number
	const targetWidth = (window.innerWidth - 185) * 0.52;
    
	let fontSize = targetWidth * (3 / element_memberName.textContent.length);
	const cap = 50;
	if (fontSize > cap) fontSize = cap;
	element_memberName.style["font-size"] = `${fontSize}px`;
}

window.addEventListener("resize", recalcUsernameSize);