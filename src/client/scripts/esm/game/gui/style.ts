/**
 * Utility function for html elements and styles.
 *
 * It also keeps track of our javascript-inserted css in the style element of the html document
 * for things like the color of the navigation bar when theme changes.
 */

import type { Color } from '../../../../../shared/util/math/math';

// Types -------------------------------------------------------------

/** HSL Color representation */
interface HSLColor {
	/** Hue (0 - 360) */
	h: number;
	/** Saturation (0.0 - 1.0) */
	s: number;
	/** Lightness (0.0 - 1.0) */
	l: number;
}

// Constants -------------------------------------------------------------

/** SVG default namespace */
const SVG_NS = 'http://www.w3.org/2000/svg';

// Elements  -------------------------------------------------------------

const element_style = document.getElementById('style')!; // The in-html-doc style element containing css stylings

// Variables  -------------------------------------------------------------

// What things require styling that our javascript changes?
// * The navigation bar, when the theme changes.
let navigationStyle: string;

// Functions -------------------------------------------------------------

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
		return parent.children[index]!;
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

/**
 * Converts RGB components to an HSL Color.
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @returns HSLColor object
 */
function rgbToHsl(r: number, g: number, b: number): HSLColor {
	const rN = r / 255;
	const gN = g / 255;
	const bN = b / 255;

	const max = Math.max(rN, gN, bN);
	const min = Math.min(rN, gN, bN);

	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

		switch (max) {
			case rN:
				h = (gN - bN) / d + (gN < bN ? 6 : 0);
				break;
			case gN:
				h = (bN - rN) / d + 2;
				break;
			case bN:
				h = (rN - gN) / d + 4;
				break;
		}
		h /= 6;
	}

	return { h: h * 360, s, l };
}

export default {
	SVG_NS,

	setNavStyle,
	arrayToCssColor,
	getElementIndexWithinItsParent,
	getChildByIndexInParent,
	rgbToHsl,
};
