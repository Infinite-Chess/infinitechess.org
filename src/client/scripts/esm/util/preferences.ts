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

/** The LocalStorage key the preferences are saved under. */
const STORAGE_KEY = 'preferences';

/** The cookie the server delivers a logged-in user's server-side preferences in. */
const COOKIE_NAME = 'preferences';

/** How long saved preferences survive without being changed. */
const EXPIRY_MS = timeutil.toMillis(1, 'years');

/** The server-side preferences a user starts with. */
const DEFAULT_SERVER_PREFS: ServerSidePreferences = {
	theme: themes.DEFAULT_THEME,
	legal_moves: 'squares',
	/** When false, animations are instant, only playing the sound. (same as dropping dragged pieces) */
	animations: true,
	lingering_annotations: true,
};

/** The client-side preferences a user starts with. */
const DEFAULT_CLIENT_PREFS: ClientSidePreferences = {
	perspective_sensitivity: 100,
	perspective_fov: 90,
	drag_enabled: true,
	premove_enabled: true,
	fast_transitions_enabled: false,
	coordinates_enabled: false,
	starfield_enabled: true,
	advanced_effects_enabled: true,
	master_volume: 1,
	ambience_enabled: true,
};

/** The preferences a user starts with. */
const DEFAULT_PREFERENCES: Preferences = { ...DEFAULT_SERVER_PREFS, ...DEFAULT_CLIENT_PREFS };

// State -----------------------------------------------------------------------

/** The user's preferences. */
const preferences: Preferences = loadPreferences();

// Loading ---------------------------------------------------------------------

/** Reads the preferences: defaults, overridden by this device's saved ones, then the server's. */
function loadPreferences(): Preferences {
	const cookie = docutil.getCookieValue(COOKIE_NAME);
	const cookiePrefs: unknown = cookie ? JSON.parse(decodeURIComponent(cookie)) : undefined;
	return {
		...DEFAULT_PREFERENCES,
		...pickValid(LocalStorage.loadItem(STORAGE_KEY), DEFAULT_PREFERENCES),
		...pickValid(cookiePrefs, DEFAULT_SERVER_PREFS),
	};
}

/**
 * Keeps the entries of `source` whose key is in `defaults` and whose value matches its type.
 * A bad theme name needs no check: {@link themes.getPropertyOfTheme} falls back for it.
 */
function pickValid<T extends object>(source: unknown, defaults: T): Partial<T> {
	if (typeof source !== 'object' || source === null) return {};
	const valid = Object.entries(source).filter(
		([key, value]) =>
			Object.hasOwn(defaults, key) && typeof value === typeof defaults[key as keyof T],
	);
	return Object.fromEntries(valid) as Partial<T>;
}

// Saving ----------------------------------------------------------------------

/** Saves the preferences to this device. */
function savePreferences(): void {
	LocalStorage.saveItem(STORAGE_KEY, preferences, EXPIRY_MS);
}

/** Pushes the server-side preferences to the server, if we're logged in. */
function sendPrefsToServer(): void {
	if (!validatorama.areWeLoggedIn()) return;

	console.log('Sending preferences to the server!');
	PUTPrefs(getServerSidePrefs());
}

/** The server-side subset of the preferences. */
function getServerSidePrefs(): ServerSidePreferences {
	const { theme, legal_moves, animations, lingering_annotations } = preferences;
	return { theme, legal_moves, animations, lingering_annotations };
}

/** PUTs the server-side preferences to the server, logging the outcome. */
async function PUTPrefs(serverSidePrefs: ServerSidePreferences): Promise<void> {
	try {
		const response: Response = await serverfetch('/api/preferences', {
			method: 'PUT',
			// Still sends it if the page unloads before it fully leaves the browser.
			keepalive: true,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ preferences: serverSidePrefs }),
		});

		if (response.ok) {
			console.log('Preferences updated successfully on the server.');
		} else {
			console.error(`Failed to update preferences on the server. Status: ${response.status}`);
		}
	} catch (error) {
		console.error('Error sending preferences to the server:', error);
	}
}

// Preferences -----------------------------------------------------------------

/** The selected board theme's name. */
function getBoardColor(): string {
	return preferences.theme;
}

/** Selects a board theme. */
function setBoardColor(boardColor: string): void {
	preferences.theme = boardColor;
	savePreferences();
	sendPrefsToServer();
}

/** Whether board coordinates are shown. */
function getCoordinatesEnabled(): boolean {
	return preferences.coordinates_enabled;
}

/** Shows or hides board coordinates. */
function setCoordinatesEnabled(value: boolean): void {
	preferences.coordinates_enabled = value;
	savePreferences();
}

/** Whether the starfield is enabled. */
function getStarfieldMode(): boolean {
	return preferences.starfield_enabled;
}

/** Enables or disables the starfield. */
function setStarfieldMode(value: boolean): void {
	preferences.starfield_enabled = value;
	savePreferences();

	SettingsBus.dispatch('starfield-toggle', value);
}

/** The shape legal moves are highlighted with. */
function getLegalMovesShape(): 'dots' | 'squares' {
	return preferences.legal_moves;
}

/** Sets the shape legal moves are highlighted with. */
function setLegalMovesShape(legal_moves: 'dots' | 'squares'): void {
	preferences.legal_moves = legal_moves;
	savePreferences();
	sendPrefsToServer();
}

/** Whether pieces can be dragged. */
function getDragEnabled(): boolean {
	return preferences.drag_enabled;
}

/** Enables or disables piece dragging. */
function setDragEnabled(drag_enabled: boolean): void {
	preferences.drag_enabled = drag_enabled;
	savePreferences();
}

/** Whether premoves are enabled. */
function getPremoveEnabled(): boolean {
	return preferences.premove_enabled;
}

/** Enables or disables premoves. */
function setPremoveMode(value: boolean): void {
	preferences.premove_enabled = value;
	savePreferences();

	SettingsBus.dispatch('premoves-toggle', value);
}

/** Whether camera transitions are sped up. */
function getFastTransitionsMode(): boolean {
	return preferences.fast_transitions_enabled;
}

/** Enables or disables fast camera transitions. */
function setFastTransitionsMode(value: boolean): void {
	preferences.fast_transitions_enabled = value;
	savePreferences();
}

/** Whether moves are animated. */
function getAnimationsMode(): boolean {
	return preferences.animations;
}

/** Enables or disables move animations. */
function setAnimationsMode(animations_enabled: boolean): void {
	preferences.animations = animations_enabled;
	savePreferences();
	sendPrefsToServer();
}

/** The mouse sensitivity in perspective mode, as a percentage. */
function getPerspectiveSensitivity(): number {
	return preferences.perspective_sensitivity;
}

/** Sets the mouse sensitivity in perspective mode. */
function setPerspectiveSensitivity(perspective_sensitivity: number): void {
	preferences.perspective_sensitivity = perspective_sensitivity;
	savePreferences();
}

/** The field of view in perspective mode, in degrees. */
function getPerspectiveFOV(): number {
	return preferences.perspective_fov;
}

/** The field of view a user starts with. */
function getDefaultPerspectiveFOV(): number {
	return DEFAULT_PREFERENCES.perspective_fov;
}

/** Sets the field of view in perspective mode. */
function setPerspectiveFOV(perspective_fov: number): void {
	preferences.perspective_fov = perspective_fov;
	savePreferences();
	SettingsBus.dispatch('fov-change');
}

/** Whether annotations linger after a move is made. */
function getLingeringAnnotationsMode(): boolean {
	return preferences.lingering_annotations;
}

/** Enables or disables lingering annotations. */
function setLingeringAnnotationsMode(value: boolean): void {
	preferences.lingering_annotations = value;
	savePreferences();
	sendPrefsToServer();

	SettingsBus.dispatch('lingering-annotations-toggle', value);
}

/** Whether the user has enabled "Advanced Effects" in the settings. */
function getAdvancedEffectsMode(): boolean {
	return preferences.advanced_effects_enabled;
}

/** Enables or disables advanced effects. */
function setAdvancedEffectsMode(value: boolean): void {
	preferences.advanced_effects_enabled = value;
	savePreferences();
}

/** The master volume. */
function getMasterVolume(): number {
	return preferences.master_volume;
}

/** Sets the master volume. */
function setMasterVolume(master_volume: number): void {
	preferences.master_volume = master_volume;
	savePreferences();

	SettingsBus.dispatch('master-volume-change', master_volume);
}

/** Whether the user has enabled "Ambience" in the settings. */
function getAmbienceEnabled(): boolean {
	return preferences.ambience_enabled;
}

/** Enables or disables ambience. */
function setAmbienceEnabled(ambience_enabled: boolean): void {
	preferences.ambience_enabled = ambience_enabled;
	savePreferences();

	SettingsBus.dispatch('ambience-toggle', ambience_enabled);
}

// Theme colors ----------------------------------------------------------------

/** The selected theme's light tile color. */
function getColorOfLightTiles(): Color {
	return themes.getPropertyOfTheme(getBoardColor(), 'lightTiles');
}

/** The selected theme's dark tile color. */
function getColorOfDarkTiles(): Color {
	return themes.getPropertyOfTheme(getBoardColor(), 'darkTiles');
}

/** The selected theme's legal move highlight color, for the given kind of selected piece. */
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

/** The selected theme's last move highlight color. */
function getLastMoveHighlightColor(): Color {
	return themes.getPropertyOfTheme(getBoardColor(), 'lastMoveHighlightColor');
}

/** The selected theme's check highlight color. */
function getCheckHighlightColor(): Color {
	return themes.getPropertyOfTheme(getBoardColor(), 'checkHighlightColor');
}

/** The selected theme's box outline color. */
function getBoxOutlineColor(): Color {
	return themes.getPropertyOfTheme(getBoardColor(), 'boxOutlineColor');
}

/** The selected theme's annotation square color. */
function getAnnoteSquareColor(): Color {
	return themes.getPropertyOfTheme(getBoardColor(), 'annoteSquareColor');
}

/** The selected theme's annotation arrow color. */
function getAnnoteArrowColor(): Color {
	return themes.getPropertyOfTheme(getBoardColor(), 'annoteArrowColor');
}

// Exports ---------------------------------------------------------------------

export default {
	// Preferences
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
	// Theme colors
	getColorOfLightTiles,
	getColorOfDarkTiles,
	getLegalMoveHighlightColor,
	getLastMoveHighlightColor,
	getCheckHighlightColor,
	getBoxOutlineColor,
	getAnnoteSquareColor,
	getAnnoteArrowColor,
};
