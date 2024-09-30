
/*
 * This module, in the future, where be where we connect to Patreon's API
 * to dynamically refresh the list of Patreon-specific patrons on the webiste.
 */


/** A list of patrons on Naviary's [patreon](https://www.patreon.com/Naviary) page.
 * This should be periodically refreshed. */
const patrons = [];
/** An object, containing patron usernames for the key, and their preferred
 * name on the website's patron list for the value. */
const replacementNames = {};

/** The interval, in milliseconds, to use Patreon's API to refresh the patron list. */
const intervalToRefreshPatreonPatronsMillis = 1000 * 60 * 60; // 1 hour

/**
 * Uses Patreon's API to fetch all patrons on Naviary's
 * [patreon](https://www.patreon.com/Naviary) page, and updates our list!
 * 
 * STILL TO BE WRITTEN
 */
function refreshPatreonPatronList() {

}

/**
 * Returns a list of patrons on Naviary's [patreon](https://www.patreon.com/Naviary) page,
 * updated every {@link intervalToRefreshPatreonPatronsMillis}.
 * @returns {string[]}
 */
function getPatreonPatrons() {
	// Replace their true usernames with replacements
	const patronsWithReplacedNames = patrons.map((patron) => {
		return replacementNames[patron] || patron;
	});

	return patronsWithReplacedNames;
}


export {
	getPatreonPatrons
};