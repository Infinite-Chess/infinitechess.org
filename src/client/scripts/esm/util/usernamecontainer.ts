
/**
 * This script provides functionalities for the username container that contains the players' username, elo etc.
 */



// Types ----------------------------------------------------------------------------------------


/**
 * Such an object contains all display information for a given user
 */
type UsernameContainer = {
	username: string,
	displayrating?: string | null
}

/**
 * Settings for creating HTML elements out of username containers
 */
type UsernameContainerDisplayOptions = {
    /** Whether to make the username a clickable hyperlink */
    makehyperlink?: boolean,
	/** Hyperlink target. By default, '_blank' is used. */
	hyperlinktarget?: string,
    /** Whether to show the displayrating entry if it exists */
    showrating?: boolean
	/** Whether the player is an engine (we'll use a different svg) */
	isEngine?: boolean
}


// Variables ----------------------------------------------------------------------------------------


const profileSVGSource = '<svg class="svg-profile" xmlns="http://www.w3.org/2000/svg" fill="#000" stroke="#000" version="1.1" viewBox="0 0 2000 2000"><path d="M1656 1800H344c-70 0-123-70-96-134C370 1370 662 1200 1000 1200s629 170 752 466c27 64-25 134-96 134M592 600c0-220 183-400 408-400s408 180 408 400-183 400-408 400a405 405 0 01-408-400m1404 1164a952 952 0 00-612-697 593 593 0 00 220-560 610 610 0 00-530-503A608 608 0 00 388 600c0 190 89 357 228 467a952 952 0 00-612 697c-27 122 74 236 200 236h1590c128 0 229-114 200-236" fill="#555" fill-rule="evenodd" stroke="none"/></svg>';
const engineSVGSource = '<svg class="svg-engine" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 240 240"><path d="M90 20v30m60-30v30M90 190v30m60-30v30m40-130h30m-30 50h30M20 90h30m-30 50h30m48 50h44c17 0 25 0 32-3a30 30 0 00 13-13c3-7 3-15 3-32V98c0-17 0-25-3-32a30 30 0 00-13-13c-7-3-15-3-32-3H98c-17 0-25 0-32 3a30 30 0 00-13 13C50 73 50 81 50 98v44c0 17 0 25 3 32 3 5 8 10 13 13 7 3 15 3 32 3Z" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/></svg>';


// General functions ----------------------------------------------------------------------------------------


/**
 * Creates an HTML Div Element containing all information to be shown about a UsernameContainer
 * @param usernamecontainer - contains information for a given user
 * @param options - settings for how to display information
 * @returns HTMLDivElement
 */
function createUsernameContainerDisplay(usernamecontainer: UsernameContainer, options: UsernameContainerDisplayOptions = {}) : HTMLDivElement {
	const containerDiv = document.createElement('div');

	// Profile SVG element
	const svgSource = options.isEngine ? engineSVGSource : profileSVGSource;
	const svgElement = createSvgElementFromString(svgSource);
	containerDiv.appendChild(svgElement);

	// username element
	if (options?.makehyperlink) {
		const usernameHyper = document.createElement('a');
		usernameHyper.href = `/member/${usernamecontainer.username}`;
		usernameHyper.textContent = usernamecontainer.username;
		usernameHyper.target = options?.hyperlinktarget !== undefined ? options.hyperlinktarget : '_blank';
		usernameHyper.classList.add("username");
		containerDiv.appendChild(usernameHyper);
	}
	else {
		const usernameDiv = document.createElement('div');
		usernameDiv.textContent = usernamecontainer.username;
		usernameDiv.classList.add("username");
		containerDiv.appendChild(usernameDiv);
	}

	// rating element
	if (options?.showrating && usernamecontainer?.displayrating !== undefined && usernamecontainer?.displayrating !== null ) {
		const eloDiv = document.createElement('div');
		eloDiv.textContent = usernamecontainer.displayrating;
		eloDiv.classList.add("elo");
		containerDiv.appendChild(eloDiv);
	}

	containerDiv.classList.add("username-embed");

	return containerDiv;
}

/**
 * Set child_element as the only content of parent_element, with the same classes and styling
 * @param child_element 
 * @param parent_element 
 */
function embedUsernameContainerDisplayIntoParent(child_element: HTMLDivElement, parent_element: HTMLElement) {
	// First clear all other content of parent_element
	while (parent_element.firstChild) {
		parent_element.removeChild(parent_element.firstChild);
	}

	// append child to parent
	parent_element.appendChild(child_element);
}

/**
 * Parse an SVG string into a live SVGElement.
 * @param svgText — a string containing valid `<svg>…</svg>` markup
 * @returns the newly created SVG element
 */
function createSvgElementFromString(svgText: string): SVGElement {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgText, 'image/svg+xml');
	const svg = doc.querySelector('svg');
	if (!svg) throw new Error('Failed to parse SVG string.');
	return svg;
}

// Invite-text specific functions ----------------------------------------------------------------------------------------


/**
 * Parse a UsernameContainer object into a text string, as it should appear on an invite
 */
function parseUsernameContainerToInviteText(usernamecontainer: UsernameContainer) : string {
	return usernamecontainer?.displayrating === undefined ? usernamecontainer.username : `${usernamecontainer.username} (${usernamecontainer.displayrating})`;
}

/**
 * Parse a text string appearing on an invite into a UsernameContainer object
 */
function parseInviteTextToUsernameContainer(text: string) : UsernameContainer {
	const elo_index = text.search(/\(?-?[0-9]/);
	if (elo_index === -1) return {username: text}; // contains no display elo
	else return { // contains display elo
		username: text.slice(0, elo_index).trimEnd(),
		displayrating: text.slice(elo_index).replace(/[()]/g, "")
	};
}


export default {
	createUsernameContainerDisplay,
	embedUsernameContainerDisplayIntoParent,
	parseUsernameContainerToInviteText,
	parseInviteTextToUsernameContainer
};

export type {
	UsernameContainer,
	UsernameContainerDisplayOptions
};