// src/shared/util/EventBus.ts

/**
 * A typed wrapper around `EventTarget`: event names and their detail types are
 * declared up front, so listeners and dispatches are checked against each other.
 * @typeParam T - Maps each event name to the detail type its `CustomEvent` carries.
 */
export class EventBus<T extends Record<string, any>> {
	private target = new EventTarget();

	/** Subscribes to `type`. Keep the listener reference to remove it later. */
	addEventListener<K extends keyof T & string>(
		type: K,
		listener: (event: CustomEvent<T[K]>) => void,
		options?: boolean | AddEventListenerOptions,
	): void {
		// We cast 'as any' here because the internal EventTarget expects a
		// generic EventListener, but we are enforcing a stricter one.
		this.target.addEventListener(type, listener as any, options);
	}

	/** Unsubscribes a listener previously passed to {@link EventBus.addEventListener}. */
	removeEventListener<K extends keyof T & string>(
		type: K,
		listener: (event: CustomEvent<T[K]>) => void,
		options?: boolean | EventListenerOptions,
	): void {
		this.target.removeEventListener(type, listener as any, options);
	}

	/** Fires `type`. Returns false if a listener cancelled it with `preventDefault()`. */
	dispatch<K extends keyof T & string>(
		type: K,
		...args: undefined extends T[K] ? [detail?: T[K]] : [detail: T[K]]
	): boolean {
		const [detail] = args;
		const event = new CustomEvent(type, { detail, cancelable: true });
		return this.target.dispatchEvent(event);
	}
}
