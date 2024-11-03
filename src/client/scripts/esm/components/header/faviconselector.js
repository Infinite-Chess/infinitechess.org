
// This script auto detects device theme and adjusts the browser icon accordingly

const element_favicon = document.getElementById('favicon');

/**
 * Switches the browser icon to match the given theme.
 * @param {string} theme "dark"/"light"
 */
function switchFavicon(theme) {
	if (theme === 'dark') element_favicon.href = '/img/favicon-dark.png';
	else element_favicon.href = '/img/favicon-light.png';
}

// Don't create a theme-change event listener if matchMedia isn't supported.
if (window.matchMedia) {
	// Initial theme detection
	const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
	switchFavicon(prefersDarkScheme ? 'dark' : 'light');
	
	// Listen for theme changes
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
		const newTheme = event.matches ? 'dark' : 'light';
		console.log(`Toggled ${newTheme} icon`);
		switchFavicon(newTheme);
	});
};

export default {};