
/**
 * This script can attach input listeners to individual elements.
 * 
 * Types of inputs it can hear: Keyboard, mouse, touch.
 * 
 * It also can detect simulated mouse clicks via the mouse or finger,
 * and simulated double click drags!
 */


import type { DoubleCoords } from "../../../../shared/chess/util/coordutil.js";

import docutil from "../util/docutil.js";

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

/** Information about a key that was pressed down this frame. */
interface KeyDownInfo {
	/** The key code that was pressed. */
	keyCode: string;
	/** Whether a meta key (Ctrl or Cmd) was held when the key was pressed. */
	metaKey: boolean;
}

interface InputListener {
	/** Whether this input listener has experience atleast one input event the past frame. */
	atleastOneInput: () => boolean;
	/** Whether the given mouse button experienced a click-down this frame. */
    // eslint-disable-next-line no-unused-vars
    isMouseDown(button: MouseButton): boolean;
	/** Removes the mouse down so that other scripts don't also use it. Also removes the pointer down. */
	// eslint-disable-next-line no-unused-vars
	claimMouseDown(button: MouseButton): void;
	/** Removes the pointer down so that other scripts don't also use it. */
	// eslint-disable-next-line no-unused-vars
	claimPointerDown(pointerId: string): void;
	/** Removes the simulated mouse click so that other scripts don't also use it. */
	// eslint-disable-next-line no-unused-vars
	claimMouseClick(button: MouseButton): void;
	/**
	 * Resets the simulated mouse click on mouse-down so that
	 * when it released it DOESN'T count as a click.
	 */
	// eslint-disable-next-line no-unused-vars
	cancelMouseClick(button: MouseButton): void;
	/** Whether the given mouse button is currently held down. */
    // eslint-disable-next-line no-unused-vars
    isMouseHeld(button: MouseButton): boolean;
	/** Returns true if the most recent pointer for a specific mouse button action is a touch (not mouse). */
    // eslint-disable-next-line no-unused-vars
	isMouseTouch(button: MouseButton): boolean;
	/** Returns true if the given pointer is a touch (not mouse). */
    // eslint-disable-next-line no-unused-vars
	isPointerTouch(pointerId: string): boolean;
	/** Returns the id of the LOGICAL pointer that most recently performed an action on the specified mouse button. */
	// eslint-disable-next-line no-unused-vars
	getMouseId(button: MouseButton): string | undefined;
	/** Returns the id of the PHYSICAL pointer that most recently performed an action on the specified mouse button. */
	// eslint-disable-next-line no-unused-vars
	getMousePhysicalId(button: MouseButton): string | undefined;
	/** Returns the last known pointer position that trigerred a simulated event for the given mouse button. */
	// eslint-disable-next-line no-unused-vars
	getMousePosition(button: MouseButton): DoubleCoords | undefined;
	/** Whether the given mouse button simulated a full CLICK this frame. */
	// eslint-disable-next-line no-unused-vars
	isMouseClicked(button: MouseButton): boolean;
	/** Whether the given mouse button experience a double-click-down this frame. */
	// eslint-disable-next-line no-unused-vars
	isMouseDoubleClickDragged(button: MouseButton): boolean;
	/**
	 * Toggles all-left click actions being treated as right-click actions.
	 * This is useful for allowing fingers to right click.
	 */
	// eslint-disable-next-line no-unused-vars
	setTreatLeftasRight(value: boolean): void,
	/** Returns the position of the given LOGICAL pointer id, if it still exists. */
    // eslint-disable-next-line no-unused-vars
    getPointerPos(pointerId?: string): DoubleCoords | undefined;
	/** Returns the position of the given PHYSICAL pointer id, if it still exists. */
    // eslint-disable-next-line no-unused-vars
    getPhysicalPointerPos(pointerId?: string): DoubleCoords | undefined;
	/** Returns the PHYSICAL pointer id this pointer is attached to. */
    // eslint-disable-next-line no-unused-vars
	getPhysicalPointerIdOfPointer(pointerId: string): string | undefined;
	/**
	 * Returns the delta movement of the given PHYSICAL pointer id over the
	 * past frame, if it still exists. The mouse pointer's id is 'mouse'.
	 */
    // eslint-disable-next-line no-unused-vars
	getPhysicalPointerDelta(physicalPointerId: string): DoubleCoords | undefined;
	/**
	 * Returns undefined if the pointer doesn't exist (finger has since lifted), or mouse isn't supported. 
	 * The mouse pointer's id is 'mouse'.
	 */
    // eslint-disable-next-line no-unused-vars
	getPointerVel(pointerId: string): DoubleCoords | undefined;
	/** Returns the ids of all existing LOGICAL pointers for the given button action. */
    // eslint-disable-next-line no-unused-vars
	getAllPointers(button: MouseButton): string[];
	/** Returns the ids of all existing touch LOGICAL pointers, regardless of what button action they were for. */
	getAllTouchPointers(): string[];
	/** Returns the ids of all existing PHYSICAL pointers. */
	getAllPhysicalPointers(): string[];
	/**
	 * Whether the given LOGICAL pointer is currently being held down.
	 * Which also happens to be true if the pointer still EXISTS.
	 */
	// eslint-disable-next-line no-unused-vars
	isPointerHeld(pointerId: string): boolean;
	/** Whether the given LOGICAL pointer still exists (held down). */
	// eslint-disable-next-line no-unused-vars
	pointerExists(pointerId: string): boolean;
	/** Returns a list of all LOGICAL pointers that were pressed down this frame for the given button action. */
	// eslint-disable-next-line no-unused-vars
	getPointersDown(button: MouseButton): string[];
	/** Returns a list of all touch LOGICAL pointers that were pressed down this frame, regardless of what button action they were for. */
	getTouchPointersDown(): string[];
	/** Returns the number of pointers that were pressed down this frame. */
	getPointersDownCount(): number;
	/** Returns whether the provided LOGICAL pointer belongs to the provided PHYSICAL pointer. */
    // eslint-disable-next-line no-unused-vars
	doesPointerBelongToPhysicalPointer(logicalPointerId: string, physicalPointerId: string): boolean;
	/** Returns how much the wheel has scrolled this frame. */
    getWheelDelta(): number;
	/** 
	 * Whether the provided keyboard key was pressed down this frame.
	 * @param keyCode - The key code to check
	 * @param requireMetaKey - If true, only returns true if a meta key (Ctrl/Cmd) was also held. If false or undefined, returns true regardless of meta key state.
	 */
    // eslint-disable-next-line no-unused-vars
    isKeyDown(keyCode: string, requireMetaKey?: boolean): boolean;
	/** Whether the provided keyboard key is currently being held down. */
    // eslint-disable-next-line no-unused-vars
    isKeyHeld(keyCode: string): boolean;
	/** Call when done with the input listener. This closes all its event listeners. */
    removeEventListeners(): void;
	/** The element this input listener is attached to. */
    element: HTMLElement | typeof document;
}

type PointerHistory = { pos: DoubleCoords, time: number }[];

/** Options for simulated clicks */
const CLICK_THRESHOLDS = {
	MOUSE: {
		/** The maximum distance the mouse can move before a click is not registered. */
		MOVE_VPIXELS: 6, // Default: 8
		/** The maximum time the mouse can be held down before a click is not registered. */
		TIME_MILLIS: 400, // Default: 400
		/** The maximum time between first click down and second click up to register a double click drag. */
		DOUBLE_CLICK_TIME_MILLIS: 450, // Default: 500
	},
	TOUCH: {
		/** {@link CLICK_THRESHOLDS.MOUSE.MOVE_VPIXELS}, but for fingers (less strict, the 2nd tap can be further away) */
		MOVE_VPIXELS: 17, // Default: 20
		/** {@link CLICK_THRESHOLDS.MOUSE.TIME_MILLIS}, but for fingers (more strict, they must lift quicker) */
		TIME_MILLIS: 120,
		/** {@link CLICK_THRESHOLDS.MOUSE.DOUBLE_CLICK_TIME_MILLIS}, but for fingers (more strict, they must lift quicker) */
		DOUBLE_CLICK_TIME_MILLIS: 250, // Default: 220
	}

} as const;

/** The window of milliseconds to store mouse position history for velocity calculations. */
const MOUSE_POS_HISTORY_WINDOW_MILLIS = 80;



/**
 * Physical Pointers are assigned one trackable POSITION.
 * But they may be linked to multiple Logical Pointers if
 * it supports multiple mouse buttons (touches do not).
 */
type PhysicalPointer = {
	/** The unique id of the pointer. */
	id: string;
	/** Whether the Physical Pointer is derived from a touch (finger). */
	isTouch: boolean;
	/** The position of the pointer relative to the top-left corner of the listener's element. */
	position: DoubleCoords;
	/** How many pixels the pointer has moved since last frame. */
	delta: DoubleCoords;
	/** Used for calculating velocity */
	positionHistory: PointerHistory;
	velocity: DoubleCoords;
};

/**
 * Logical Pointers represent one BUTTON ACTION continuously held down.
 * Multiple Logical Pointers may be attached to one Physical Pointer.
 * These are deleted as soon as the button is lifted up.
 */
type LogicalPointer = {
	/** The unique id of the pointer. May be identical to its Physical Pointer's id if it's a touch pointer. */
	id: string;
	/** The Physical Pointer it's linked to. */
	physical: PhysicalPointer;
	/** What button action this is for. */
	button: MouseButton;
};

/**
 * Keeps track of the recent down position of mouse buttons.
 * Allowing us to perform simulated clicks or double click drags with any of them.
 */
interface ClickInfo {
	/** The id of the LOGICAL pointer that most recently pressed this mouse button. */
	pointerId?: string;
	/** The id of the PHYSICAL pointer tied to the logical pointer that most recently pressed this mouse button. */
	physicalId?: string;
	/** Whether the last action for this Button was from a touch. */
	isTouch: boolean;
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
	/**
	 * The last known position the mouse button was pressed down.
	 * 
	 * Also Used for calculating simulated clicks, when touch events
	 * don't provide delta from lift to down.
	 */
	posDown?: DoubleCoords;
	/**
	 * How much the mouse has ABSOLUTELY moved since the last click down.
	 * ONLY USED FOR CALCULATING SIMULATED CLICKS AND DOUBLE CLICK DRAGS,
	 * as if the pointer has moved too far, we don't register the click.
	 * 
	 * We use delta instead of remembering the position down, because when
	 * the mouse is locked in perspective mode, the position is not updated.
	 * 
	 * This can only be positive, not negative.
	 */
	deltaSinceDown: DoubleCoords;
	/**
	 * The last known position of the last active pointer for this mouse button.
	 * UPDATES ON DOWN AND UP, NOT ON MOVE.
	 */
	position?: DoubleCoords;
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
function CreateInputListener(element: HTMLElement | typeof document, { keyboard = true, mouse = true }: { keyboard?: boolean, mouse?: boolean } = {}): InputListener {
	const keyDowns: KeyDownInfo[] = [];
	const keyHelds: string[] = [];
	/** The amount the scroll wheel has scrolled this frame. */
	let wheelDelta: number = 0;

	/** Tracks the physical input sources. Only one entry for 'mouse'. */
	const physicalPointers: Record<string, PhysicalPointer> = {};
	/** Tracks the virtual pointers, one for each button action (left/right/middle). */
	const logicalPointers: Record<string, LogicalPointer> = {};

	/** A list of all LOGICAL pointer id's that were pressed down this frame. */
	const pointersDown: string[] = [];

	/** 
	 * Whether to treat all left click actions as right click actions.
	 * This is useful for allowing fingers to right click.
	 */
	let treatLeftAsRight = false;

	// console.log("Mouse supported: ", docutil.isMouseSupported());
	// Immediately add the mouse pointer if the doc supports it
	if (docutil.isMouseSupported()) {
		physicalPointers['mouse'] = {
			isTouch: false,
			id: 'mouse',
			position: [0, 0],
			delta: [0, 0],
			positionHistory: [],
			velocity: [0, 0],
		};
	}

	/** Whether there has been any input this frame. */
	let atleastOneInputThisFrame = false;

	const clickInfo: Record<MouseButton, ClickInfo> = {
		[Mouse.LEFT]: { isTouch: false, isDown: false, isHeld: false, clicked: false, doubleClickDrag: false, timeDownMillisHistory: [], deltaSinceDown: [0, 0] },
		[Mouse.MIDDLE]: { isTouch: false, isDown: false, isHeld: false, clicked: false, doubleClickDrag: false, timeDownMillisHistory: [], deltaSinceDown: [0, 0] },
		[Mouse.RIGHT]: { isTouch: false, isDown: false, isHeld: false, clicked: false, doubleClickDrag: false, timeDownMillisHistory: [], deltaSinceDown: [0, 0] },
	};
	
	const eventHandlers: Record<string, { target: EventTarget; handler: EventListener }> = {};


	// Helper Functions ---------------------------------------------------------------------------


	function addListener(target: EventTarget, eventType: string, handler: EventListener): void {
		target.addEventListener(eventType, handler);
		eventHandlers[eventType] = { target, handler };
	};

	/** Reset the input events for the next frame. Fire 'reset-listener-events' event at the very end of EVERY frame. */
	document.addEventListener('reset-listener-events', () => {
		// console.log("Resetting events");
		// We can continuously hold a key without triggering more events, so held keys should still count as an input that frame.
		// atleastOneInputThisFrame = keyHelds.length > 0 || Object.values(clickInfo).some(clickInfo => clickInfo.isHeld);
		atleastOneInputThisFrame = keyHelds.length > 0;
		// console.log("Atleast one input this frame: ", atleastOneInputThisFrame);
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
		for (const pointer of Object.values(physicalPointers)) {
			pointer.delta = [0, 0];
			pointer.positionHistory = pointer.positionHistory.filter(entry => entry.time > Date.now() - MOUSE_POS_HISTORY_WINDOW_MILLIS);
			recalcPointerVel(pointer, now);
		}

		keyDowns.length = 0;
		pointersDown.length = 0;
		wheelDelta = 0;
	});

	/** Calculates the mouse velocity based on recent mouse positions. */
	function recalcPointerVel(pointer: PhysicalPointer, now: number): void {
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


	function updateClickInfoDown(targetButton: MouseButton, e: MouseEvent | Touch): void {
		// console.log("Mouse down: ", MouseNames[targetButton]);
		const targetButtonInfo = clickInfo[targetButton];
		if (targetButtonInfo === undefined) return; // Invalid button (some mice have extra buttons)

		// This makes it so the coordinate input fields are unfocused when clicking the canvas.
		const prev = document.activeElement;
		if (element instanceof HTMLElement && prev !== element && prev instanceof HTMLElement) prev.blur();

		// Generate a unique logical ID for the action.
		const logicalId = getLogicalPointerId(e, targetButton);
		const physicalId = getPhysicalPointerId(e);
		targetButtonInfo.pointerId = logicalId;
		targetButtonInfo.physicalId = physicalId;
		targetButtonInfo.isTouch = !(e instanceof MouseEvent); // CAN'T USE instanceof Touch because it's not defined in Safari!
		targetButtonInfo.isDown = true;
		targetButtonInfo.isHeld = true;
		const relativeMousePos = getRelativeMousePosition([e.clientX, e.clientY], element);
		targetButtonInfo.position = [...relativeMousePos];
		// if (targetButton === Mouse.LEFT) pointersDown.push(targetButtonInfo.pointerId!);
		// Push them down anyway no matter which type of click.
		// So that you can still pinch the board when fingers act as right clicks.
		pointersDown.push(logicalId);

		// Create LOGICAL pointer, which automatically means it's held down.
		logicalPointers[logicalId] = {
			id: logicalId,
			physical: physicalPointers[physicalId]!,
			button: targetButton,
		};

		// Update click ------------
		const previousTimeDown = targetButtonInfo.timeDownMillisHistory[targetButtonInfo.timeDownMillisHistory.length - 1];
		const now = Date.now();
		targetButtonInfo.timeDownMillisHistory.push(now);
		// Update double click draw ----------
		const DOUBLE_CLICK_TIME_MILLIS = e instanceof MouseEvent ? CLICK_THRESHOLDS.MOUSE.DOUBLE_CLICK_TIME_MILLIS : CLICK_THRESHOLDS.TOUCH.DOUBLE_CLICK_TIME_MILLIS; // CAN'T USE instanceof Touch because it's not defined in Safari!
		if (previousTimeDown && now - previousTimeDown < DOUBLE_CLICK_TIME_MILLIS) {
			// Mouse has been down atleast once before.
			// Now we now posDown will be defined, so we can calculate the distance to that last click down.
			// Works for 2D mode, desktop & mobile
			const posDown = targetButtonInfo.posDown;
			const distMoved = posDown ? Math.max(
				Math.abs(posDown[0] - relativeMousePos[0]),
				Math.abs(posDown[1] - relativeMousePos[1])
			) : 0;
			// Works for 3D mode, desktop (mouse is locked in place then)
			const delta = Math.max(
				targetButtonInfo.deltaSinceDown[0],
				targetButtonInfo.deltaSinceDown[1]
			);
			// console.log("Mouse delta:", delta);
			const MOVE_VPIXELS = e instanceof MouseEvent ? CLICK_THRESHOLDS.MOUSE.MOVE_VPIXELS : CLICK_THRESHOLDS.TOUCH.MOVE_VPIXELS; // CAN'T USE instanceof Touch because it's not defined in Safari!
			if (distMoved < MOVE_VPIXELS && delta < MOVE_VPIXELS) { // Only register the double click drag if the mouse hasn't moved too far from its last click down.
				targetButtonInfo.doubleClickDrag = true;
				// console.log("Mouse double click dragged: ", MouseNames[targetButton]);
			}
			// else console.log("Mouse double click MOVED TOO FAR: ", MouseNames[targetButton]);
		} // ----------------
	
		// Now we can update the last click down after checking for its distance to the last one.
		targetButtonInfo.posDown = [...relativeMousePos];
		targetButtonInfo.deltaSinceDown = [0, 0]; // Reset the delta since down
	}

	function updateClickInfoUp(targetButton: MouseButton, e: MouseEvent | Touch): void {
		// console.log("Mouse up: ", MouseNames[targetButton]);
		const targetButtonInfo = clickInfo[targetButton];
		if (targetButtonInfo === undefined) return; // Invalid button (some mice have extra buttons)
		const logicalId = getLogicalPointerId(e, targetButton);
		const physicalId = getPhysicalPointerId(e);
		targetButtonInfo.pointerId = logicalId;
		targetButtonInfo.physicalId = physicalId;
		targetButtonInfo.isTouch = !(e instanceof MouseEvent); // CAN'T USE instanceof Touch because it's not defined in Safari!
		targetButtonInfo.isDown = false;
		targetButtonInfo.isHeld = false;
		const relativeMousePos = getRelativeMousePosition([e.clientX, e.clientY], element);
		targetButtonInfo.position = [...relativeMousePos];

		// Remove the pointer from the list of pointers down too, if it's in there.
		// This can happen if it was added & removed in a single frame.
		const index = pointersDown.indexOf(targetButtonInfo.pointerId!);
		if (index !== -1) pointersDown.splice(index, 1);
		
		// Mark the LOGICAL pointer as no longer held.
		// We have to delete it so that it doesn't inflate the pointer count.
		delete logicalPointers[logicalId];

		// Update click --------------
		const mouseHistory = targetButtonInfo.timeDownMillisHistory;
		const timePassed = Date.now() - (mouseHistory[mouseHistory.length - 1] ?? 0); // Since the latest click
		const TIME_MILLIS = e instanceof MouseEvent ? CLICK_THRESHOLDS.MOUSE.TIME_MILLIS : CLICK_THRESHOLDS.TOUCH.TIME_MILLIS; // CAN'T USE instanceof Touch because it's not defined in Safari!
		if (timePassed < TIME_MILLIS) {
			// Works for 2D mode, desktop & mobile
			const posDown = targetButtonInfo.posDown;
			const distMoved = posDown ? Math.max(
				Math.abs(posDown[0] - relativeMousePos[0]),
				Math.abs(posDown[1] - relativeMousePos[1])
			) : 0; // No click down to compare to. This can happen if you click down offscreen.
			// Works for 3D mode, desktop (mouse is locked in place then)
			const delta = Math.max(
				targetButtonInfo.deltaSinceDown[0],
				targetButtonInfo.deltaSinceDown[1]
			);
			// console.log("Mouse delta: ", delta);
			const MOVE_VPIXELS = e instanceof MouseEvent ? CLICK_THRESHOLDS.MOUSE.MOVE_VPIXELS : CLICK_THRESHOLDS.TOUCH.MOVE_VPIXELS; // CAN'T USE instanceof Touch because it's not defined in Safari!
			if (distMoved < MOVE_VPIXELS && delta < MOVE_VPIXELS) {
				targetButtonInfo.clicked = true;
				// console.log("Mouse clicked: ", MouseNames[targetButton]);
			}
		} // --------------
	}

	/**
	 * On pointer move. This updates the deltaSinceDown for the
	 * clickInfo of the mouse button whos most recent action
	 * was from the pointerId.
	 * 
	 * If the pointer moves too much, don't simulate a click.
	 */
	function updateDeltaSinceDownForPointer(physicalPointerId: string, delta: DoubleCoords): void {
		// Update the delta (deltaSinceDown) for simulated mouse clicks
		Object.values(Mouse).forEach((targetButton) => {
			const targetButtonInfo = clickInfo[targetButton];

			// Only update the click info's delta since down if the physical pointer that most recently performed that click action matches
			if (targetButtonInfo.physicalId !== physicalPointerId) return;
			
			// Update the delta since down
			targetButtonInfo.deltaSinceDown[0] += Math.abs(delta[0]);
			targetButtonInfo.deltaSinceDown[1] += Math.abs(delta[1]);
		});
	}

	if (mouse) {

		// Mouse Events ---------------------------------------------------------------------------

		addListener(element, 'mousedown', ((e: MouseEvent): void => {
			if (element instanceof HTMLElement) {
				if (e.target !== element) return; // Ignore events triggered on CHILDREN of the element.
				// Prevents dragging the board also selecting/highlighting text in Coordinates container
				// We can't prevent default the document input listener tho or dropdown selections can't be opened.
				e.preventDefault(); 
			}
			const targetPointer = physicalPointers['mouse'];
			if (!targetPointer) return; // Sometimes the 'mousedown' event is fired from touch events, even though the mouse pointer does not exist.
			atleastOneInputThisFrame = true;
			const eventButton = e.button as MouseButton;
			// If alt is held,  right click instead
			const button = (e.altKey || treatLeftAsRight) && eventButton === Mouse.LEFT ? Mouse.RIGHT : eventButton;
			updateClickInfoDown(button, e);
		}) as EventListener);

		// This listener is placed on the document so we don't miss mouseup events if the user lifts their mouse off the element.
		addListener(document, 'mouseup', ((e: MouseEvent): void => {
			atleastOneInputThisFrame = true;
			const eventButton = e.button as MouseButton;
			// If alt is held, right click instead
			const button = (e.altKey || treatLeftAsRight) && eventButton === Mouse.LEFT ? Mouse.RIGHT : eventButton;
			updateClickInfoUp(button, e);
		}) as EventListener);

		// Mouse position tracking
		addListener(element, 'mousemove', ((e: MouseEvent): void => {
			atleastOneInputThisFrame = true;
			const physicalPointer = physicalPointers['mouse'];
			if (!physicalPointer) return; // Sometimes the 'mousemove' event is fired from touch events, even though the mouse pointer does not exist.
			physicalPointer.position = getRelativeMousePosition([e.clientX, e.clientY], element);
			// console.log(`Updated pointer ${targetPointer.id} position:`, targetPointer.position);
			// Update delta (Note: e.movementX/Y are relative to the document, it should be fine)
			// Add to the current delta, in case this event is triggered multiple times in a frame.
			physicalPointer.delta[0] += e.movementX;
			physicalPointer.delta[1] += e.movementY;

			// Update the delta (deltaSinceDown) for simulated mouse clicks
			updateDeltaSinceDownForPointer(physicalPointer.id, physicalPointer.delta);
			
			// console.log("Mouse delta: ", targetPointer.delta);
			// Update velocity
			const now = Date.now();
			physicalPointer.positionHistory.push({ pos: [...physicalPointer.position], time: now }); // Deep copy the mouse position to avoid modifying the original
			recalcPointerVel(physicalPointer, now);
			// console.log("Mouse relative position: ", targetPointer.position);
		}) as EventListener);

		// Scroll wheel tracking
		addListener(element, 'wheel', ((e: WheelEvent): void => {
			if (element instanceof HTMLElement && e.target !== element) return; // Ignore events triggered on CHILDREN of the element.
			atleastOneInputThisFrame = true;
			wheelDelta = e.deltaY;
			// console.log("Scroll wheel: ", wheelDelta);
		}) as EventListener);

		// Prevent the context menu on right click
		addListener(element, 'contextmenu', ((e: MouseEvent): void => {
			if (element instanceof Document || e.target !== element) return; // Allow context menu outside the element, or inside as long as the target isn't the element.
			atleastOneInputThisFrame = true;
			// console.log("Context menu");
			e.preventDefault();
		}) as EventListener);


		// Finger Events ---------------------------------------------------------------------------


		addListener(element, 'touchstart', ((e: TouchEvent): void => {
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
				const position = getRelativeMousePosition([touch.clientX, touch.clientY], element);

				const physicalId = getPhysicalPointerId(touch);

				// 1. Create the Physical Pointer
				physicalPointers[physicalId] = {
					isTouch: true,
					id: physicalId,
					position,
					delta: [0, 0],
					positionHistory: [{ pos: [...position], time: Date.now() }],
					velocity: [0, 0],
				};
				// console.log("Touch start: ", touch.identifier);

				// Treat fingers as the left mouse button by default
				const button = treatLeftAsRight ? Mouse.RIGHT : Mouse.LEFT;
				updateClickInfoDown(button, touch);
			}
		}) as EventListener);

		addListener(element, 'touchmove', ((e: TouchEvent): void => {
			atleastOneInputThisFrame = true;
			for (let i = 0; i < e.changedTouches.length; i++) {
				const touch: Touch = e.changedTouches[i]!;
				const touchId = getPhysicalPointerId(touch);
				const physicalPointer = physicalPointers[touchId];
				if (!physicalPointer) continue; // This touch likely started outside the element, so we ignored adding it.

				const relativeTouchPos = getRelativeMousePosition([touch.clientX, touch.clientY], element);
				// Update delta
				physicalPointer.delta[0] += relativeTouchPos[0] - physicalPointer.position[0];
				physicalPointer.delta[1] += relativeTouchPos[1] - physicalPointer.position[1];
				// Position
				physicalPointer.position = relativeTouchPos;

				// Update the delta (deltaSinceDown) for simulated mouse clicks
				updateDeltaSinceDownForPointer(physicalPointer.id, physicalPointer.delta);

				// Update velocity
				const now = Date.now();
				physicalPointer.positionHistory.push({ pos: [...physicalPointer.position], time: now }); // Deep copy the touch position to avoid modifying the original
				recalcPointerVel(physicalPointer, now);
				// console.log("Touch position: ", targetPointer.position);
			}
		}) as EventListener);

		// This listeners are placed on the document so we don't miss touchend events if the user lifts their finger off the element.
		addListener(document, 'touchend', touchEndCallback as EventListener);
		addListener(document, 'touchcancel', touchEndCallback as EventListener);

		function touchEndCallback(e: TouchEvent): void {
			atleastOneInputThisFrame = true;
			for (let i = 0; i < e.changedTouches.length; i++) {
				const touch: Touch = e.changedTouches[i]!;
				// console.log("Touch end/cancel: ", touch.identifier);
				const physicalId = getPhysicalPointerId(touch);
				// Destroy both pointers since it's a touch
				delete logicalPointers[physicalId];
				delete physicalPointers[physicalId];

				// Treat fingers as the left mouse button by default
				const button = treatLeftAsRight ? Mouse.RIGHT : Mouse.LEFT;
				updateClickInfoUp(button, touch);
			}
		}
	}

	
	// Keyboard Events ---------------------------------------------------------------------------


	if (keyboard) {

		addListener(element, 'keydown', ((e: KeyboardEvent): void => {
			// if (e.target !== element) return; // Ignore events triggered on CHILDREN of the element.
			if (document.activeElement !== document.body) return; // This ignores the event fired when the user is typing for example in a text box.
			// console.log("Key down: ", e.code);
			atleastOneInputThisFrame = true;
			if (!keyDowns.some(keyInfo => keyInfo.keyCode === e.code)) {
				keyDowns.push({
					keyCode: e.code,
					metaKey: e.ctrlKey || e.metaKey
				});
			}
			// Only add to keyHelds if no meta key was held
			if (!keyHelds.includes(e.code) && !(e.ctrlKey || e.metaKey)) keyHelds.push(e.code);

			if (e.key === 'Tab') e.preventDefault(); // Prevents the default tabbing behavior of cycling through elements on the page.
		}) as EventListener);

		// This listener is placed on the document so we don't miss mouseup events if the user lifts their mouse off the element.
		addListener(element, 'keyup', ((e: KeyboardEvent): void => {
			// console.log("Key up: ", e.code);
			atleastOneInputThisFrame = true;
			const downIndex = keyDowns.findIndex(keyInfo => keyInfo.keyCode === e.code);
			if (downIndex !== -1) keyDowns.splice(downIndex, 1);
			
			const heldIndex = keyHelds.indexOf(e.code);
			if (heldIndex !== -1) keyHelds.splice(heldIndex, 1);
		}) as EventListener);


		window.addEventListener('blur', function() {
			// Clear all keys being held, as when the window isn't in focus, we don't hear the key-up events.
			// So if we held down the shift key, then click off, then let go,
			// the game would CONTINUOUSLY keep zooming in without you pushing anything,
			// and you'd have to push the shift again to cancel it.
			keyHelds.length = 0;
		});

	}


	// Return the InputListener object ---------------------------------------------------------------------------


	return {
		element,
		atleastOneInput: (): boolean => atleastOneInputThisFrame,
		isMouseDown: (button: MouseButton): boolean => clickInfo[button].isDown ?? false,
		claimMouseDown: (button: MouseButton): void => {
			// console.error("Claiming mouse down: ", MouseNames[button]);
			clickInfo[button].isDown = false;
			// Also remove the pointer from the list of pointers down this frame.
			const pointerId = clickInfo[button].pointerId;
			const index = pointersDown.indexOf(pointerId!);
			// console.error("Claiming pointer down1: ", pointerId);
			if (index !== -1) pointersDown.splice(index, 1);
		},
		claimPointerDown: (pointerId: string): void => {
			// console.error("Claiming pointer down: ", pointerId);
			const index = pointersDown.indexOf(pointerId);
			if (index === -1) throw Error("Can't claim pointer down. Already claimed, or is not down.");
			// console.error("Claiming pointer down2: ", pointerId);
			pointersDown.splice(index, 1);
			// Also claim the mouse down if this pointer is the most recent pointer that performed that action.
			Object.values(clickInfo).forEach((buttonInfo) => {
				if (buttonInfo.pointerId === pointerId) buttonInfo.isDown = false;
			});
		},
		claimMouseClick: (button: MouseButton): void => {
			// console.error("Claiming mouse click: ", MouseNames[button]);
			clickInfo[button].clicked = false;
			// console.error("Claiming mouse click: ", MouseNames[button]);
		},
		cancelMouseClick: (button: MouseButton): number => clickInfo[button].timeDownMillisHistory.length = 0,
		isMouseHeld: (button: MouseButton): boolean => clickInfo[button].isHeld ?? false,
		isMouseTouch: (button: MouseButton): boolean => clickInfo[button].isTouch,
		isPointerTouch: (pointerId: string): boolean => logicalPointers[pointerId]?.physical.isTouch ?? false,
		getMouseId: (button: MouseButton): string | undefined => clickInfo[button].pointerId,
		getMousePhysicalId: (button: MouseButton): string | undefined => clickInfo[button].physicalId,
		getMousePosition: (button: MouseButton): DoubleCoords | undefined => {
			const logicalId = clickInfo[button].pointerId;
			if (!logicalId) return undefined;
			const logicalPointer = logicalPointers[logicalId];
			/**
			 * A. Pointer exists => Return its current position. (It may not exist anymore if it was a finger that has since lifted)
			 * B. Pointer does not exist => Return its last known position since it simulated an UP/DOWN mouse click.
			 */
			if (logicalPointer) {
				// Pointer is still held, get its live position.
				return logicalPointer.physical.position;
			} else {
				// Pointer has been lifted, return its last known position.
				return clickInfo[button].position;
			}
		},
		isMouseClicked: (button: MouseButton): boolean => clickInfo[button].clicked,
		isMouseDoubleClickDragged: (button: MouseButton): boolean => clickInfo[button].doubleClickDrag,
		setTreatLeftasRight: (value: boolean): boolean => treatLeftAsRight = value,
		getPointerPos: (pointerId: string): DoubleCoords | undefined => logicalPointers[pointerId]?.physical.position,
		getPhysicalPointerPos: (pointerId: string): DoubleCoords | undefined => physicalPointers[pointerId]?.position,
		getPhysicalPointerIdOfPointer: (pointerId: string): string | undefined => logicalPointers[pointerId]?.physical.id,
		getPhysicalPointerDelta: (physicalPointerId: string): DoubleCoords | undefined => physicalPointers[physicalPointerId]?.delta,
		getPointerVel: (pointerId: string): DoubleCoords | undefined => logicalPointers[pointerId]?.physical.velocity,
		getAllPointers: (button: MouseButton): string[] => Object.values(logicalPointers).filter(p => p.button === button).map(p => p.id), // Filter out the ones not for the button action, and map to ids
		getAllTouchPointers: (): string[] => Object.values(logicalPointers).filter(p => p.physical.isTouch).map(p => p.id), // Filter out the non-touch ones, and map to ids
		getAllPhysicalPointers: (): string[] => Object.keys(physicalPointers),
		isPointerHeld: (pointerId: string): boolean => logicalPointers[pointerId] !== undefined,
		pointerExists: (pointerId: string): boolean => logicalPointers[pointerId] !== undefined,
		getPointersDown: (button: MouseButton): string[] => pointersDown.filter(id => logicalPointers[id]!.button === button), // Filter out the ones not for the button action
		getTouchPointersDown: (): string[] => pointersDown.filter(id => logicalPointers[id]!.physical.isTouch),
		getPointersDownCount: (): number => pointersDown.length,
		doesPointerBelongToPhysicalPointer: (logicalPointerId: string, physicalPointerId: string): boolean => {
			const logicalPointer = logicalPointers[logicalPointerId];
			if (!logicalPointer) return false;
			return logicalPointer.physical === physicalPointers[physicalPointerId];
		},
		getWheelDelta: (): number => wheelDelta,
		isKeyDown: (keyCode: string, requireMetaKey?: boolean): boolean => {
			return keyDowns.some(keyInfo => keyInfo.keyCode === keyCode && (!requireMetaKey || keyInfo.metaKey));
		},
		isKeyHeld: (keyCode: string): boolean => keyHelds.includes(keyCode),
		removeEventListeners: (): void => {
			Object.keys(eventHandlers).forEach((eventType) => {
				const { target, handler } = eventHandlers[eventType]!;
				target.removeEventListener(eventType, handler);
			});
			console.log("Closed event listeners of Input Listener");
		},
	};
}

/** Generates the unique PHYSICAL pointer id for the mouse or touch event. */
function getPhysicalPointerId(e: MouseEvent | Touch): string {
	const mouseEvent = e instanceof MouseEvent; // CAN'T USE instanceof Touch because it's not defined in Safari!
	return mouseEvent ? 'mouse' : e.identifier.toString();
}

/** Generates the unique pointer id for the mouse or touch event and button action. */
function getLogicalPointerId(e: MouseEvent | Touch, button: MouseButton): string {
	const mouseEvent = e instanceof MouseEvent; // CAN'T USE instanceof Touch because it's not defined in Safari!
	return mouseEvent ? `mouse_${MouseNames[button]}` : e.identifier.toString();
}


/**
 * Converts the mouse coordinates to be relative to the
 * element bounding box instead of absolute to the whole page.
 */
function getRelativeMousePosition(coords: DoubleCoords, element: HTMLElement | typeof document): DoubleCoords {
	if (element instanceof Document) return coords; // No need to adjust if we're listening on the document.
	const rect = element.getBoundingClientRect();
	return [
		coords[0] - rect.left,
		coords[1] - rect.top
	];
}



export {
	Mouse,
	CreateInputListener
};

export default {
	getRelativeMousePosition,
};

export type {
	InputListener,
	MouseButton,
};