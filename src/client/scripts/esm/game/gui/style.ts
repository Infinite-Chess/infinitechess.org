/**
 * This script holds common operations on document elements,
 *  as show, hide, fade-after-1s...
 * And it keeps track of our javascript-inserted css in the style element of the html document
 * for things like the color of the navigation bar when theme changes.
 */

import type { Color } from '../../../../../shared/util/math/math';

const element_style = document.getElementById('style')!; // The in-html-doc style element containing css stylings

// What things require styling that our javascript changes?
// * The navigation bar, when the theme changes.
let navigationStyle: string;

// Other operations

function setNavStyle(cssStyle: string): void {
	navigationStyle = cssStyle;
	// Update the style element
	element_style.innerHTML = navigationStyle; // Other styles can be appended here later
}

/**
 * Finds the index of an element within its parent.
 * @param element - The element to find the index of.
 * @returns - The index of the element within its parent, or -1 if not found.
 */
function getElementIndexWithinItsParent(element: Element): number {
	if (!element || !element.parentNode) return -1;

	// Get the parent node
	const parent = element.parentNode;

	// Convert the parent's children to an array and find the index of the element
	const children = Array.prototype.slice.call(parent.children);
	return children.indexOf(element);
}

/**
 * Gets the child element at the specified index of a parent element.
 * @param parent - The parent element.
 * @param index - The index of the child element.
 * @returns The child element at the specified index, or null if not found.
 */
function getChildByIndexInParent(parent: Element, index: number): Element | null {
	if (parent && parent.children && index >= 0 && index < parent.children.length) {
		return parent.children[index];
	}
	return null;
}

/**
 * Converts an array of [r, g, b, a], range 0-1, into a valid CSS rgba color string.
 * @param colorArray - An array containing [r, g, b, a] values, where r, g, b are in the range [0, 1].
 * @returns A CSS rgba color string.
 */
function arrayToCssColor(colorArray: Color): string {
	if (colorArray.length !== 4)
		throw new Error('Array must have exactly 4 elements: [r, g, b, a].');

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
	setNavStyle,
	arrayToCssColor,
	getElementIndexWithinItsParent,
	getChildByIndexInParent,
};
