// src/shared/util/EventBus.ts

/**
 * Typed Event Bus
 * T is the mapping of event names to detail types.
 */
export class EventBus<T extends Record<string, any>> {
	private target = new EventTarget();

	addEventListener<K extends keyof T & string>(
		type: K,
		listener: (event: CustomEvent<T[K]>) => void,
		options?: boolean | AddEventListenerOptions,
	): void {
		// We cast 'as any' here because the internal EventTarget expects a
		// generic EventListener, but we are enforcing a stricter one.
		this.target.addEventListener(type, listener as any, options);
	}

	removeEventListener<K extends keyof T & string>(
		type: K,
		listener: (event: CustomEvent<T[K]>) => void,
		options?: boolean | EventListenerOptions,
	): void {
		this.target.removeEventListener(type, listener as any, options);
	}

	dispatch<K extends keyof T & string>(
		type: K,
		...args: undefined extends T[K] ? [detail?: T[K]] : [detail: T[K]]
	): boolean {
		const [detail] = args;
		const event = new CustomEvent(type, { detail, cancelable: true });
		return this.target.dispatchEvent(event);
	}
}
