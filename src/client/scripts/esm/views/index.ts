// src/client/scripts/esm/views/index.ts

// ── Animation toggle ─────────────────────────────────────────────────────────

// ── Modal ────────────────────────────────────────────────────────────────────

type ModalMode = 'create' | 'friend' | 'ai';

const SUBMIT_LABELS: Record<ModalMode, string> = {
	create: 'Create Game',
	friend: 'Send Challenge',
	ai: 'Play',
};

function initModal(): void {
	document
		.getElementById('btn-create-game')
		?.addEventListener('click', () => openModal('create'));
	document
		.getElementById('btn-challenge-friend')
		?.addEventListener('click', () => openModal('friend'));
	document.getElementById('btn-play-ai')?.addEventListener('click', () => openModal('ai'));

	document.getElementById('modal-close')?.addEventListener('click', closeModal);
	document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
		if (e.target === e.currentTarget) closeModal();
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeModal();
	});

	initModalSliders();
	initToggleGroups();
	initPasteButton();
}

function openModal(mode: ModalMode): void {
	const submit = document.getElementById('modal-submit');
	const rowSide = document.getElementById('row-side');
	const rowGameMode = document.getElementById('row-game-mode');
	const rowStrength = document.getElementById('row-strength');

	if (submit) submit.textContent = SUBMIT_LABELS[mode];

	rowSide?.classList.toggle('hidden', mode === 'create');
	rowGameMode?.classList.toggle('hidden', mode === 'ai');
	rowStrength?.classList.toggle('hidden', mode !== 'ai');

	const overlay = document.getElementById('modal-overlay');
	overlay?.classList.remove('hidden');

	document.getElementById('modal-close')?.focus();
}

function closeModal(): void {
	const overlay = document.getElementById('modal-overlay');
	overlay?.classList.add('hidden');
}

function initModalSliders(): void {
	linkSlider('slider-minutes', 'minutes-display', (v) => `${v}m`);
	linkSlider('slider-increment', 'increment-display', (v) => `${v}s`);
	linkSlider('slider-strength', 'strength-display', (v) => `Level ${v}`);
}

function linkSlider(sliderId: string, displayId: string, format: (v: string) => string): void {
	const slider = document.getElementById(sliderId) as HTMLInputElement | null;
	const display = document.getElementById(displayId);
	if (!slider || !display) return;
	slider.addEventListener('input', () => {
		display.textContent = format(slider.value);
	});
}

function initToggleGroups(): void {
	// Each [data-time], [data-mode], [data-side], [data-type] button is an exclusive-select group.
	// Buttons sharing the same data-* attribute key form one group.
	const groups: [string, (() => void)?][] = [
		['data-time', onTimeToggle],
		['data-mode'],
		['data-side'],
		['data-type', onVariantTypeToggle],
	];
	for (const [attr, callback] of groups) {
		document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((btn) => {
			btn.addEventListener('click', () => {
				document
					.querySelectorAll<HTMLElement>(`[${attr}]`)
					.forEach((b) => b.classList.remove('active'));
				btn.classList.add('active');
				callback?.();
			});
		});
	}
}

function onTimeToggle(): void {
	const activeBtn = document.querySelector<HTMLElement>('[data-time].active');
	const isFinite = activeBtn?.getAttribute('data-time') === 'finite';
	document.getElementById('time-sliders')?.classList.toggle('hidden', !isFinite);
}

function onVariantTypeToggle(): void {
	const activeBtn = document.querySelector<HTMLElement>('[data-type].active');
	const isCustom = activeBtn?.getAttribute('data-type') === 'custom';
	document.getElementById('variant-preset-section')?.classList.toggle('hidden', isCustom);
	document.getElementById('variant-custom-section')?.classList.toggle('hidden', !isCustom);
}

function initPasteButton(): void {
	document.getElementById('btn-paste-icn')?.addEventListener('click', async () => {
		const input = document.getElementById('icn-input') as HTMLTextAreaElement | null;
		if (!input) return;
		try {
			input.value = await navigator.clipboard.readText();
		} catch {
			// Clipboard access denied — silently ignore.
		}
	});
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

initModal();
