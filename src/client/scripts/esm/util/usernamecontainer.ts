
/**
 * This script provides functionalities for the username container that contains the players' username, elo etc.
 */

// @ts-ignore
import languagedropdown from "../components/header/dropdowns/languagedropdown.js";
import metadata from "../chess/util/metadata.js";
import docutil from "./docutil.js";


import type { Rating } from "../../../../server/database/leaderboardsManager.js";


// Types ----------------------------------------------------------------------------------------



/**
 * Such an object contains all display information for a given user
 */
type UsernameContainer = {
	properties: UsernameContainerProperties,
	/** A reference to the documant element container. */
	element: HTMLDivElement,
}


/**
 * Settings for creating HTML elements out of username containers
 */
type UsernameContainerProperties = {
	/** 
	 * Player => Clickable hyperlink to the user's profile
	 * Guest => No clickable hyperlink
	 * Engine => No clickable hyperlink, AND a unique SVG icon
	 */
	type: UsernameContainerType,
	username: UsernameItem,
	rating?: {
		value: number,
		confident: boolean,
		change?: number,
	}
}

type UsernameContainerType = 'player' | 'guest' | 'engine';
type UsernameItem = {
	/** The actual username. */
	value: string,
	/**
	 * Whether clicking the username should open their profile in a new window or not.
	 * IGNORED IF TYPE === 'engine' or 'guest'.
	 */
	openInNewWindow: boolean,
}
type RatingItem = {
	/** The actual rating */
	value: number,
	/** Whether the rating is confident or not (low RD). If not confident, a question mark "?" is shown. */
	confident: boolean,
	/** The change in rating of the current match, if available. */
	change?: number,
}



// Variables ----------------------------------------------------------------------------------------


const profileSVGSource = '<svg class="svg-profile" xmlns="http://www.w3.org/2000/svg" fill="#000" stroke="#000" version="1.1" viewBox="0 0 2000 2000"><path d="M1656 1800H344c-70 0-123-70-96-134C370 1370 662 1200 1000 1200s629 170 752 466c27 64-25 134-96 134M592 600c0-220 183-400 408-400s408 180 408 400-183 400-408 400a405 405 0 01-408-400m1404 1164a952 952 0 00-612-697 593 593 0 00 220-560 610 610 0 00-530-503A608 608 0 00 388 600c0 190 89 357 228 467a952 952 0 00-612 697c-27 122 74 236 200 236h1590c128 0 229-114 200-236" fill="#555" fill-rule="evenodd" stroke="none"/></svg>';
const engineSVGSource = '<svg class="svg-engine" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 240 240"><path d="M90 20v30m60-30v30M90 190v30m60-30v30m40-130h30m-30 50h30M20 90h30m-30 50h30m48 50h44c17 0 25 0 32-3a30 30 0 00 13-13c3-7 3-15 3-32V98c0-17 0-25-3-32a30 30 0 00-13-13c-7-3-15-3-32-3H98c-17 0-25 0-32 3a30 30 0 00-13 13C50 73 50 81 50 98v44c0 17 0 25 3 32 3 5 8 10 13 13 7 3 15 3 32 3Z" stroke="#555" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/></svg>';


// General functions ----------------------------------------------------------------------------------------


/**
 * Creates an HTML Div Element containing all information to be shown about a UsernameContainer
 * @param usernamecontainer - contains information for a given user
 * @param options - settings for how to display information
 * @returns HTMLDivElement
 */
function createUsernameContainer(type: UsernameContainerType, username: UsernameItem, rating?: RatingItem) : UsernameContainer {
	const containerDiv = document.createElement('div');

	// Profile SVG element
	const svgSource = type === 'engine' ? engineSVGSource : profileSVGSource;
	const svgElement = docutil.createSvgElementFromString(svgSource);
	containerDiv.appendChild(svgElement);

	
	if (type === 'player') { // Hyperlink
		const usernameHyper = document.createElement('a');
		usernameHyper.href = languagedropdown.addLngQueryParamToLink(`/member/${username.value}`);
		usernameHyper.textContent = username.value;
		if (username.openInNewWindow) usernameHyper.target = '_blank';
		usernameHyper.classList.add("username");
		usernameHyper.setAttribute('user-type', type); // Alows this container's properties to be reconstructed by other scripts from just the HTML element
		containerDiv.appendChild(usernameHyper);
	} else { // No hyperlink
		const usernameDiv = document.createElement('div');
		usernameDiv.textContent = username.value;
		usernameDiv.classList.add("username");
		usernameDiv.setAttribute('user-type', type); // Alows this container's properties to be reconstructed by other scripts from just the HTML element
		containerDiv.appendChild(usernameDiv);
	}

	// rating element
	if (rating) {
		const eloDiv = document.createElement('div');
		eloDiv.classList.add("elo");
		containerDiv.appendChild(eloDiv);

		// Rating change element
		if (rating.change !== undefined) {
			const eloChangeDiv = document.createElement('div');
			eloChangeDiv.classList.add("eloChange");
			containerDiv.appendChild(eloChangeDiv);
		}
	}

	containerDiv.classList.add("username-embed");

	// Construct the UsernameContainer object

	const properties: UsernameContainerProperties = {
		type,
		username,
	};
	if (rating) properties.rating = rating;

	const usernameContainer: UsernameContainer = {
		properties,
		element: containerDiv,
	};

	updateUsernameContainerRatingTextContent(usernameContainer);

	return usernameContainer;
}

/**
 * Extracts the UsernameContainerProperties from a physical html element username container.
 * @param containerDiv - the HTMLDivElement to extract information from
 * @returns a freshly created UsernameContainer or undefined, if this failed
 */
function extractPropertiesFromUsernameContainerElement(containerDiv: HTMLDivElement) : UsernameContainerProperties {
	if (!containerDiv.classList.contains('username-embed')) throw Error("Cannot extract username container from element that is not a username embed!");

	// Reconstruct type and username
	const usernameElem = containerDiv.querySelector('.username')!;
	const result: UsernameContainerProperties = {
		type: containerDiv.getAttribute('user-type') as UsernameContainerType,
		username: {
			value: usernameElem.textContent!,
			openInNewWindow: usernameElem.getAttribute('target') === '_blank'
		}
	};

	// Reconstruct rating
	const eloElem = containerDiv.querySelector('.elo');
	if (eloElem) result.rating = JSON.parse(eloElem.getAttribute('rating')!) as RatingItem;

	return result;
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

	// Append child to parent
	parent_element.appendChild(child_element);
}

/**
 * Test's if the mouse click event was inside a username embed.
 * @param event
 * @returns The nearest .username-embed element, or null if the click was outside
 */
function wasEventClickInsideUsernameContainer(event: MouseEvent): boolean {
	const targetNode = event.target as Node;
	const el = targetNode instanceof Element ? targetNode : targetNode.parentElement;
	return el?.closest<HTMLDivElement>('.username-embed') !== null;
}

/** Adds the elo change div to an existing username container. */
function createEloChangeItem(usernamecontainer: UsernameContainer, newRating: Rating, ratingChange: number) {
	if (!usernamecontainer.properties.rating) throw Error("Cannot create elo change item for usernamecontainer without rating!");

	// Update rating in usernamecontainer
	usernamecontainer.properties.rating = {
		value: newRating.value,
		confident: newRating.confident,
		change: ratingChange,
	};

	// rating change element
	const eloChangeDiv = document.createElement('div');
	eloChangeDiv.classList.add("eloChange");
	usernamecontainer.element.appendChild(eloChangeDiv);

	updateUsernameContainerRatingTextContent(usernamecontainer);
}

/**
 * Updates the text contents of each of the username container element's rating elements,
 * according to the values in the usernamecontainer properties..
 */
function updateUsernameContainerRatingTextContent(usernamecontainer: UsernameContainer) {
	const element = usernamecontainer.element;

	// Update the rating
	if (usernamecontainer.properties.rating) {
		const eloElem = element.querySelector('.elo') as HTMLDivElement;
		const displayRating = metadata.getWhiteBlackElo(usernamecontainer.properties.rating);
		eloElem.textContent = `(${displayRating})`;
		eloElem.setAttribute('rating', JSON.stringify(usernamecontainer.properties.rating)); // Allows this container's properties to be reconstructed by other scripts from just the HTML element

		// Update the rating change, if available
		if (usernamecontainer.properties.rating.change !== undefined) {
			const eloChangeDiv = element.querySelector('.eloChange')!;
			eloChangeDiv.textContent = metadata.getWhiteBlackRatingDiff(usernamecontainer.properties.rating.change);
			// Color the ratingchange green or red, depending on its positivity
			if (usernamecontainer.properties.rating.change >= 0) {
				eloChangeDiv.classList.add("positive");
				eloChangeDiv.classList.remove("negative");
			} else {
				eloChangeDiv.classList.add("negative");
				eloChangeDiv.classList.remove("positive");
			}
		}
	}
}


export default {
	createUsernameContainer,
	extractPropertiesFromUsernameContainerElement,
	embedUsernameContainerDisplayIntoParent,
	wasEventClickInsideUsernameContainer,
	createEloChangeItem,
};

export type {
	UsernameContainer,
	UsernameContainerProperties,
	UsernameItem,
	RatingItem,
};