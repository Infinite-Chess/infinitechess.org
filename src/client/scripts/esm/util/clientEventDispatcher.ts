
/**
 * This event dispatcher will only dispatch events in the browser environment.
 * 
 * NOTHING will happen if it is imported, or its methods are called, in the Node.js environment.
 */


/** Whether the current environment is a browser. */
const isBrowser = typeof window !== 'undefined' && typeof window.dispatchEvent === 'function';
const target: Window = isBrowser ? window : null!;


/**
 * Dispatches an event with the given name. If data is provided, a CustomEvent is dispatched
 * with the data in the detail property. Otherwise, a standard Event is dispatched.
 * @param eventName The name of the event to dispatch.
 * @param [data] Optional data to include in the event's detail property.
 */
function dispatch(eventName: string, data?: any): void {
    if (!isBrowser) return;
	if (data !== undefined) target.dispatchEvent(new CustomEvent(eventName, { detail: data }));
	else target.dispatchEvent(new Event(eventName));
}

/**
 * Listens for an event with the given name.
 * @param eventName The name of the event to listen for.
 * @param callback The callback function to invoke when the event occurs.
 */
function listen(eventName: string, callback: (event: Event) => void): void {
    if (!isBrowser) return;
	target.addEventListener(eventName, callback);
}

/**
 * Removes a previously added event listener.
 * @param eventName The name of the event.
 * @param callback The callback function to remove.
 */
function removeListener(eventName: string, callback: (event: Event) => void): void {
    if (!isBrowser) return;
	target.removeEventListener(eventName, callback);
}

export default {
    dispatch,
    listen,
    removeListener
};