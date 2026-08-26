// src/client/scripts/esm/util/passwordtoggle.ts

/**
 * Wires the show/hide toggles for password inputs rendered by the `passwordInput` njk macro
 * (components/forms.njk): a `.password-wrap` holding the input and a `.password-toggle` button
 * with an eye / eye-off glyph. Self-initializing — import it for its side effect on any page
 * with password fields.
 */

for (const toggle of document.querySelectorAll<HTMLButtonElement>('.password-toggle')) {
	const input = toggle.closest('.password-wrap')?.querySelector<HTMLInputElement>('input');
	const eye = toggle.querySelector<SVGElement>('.password-eye');
	const eyeOff = toggle.querySelector<SVGElement>('.password-eye-off');
	if (!input || !eye || !eyeOff) {
		console.error('Password toggle is missing its input or eye glyphs.', toggle);
		continue;
	}

	toggle.addEventListener('click', (): void => {
		const reveal = input.type === 'password';
		input.type = reveal ? 'text' : 'password';
		eye.classList.toggle('hidden', reveal);
		eyeOff.classList.toggle('hidden', !reveal);
	});

	// Prevent the button from stealing keyboard focus when clicked, so that
	// the focus (and the Enter-to-submit behavior) stays on the password input.
	toggle.addEventListener('mousedown', (e: MouseEvent): void => e.preventDefault());
}
