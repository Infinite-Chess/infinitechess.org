
// Greys the background color of the header navigation link of the page we are currently on

import docutil from "../../util/docutil.js";
import validatorama from "../../util/validatorama.js";


const loginLink = document.getElementById('login-link');


// Greys the background color of the header navigation link of the page we are currently on
document.querySelectorAll('nav a').forEach(link => {
	if (link.getAttribute('href') === window.location.pathname) { // e.g. "/news"
		link.classList.add('currPage');
	}
});

document.addEventListener('validated', updateColorOfProfileButton); // Custom-event listener. Fired when the validator script receives a response from the server with either our access token or new browser-id cookie.

// Greys the background color of the profile button if it is ours
function updateColorOfProfileButton() {
	if (!window.location.pathname.startsWith("/member")) return; // Not on a members profile

	const username = validatorama.getOurUsername();
	if (!username) return; // We haven't received our token back yet

	if (docutil.getLastSegmentOfURL() === username.toLowerCase()) loginLink.classList.add('currPage');
	else loginLink.classList.remove('currPage');
}

updateColorOfProfileButton(); // If we don't do this once initially, our validatorama method might receive our token back before the event listener is set here

export default {};