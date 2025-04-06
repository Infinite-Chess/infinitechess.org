
// This script contains the code related to the
// header that runs on every single page

import languagedropdown from "./dropdowns/languagedropdown.js";
import validatorama from "../../util/validatorama.js";

// Only imported so their code will run! ...

/* eslint-disable no-unused-vars */
import faviconselector from './faviconselector.js';
import spacing from './spacing.js';
import currpage_greyer from './currpage-greyer.js';
import settings from './settings.js';
import tooltips from '../../util/tooltips.js'; // This should be imported on EVERY page!
/* eslint-enable no-unused-vars */



const loginLink = document.getElementById('login-link');
const loginText = document.getElementById('login');
const loginSVG = document.getElementById('svg-login');
const profileText = document.getElementById('profile');
const profileSVG = document.getElementById('svg-profile');
const createaccountLink = document.getElementById('createaccount-link');
const createaccountText = document.getElementById('createaccount');
const createaccountSVG = document.getElementById('svg-createaccount');
const logoutText = document.getElementById('logout');
const logoutSVG = document.getElementById('svg-logout');




(function init() {
	initListeners();
	updateNavigationLinks(); // Do this once initially
})();

function initListeners() {
	window.addEventListener('pageshow', updateNavigationLinks); // Fired on initial page load AND when hitting the back button to return.
	document.addEventListener('login', updateNavigationLinks); // Custom-event listener. Fired when the validator script receives a response from the server with either our access token or new browser-id cookie.
	document.addEventListener('logout', updateNavigationLinks); // Custom-event listener. Often fired when a web socket connection closes due to us logging out.
}


/**
 * Changes the navigation links, depending on if we're logged in, to
 * go to our Profile or the Log Out route, or the Log In / Create Account pages.
 */
function updateNavigationLinks() {
	const username = validatorama.getOurUsername();
	if (username) { // Logged in
		loginText.classList.add('hidden');
		loginSVG.classList.add('hidden');
		createaccountText.classList.add('hidden');
		createaccountSVG.classList.add('hidden');
		profileText.classList.remove('hidden');
		profileSVG.classList.remove('hidden');
		logoutText.classList.remove('hidden');
		logoutSVG.classList.remove('hidden');

		loginLink.href = languagedropdown.addLngQueryParamToLink(`/member/${username.toLowerCase()}`);
		createaccountLink.href = languagedropdown.addLngQueryParamToLink('/logout');
	} else { // Not logged in
		profileText.classList.add('hidden');
		profileSVG.classList.add('hidden');
		logoutSVG.classList.add('hidden');
		logoutText.classList.add('hidden');
		loginText.classList.remove('hidden');
		loginSVG.classList.remove('hidden');
		createaccountText.classList.remove('hidden');
		createaccountSVG.classList.remove('hidden');

		loginLink.href = languagedropdown.addLngQueryParamToLink('/login');
		createaccountLink.href = languagedropdown.addLngQueryParamToLink('/createaccount');
	}

	// Manually dispatch a window resize event so that our javascript knows to
	// recalc the spacing/compactness of the header, as the items have changed their content.
	document.dispatchEvent(new CustomEvent('resize'));
}

// For every '.badge img' in the document, prevent long-press context menu
document.querySelectorAll('.badge img').forEach((img) => {
	img.addEventListener('contextmenu', e => {
		// Only prevent default if the context menu is triggered by touch or pen
		if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
		console.log("Preventing context menu for badge image.");
		e.preventDefault();
	});
});

