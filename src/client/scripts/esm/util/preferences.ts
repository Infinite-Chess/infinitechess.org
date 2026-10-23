// src/client/scripts/esm/util/preferences.ts

/**
 * The user's saved preferences — board theme, sound, perspective, animation and premove
 * settings — and the theme colors derived from whichever board theme is selected.
 *
 * Persisted to LocalStorage on every change, and pushed to the server on every change to a
 * server-side one, so a logged-in user's settings follow them between devices. The header's
 * settings dropdowns are the only writers; everything else reads.
 */

import type { Color } from '../../../../shared/types/color.js';

import themes from '../../../../shared/components/header/themes.js';
import jsutil from '../../../../shared/util/jsutil.js';
import timeutil from '../../../../shared/util/timeutil.js';

import docutil from './docutil.js';
import LocalStorage from './LocalStorage.js';
import validatorama from './validatorama.js';
import { SettingsBus } from './SettingsBus.js';
import { serverfetch } from './serverfetch.js';

// Types -----------------------------------------------------------------------

/** Prefs kept on this device only. */
interface ClientSidePreferences {
	perspective_sensitivity: number;
	perspective_fov: number;
	drag_enabled: boolean;
	premove_enabled: boolean;
	fast_transitions_enabled: boolean;
	coordinates_enabled: boolean;
	starfield_enabled: boolean;
	advanced_effects_enabled: boolean;
	/** Master volume level from 0 (silent) to 1 (full volume) */
	master_volume: number;
	ambience_enabled: boolean;
	[key: string]: any;
}

/**
 * Prefs saved on the server, so they follow a logged-in user between devices.
 *
 * Each change to one of these PUTs to the server immediately, which is cheap only because
 * every one is a discrete click. A slider added here must push on release, not on every tick.
 */
interface ServerSidePreferences {
	theme: string;
	legal_moves: 'dots' | 'squares';
	animations: boolean;
	lingering_annotations: boolean;
}

/** Both client and server side preferences */
type Preferences = ServerSidePreferences & ClientSidePreferences;

// Constants -------------------------------------------------------------------

/** Prefs that do NOT get saved on the server side */
const CLIENT_SIDE_PREFS: string[] = [
	'perspective_sensitivity',
	'perspective_fov',
	'drag_enabled',
	'premove_enabled',
	'fast_transitions_enabled',
	'coordinates_enabled',
	'starfield_enabled',
	'advanced_effects_enabled',
	'master_volume',
	'ambience_enabled',
];

/** The preferences a user starts with. */
const DEFAULT_PREFERENCES: Preferences = {
	theme: themes.DEFAULT_THEME,
	legal_moves: 'squares',
	perspective_sensitivity: 100,
	perspective_fov: 90,
	drag_enabled: true,
	premove_enabled: true,
	fast_transitions_enabled: false,
	/** When false, animations are instant, only playing the sound. (same as dropping dragged pieces) */
	animations: true,
	lingering_annotations: true,
	coordinates_enabled: false,
	starfield_enabled: true,
	advanced_effects_enabled: true,
	master_volume: 1,
	ambience_enabled: true,
};

// State -----------------------------------------------------------------------

/** The user's preferences. */
let preferences: Preferences;

// Functions -------------------------------------------------------------------

(function init(): void {
	loadPreferences();
})();

function loadPreferences(): void {
	const browserStoragePrefs: Preferences = { ...DEFAULT_PREFERENCES, ...readStoredPreferences() };

	preferences = browserStoragePrefs;

	const cookiePrefs: string | undefined = docutil.getCookieValue('preferences');
	if (cookiePrefs) {
		preferences = JSON.parse(decodeURIComponent(cookiePrefs));
		CLIENT_SIDE_PREFS.forEach((pref) => (preferences![pref] = browserStoragePrefs[pref]));
	}
}

/** Reads the preferences out of local storage, returning only the valid ones. */
function readStoredPreferences(): Partial<Preferences> {
	const stored: unknown = LocalStorage.loadItem('preferences');
	if (typeof stored !== 'object' || stored === null) return {};
	/**
	 * A bad theme name needs no check here — {@link themes.getPropertyOfTheme}
	 * already falls back to the default theme's colors for a name it doesn't recognize.
	 */
	const valid: Partial<Preferences> = {};
	for (const [key, value] of Object.entries(stored)) {
		// An unrecognized key's default is undefined, so its typeof never matches.
		if (typeof value === typeof DEFAULT_PREFERENCES[key]) valid[key] = value;
	}
	return valid;
}

function savePreferences(): void {
	const oneYearInMs: number = timeutil.toMillis(1, 'years');
	LocalStorage.saveItem('preferences', preferences, oneYearInMs);
}

function sendPrefsToServer(): void {
	if (!validatorama.areWeLoggedIn()) return; // Ensure user is logged in

	console.log('Sending preferences to the server!');
	const preparedPrefs: ServerSidePreferences = preparePrefs(); // Prepare the preferences to send
	PUTPrefs(preparedPrefs);
}

async function PUTPrefs(preparedPrefs: ServerSidePreferences): Promise<void> {
	try {
		const response: Response = await serverfetch('/api/preferences', {
			method: 'PUT',
			// Still sends it if the page unloads before it fully leaves the browser.
			keepalive: true,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ preferences: preparedPrefs }), // Send the preferences as JSON
		});

		// Check if the response status code indicates success (e.g., 200-299 range)
		if (response.ok) {
			console.log('Preferences updated successfully on the server.');
		} else {
			console.error(`Failed to update preferences on the server. Status: ${response.status}`);
		}
	} catch (error) {
		console.error('Error sending preferences to the server:', error);
	}
}

function preparePrefs(): ServerSidePreferences {
	const prefsCopy: Preferences = jsutil.deepCopyObject(preferences);
	Object.keys(prefsCopy).forEach((prefName) => {
		if (CLIENT_SIDE_PREFS.includes(prefName)) delete prefsCopy[prefName];
	});
	return prefsCopy;
}

function getBoardColor(): string {
	return preferences.theme || DEFAULT_PREFERENCES.theme;
}

function setBoardColor(boardColor: string): void {
	preferences.theme = boardColor;
	savePreferences();
	sendPrefsToServer();
}

function getCoordinatesEnabled(): boolean {
	return preferences.coordinates_enabled ?? DEFAULT_PREFERENCES.coordinates_enabled;
}

function setCoordinatesEnabled(value: boolean): void {
	preferences.coordinates_enabled = value;
	savePreferences();
}

function getStarfieldMode(): boolean {
	return preferences.starfield_enabled ?? DEFAULT_PREFERENCES.starfield_enabled;
}

function setStarfieldMode(value: boolean): void {
	preferences.starfield_enabled = value;
	savePreferences();

	SettingsBus.dispatch('starfield-toggle', value);
}

function getLegalMovesShape(): 'dots' | 'squares' {
	return preferences.legal_moves || DEFAULT_PREFERENCES.legal_moves;
}

function setLegalMovesShape(legal_moves: 'dots' | 'squares'): void {
	preferences.legal_moves = legal_moves;
	savePreferences();
	sendPrefsToServer();
}

function getDragEnabled(): boolean {
	return preferences.drag_enabled ?? DEFAULT_PREFERENCES.drag_enabled;
}

function setDragEnabled(drag_enabled: boolean): void {
	preferences.drag_enabled = drag_enabled;
	savePreferences();
}

function getPremoveEnabled(): boolean {
	return preferences.premove_enabled ?? DEFAULT_PREFERENCES.premove_enabled;
}

function setPremoveMode(value: boolean): void {
	preferences.premove_enabled = value;
	savePreferences();

	SettingsBus.dispatch('premoves-toggle', value);
}

function getFastTransitionsMode(): boolean {
	return preferences.fast_transitions_enabled ?? DEFAULT_PREFERENCES.fast_transitions_enabled;
}

function setFastTransitionsMode(value: boolean): void {
	preferences.fast_transitions_enabled = value;
	savePreferences();
}

function getAnimationsMode(): boolean {
	return preferences.animations ?? DEFAULT_PREFERENCES.animations;
}

function setAnimationsMode(animations_enabled: boolean): void {
	preferences.animations = animations_enabled;
	savePreferences();
	sendPrefsToServer();
}

function getPerspectiveSensitivity(): number {
	return preferences.perspective_sensitivity || DEFAULT_PREFERENCES.perspective_sensitivity;
}

function setPerspectiveSensitivity(perspective_sensitivity: number): void {
	preferences.perspective_sensitivity = perspective_sensitivity;
	savePreferences();
}

function getPerspectiveFOV(): number {
	return preferences.perspective_fov || DEFAULT_PREFERENCES.perspective_fov;
}

function getDefaultPerspectiveFOV(): number {
	return DEFAULT_PREFERENCES.perspective_fov;
}

function setPerspectiveFOV(perspective_fov: number): void {
	preferences.perspective_fov = perspective_fov;
	savePreferences();
	SettingsBus.dispatch('fov-change');
}

function getLingeringAnnotationsMode(): boolean {
	return preferences.lingering_annotations ?? DEFAULT_PREFERENCES.lingering_annotations;
}

function setLingeringAnnotationsMode(value: boolean): void {
	preferences.lingering_annotations = value;
	savePreferences();
	sendPrefsToServer();

	SettingsBus.dispatch('lingering-annotations-toggle', value);
}

/** Whether the user has enabled "Advanced Effects" in the settings. */
function getAdvancedEffectsMode(): boolean {
	return preferences.advanced_effects_enabled ?? DEFAULT_PREFERENCES.advanced_effects_enabled;
}

function setAdvancedEffectsMode(value: boolean): void {
	preferences.advanced_effects_enabled = value;
	savePreferences();
}

function getMasterVolume(): number {
	return preferences.master_volume ?? DEFAULT_PREFERENCES.master_volume;
}

function setMasterVolume(master_volume: number): void {
	preferences.master_volume = master_volume;
	savePreferences();

	SettingsBus.dispatch('master-volume-change', master_volume);
}

/** Whether the user has enabled "Ambience" in the settings. */
function getAmbienceEnabled(): boolean {
	return preferences.ambience_enabled ?? DEFAULT_PREFERENCES.ambience_enabled;
}

function setAmbienceEnabled(ambience_enabled: boolean): void {
	preferences.ambience_enabled = ambience_enabled;
	savePreferences();

	SettingsBus.dispatch('ambience-toggle', ambience_enabled);
}

// Getters for our current theme properties ------------------------------------

function getColorOfLightTiles(): Color {
	const boardColorName: string = getBoardColor();
	return themes.getPropertyOfTheme(boardColorName, 'lightTiles');
}

function getColorOfDarkTiles(): Color {
	const boardColorName: string = getBoardColor();
	return themes.getPropertyOfTheme(boardColorName, 'darkTiles');
}

function getLegalMoveHighlightColor({
	isOpponentPiece,
	isPremove,
}: {
	isOpponentPiece: boolean;
	isPremove: boolean;
}): Color {
	const boardColorName: string = getBoardColor();
	if (isOpponentPiece)
		return themes.getPropertyOfTheme(boardColorName, 'legalMovesHighlightColor_Opponent');
	else if (isPremove)
		return themes.getPropertyOfTheme(boardColorName, 'legalMovesHighlightColor_Premove');
	else return themes.getPropertyOfTheme(boardColorName, 'legalMovesHighlightColor_Friendly');
}

function getLastMoveHighlightColor(): Color {
	const boardColorName: string = getBoardColor();
	return themes.getPropertyOfTheme(boardColorName, 'lastMoveHighlightColor');
}

function getCheckHighlightColor(): Color {
	const boardColorName: string = getBoardColor();
	return themes.getPropertyOfTheme(boardColorName, 'checkHighlightColor');
}

function getBoxOutlineColor(): Color {
	const boardColorName: string = getBoardColor();
	return themes.getPropertyOfTheme(boardColorName, 'boxOutlineColor');
}

function getAnnoteSquareColor(): Color {
	const boardColorName: string = getBoardColor();
	return themes.getPropertyOfTheme(boardColorName, 'annoteSquareColor');
}

function getAnnoteArrowColor(): Color {
	const boardColorName: string = getBoardColor();
	return themes.getPropertyOfTheme(boardColorName, 'annoteArrowColor');
}

// Exports ---------------------------------------------------------------------

export default {
	getBoardColor,
	setBoardColor,
	getCoordinatesEnabled,
	setCoordinatesEnabled,
	getStarfieldMode,
	setStarfieldMode,
	getLegalMovesShape,
	setLegalMovesShape,
	getDragEnabled,
	setDragEnabled,
	getPremoveEnabled,
	setPremoveMode,
	getFastTransitionsMode,
	setFastTransitionsMode,
	getAnimationsMode,
	setAnimationsMode,
	getPerspectiveSensitivity,
	setPerspectiveSensitivity,
	getPerspectiveFOV,
	getDefaultPerspectiveFOV,
	setPerspectiveFOV,
	getLingeringAnnotationsMode,
	setLingeringAnnotationsMode,
	getAdvancedEffectsMode,
	setAdvancedEffectsMode,
	getMasterVolume,
	setMasterVolume,
	getAmbienceEnabled,
	setAmbienceEnabled,
	getColorOfLightTiles,
	getColorOfDarkTiles,
	getLegalMoveHighlightColor,
	getLastMoveHighlightColor,
	getCheckHighlightColor,
	getBoxOutlineColor,
	getAnnoteSquareColor,
	getAnnoteArrowColor,
};
