
/**
 * This script will check if the current browser supports all
 * it needs to for the game to function, and if not, it will
 * inform the user to upgrade their browser.
 */

function checkBrowserSupport() {
	// Enable after infinite move distance
	// checkIfBigIntSupported()
}

function checkIfBigIntSupported() {
	try {
		BigInt(123); // Try to initialize a BigInt
	} catch (e) {
		console.error('BigInts are not supported.');
		alert(translations.bigints_unsupported);
		throw new Error('Browser not supported.');
	}
}

// Only supported by 93.65% of all users
// function checkStructuredCloneSupport() {
//     try {
//         structuredClone();
//     } catch (error) {
//         console.error('Structured clone isn't supported.')
//         alert("Structured clone isn't supported. Please upgrade your browser.")
//         throw new Error('Browser not supported.')
//     }
// }

export default {
	checkBrowserSupport
};