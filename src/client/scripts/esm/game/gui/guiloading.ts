
/**
 * This script hides the loading animation when the page fully loads.
 * */

// Loading Animation Before Page Load
const element_loadingAnimation = document.getElementById('loading-animation')!;

/** THIS SHOULD MATCH THE transition time declared in the css stylesheet!! */
const durationOfFadeOutMillis = 400;

/** Stops the loading screen animation. */
function closeAnimation(): void {
	setTimeout(() => {
		element_loadingAnimation.classList.add('hidden');
	}, durationOfFadeOutMillis);

	element_loadingAnimation.style.opacity = '0';
}

export default {
	closeAnimation
};