
// Greys the background color of the header navigation link of the page we are currently on

import docutil from "../../util/docutil.js";
import validatorama from "../../util/validatorama.js";

const loginLink = document.getElementById('login-link');


(function init() {
	greyBackgroundOfCurrPage();
	initListeners();
})();

/** Greys the background color of the header navigation link of the page we are currently on */
function greyBackgroundOfCurrPage() {
	document.querySelectorAll('nav a').forEach(link => {
		const hrefPathname = docutil.getPathnameFromHref(link.getAttribute('href'));
		if (hrefPathname === window.location.pathname) { // e.g. "/news"
			link.classList.add('currPage');
		} else {
			link.classList.remove('currPage');
		}
	});
	updateColorOfProfileButton();
}

// Greys the background color of the profile button if it is ours
function updateColorOfProfileButton() {
	if (!window.location.pathname.startsWith("/member")) return; // Not on a members profile

	loginLink.classList.remove('currPage'); // Reset

	const username = validatorama.getOurUsername();
	if (!username) return; // Not signed in, this isn't our profile

	if (docutil.getLastSegmentOfURL() === username.toLowerCase()) loginLink.classList.add('currPage');
}

function initListeners() {
	document.addEventListener('login', updateColorOfProfileButton); // Custom-event listener. Fired when the validator script receives a response from the server with either our access token or new browser-id cookie.
	window.addEventListener('pageshow', greyBackgroundOfCurrPage); // Fired on initial page load AND when hitting the back button to return.
}



export default {};