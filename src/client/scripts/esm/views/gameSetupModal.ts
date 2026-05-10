// src/client/scripts/esm/views/gameSetupModal.ts

// Types ----------------------------------------------

type ModalMode = 'create' | 'friend' | 'ai';

type ToggleGroupAttribute = 'data-time' | 'data-mode' | 'data-side' | 'data-level' | 'data-type';

// Constants ------------------------------------------

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

// Elements ----------------------------------------------

const element_btnCreateGame = document.getElementById('btn-create-game')!;
const element_btnChallengeFriend = document.getElementById('btn-challenge-friend')!;
const element_btnPlayAi = document.getElementById('btn-play-ai')!;
const element_modalClose = document.getElementById('modal-close')!;
const element_modalOverlay = document.getElementById('modal-overlay')!;
const element_modalSubmit = document.getElementById('modal-submit')!;
const element_rowGameMode = document.getElementById('row-game-mode')!;
const element_rowStrength = document.getElementById('row-strength')!;
const element_sliderMinutes = document.getElementById('slider-minutes')! as HTMLInputElement;
const element_minutesDisplay = document.getElementById('minutes-display')!;
const element_sliderIncrement = document.getElementById('slider-increment')! as HTMLInputElement;
const element_incrementDisplay = document.getElementById('increment-display')!;
const element_timeSliders = document.getElementById('time-sliders')!;
const element_variantPresetSection = document.getElementById('variant-preset-section')!;
const element_variantCustomSection = document.getElementById('variant-custom-section')!;
const element_btnPasteIcn = document.getElementById('btn-paste-icn')!;
const element_icnInput = document.getElementById('icn-input')! as HTMLTextAreaElement;
const element_presetButtons = document.querySelectorAll<HTMLElement>('.preset-btn');
const element_buttonsByToggleGroup: Record<ToggleGroupAttribute, NodeListOf<HTMLElement>> = {
	'data-time': document.querySelectorAll<HTMLElement>('[data-time]'),
	'data-mode': document.querySelectorAll<HTMLElement>('[data-mode]'),
	'data-side': document.querySelectorAll<HTMLElement>('[data-side]'),
	'data-level': document.querySelectorAll<HTMLElement>('[data-level]'),
	'data-type': document.querySelectorAll<HTMLElement>('[data-type]'),
};

// Initialization ----------------------------------------------

initModal();

// Functions ----------------------------------------------

function sliderToValue(index: number, values: number[]): number {
	return values[Math.max(0, Math.min(values.length - 1, index))] ?? values[0]!;
}

function valueToSliderIndex(value: number, values: number[]): number {
	const i = values.indexOf(value);
	return i >= 0 ? i : 0;
}

function initModal(): void {
	element_btnCreateGame.addEventListener('click', () => openModal('create'));
	element_btnChallengeFriend.addEventListener('click', () => openModal('friend'));
	element_btnPlayAi.addEventListener('click', () => openModal('ai'));

	element_modalClose.addEventListener('click', closeModal);
	element_modalOverlay.addEventListener('pointerdown', (e) => {
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
	element_modalSubmit.textContent = SUBMIT_LABELS[mode];

	element_rowGameMode.classList.toggle('hidden', mode === 'ai');
	element_rowStrength.classList.toggle('hidden', mode !== 'ai');

	element_modalOverlay.classList.remove('hidden');

	element_modalClose.focus();
}

function closeModal(): void {
	element_modalOverlay.classList.add('hidden');
}

function initModalSliders(): void {
	linkSlider(element_sliderMinutes, element_minutesDisplay, (v) =>
		String(sliderToValue(parseInt(v), MINUTE_VALUES)),
	);
	linkSlider(element_sliderIncrement, element_incrementDisplay, (v) =>
		String(sliderToValue(parseInt(v), INCREMENT_VALUES)),
	);
}

function linkSlider(
	slider: HTMLInputElement,
	display: HTMLElement,
	format: (v: string) => string,
): void {
	slider.addEventListener('input', () => {
		display.textContent = format(slider.value);
		syncPresetHighlight();
	});
}

function initToggleGroups(): void {
	// Each [data-time], [data-mode], [data-side], [data-level], [data-type] button is an exclusive-select group.
	// Buttons sharing the same data-* attribute key form one group.
	const groups: [ToggleGroupAttribute, (() => void)?][] = [
		['data-time', onTimeToggle],
		['data-mode'],
		['data-side'],
		['data-level'],
		['data-type', onVariantTypeToggle],
	];
	for (const [attr, callback] of groups) {
		element_buttonsByToggleGroup[attr].forEach((btn) => {
			btn.addEventListener('click', () => {
				element_buttonsByToggleGroup[attr].forEach((groupButton) =>
					groupButton.classList.remove('active'),
				);
				btn.classList.add('active');
				callback?.();
			});
		});
	}
}

function initPresets(): void {
	element_presetButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			const minutes = Number(btn.getAttribute('data-minutes'));
			const increment = Number(btn.getAttribute('data-increment'));
			element_sliderMinutes.value = String(valueToSliderIndex(minutes, MINUTE_VALUES));
			element_minutesDisplay.textContent = String(minutes);
			element_sliderIncrement.value = String(valueToSliderIndex(increment, INCREMENT_VALUES));
			element_incrementDisplay.textContent = String(increment);
			syncPresetHighlight();
		});
	});
}

function syncPresetHighlight(): void {
	const currentMinutes = sliderToValue(parseInt(element_sliderMinutes.value), MINUTE_VALUES);
	const currentIncrement = sliderToValue(
		parseInt(element_sliderIncrement.value),
		INCREMENT_VALUES,
	);
	element_presetButtons.forEach((btn) => {
		const match =
			parseInt(btn.getAttribute('data-minutes') ?? '') === currentMinutes &&
			parseInt(btn.getAttribute('data-increment') ?? '') === currentIncrement;
		btn.classList.toggle('active', match);
	});
}

function onTimeToggle(): void {
	const activeBtn = document.querySelector<HTMLElement>('[data-time].active');
	const isFinite = activeBtn?.getAttribute('data-time') === 'finite';
	element_timeSliders.classList.toggle('hidden', !isFinite);
}

function onVariantTypeToggle(): void {
	const activeBtn = document.querySelector<HTMLElement>('[data-type].active');
	const isCustom = activeBtn?.getAttribute('data-type') === 'custom';
	element_variantPresetSection.classList.toggle('hidden', isCustom);
	element_variantCustomSection.classList.toggle('hidden', !isCustom);
}

function initPasteButton(): void {
	element_btnPasteIcn.addEventListener('click', async () => {
		try {
			element_icnInput.value = await navigator.clipboard.readText();
		} catch {
			// Clipboard access denied — silently ignore.
		}
	});
}

// Exports ----------------------------------------------

export {};
