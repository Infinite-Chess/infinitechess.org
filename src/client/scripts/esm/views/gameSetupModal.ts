// src/client/scripts/esm/views/gameSetupModal.ts

export {};

type ModalMode = 'create' | 'friend' | 'ai';

const SUBMIT_LABELS: Record<ModalMode, string> = {
	create: 'Create Game',
	friend: 'Send Challenge',
	ai: 'Play',
};

// Non-linear slider value tables: index → actual value
// prettier-ignore
const MINUTE_VALUES: number[] = [
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
	25, 30, 35, 40, 45,
	60,
];

// prettier-ignore
const INCREMENT_VALUES: number[] = [
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
	25, 30, 35, 40, 45,
	60,
];

function sliderToValue(index: number, values: number[]): number {
	return values[Math.max(0, Math.min(values.length - 1, index))] ?? values[0]!;
}

function valueToSliderIndex(value: number, values: number[]): number {
	const i = values.indexOf(value);
	return i >= 0 ? i : 0;
}

function initModal(): void {
	document
		.getElementById('btn-create-game')
		?.addEventListener('click', () => openModal('create'));
	document
		.getElementById('btn-challenge-friend')
		?.addEventListener('click', () => openModal('friend'));
	document.getElementById('btn-play-ai')?.addEventListener('click', () => openModal('ai'));

	document.getElementById('modal-close')?.addEventListener('click', closeModal);
	document.getElementById('modal-overlay')?.addEventListener('pointerdown', (e) => {
		if (e.target === e.currentTarget) closeModal();
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeModal();
	});

	initModalSliders();
	initToggleGroups();
	onTimeToggle();
	initPresets();
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
	linkSlider('slider-minutes', 'minutes-display', (v) =>
		String(sliderToValue(parseInt(v), MINUTE_VALUES)),
	);
	linkSlider('slider-increment', 'increment-display', (v) =>
		String(sliderToValue(parseInt(v), INCREMENT_VALUES)),
	);
}

function linkSlider(sliderId: string, displayId: string, format: (v: string) => string): void {
	const slider = document.getElementById(sliderId) as HTMLInputElement | null;
	const display = document.getElementById(displayId);
	if (!slider || !display) return;
	slider.addEventListener('input', () => {
		display.textContent = format(slider.value);
		syncPresetHighlight();
	});
}

function initToggleGroups(): void {
	// Each [data-time], [data-mode], [data-side], [data-level], [data-type] button is an exclusive-select group.
	// Buttons sharing the same data-* attribute key form one group.
	const groups: [string, (() => void)?][] = [
		['data-time', onTimeToggle],
		['data-mode'],
		['data-side'],
		['data-level'],
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

function initPresets(): void {
	document.querySelectorAll<HTMLElement>('.preset-btn').forEach((btn) => {
		btn.addEventListener('click', () => {
			const minutes = parseInt(btn.getAttribute('data-minutes') ?? '');
			const increment = parseInt(btn.getAttribute('data-increment') ?? '');
			const minutesSlider = document.getElementById(
				'slider-minutes',
			) as HTMLInputElement | null;
			const incrementSlider = document.getElementById(
				'slider-increment',
			) as HTMLInputElement | null;
			const minutesDisplay = document.getElementById('minutes-display');
			const incrementDisplay = document.getElementById('increment-display');
			if (minutesSlider && !isNaN(minutes)) {
				minutesSlider.value = String(valueToSliderIndex(minutes, MINUTE_VALUES));
				if (minutesDisplay) minutesDisplay.textContent = String(minutes);
			}
			if (incrementSlider && !isNaN(increment)) {
				incrementSlider.value = String(valueToSliderIndex(increment, INCREMENT_VALUES));
				if (incrementDisplay) incrementDisplay.textContent = String(increment);
			}
			syncPresetHighlight();
		});
	});
}

function syncPresetHighlight(): void {
	const minutesSlider = document.getElementById('slider-minutes') as HTMLInputElement | null;
	const incrementSlider = document.getElementById('slider-increment') as HTMLInputElement | null;
	if (!minutesSlider || !incrementSlider) return;
	const currentMinutes = sliderToValue(parseInt(minutesSlider.value), MINUTE_VALUES);
	const currentIncrement = sliderToValue(parseInt(incrementSlider.value), INCREMENT_VALUES);
	document.querySelectorAll<HTMLElement>('.preset-btn').forEach((btn) => {
		const match =
			parseInt(btn.getAttribute('data-minutes') ?? '') === currentMinutes &&
			parseInt(btn.getAttribute('data-increment') ?? '') === currentIncrement;
		btn.classList.toggle('active', match);
	});
}

function onTimeToggle(): void {
	const activeBtn = document.querySelector<HTMLElement>('[data-time].active');
	const isFinite = activeBtn?.getAttribute('data-time') === 'finite';
	document.getElementById('time-control')?.classList.toggle('hidden', !isFinite);
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
