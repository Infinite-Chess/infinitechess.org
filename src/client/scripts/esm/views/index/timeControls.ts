// src/client/scripts/esm/views/index/timeControls.ts

import type { TimeControl } from '../../../../../shared/types.js';

import clockutil from '../../../../../shared/chess/util/clockutil';

/**
 * This script manages the time control section of the game setup modal:
 * the timed/untimed toggle, base+increment sliders, and preset buttons.
 */

// Constants ------------------------------------------

/** Mappings from slider index to actual time control values for both time control sliders. */
const TIME_CONTROL_SLIDER_MAPPINGS = {
	BASE: clockutil.VALID_BASE_MINUTES,
	INCREMENT: clockutil.VALID_INCREMENT_SECS,
};

// Elements ----------------------------------------------

const element_timeSliders = document.getElementById('time-sliders')!;
const element_sliderMinutes = document.getElementById('slider-minutes') as HTMLInputElement;
const element_minutesDisplay = document.getElementById('minutes-display')!;
const element_sliderIncrement = document.getElementById('slider-increment') as HTMLInputElement;
const element_incrementDisplay = document.getElementById('increment-display')!;
const element_presetButtons = document.querySelectorAll<HTMLElement>('.preset-btn');

// Functions ----------------------------------------------

/** Connects both time sliders to their value displays. */
function initModalSliders(): void {
	linkSlider(element_sliderMinutes, element_minutesDisplay, (v) =>
		String(TIME_CONTROL_SLIDER_MAPPINGS.BASE[Number(v)]!),
	);
	linkSlider(element_sliderIncrement, element_incrementDisplay, (v) =>
		String(TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT[Number(v)]!),
	);
}

/** Binds slider input updates to a display formatter callback. */
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

/** Applies a selected preset to both sliders and display labels. */
function initPresets(): void {
	element_presetButtons.forEach((btn) => {
		btn.addEventListener('click', () => applyPreset(btn));
	});
	const activePreset = document.querySelector<HTMLElement>('.preset-btn.active');
	if (activePreset) applyPreset(activePreset);
}

/** Sets both sliders and their displays to the given preset button's values. */
function applyPreset(btn: HTMLElement): void {
	// Presets store literal minute/increment values, not slider indices.
	const minutes = Number(btn.getAttribute('data-minutes'));
	const increment = Number(btn.getAttribute('data-increment'));
	element_sliderMinutes.value = String(TIME_CONTROL_SLIDER_MAPPINGS.BASE.indexOf(minutes));
	element_minutesDisplay.textContent = String(minutes);
	element_sliderIncrement.value = String(
		TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT.indexOf(increment),
	);
	element_incrementDisplay.textContent = String(increment);
	syncPresetHighlight();
}

/** Highlights the preset button that matches the current slider values. */
function syncPresetHighlight(): void {
	const currentMinutes = TIME_CONTROL_SLIDER_MAPPINGS.BASE[Number(element_sliderMinutes.value)]!;
	const currentIncrement =
		TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT[Number(element_sliderIncrement.value)]!;
	element_presetButtons.forEach((btn) => {
		const match =
			Number(btn.getAttribute('data-minutes')) === currentMinutes &&
			Number(btn.getAttribute('data-increment')) === currentIncrement;
		btn.classList.toggle('active', match);
	});
}

/** Shows or hides the time slider section based on the active time mode. */
function onTimeToggle(): void {
	const activeBtn = document.querySelector<HTMLElement>('[data-time].active')!;
	const isTimed = activeBtn.getAttribute('data-time') === 'timed';
	element_timeSliders.classList.toggle('is-collapsed', !isTimed);
}

/** Returns the current time control value from the modal's slider/toggle state. */
function getTimeControl(): TimeControl {
	const activeBtn = document.querySelector<HTMLElement>('[data-time].active')!;
	const isTimed = activeBtn.getAttribute('data-time') === 'timed';
	if (!isTimed) return '-';
	const minutes = TIME_CONTROL_SLIDER_MAPPINGS.BASE[Number(element_sliderMinutes.value)]!;
	const increment =
		TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT[Number(element_sliderIncrement.value)]!;
	return `${minutes * 60}+${increment}` as TimeControl;
}

// Exports ----------------------------------------------

export default {
	initModalSliders,
	onTimeToggle,
	initPresets,
	getTimeControl,
};
