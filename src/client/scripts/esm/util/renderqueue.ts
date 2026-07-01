// src/client/scripts/esm/util/renderqueue.ts

/**
 * Creates a render queue that serializes async DOM-render tasks into dispatch order.
 * Needed whenever a render awaits (e.g. an async asset fetch) and rapid updates would
 * otherwise interleave and race. Each queued task runs only after the previous settles.
 * Reusable for any such control (moves list, captured-material bars, etc.).
 * @param label - Prefixes any logged task error, identifying the queue's owner.
 * @returns An `enqueue` function that appends a task to this queue.
 */
export function createRenderQueue(label: string): (task: () => void | Promise<void>) => void {
	let chain: Promise<void> = Promise.resolve();
	return (task) => {
		chain = chain.then(task).catch((e) => console.error(`${label}:`, e));
	};
}
