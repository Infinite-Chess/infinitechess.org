
// This script does what the memberHeader script does, except it also detects if we're on the same page as who we're logged in as.

let token;

const element_loginLink = document.getElementById('loginlink');
const element_loginText = document.getElementById('logintext');
const element_createaccountLink = document.getElementById('createaccountlink');
const element_createaccountText = document.getElementById('createaccounttext');


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

// If we're logged in, the log in button will change to their profile,
// and create account will change to log out...

let isOurProfile = false;

const member = getLastSegmentOfURL();

/**
 * Gets the last segment of the current URL without query parameters.
 * @returns {string} - The last segment of the URL.
 */
function getLastSegmentOfURL() {
	const url = new URL(window.location.href);
	const pathname = url.pathname;
	const segments = pathname.split('/');
	return segments[segments.length - 1] || segments[segments.length - 2]; // Handle situation if trailing '/' is present
}

refreshAndUpdateNav();

function refreshAndUpdateNav() {
	// Fetch an access token by refreshing
	let OK = false;
	fetch('/api/get-access-token')
		.then((response) => {
			if (response.ok) OK = true;
			return response.json();
		})
		.then((result) => {
			if (OK) { // Refresh token (from cookie) accepted! Receiving new access token + member name
				console.log("Logged in");
				// token = result.accessToken;
				token = getCookieValue('token'); // Cookie expires in 60s
            
				loadMemberData(result.member.toLowerCase());

				// Change navigation links...
				element_loginLink.setAttribute('href', `/member/${result.member.toLowerCase()}`);
				// element_loginText.textContent = result.member;
				element_loginText.textContent = translations["js-profile"];

				element_createaccountLink.setAttribute('href', '/logout');
				element_createaccountText.textContent = translations["js-logout"];

			} else { // Unauthorized, don't change any navigation links
				console.log(result.message);
				loadMemberData();
			}
		});
}

/**
 * Fetches data from a given endpoint after removing any query parameters from the URL.
 * 
 * @param {string} member - The member identifier to include in the URL.
 * @param {Object} config - The configuration object for the fetch request.
 * @returns {Promise<Response>} - The fetch response promise.
 */
function removeQueryParamsFromLink(link) {
	const url = new URL(link, window.location.origin);
	// Remove query parameters
	url.search = '';
	return url.toString();
}

function loadMemberData(loggedInAs) {
	const config = { // Send with our access token
		method: 'GET',
		headers: {
			'Content-Type': 'application/json'
		},
		credentials: 'same-origin', // Allows cookie to be set from this request
	};
	// If we're logged in, include authorization
	if (token) config.headers.Authorization = `Bearer ${token}`;

	fetch(`/member/${member}/data`, config)
		.then((response) => {
			if (response.status === 404) window.location = '/404';
			if (response.status === 500) window.location = '/500';
			return response.json();
		})
		.then((result) => { // result.verified = true/false
			console.log(result); // { elo, joined, seen, username, email, verified }

			// Change on-screen data of the member
			element_memberName.textContent = result.username;
			const eloElement = document.getElementById('elo');
			eloElement.textContent = result.elo;
			const joinedElement = document.getElementById('joined');
			joinedElement.textContent = result.joined;
			const seenElement = document.getElementById('seen');
			seenElement.textContent = result.seen;

			// Is it our own profile?
			if (loggedInAs === result.username.toLowerCase()) {
				isOurProfile = true;

				// Grey background our profile nav link.
				element_loginText.className = 'currPage';

				// If this account has not yet confirmed their email, make that error visible.
				// Our json will not contain this parameter if we aren't logged in.
				if (result.verified === true) revealElement(element_verifyConfirmElement); // They just confirmed, tell them it was a success!
				else if (result.verified === false) revealElement(element_verifyErrorElement);

				// Display email
				revealElement(element_showAccountInfo);
				// Display remove button
				revealElement(element_deleteAccount);
				element_deleteAccount.addEventListener("click", () => removeAccount(true));
				// revealElement(element_accountInfo)
				revealElement(element_change);
				element_email.textContent = result.email;
			}

			// Change username text size depending on character count
			recalcUsernameSize();
		});
}

function showAccountInfo() {
	hideElement(element_showAccountInfo); // Button
	revealElement(element_accountInfo);
}

async function removeAccount(confirmation) {
	if (!confirmation || confirm(translations["js-confirm_delete"])) {
		const password = prompt(translations["js-enter_password"]);
		const cancelWasPressed = password === null;
		if (cancelWasPressed) return; // Don't delete account

		const config = { // Send with our access token
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${token}`
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
			'Authorization': `Bearer ${token}`
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

function getCookieValue(cookieName) {
	const cookieArray = document.cookie.split("; ");
    
	for (let i = 0; i < cookieArray.length; i++) {
		const cookiePair = cookieArray[i].split("=");
  
		if (cookiePair[0] === cookieName) {
			return cookiePair[1];
		}
	}
}

function hideElement(element) {
	element.classList.add("hidden");
}

function revealElement(element) {
	element.classList.remove("hidden");
}

window.addEventListener("resize", recalcUsernameSize);