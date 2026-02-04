// src/client/scripts/esm/util/usernamecontainer.ts

/**
 * This script provides functionalities for the username container that contains the players' username, elo etc.
 */

import languagedropdown from '../components/header/dropdowns/languagedropdown.js';
import metadata from '../../../../shared/chess/util/metadata.js';
import docutil from './docutil.js';

import type { Rating } from '../../../../server/database/leaderboardsManager.js';
import type { ServerUsernameContainer } from '../../../../shared/types.js';

// Types ----------------------------------------------------------------------------------------

/**
 * Such an object contains all display information for a given user
 */
type UsernameContainer = {
	properties: UsernameContainerProperties;
	/** A reference to the documant element container. */
	element: HTMLDivElement;
	/** Cancel functions for any running `animateNumber` calls. */
	animationCancels: Function[];
};

/**
 * Settings for creating HTML elements out of username containers
 */
type UsernameContainerProperties = {
	/**
	 * Player => Clickable hyperlink to the user's profile
	 * Guest => No clickable hyperlink
	 * Engine => No clickable hyperlink, AND a unique SVG icon
	 */
	type: UsernameContainerType;
	username: UsernameItem;
	rating?: {
		value: number;
		confident: boolean;
		change?: number;
	};
};

type UsernameContainerType = 'player' | 'guest' | 'engine';
type UsernameItem = {
	/** The actual username. */
	value: string;
	/**
	 * Whether clicking the username should open their profile in a new window or not.
	 * IGNORED IF TYPE === 'engine' or 'guest'.
	 */
	openInNewWindow: boolean;
};
type RatingItem = {
	/** The actual rating */
	value: number;
	/** Whether the rating is confident or not (low RD). If not confident, a question mark "?" is shown. */
	confident: boolean;
	/** The change in rating of the current match, if available. */
	change?: number;
};

// Variables ----------------------------------------------------------------------------------------

const profileSVGSource =
	'<svg class="svg-profile" xmlns="http://www.w3.org/2000/svg" fill="#000" stroke="#000" version="1.1" viewBox="0 0 2000 2000"><path d="M1656 1800H344c-70 0-123-70-96-134C370 1370 662 1200 1000 1200s629 170 752 466c27 64-25 134-96 134M592 600c0-220 183-400 408-400s408 180 408 400-183 400-408 400a405 405 0 01-408-400m1404 1164a952 952 0 00-612-697 593 593 0 00 220-560 610 610 0 00-530-503A608 608 0 00 388 600c0 190 89 357 228 467a952 952 0 00-612 697c-27 122 74 236 200 236h1590c128 0 229-114 200-236" fill="#555" fill-rule="evenodd" stroke="none"/></svg>';
const engineSVGSource =
	'<svg class="svg-engine" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 240 240"><path d="M90 20v30m60-30v30M90 190v30m60-30v30m40-130h30m-30 50h30M20 90h30m-30 50h30m48 50h44c17 0 25 0 32-3a30 30 0 00 13-13c3-7 3-15 3-32V98c0-17 0-25-3-32a30 30 0 00-13-13c-7-3-15-3-32-3H98c-17 0-25 0-32 3a30 30 0 00-13 13C50 73 50 81 50 98v44c0 17 0 25 3 32 3 5 8 10 13 13 7 3 15 3 32 3Z" stroke="#555" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/></svg>';

// General functions ----------------------------------------------------------------------------------------

/**
 * Creates an HTML Div Element containing all information to be shown about a UsernameContainer
 * @param usernamecontainer - contains information for a given user
 * @param options - settings for how to display information
 * @returns HTMLDivElement
 */
function createUsernameContainer(
	type: UsernameContainerType,
	username: UsernameItem,
	rating?: RatingItem,
): UsernameContainer {
	const containerDiv = document.createElement('div');

	// Profile SVG element
	const svgSource = type === 'engine' ? engineSVGSource : profileSVGSource;
	const svgElement = docutil.createSvgElementFromString(svgSource);
	containerDiv.appendChild(svgElement);

	if (type === 'player') {
		// Hyperlink
		const usernameHyper = document.createElement('a');
		usernameHyper.href = languagedropdown.addLngQueryParamToLink(
			`/member/${username.value.toLowerCase()}`,
		);
		usernameHyper.textContent = username.value;
		if (username.openInNewWindow) usernameHyper.target = '_blank';
		usernameHyper.classList.add('username');
		usernameHyper.setAttribute('user-type', type); // Alows this container's properties to be reconstructed by other scripts from just the HTML element
		containerDiv.appendChild(usernameHyper);
	} else {
		// No hyperlink
		const usernameDiv = document.createElement('div');
		usernameDiv.textContent = username.value;
		usernameDiv.classList.add('username');
		usernameDiv.setAttribute('user-type', type); // Alows this container's properties to be reconstructed by other scripts from just the HTML element
		containerDiv.appendChild(usernameDiv);
	}

	// rating element
	if (rating) {
		const eloDiv = document.createElement('div');
		eloDiv.classList.add('elo');
		containerDiv.appendChild(eloDiv);

		// Rating change element
		if (rating.change !== undefined) {
			const eloChangeDiv = document.createElement('div');
			eloChangeDiv.classList.add('eloChange');
			containerDiv.appendChild(eloChangeDiv);
		}
	}

	containerDiv.classList.add('username-embed');

	// Construct the UsernameContainer object

	const properties: UsernameContainerProperties = {
		type,
		username,
	};
	if (rating) properties.rating = rating;

	// Build the container object
	const usernameContainer: UsernameContainer = {
		properties,
		element: containerDiv,
		animationCancels: [],
	};

	updateUsernameContainerRatingTextContent(usernameContainer);

	// If we have a rating change, animate that text
	if (rating?.change !== undefined) {
		const oldValue = rating.value - rating.change;
		animateRatingChange(
			usernameContainer,
			oldValue,
			rating.value,
			rating.change,
			rating.confident,
		);
	}

	return usernameContainer;
}

/**
 * Extracts the UsernameContainerProperties from a physical html element username container.
 * @param containerDiv - the HTMLDivElement to extract information from
 * @returns a freshly created UsernameContainer or undefined, if this failed
 */
function extractPropertiesFromUsernameContainerElement(
	containerDiv: HTMLDivElement,
): ServerUsernameContainer {
	if (!containerDiv.classList.contains('username-embed'))
		throw Error('Cannot extract username container from element that is not a username embed!');

	// Reconstruct type and username
	const usernameElem = containerDiv.querySelector('.username')!;
	const type = usernameElem.getAttribute('user-type') as 'player' | 'guest';
	if (!type)
		throw Error(
			'Cannot extract username container from element that does not have a user-type attribute!',
		);
	const result: ServerUsernameContainer = {
		type,
		username: usernameElem.textContent!,
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
function embedUsernameContainerDisplayIntoParent(
	child_element: HTMLDivElement,
	parent_element: HTMLElement,
): void {
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
function createEloChangeItem(
	usernamecontainer: UsernameContainer,
	newRating: Rating,
	ratingChange: number,
): void {
	if (!usernamecontainer.properties.rating)
		throw Error('Cannot create elo change item for usernamecontainer without rating!');

	// Previous rating value
	const oldValue = usernamecontainer.properties.rating.value;

	// Update rating in usernamecontainer
	usernamecontainer.properties.rating = {
		value: newRating.value,
		confident: newRating.confident,
		change: ratingChange,
	};

	// rating change element
	const eloChangeDiv = document.createElement('div');
	eloChangeDiv.classList.add('eloChange');
	usernamecontainer.element.appendChild(eloChangeDiv);

	updateUsernameContainerRatingTextContent(usernamecontainer);

	// Animate...
	animateRatingChange(
		usernamecontainer,
		oldValue,
		newRating.value,
		ratingChange,
		newRating.confident,
	);
}

/**
 * Updates the text contents of each of the username container element's rating elements,
 * according to the values in the usernamecontainer properties..
 */
function updateUsernameContainerRatingTextContent(usernamecontainer: UsernameContainer): void {
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
			eloChangeDiv.textContent = metadata.getWhiteBlackRatingDiff(
				usernamecontainer.properties.rating.change,
			);
			// Color the ratingchange green or red, depending on its positivity
			if (usernamecontainer.properties.rating.change >= 0) {
				eloChangeDiv.classList.add('positive');
				eloChangeDiv.classList.remove('negative');
			} else {
				eloChangeDiv.classList.add('negative');
				eloChangeDiv.classList.remove('positive');
			}
		}
	}
}

// Animating Elo Changes ----------------------------------------------------------------------------------------

/**
 * Returns a function that formats an elo value into a string for going into the `.elo` element's textContent.
 * This function goes into the {@link animateNumber} as the `valueFormatter` parameter.
 * @param confident - Whether the new rating is confident or not.
 * @returns A function that takes a numeric value and returns the formatted text content for the elo rating.
 */
function createEloFormatter(confident: boolean): (_value: number) => string {
	// Create a text content generator
	return (value: number): string => {
		const rating: Rating = { value, confident };
		const displayRating = metadata.getWhiteBlackElo(rating);
		return `(${displayRating})`;
	};
}

/**
 * Animate both the main Elo and its Δ for a given container.
 * @param container — the UsernameContainer whose elements we’ll animate
 * @param oldValue  — rating before the change
 * @param newValue  — rating after the change
 * @param change    — the Δ to display (can be positive or negative)
 * @param confident — whether the rating is “confident” (for formatting)
 */
function animateRatingChange(
	container: UsernameContainer,
	oldValue: number,
	newValue: number,
	change: number,
	confident: boolean,
): void {
	const DURATION = 1000; // ms for both animations

	// find our two elements
	const eloElem = container.element.querySelector('.elo')! as HTMLElement;
	const deltaElem = container.element.querySelector('.eloChange')! as HTMLElement;

	// tween the main rating
	const mainAnim = animateNumber(
		eloElem,
		oldValue,
		newValue,
		DURATION,
		undefined,
		createEloFormatter(confident),
	);
	container.animationCancels.push(mainAnim.cancel);

	// tween the change Δ
	const changeAnim = animateNumber(
		deltaElem,
		0,
		change,
		DURATION,
		undefined,
		metadata.getWhiteBlackRatingDiff,
	);
	container.animationCancels.push(changeAnim.cancel);
}

/**
 * Animate a numeric text value in an element from `start` to `end` over `duration` ms,
 * using a custom easing function and optional text content formatter.
 * @param element — the element whose `.textContent` will be updated
 * @param start — starting number
 * @param end — ending number
 * @param durationMillis — total time, in milliseconds, for the animation
 * @param easingFn — easing function (t from 0→1); defaults to an ease-out curve
 * @param valueFormatter — optional function that receives the current numeric value
 *     and returns the string to set as textContent; defaults to `v => v.toLocaleString()`
 * @returns An object with a `cancel()` method to stop the animation early.
 */
function animateNumber(
	element: HTMLElement,
	start: number,
	end: number,
	durationMillis: number,
	easingFn: (_t: number) => number = (t) => 1 - Math.pow(1 - t, 2), // Default: ease-out
	valueFormatter: (_value: number) => string = (v) => v.toLocaleString(),
): { cancel(): void } {
	let frameId: number | null = null;
	let cancelled = false;
	const range = end - start;
	const startTime = performance.now();

	/**
	 * Internal step function for requestAnimationFrame
	 * @param now — high-resolution timestamp passed by rAF
	 */
	function step(now: DOMHighResTimeStamp): void {
		if (cancelled) return;
		const elapsed = now - startTime;
		const progress = Math.min(elapsed / durationMillis, 1);
		const eased = easingFn(progress);
		const current = Math.round(start + range * eased);
		element.textContent = valueFormatter(current);

		if (progress < 1) frameId = requestAnimationFrame(step);
	}

	frameId = requestAnimationFrame(step);

	return {
		/** Cancel the animation at its next opportunity */
		cancel(): void {
			cancelled = true;
			if (frameId !== null) cancelAnimationFrame(frameId);
		},
	};
}

// Exports ----------------------------------------------------------------------------------------

export default {
	createUsernameContainer,
	extractPropertiesFromUsernameContainerElement,
	embedUsernameContainerDisplayIntoParent,
	wasEventClickInsideUsernameContainer,
	createEloChangeItem,
};

export type { UsernameContainer, UsernameContainerProperties, UsernameItem, RatingItem };
