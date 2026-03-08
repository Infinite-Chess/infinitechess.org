// src/client/scripts/esm/game/gui/boardeditor/guifloatingwindow.ts

/**
 * Handles reusable floating window behavior in the board editor:
 * - open/close/toggle
 * - draggable by header (mouse + touch)
 * - clamped to a parent container
 * - remembers last position while open
 */

import math from '../../../../../../shared/util/math/math';

// Elements ----------------------------------------------------------

const element_boardUI = document.getElementById('boardUI')!;
const element_menu = document.getElementById('editor-menu')!;
const element_menuToggle = document.getElementById('editor-menu-toggle')!;

// Constants -----------------------------------------------------------

/**
 * The viewport width (px) below which the sidebar switches to overlay/collapsible mode.
 * MUST MATCH the CSS @media max-width value in play.css — CSS variables cannot
 * be used in media queries, so this value must be kept in sync manually.
 */
const NARROW_THRESHOLD = 727;

// Types -------------------------------------------------------------

/** Functions that handle all floating window behavior */
interface FloatingWindowHandle {
	open: () => void;
	close: (resetPositioning: boolean) => void;
	resetPositioning: () => void;
	clampToParentBounds: () => void;
	isOpen: () => boolean;
}

/** Options for initializing a floating window in the board editor */
interface FloatingWindowOptions {
	/** Floating window element */
	windowEl: HTMLElement;

	/** Header element of floating window */
	headerEl: HTMLElement;

	/** Close button inside the floating window */
	closeButtonEl: HTMLElement;

	/** Optional list of input elements in floating window. They will get deselected on any click outside the floating window */
	inputElList?: HTMLInputElement[];

	/** Called after the floating window opens (use for window-specific listeners) */
	onOpen: () => void;

	/** Called after the floating window closes (use for window-specific listener cleanup) */
	onClose: (resetPositioning: boolean) => void;
}

// Utilities -------------------------------------------------------------

/** Create the functions needed for the handling of a floating window in the board editor */
function create(opts: FloatingWindowOptions): FloatingWindowHandle {
	const { windowEl, headerEl, closeButtonEl, inputElList, onOpen, onClose } = opts;

	// Window Position & Dragging State
	let offsetX = 0;
	let offsetY = 0;
	let isDragging = false;
	let savedPos: { left: number; top: number } | undefined;

	function clampToParentBounds(): void {
		const parentRect = element_boardUI.getBoundingClientRect();
		const elWidth = windowEl.offsetWidth;
		const elHeight = windowEl.offsetHeight;

		const newLeft = math.clamp(windowEl.offsetLeft, 0, parentRect.width - elWidth);
		const newTop = math.clamp(windowEl.offsetTop, 0, parentRect.height - elHeight);

		windowEl.style.left = `${newLeft}px`;
		windowEl.style.top = `${newTop}px`;
		savedPos = { left: newLeft, top: newTop };
	}

	// --- Dragging ---
	function startDrag(clientX: number, clientY: number): void {
		isDragging = true;
		offsetX = clientX - windowEl.offsetLeft;
		offsetY = clientY - windowEl.offsetTop;
		document.body.style.userSelect = 'none';
	}

	function startMouseDrag(e: MouseEvent): void {
		startDrag(e.clientX, e.clientY);
	}

	function startTouchDrag(e: TouchEvent): void {
		if (e.touches.length === 1) {
			const touch = e.touches[0]!;
			startDrag(touch.clientX, touch.clientY);
		}
	}

	function stopDrag(): void {
		if (isDragging) clampToParentBounds();
		isDragging = false;
		document.body.style.userSelect = 'auto';
	}

	function duringDrag(clientX: number, clientY: number): void {
		if (!isDragging) return;

		const parentRect = element_boardUI.getBoundingClientRect();
		const elWidth = windowEl.offsetWidth;
		const elHeight = windowEl.offsetHeight;

		const newLeft = clientX - offsetX;
		const newTop = clientY - offsetY;

		const clampedLeft = math.clamp(newLeft, 0, parentRect.width - elWidth);
		const clampedTop = math.clamp(newTop, 0, parentRect.height - elHeight);

		windowEl.style.left = `${clampedLeft}px`;
		windowEl.style.top = `${clampedTop}px`;
		savedPos = { left: clampedLeft, top: clampedTop };
	}

	function duringMouseDrag(e: MouseEvent): void {
		duringDrag(e.clientX, e.clientY);
	}

	function duringTouchDrag(e: TouchEvent): void {
		if (e.touches.length === 1) {
			if (isDragging) e.preventDefault(); // prevent scrolling
			const touch = e.touches[0]!;
			duringDrag(touch.clientX, touch.clientY);
		}
	}

	/** Deselects input boxes when pressing Enter */
	function blurOnEnter(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			(e.target as HTMLInputElement).blur();
		}
	}

	/** Deselects input boxes when clicking somewhere outside the floating window */
	function blurOnClickorTouchOutside(e: MouseEvent | TouchEvent): void {
		if (inputElList === undefined) return;
		if (!windowEl.contains(e.target as Node)) {
			const activeEl = document.activeElement as HTMLInputElement;
			if (activeEl && inputElList.includes(activeEl) && activeEl.tagName === 'INPUT') {
				activeEl.blur();
			}
		}
	}

	/** Initialize general floating window listeners */
	function initBaseListeners(): void {
		headerEl.addEventListener('mousedown', startMouseDrag);
		document.addEventListener('mousemove', duringMouseDrag);
		document.addEventListener('mouseup', stopDrag);

		headerEl.addEventListener('touchstart', startTouchDrag, { passive: false });
		document.addEventListener('touchmove', duringTouchDrag, { passive: false });
		document.addEventListener('touchend', stopDrag, { passive: false });

		window.addEventListener('resize', clampToParentBounds);

		if (closeButtonEl) closeButtonEl.addEventListener('click', callbackClose);

		if (inputElList) {
			inputElList.forEach((el) => {
				if (el.type === 'text') el.addEventListener('keydown', blurOnEnter);
			});
			document.addEventListener('click', blurOnClickorTouchOutside);
			document.addEventListener('touchstart', blurOnClickorTouchOutside);
		}
	}

	/** Close general floating window listeners */
	function removeBaseListeners(): void {
		headerEl.removeEventListener('mousedown', startMouseDrag);
		document.removeEventListener('mousemove', duringMouseDrag);
		document.removeEventListener('mouseup', stopDrag);

		headerEl.removeEventListener('touchstart', startTouchDrag);
		document.removeEventListener('touchmove', duringTouchDrag);
		document.removeEventListener('touchend', stopDrag);

		window.removeEventListener('resize', clampToParentBounds);

		if (closeButtonEl) closeButtonEl.removeEventListener('click', callbackClose);

		if (inputElList) {
			inputElList.forEach((el) => {
				if (el.type === 'text') el.removeEventListener('keydown', blurOnEnter);
			});
			document.removeEventListener('click', blurOnClickorTouchOutside);
			document.removeEventListener('touchstart', blurOnClickorTouchOutside);
		}
	}

	function isOpen(): boolean {
		return !windowEl.classList.contains('hidden');
	}

	function callbackClose(): void {
		close(false);
	}

	function close(resetPositioning: boolean): void {
		windowEl.classList.add('hidden');

		onClose(resetPositioning);
		removeBaseListeners();
	}

	function resetPositioning(): void {
		windowEl.style.left = '';
		windowEl.style.top = '';
		savedPos = undefined;
	}

	/**
	 * Returns the rendered width of the window.
	 * If currently hidden, temporarily makes it invisible-but-laid-out to measure it.
	 */
	function measureWidth(): number {
		if (!windowEl.classList.contains('hidden')) return windowEl.offsetWidth;
		windowEl.style.visibility = 'hidden';
		windowEl.classList.remove('hidden');
		const w = windowEl.offsetWidth;
		windowEl.classList.add('hidden');
		windowEl.style.visibility = '';
		return w;
	}

	/**
	 * On narrow screens, computes the initial position for the floating window, placing it
	 * to the right of the sidebar tab. Collapses the sidebar first if the window would not fit
	 * alongside it. Returns undefined on wide screens (no special positioning needed).
	 */
	function computeNarrowInitialPos(): { left: number; top: number } | undefined {
		if (window.innerWidth > NARROW_THRESHOLD) return undefined;

		const winWidth = measureWidth();
		const topPx = Math.round(element_boardUI.offsetHeight * 0.11);
		const sidebarWidth = element_menu.offsetWidth;
		const tabWidth = element_menuToggle.offsetWidth;
		const expandedRightEdge = sidebarWidth + tabWidth;

		if (
			element_menu.classList.contains('expanded') &&
			expandedRightEdge + winWidth <= window.innerWidth
		) {
			// Sidebar is open and the window fits alongside it
			return { left: expandedRightEdge, top: topPx };
		} else {
			// Place window right of the collapsed tab
			return { left: tabWidth, top: topPx };
		}
	}

	/**
	 * Opens the floating window, smartly positioning it if this is the first opening,
	 * and potentially collapsing the sidebar in order for the window to be visible.
	 */
	function open(): void {
		let effectiveLeft: number | undefined;

		if (savedPos !== undefined) {
			// Restore previous drag position
			windowEl.style.left = `${savedPos.left}px`;
			windowEl.style.top = `${savedPos.top}px`;
			effectiveLeft = savedPos.left;
		} else {
			// No saved drag position - compute smart initial position
			const initialPos = computeNarrowInitialPos();
			if (initialPos !== undefined) {
				windowEl.style.left = `${initialPos.left}px`;
				windowEl.style.top = `${initialPos.top}px`;
				effectiveLeft = initialPos.left;
			}
		}

		// On narrow screens, collapse the sidebar if it would overlap the window
		if (
			window.innerWidth <= NARROW_THRESHOLD &&
			effectiveLeft !== undefined &&
			effectiveLeft < element_menu.offsetWidth + element_menuToggle.offsetWidth
		) {
			element_menu.classList.remove('expanded');
		}

		// Open the window
		windowEl.classList.remove('hidden');

		// Ensure it’s inside bounds on open (and after becoming visible)
		clampToParentBounds();

		initBaseListeners();
		onOpen?.();
	}

	return {
		open,
		close,
		resetPositioning,
		clampToParentBounds,
		isOpen,
	};
}

export default {
	create,
};
