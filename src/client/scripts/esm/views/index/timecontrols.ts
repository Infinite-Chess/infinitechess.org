// src/client/scripts/esm/views/index/timecontrols.ts

/**
 * Manages the time control section of the game setup modal:
 * the timed/untimed toggle, base+increment sliders, and preset buttons.
 */

import type { TimeControl } from '../../../../../shared/chess/util/clockutil.js';

import clockutil from '../../../../../shared/chess/util/clockutil';

// Types -----------------------------------------------------------------------

/** Callbacks a host wires to react to the time controls' state. */
interface TimeControlsConfig {
	/** Fired only on committed changes (a preset click, or release of either slider); hosts act on it. */
	onCommit: () => void;
}

// Constants -------------------------------------------------------------------

/** Mappings from slider index to actual time control values for both time control sliders. */
const TIME_CONTROL_SLIDER_MAPPINGS = {
	BASE: clockutil.VALID_BASE_MINUTES,
	INCREMENT: clockutil.VALID_INCREMENT_SECS,
};

// Elements --------------------------------------------------------------------

const element_timeSliders = document.getElementById('time-sliders')!;
const element_sliderMinutes = document.getElementById('slider-minutes') as HTMLInputElement;
const element_minutesDisplay = document.getElementById('minutes-display')!;
const element_sliderIncrement = document.getElementById('slider-increment') as HTMLInputElement;
const element_incrementDisplay = document.getElementById('increment-display')!;
const element_presetButtons = document.querySelectorAll<HTMLElement>('.preset-btn');

// State -----------------------------------------------------------------------

/** Host callbacks, populated by {@link init}. */
let config: TimeControlsConfig;

// Initialization --------------------------------------------------------------

/** Wires both time sliders and the preset buttons, then syncs the section to the active markup. */
function init(hostConfig: TimeControlsConfig): void {
	config = hostConfig;

	linkSlider(element_sliderMinutes, element_minutesDisplay, (v) =>
		String(TIME_CONTROL_SLIDER_MAPPINGS.BASE[Number(v)]!),
	);
	linkSlider(element_sliderIncrement, element_incrementDisplay, (v) =>
		String(TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT[Number(v)]!),
	);

	element_presetButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			applyPreset(btn);
			config.onCommit();
		});
	});
	const activePreset = document.querySelector<HTMLElement>('.preset-btn.active');
	if (activePreset) applyPreset(activePreset);
	onTimeToggle();
}

/** Binds a slider's live display updates, and its drag release as a commit. */
function linkSlider(
	slider: HTMLInputElement,
	display: HTMLElement,
	format: (v: string) => string,
): void {
	slider.addEventListener('input', () => {
		display.textContent = format(slider.value);
		syncPresetHighlight();
	});
	slider.addEventListener('change', () => config.onCommit());
}

// Base and increment ----------------------------------------------------------

/** Sets both sliders and their displays to the given preset button's values. */
function applyPreset(btn: HTMLElement): void {
	// Presets store literal minute/increment values, not slider indices.
	setMinutesAndIncrement(
		Number(btn.getAttribute('data-minutes')),
		Number(btn.getAttribute('data-increment')),
	);
}

/** Moves both sliders and their displays to the given base minutes and increment seconds. */
function setMinutesAndIncrement(minutes: number, increment: number): void {
	element_sliderMinutes.value = String(TIME_CONTROL_SLIDER_MAPPINGS.BASE.indexOf(minutes));
	element_minutesDisplay.textContent = String(minutes);
	element_sliderIncrement.value = String(
		TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT.indexOf(increment),
	);
	element_incrementDisplay.textContent = String(increment);
	syncPresetHighlight();
}

/** The base minutes and increment seconds both sliders currently sit on. */
function getMinutesAndIncrement(): { minutes: number; increment: number } {
	return {
		minutes: TIME_CONTROL_SLIDER_MAPPINGS.BASE[Number(element_sliderMinutes.value)]!,
		increment: TIME_CONTROL_SLIDER_MAPPINGS.INCREMENT[Number(element_sliderIncrement.value)]!,
	};
}

/** Highlights the preset button that matches the current slider values. */
function syncPresetHighlight(): void {
	const { minutes, increment } = getMinutesAndIncrement();
	element_presetButtons.forEach((btn) => {
		const match =
			Number(btn.getAttribute('data-minutes')) === minutes &&
			Number(btn.getAttribute('data-increment')) === increment;
		btn.classList.toggle('active', match);
	});
}

// Time mode -------------------------------------------------------------------

/** Shows or hides the time slider section based on the active time mode. */
function onTimeToggle(): void {
	element_timeSliders.classList.toggle('is-collapsed', !isTimed());
}

/** Whether the time toggle group is set to a timed game, rather than an infinite one. */
function isTimed(): boolean {
	const activeBtn = document.querySelector<HTMLElement>('[data-time].active')!;
	return activeBtn.getAttribute('data-time') === 'timed';
}

/** Returns the current time control value from the modal's slider/toggle state. */
function getTimeControl(): TimeControl {
	if (!isTimed()) return '-';
	const { minutes, increment } = getMinutesAndIncrement();
	return `${minutes * 60}+${increment}`;
}

// Exports ---------------------------------------------------------------------

export default {
	// Initialization
	init,
	// Base and increment
	setMinutesAndIncrement,
	getMinutesAndIncrement,
	// Time mode
	onTimeToggle,
	getTimeControl,
};
