
/**
 * Future new input script that can listen for inputs on specific elements,
 * not only on the document.
 *
 * Also, we will need built-in double-click and triple-click detection
 * for mapping tools to, such as ray/arrow drawing.
 */


import type { Coords } from "../chess/util/coordutil.js";
import docutil from "../util/docutil.js";
import type { Vec2 } from "../util/math.js";

const Mouse = {
	LEFT: 0,
	MIDDLE: 1,
	RIGHT: 2,
} as const;

// Maps buttons to string names
const MouseNames = {
	[Mouse.LEFT]: 'Left',
	[Mouse.MIDDLE]: 'Middle',
	[Mouse.RIGHT]: 'Right',
} as const;

type MouseButton = typeof Mouse[keyof typeof Mouse];


interface InputListener {
	atleastOneInput: () => boolean;

    // eslint-disable-next-line no-unused-vars
    isMouseDown(button: MouseButton): boolean;
    // eslint-disable-next-line no-unused-vars
    isMouseHeld(button: MouseButton): boolean;
	// eslint-disable-next-line no-unused-vars
	getMousePosition(button: MouseButton): Coords | null;
	// eslint-disable-next-line no-unused-vars
	isMouseClicked(button: MouseButton): boolean;
	// eslint-disable-next-line no-unused-vars
	getMouseClickedPos(button: MouseButton): Coords | null;
	// eslint-disable-next-line no-unused-vars
	isMouseDoubleClickDragged(button: MouseButton): boolean;

	/**
	 * Returns null if the pointer doesn't exist (finger has since lifted), or mouse isn't supported. 
	 * The mouse pointer's id is 'mouse'.
	 */
    // eslint-disable-next-line no-unused-vars
    getPointerPos(pointerId?: string): Coords | null;
	/**
	 * Returns null if the pointer doesn't exist (finger has since lifted), or mouse isn't supported. 
	 * The mouse pointer's id is 'mouse'.
	 */
    // eslint-disable-next-line no-unused-vars
	getPointerDelta(pointerId: string): Vec2 | null;
	/**
	 * Returns null if the pointer doesn't exist (finger has since lifted), or mouse isn't supported. 
	 * The mouse pointer's id is 'mouse'.
	 */
    // eslint-disable-next-line no-unused-vars
	getPointerVel(pointerId: string): Vec2 | null;

    getWheelDelta(): number;

    // eslint-disable-next-line no-unused-vars
    isKeyDown(keyCode: string): boolean;
    // eslint-disable-next-line no-unused-vars
    isKeyHeld(keyCode: string): boolean;

    removeEventListeners(): void;
	/** The element this input listener is attached to. */
    element: HTMLElement;
}

type PointerHistory = { pos: Coords, time: number }[];

const CLICK_THRESHOLDS = {
	MOUSE: {
		/** The maximum distance the mouse can move before a click is not registered. */
		MOVE_VPIXELS: 8, // Default: 8
		/** The maximum time the mouse can be held down before a click is not registered. */
		TIME_MILLIS: 400, // Default: 400
		/** The maximum time between first click down and second click up to register a double click drag. */
		DOUBLE_CLICK_TIME_MILLIS: 500,
	},
	TOUCH: {
		/** {@link CLICK_THRESHOLDS.MOUSE.MOVE_VPIXELS}, but for fingers (less strict, the 2nd tap can be further away) */
		MOVE_VPIXELS: 24,
		/** {@link CLICK_THRESHOLDS.MOUSE.TIME_MILLIS}, but for fingers (more strict, they must lift quicker) */
		TIME_MILLIS: 120,
		/** {@link CLICK_THRESHOLDS.MOUSE.DOUBLE_CLICK_TIME_MILLIS}, but for fingers (more strict, they must lift quicker) */
		DOUBLE_CLICK_TIME_MILLIS: 250, // Default: 220
	}

} as const;

/** The window of milliseconds to store mouse position history for velocity calculations. */
const MOUSE_POS_HISTORY_WINDOW_MILLIS = 80;


/** Mouse or Finger */
type Pointer = {
	position: Coords;
	delta: Vec2;
	positionHistory: PointerHistory;
	velocity: Vec2;
} & ({
	isFinger: false;
} | {
	isFinger: true;
	id: number;
})

/**
 * Keeps track of the recent down position of mouse buttons.
 * Allowing us to perform simulated clicks or double click drags with any of them.
 */
interface ClickInfo {
	/**
	 * The id of the pointer that most recently pressed this mouse button. 
	 * The mouse pointer's id is always 'mouse'.
	 */
	pointerId?: string;
	/** Whether this mouse button was pushed down THIS FRAME */
	isDown: boolean;
	/** Whether this mouse button is currently being held down. */
	isHeld: boolean;
	/**
	 * Whether this mouse button has been a simulated click or not.
	 * Clicks are registered if the mouse goes up within a small window
	 * after going down, and the mouse has not moved beyond a certain threshold.
	 */
	clicked: boolean;
	/** The time the mouse button was pressed down. */
	timeDownMillisHistory: number[];
	/** The last position the mouse was pressed down. */
	posDown?: Coords;
	/** Whether this frame incurred the start of a double click drag */
	doubleClickDrag: boolean;
}


/**
 * Creates an input listener that listens to mouse and keyboard events on the given element.
 * 
 * EVERY FRAME you need to dispatch the 'reset-listener-events' event on the document
 * to reset the state of the input listener.
 * @param element - The HTML element to listen for events on.
 * @returns An object with methods to check the state of mouse and keyboard inputs.
 */
function CreateInputListener(element: HTMLElement): InputListener {
	const keyDowns: string[] = [];
	const keyHelds: string[] = [];
	/** The amount the scroll wheel has scrolled this frame. */
	let wheelDelta: number = 0;
	/** The keys are the finger ids, if its a finger, or 'mouse' if it's the mouse. */
	const pointers: Record<string, Pointer> = {};

	// console.log("Mouse supported: ", docutil.isMouseSupported());
	// Immediately add the mouse pointer if the doc supports it
	if (docutil.isMouseSupported()) {
		pointers['mouse'] = {
			isFinger: false,
			position: [0, 0],
			delta: [0, 0],
			positionHistory: [],
			velocity: [0, 0],
		};
	}

	/** Whether there has been any input this frame. */
	let atleastOneInputThisFrame = false;

	const clickInfo: Record<MouseButton, ClickInfo> = {
		[Mouse.LEFT]: { isDown: false, isHeld: false, clicked: false, doubleClickDrag: false, timeDownMillisHistory: [] },
		[Mouse.MIDDLE]: { isDown: false, isHeld: false, clicked: false, doubleClickDrag: false, timeDownMillisHistory: [] },
		[Mouse.RIGHT]: { isDown: false, isHeld: false, clicked: false, doubleClickDrag: false, timeDownMillisHistory: [] },
	};
	
	const eventHandlers: Record<string, { target: EventTarget; handler: EventListener }> = {};


	// Helper Functions ---------------------------------------------------------------------------


	function addListener(target: EventTarget, eventType: string, handler: EventListener): void {
		target.addEventListener(eventType, handler);
		eventHandlers[eventType] = { target, handler };
	};

	/** Preps for next frame. Call at the very end of a frame. */
	function resetEvents(): void {
		// console.log("Resetting events");
		atleastOneInputThisFrame = false;
		// For each mouse button, reset its state
		for (const button of Object.values(clickInfo)) {
			button.isDown = false;
			button.clicked = false;
			button.doubleClickDrag = false;
			// Trim their timeDownMillisHistory of old mouse downs
			button.timeDownMillisHistory = button.timeDownMillisHistory.filter(time => time > Date.now() - 3000);
		}
		// For each pointer, reset its state
		const now = Date.now();
		for (const pointer of Object.values(pointers)) {
			pointer.delta = [0, 0];
			pointer.positionHistory = pointer.positionHistory.filter(entry => entry.time > Date.now() - MOUSE_POS_HISTORY_WINDOW_MILLIS);
			recalcPointerVel(pointer, now);
		}

		keyDowns.length = 0;
		wheelDelta = 0;

	}

	document.addEventListener('reset-listener-events', resetEvents); // Reset the input events for the next frame

	/** Calculates the mouse velocity based on recent mouse positions. */
	function recalcPointerVel(pointer: Pointer, now: number) {
		// Remove old entries, stop once we encounter recent enough data
		const timeToRemoveEntriesBefore = now - MOUSE_POS_HISTORY_WINDOW_MILLIS;
		while (pointer.positionHistory.length > 0 && pointer.positionHistory[0]!.time < timeToRemoveEntriesBefore) pointer.positionHistory.shift();
	
	
		// Calculate velocity if there are at least two positions
		if (pointer.positionHistory.length >= 2) {
			const latestMousePosEntry = pointer.positionHistory[pointer.positionHistory.length - 1]!;
			const firstMousePosEntry = pointer.positionHistory[0]!; // { mousePos, time }
			const timeDiffBetwFirstAndLastEntryMillis = (latestMousePosEntry.time - firstMousePosEntry.time);
	
			const mVX = (latestMousePosEntry.pos[0] - firstMousePosEntry.pos[0]) / timeDiffBetwFirstAndLastEntryMillis;
			const mVY = (latestMousePosEntry.pos[1] - firstMousePosEntry.pos[1]) / timeDiffBetwFirstAndLastEntryMillis;
	
			pointer.velocity = [mVX, mVY];
		} else pointer.velocity = [0, 0];
	}


	// Simulated Click Events (either mouse or finger) ------------------------------------------------------------


	function updateClickInfoDown(targetButton: MouseButton, e: MouseEvent | Touch) {
		// console.log("Mouse down: ", MouseNames[targetButton]);
		const targetButtonInfo = clickInfo[targetButton];
		targetButtonInfo.pointerId = e instanceof Touch ? e.identifier.toString() : 'mouse';
		targetButtonInfo.isDown = true;
		targetButtonInfo.isHeld = true;

		// Update click ------------
		const previousTimeDown = targetButtonInfo.timeDownMillisHistory[targetButtonInfo.timeDownMillisHistory.length - 1];
		const now = Date.now();
		targetButtonInfo.timeDownMillisHistory.push(now);
		// Update double click draw ----------
		const DOUBLE_CLICK_TIME_MILLIS = e instanceof Touch ? CLICK_THRESHOLDS.TOUCH.DOUBLE_CLICK_TIME_MILLIS : CLICK_THRESHOLDS.MOUSE.DOUBLE_CLICK_TIME_MILLIS;
		if (previousTimeDown && now - previousTimeDown < DOUBLE_CLICK_TIME_MILLIS) {
			// Mouse has been down atleast once before.
			// Now we now posDown will be defined, so we can calculate the distance to that last click down.
			const distMoved = Math.max(
				Math.abs(targetButtonInfo.posDown![0] - e.clientX),
				Math.abs(targetButtonInfo.posDown![1] - e.clientY)
			);
			const MOVE_VPIXELS = e instanceof Touch ? CLICK_THRESHOLDS.TOUCH.MOVE_VPIXELS : CLICK_THRESHOLDS.MOUSE.MOVE_VPIXELS;
			if (distMoved < MOVE_VPIXELS) { // Only register the double click drag if the mouse hasn't moved too far from its last click down.
				targetButtonInfo.doubleClickDrag = true;
				// console.log("Mouse double click dragged: ", MouseNames[targetButton]);
			}
			// else console.log("Mouse double click MOVED TOO FAR: ", MouseNames[targetButton]);
		} // ----------------
	
		// Now we can update the last click down after checking for its distance to the last one.
		targetButtonInfo.posDown = [e.clientX, e.clientY];
	}

	function updateClickInfoUp(targetButton: MouseButton, e: MouseEvent | Touch) {
		// console.log("Mouse up: ", MouseNames[targetButton]);
		const targetButtonInfo = clickInfo[targetButton];
		targetButtonInfo.pointerId = e instanceof Touch ? e.identifier.toString() : 'mouse';
		targetButtonInfo.isDown = false;
		targetButtonInfo.isHeld = false;
		// Update click --------------
		if (!clickInfo[targetButton].posDown) return; // No click down to compare to. This can happen if you click down offscreen.
		const mouseHistory = clickInfo[targetButton].timeDownMillisHistory;
		const timePassed = Date.now() - (mouseHistory[mouseHistory.length - 1] ?? 0); // Since the latest click
		const TIME_MILLIS = e instanceof Touch ? CLICK_THRESHOLDS.TOUCH.TIME_MILLIS : CLICK_THRESHOLDS.MOUSE.TIME_MILLIS;
		if (timePassed < TIME_MILLIS) {
			const distMoved = Math.max(
				Math.abs(clickInfo[targetButton].posDown[0] - e.clientX),
				Math.abs(clickInfo[targetButton].posDown[1] - e.clientY)
			);
			const MOVE_VPIXELS = e instanceof Touch ? CLICK_THRESHOLDS.TOUCH.MOVE_VPIXELS : CLICK_THRESHOLDS.MOUSE.MOVE_VPIXELS;
			if (distMoved < MOVE_VPIXELS) {
				clickInfo[targetButton].clicked = true;
				// console.log("Mouse clicked: ", MouseNames[targetButton]);
			}
		} // --------------
	}


	// Mouse Events ---------------------------------------------------------------------------


	addListener(element, 'mousedown', ((e: MouseEvent) => {
		if (e.target !== element) return; // Ignore events triggered on CHILDREN of the element.
		atleastOneInputThisFrame = true;
		const targetButton = e.button as MouseButton;
		updateClickInfoDown(targetButton, e);
	}) as EventListener);

	// This listener is placed on the document so we don't miss mouseup events if the user lifts their mouse off the element.
	addListener(document, 'mouseup', ((e: MouseEvent) => {
		atleastOneInputThisFrame = true;
		const targetButton = e.button as MouseButton;
		updateClickInfoUp(targetButton, e);
	}) as EventListener);

	// Mouse position tracking
	addListener(element, 'mousemove', ((e: MouseEvent) => {
		atleastOneInputThisFrame = true;
		const targetPointer = pointers['mouse'];
		if (!targetPointer) return; // Sometimes the 'mousemove' event is fired from touch events, even though the mouse pointer does not exist.
		targetPointer.position = [e.clientX, e.clientY];
		// Update delta
		targetPointer.delta = [e.movementX, e.movementY];
		// Update velocity
		const now = Date.now();
		targetPointer.positionHistory.push({ pos: [...targetPointer.position], time: now }); // Deep copy the mouse position to avoid modifying the original
		recalcPointerVel(targetPointer, now);
		// console.log("Mouse position: ", targetPointer.position);
	}) as EventListener);

	// Scroll wheel tracking
	addListener(element, 'wheel', ((e: WheelEvent) => {
		if (e.target !== element) return; // Ignore events triggered on CHILDREN of the element.
		atleastOneInputThisFrame = true;
		wheelDelta = e.deltaY;
		// console.log("Scroll wheel: ", wheelDelta);
	}) as EventListener);

	// Prevent the context menu on right click
	addListener(element, 'contextmenu', ((e: MouseEvent) => {
		if (e.target !== element) return; // Ignore events triggered on CHILDREN of the element.
		atleastOneInputThisFrame = true;
		// console.log("Context menu");
		e.preventDefault();
	}) as EventListener);


	// Finger Events ---------------------------------------------------------------------------


	addListener(element, 'touchstart', ((e: TouchEvent) => {
		if (e.target !== element) return; // Ignore events triggered on CHILDREN of the element.
		atleastOneInputThisFrame = true;

		// Prevent default behavior of touch events
		// Stops fingers from also triggering mouse events,
		// and prevents chrome swipe gestures.
		// This still allows the touchstart to perform default actions
		// if we interacted with an element INSIDE the element.
		if (e.target instanceof HTMLElement && e.target === element) e.preventDefault();

		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch: Touch = e.changedTouches[i]!;
			pointers[touch.identifier.toString()] = {
				isFinger: true,
				id: touch.identifier,
				position: [touch.clientX, touch.clientY],
				delta: [0, 0],
				positionHistory: [],
				velocity: [0, 0],
			};
			// console.log("Touch start: ", touch.identifier);

			// Treat fingers as the left mouse button by default
			updateClickInfoDown(Mouse.LEFT, touch);
		}
	}) as EventListener);

	addListener(element, 'touchmove', ((e: TouchEvent) => {
		atleastOneInputThisFrame = true;
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch: Touch = e.changedTouches[i]!;
			if (pointers[touch.identifier]) {
				const targetPointer = pointers[touch.identifier]!;
				// Update delta
				targetPointer.delta = [
					touch.clientX - targetPointer.position[0],
					touch.clientY - targetPointer.position[1]
				];
				targetPointer.position = [touch.clientX, touch.clientY];
				// Update velocity
				const now = Date.now();
				targetPointer.positionHistory.push({ pos: [...targetPointer.position], time: now }); // Deep copy the touch position to avoid modifying the original
				recalcPointerVel(targetPointer, now);
				// console.log("Touch position: ", targetPointer.position);
			} // This touch likely started outside the element, so we ignored adding it.
		}
	}) as EventListener);

	// This listeners are placed on the document so we don't miss touchend events if the user lifts their finger off the element.
	addListener(document, 'touchend', touchEndCallback as EventListener);
	addListener(document, 'touchcancel', touchEndCallback as EventListener);

	function touchEndCallback(e: TouchEvent) {
		atleastOneInputThisFrame = true;
		for (let i = 0; i < e.changedTouches.length; i++) {
			const touch: Touch = e.changedTouches[i]!;
			if (pointers[touch.identifier]) {
				// console.log("Touch end/cancel: ", touch.identifier);
				delete pointers[touch.identifier];
			} // This touch likely started outside the element, so we ignored adding it.

			// Treat fingers as the left mouse button by default
			updateClickInfoUp(Mouse.LEFT, touch);
		}
	}

	
	// Keyboard Events ---------------------------------------------------------------------------


	addListener(element, 'keydown', ((e: KeyboardEvent) => {
		if (e.target !== element) return; // Ignore events triggered on CHILDREN of the element.
		// console.log("Key down: ", e.code);
		atleastOneInputThisFrame = true;
		if (!keyDowns.includes(e.code)) keyDowns.push(e.code);
		if (!keyHelds.includes(e.code)) keyHelds.push(e.code);
	}) as EventListener);

	// This listener is placed on the document so we don't miss mouseup events if the user lifts their mouse off the element.
	addListener(document, 'keyup', ((e: KeyboardEvent) => {
		// console.log("Key up: ", e.code);
		atleastOneInputThisFrame = true;
		const downIndex = keyDowns.indexOf(e.code);
		if (downIndex !== -1) keyDowns.splice(downIndex, 1);
        
		const heldIndex = keyHelds.indexOf(e.code);
		if (heldIndex !== -1) keyHelds.splice(heldIndex, 1);
	}) as EventListener);


	// Return the InputListener object ---------------------------------------------------------------------------


	return {
		element,
		atleastOneInput: () => atleastOneInputThisFrame,
		isMouseDown: (button: MouseButton) => clickInfo[button].isDown ?? false,
		isMouseHeld: (button: MouseButton) => clickInfo[button].isHeld ?? false,
		getMousePosition: (button: MouseButton) => {
			const pointerId = clickInfo[button].pointerId!;
			if (pointerId === undefined) return null;
			return pointers[pointerId]?.position ?? null;
		},
		isMouseClicked: (button: MouseButton) => clickInfo[button].clicked,
		getMouseClickedPos: (button: MouseButton) => clickInfo[button].posDown ?? null,
		isMouseDoubleClickDragged: (button: MouseButton) => clickInfo[button].doubleClickDrag,
		getPointerPos: (pointerId: string) => pointers[pointerId]?.position ?? null,
		getPointerDelta: (pointerId: string) => pointers[pointerId]?.delta ?? null,
		getPointerVel: (pointerId: string) => pointers[pointerId]?.velocity ?? null,
		getWheelDelta: () => wheelDelta,
		isKeyDown: (keyCode: string) => keyDowns.includes(keyCode),
		isKeyHeld: (keyCode: string) => keyHelds.includes(keyCode),
		removeEventListeners: () => {
			Object.keys(eventHandlers).forEach((eventType) => {
				const { target, handler } = eventHandlers[eventType]!;
				target.removeEventListener(eventType, handler);
			});
			console.log("Closed event listeners of Input Listener");
		}
	};
}









export {
	Mouse,
	CreateInputListener
};

export type {
	InputListener,
	MouseButton,
};