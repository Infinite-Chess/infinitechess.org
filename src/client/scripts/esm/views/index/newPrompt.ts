// src/client/scripts/esm/views/index/newPrompt.ts

/**
 * Wires up the "New?" prompt shown above the lobby.
 *
 * Either button persists the dismissal to localStorage, and an inline script in
 * index.njk's head block reads that flag on subsequent page loads to hide the
 * section before first paint (see html[data-home-prompt='dismissed'] in index.css).
 */

/** localStorage key shared with the inline head script in index.njk. */
const STORAGE_KEY = 'home-prompt-dismissed';

const section = document.getElementById('new-prompt')!;
const dismissBtn = document.getElementById('new-prompt-dismiss')!;
const tutorialBtn = document.getElementById('new-prompt-tutorial')!;

function markDismissed(): void {
	localStorage.setItem(STORAGE_KEY, '1');
}

function dismiss(): void {
	markDismissed();
	section.classList.add('collapsed');
}

dismissBtn.addEventListener('click', dismiss);
tutorialBtn.addEventListener('click', markDismissed);

// DEV: uncomment to clear the dismissed flag on every page load.
// localStorage.removeItem(STORAGE_KEY);
// document.documentElement.removeAttribute('data-home-prompt');
