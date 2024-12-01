/**
 * This module accepts HTML strings and injects the script text itself into it.
 */


/**
 * Injects a string after a certain string segment found within a source string.
 * @param {string} src - The source string
 * @param {string} after - The string segment for which the first match is found within the src, where the inject string will be inserted.
 * @param {string} inject - The string to inject
 * @returns {string} The injected string. If no match was found, the string will have not changed.
 */
function injectStringIntoStringAfter(src, after, inject) {
	return src.replace(after, `${after}${inject}`);
}

/**
 * Takes an HTML document as a string, inserts a script tag into its head, 
 * with the script content being the provided JavaScript code, and any corresponding attributes provided.
 * @param {string} HTML - The HTML string.
 * @param {string} JS - The JavaScript code to be inserted directly into the script tag.
 * @param {Object} [attributes] - An object with attribute-value pairs to insert into the script tag.
 * @param {string} [after] - The string instance to insert the script after the first occurrence of, if we need it at a specific place.
 * @returns {string} - The modified HTML string with the inserted script tag containing the JavaScript code.
 */
function insertScriptIntoHTML(HTML, JS, attributes = {}, after) {
	let scriptTag = `<script`; // Start of the script tag
	for (const [key, value] of Object.entries(attributes)) scriptTag += ` ${key}="${value}"`; // Add any additional attributes
	scriptTag += `>${JS}</script>`; // Add the JavaScript code and close the script tag

	// Determine the insertion point
	let insertionIndex = after ? HTML.indexOf(after) + after.length // If 'after' is provided and exists in the HTML, insert after the first occurrence of 'after'
                               : insertionIndex = HTML.indexOf('</head>'); // Otherwise, insert before the closing </head> tag

	if (insertionIndex === -1) { // Throw an error if we don't know where to insert
		if (after) throw new Error(`Cannot inject script into HTML when it doesn't contain the string '${after}'!`);
		else throw new Error(`Cannot inject script into HTML when it doesn't contain a head,!`);
	}

	// Insert the script tag at the determined position and return the modified HTML
	return HTML.slice(0, insertionIndex) + scriptTag + HTML.slice(insertionIndex);
}

export {
	insertScriptIntoHTML,
};
