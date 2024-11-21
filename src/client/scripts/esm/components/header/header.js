// This script contains the code related to the
// header that runs on every single page

import languagedropdown from "./dropdowns/languagedropdown.js";
import validatorama from "../../util/validatorama.js";
// Only imported so their code will run!
import faviconselector from './faviconselector.js';
import spacing from './spacing.js';
import currpage_greyer from './currpage-greyer.js';
import settings from './settings.js';



/*
 * Refreshes our token if we are logged in and have a refresh token,
 * and if we are login logged in it, changes the login and
 * create account header links into profile and logout links.
 * 
 * If we are not logged in the server will give us a browser-id
 * cookie to validate our identity in future requests.
 * 
 * It appends our lng query param to all the navigation links.
 */
// eslint-disable-next-line no-unused-vars
const header = (function() {

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

	document.addEventListener('login', updateNavigationLinks); // Custom-event listener. Fired when the validator script receives a response from the server with either our access token or new browser-id cookie.
	document.addEventListener('logout', updateNavigationLinks); // Custom-event listener. Often fired when a web socket connection closes due to us logging out.

	// If we're logged in, the log in button will change to their profile,
	// and create account will change to log out...

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

	updateNavigationLinks(); // If we don't do this once initially, our validate Arama method might receive our token back before the event listener is set here
})();
