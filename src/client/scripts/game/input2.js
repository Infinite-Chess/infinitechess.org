
import docutil from "./misc/docutil.js";


function createInputListener(element) {
	const mouseDowns = [];
	const mouseHelds = [];
	const keyDowns = [];
	const keyHelds = [];
	let mousePos = [0, 0];
	const eventHandlers = {};

	// Helper function to store event listeners and their handlers
	const addListener = (target, eventType, handler) => {
		target.addEventListener(eventType, handler);
		eventHandlers[eventType] = { target, handler };
	};

	// Add event listeners and track them
	addListener(element, 'mousedown', (e) => {
		mouseDowns.push(e.button);
		if (!mouseHelds.includes(e.button)) {
			mouseHelds.push(e.button);
		}
	});

	addListener(element, 'mouseup', (e) => {
		const downIndex = mouseDowns.indexOf(e.button);
		if (downIndex !== -1) mouseDowns.splice(downIndex, 1);

		const heldIndex = mouseHelds.indexOf(e.button);
		if (heldIndex !== -1) mouseHelds.splice(heldIndex, 1);
	});

	addListener(document, 'keydown', (e) => {
		if (!keyDowns.includes(e.code)) keyDowns.push(e.code);
		if (!keyHelds.includes(e.code)) keyHelds.push(e.code);
	});

	addListener(document, 'keyup', (e) => {
		const downIndex = keyDowns.indexOf(e.code);
		if (downIndex !== -1) keyDowns.splice(downIndex, 1);

		const heldIndex = keyHelds.indexOf(e.code);
		if (heldIndex !== -1) keyHelds.splice(heldIndex, 1);
	});

	addListener(element, 'mousemove', (e) => {
		mousePos = [e.clientX, e.clientY];
	});

	return {
		isMouseDown: (button) => mouseDowns.includes(button),
		isMouseHeld: (button) => mouseHelds.includes(button),
		isKeyDown: (keyCode) => keyDowns.includes(keyCode),
		isKeyHeld: (keyCode) => keyHelds.includes(keyCode),
		getMousePos: () => [...mousePos],
		removeEventListeners: () => {
			// Remove all event listeners that were added
			Object.keys(eventHandlers).forEach((eventType) => {
				const { target, handler } = eventHandlers[eventType];
				target.removeEventListener(eventType, handler);
			});
			console.log("Closed event listeners of Input Listener");
		}
	};
}


//---------------------------------------------------------------------------------------------------------

/**
 * 
 * @param {KeyboardEvent} event 
 * @param {InputListener} inputListener 
 * @param {Object} options 
 */
function onContextMenu(event, inputListener) {
	const targetIsElement = event.target === inputListener.element; // target is the deepest most element affected by the event
	// const targetIsElement = event.currentTarget === element; // currentTarget is the element that owns the event listener
	if (targetIsElement) event.preventDefault(); // Stop the contextual (right-click) menu from popping up.
}







export default { createInputListener };