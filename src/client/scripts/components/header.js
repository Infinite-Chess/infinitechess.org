
// Greys the navigation link of the page we are currently on
document.querySelectorAll('nav a').forEach(link => {
	if (link.getAttribute('href') === window.location.pathname) link.classList.add('currPage');
});

// Handles the spacing of our header elements at various screen widths

const header = document.querySelector('header');
const home = document.querySelector('.home');
const nav = document.querySelector('nav');
const links = document.querySelectorAll('nav a');
// Paddings allowed between each of our header links (right of logo & left of gear)
const maxPadding = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-link-max-padding'));
const minPadding = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-link-min-padding'));
const gear = document.querySelector('.gear-container');

// These things are hidden in our stylesheet off the bat to give our javascript
// here time to calculate the spacing of everything before rendering
for (const child of header.children) child.classList.remove('visibility-hidden');

let compactnessLevel = 0;

updateSpacing(); // Initial spacing on page load
window.addEventListener('resize', updateSpacing); // Continuous spacing on page-resizing

function updateSpacing() {
	// Reset to least compact, so that we can measure if each stage fits.
	// If it doesn't, we go down to the next compact stage
	compactnessLevel = 0;
	updateMode();
	updatePadding();

	let spaceBetween = getSpaceBetweenHeaderFlexElements();
	console.log(spaceBetween, compactnessLevel);

	while (spaceBetween === 0 && compactnessLevel < 4) {
		compactnessLevel++;
		updateMode();
		updatePadding();
		spaceBetween = getSpaceBetweenHeaderFlexElements(); // Recalculate space after adjusting compactness and padding
	}
}

/**
 * Updates the left-right padding of the navigation links (right of logo and left of gear)
 * according to how much space is available.
 */
function updatePadding() {
	const spaceBetween = getSpaceBetweenHeaderFlexElements();

	// If the space is less than 100px, reduce padding gradually
	if (spaceBetween >= 100) {
		// Reset to max padding when space is larger than 100px
		links.forEach(link => {
			link.style.paddingLeft = `${maxPadding}px`;
			link.style.paddingRight = `${maxPadding}px`;
		});
	} else {
		const newPadding = Math.max(minPadding, maxPadding * (spaceBetween / 100));
		links.forEach(link => {
			link.style.paddingLeft = `${newPadding}px`;
			link.style.paddingRight = `${newPadding}px`;
		});
	}
}

function updateMode() {
	if (compactnessLevel === 0) {
		home.classList.remove('compact-1'); // Show the "Infinite Chess" text
		nav.classList.remove('compact-2'); // Show the navigation SVGs
		nav.classList.remove('compact-3'); // Show the navigation TEXT
	} else if (compactnessLevel === 1) {
		home.classList.add('compact-1'); // Hide the "Infinite Chess" text
		nav.classList.remove('compact-2'); // Show the navigation SVGs
		nav.classList.remove('compact-3'); // Show the navigation TEXT
	} else if (compactnessLevel === 2) {
		home.classList.add('compact-1'); // Hide the "Infinite Chess" text
		nav.classList.add('compact-2'); // Hide the navigation SVGs
		nav.classList.remove('compact-3'); // Show the navigation TEXT
	} else if (compactnessLevel === 3) {
		home.classList.add('compact-1'); // Hide the "Infinite Chess" text
		nav.classList.remove('compact-2'); // Show the navigation SVGs
		nav.classList.add('compact-3'); // Hide the navigation TEXT
	}
}

function getSpaceBetweenHeaderFlexElements() {
	const homeRight = home.getBoundingClientRect().right;
	const navLeft = nav.getBoundingClientRect().left;
	return navLeft - homeRight;
}