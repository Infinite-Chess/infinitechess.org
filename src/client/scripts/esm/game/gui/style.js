
"use strict";

/**
 * This script holds common operations on document elements,
 *  as show, hide, fade-after-1s...
 * And it keeps track of our javascript-inserted css in the style element of the html document
 * for things like the color of the navigation bar when theme changes.
 */

const element_style = document.getElementById('style'); // The in-html-doc style element containing css stylings

// What things require styling that our javascript changes?
// * The navigation bar, when the theme changes.
let navigationStyle;

// Add and remove classes

function addClass(element, className) {
	element.classList.add(className);
}

function removeClass(element, className) {
	element.classList.remove(className);
}

// Removes the class, THEN adds it back! This starts over animations
function reinstateClass(element, className) {
	removeClass(element, className);
	addClass(element, className);
}

// Hide and show elements...

/**
 * Hides the provided document element by giving it a class with the property "display: none".
 * @param {HTMLElement} element - The document element
 */
function hideElement(element) {
	addClass(element, "hidden");
}

/**
 * Reveals the provided document element by **removing** the class with the property "display: none".
 * @param {HTMLElement} element - The document element
 */
function revealElement(element) {
	removeClass(element, "hidden");
}


// Other operations

function setNavStyle(cssStyle) {
	navigationStyle = cssStyle;
	onStyleChange();
}

function onStyleChange() {
	updateJavascriptStyling();
}

function updateJavascriptStyling() {
	element_style.innerHTML = navigationStyle; // Other styles can be appended here later
}

/**
 * Gets all children of an element and returns an array of their text contents.
 * @param {HTMLElement} parentElement - The parent element.
 * @returns {string[]} An array of text contents of the child elements.
 */
function getChildrenTextContents(parentElement) {
	// Get all child elements
	const children = parentElement.children;
    
	// Create an array to hold the text contents
	const textContents = [];

	// Loop through the child elements and extract their text content
	for (let i = 0; i < children.length; i++) {
		textContents.push(children[i].textContent);
	}

	return textContents;
}

/**
 * Finds the index of an element within its parent.
 * @param {Element} element - The element to find the index of.
 * @returns {number} - The index of the element within its parent, or -1 if not found.
 */
function getElementIndexWithinItsParent(element) {
	if (!element || !element.parentNode) {
		return -1;
	}

	// Get the parent node
	const parent = element.parentNode;

	// Convert the parent's children to an array and find the index of the element
	const children = Array.prototype.slice.call(parent.children);
	return children.indexOf(element);
}

/**
 * Gets the child element at the specified index of a parent element.
 * @param {Element} parent - The parent element.
 * @param {number} index - The index of the child element.
 * @returns {Element|null} - The child element at the specified index, or null if not found.
 */
function getChildByIndexInParent(parent, index) {
	if (parent && parent.children && index >= 0 && index < parent.children.length) {
		return parent.children[index];
	}
	return null;
}

/**
 * Converts an array of [r, g, b, a], range 0-1, into a valid CSS rgba color string.
 * @param {number[]} colorArray - An array containing [r, g, b, a] values, where r, g, b are in the range [0, 1].
 * @returns {string} A CSS rgba color string.
 */
function arrayToCssColor(colorArray) {
	if (colorArray.length !== 4) throw new Error('Array must have exactly 4 elements: [r, g, b, a].');

	const [r, g, b, a] = colorArray.map((value, index) => {
		if (index < 3) {
			if (value < 0 || value > 1) throw new Error('RGB values must be between 0 and 1.');
			return Math.round(value * 255);
		} else {
			if (value < 0 || value > 1) throw new Error('Alpha value must be between 0 and 1.');
			return value;
		}
	});

	return `rgba(${r}, ${g}, ${b}, ${a})`;
}


export default {
	hideElement,
	revealElement,
	setNavStyle,
	getChildrenTextContents,
	arrayToCssColor,
	getElementIndexWithinItsParent,
	getChildByIndexInParent,
};