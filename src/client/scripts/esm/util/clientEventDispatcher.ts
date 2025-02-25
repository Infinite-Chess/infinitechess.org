
/**
 * This event dispatcher will only dispatch events in the browser environment.
 * 
 * NOTHING will happen if it is imported, or its methods are called, in the Node.js environment.
 */


/** Whether the current environment is a browser. */
const isBrowser = typeof window !== 'undefined' && typeof window.dispatchEvent === 'function';
const target: Window = isBrowser ? window : null!;


/**
 * Dispatches an event with the given name.
 * @param eventName The name of the event to dispatch.
 */
function dispatch(eventName: string): void {
	if (isBrowser) target.dispatchEvent(new Event(eventName));
}

/**
 * Listens for an event with the given name.
 * @param eventName The name of the event to listen for.
 * @param callback The callback function to invoke when the event occurs.
 */
function listen(eventName: string, callback: () => void): void {
	if (isBrowser) target.addEventListener(eventName, callback as EventListener);
}

/**
 * Removes a previously added event listener.
 * @param eventName The name of the event.
 * @param callback The callback function to remove.
 */
function removeListener(eventName: string, callback: () => void): void {
	if (isBrowser) target.removeEventListener(eventName, callback as EventListener);
}



export default {
	dispatch,
	listen,
	removeListener
};