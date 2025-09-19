/**
 * This script manages the dynamic loading of modifiers.
 * The below types let modifiers dynamically alter the gamefiles type to add data to it.
 * @author Idontuse
 */
import type { GameEvents, LoadingEvents } from "../shared/chess/logic/events.js";
// @ts-ignore
import { getBundles } from "./modbundles.js";

const MOD_LOCATION_BASE = '/scripts/esm/modifiers/';

interface Eventable {
	events: GameEvents<this>,
	components: Set<ComponentName>
}

type Gamefile<T> = Eventable & T

interface PredictedEvent {
	events: LoadingEvents<this>,
	components: Set<ComponentName>
}

type Construction<T> = PredictedEvent & Partial<T>

type Modname = 'atomic' | 'crazyhouse' | 'clock'
type ComponentName = Modname | 'game' | 'board' | 'match' | 'client' | 'events'

/**
 * To stop ts freaking out about the extension format is we do a little thing called lying
 * Since imports are dynamic ts has no clue what the setup function index signatures are actually
 * It allows for some very funny things
 */
// eslint-disable-next-line no-unused-vars
type SetupPair = [(gamefile: Construction<any>) => void | null, (gamefile: any) => void | null]
const SETUPLENGTH = 2;

let modCache: {
	[name: string]: SetupPair
} = {};

function clearModCache(): void {
	modCache = {};
}

function isSetupValid(setup: unknown): setup is SetupPair {
	if (!Array.isArray(setup)) return false;
	if (setup.length !== SETUPLENGTH) return false;
	for (let i = 0; i < SETUPLENGTH; i++) {
		if (typeof setup[i] === "function" || setup[i] === null) continue;
		return false;
	}
	return true;
}

async function loadModList(complist: Set<ComponentName>): Promise<void> {
	await Promise.all(getBundles(complist).map(async(mod: string) => {
		if (mod in modCache) return;
		const location = `${MOD_LOCATION_BASE}${mod}`;
		console.log(`Importing a modifier from ${location}`);
		const {default: setup} = await import(location);
		if (!isSetupValid(setup)) throw Error(`Modifier at ${mod} is in invalid format`);
		modCache[mod] = setup;
	}));
}

function setupModifierComponents(gamefile: Construction<unknown>): void {
	for (const mod of getBundles(gamefile.components)) {
		if (modCache[mod] === undefined) throw Error("Mod has not been loaded into cache");
		if (modCache[mod][0] === null) continue;
		console.log(`Setting up components for ${mod}`);
		modCache[mod][0](gamefile);
	}
}

function setupModifierSystems(gamefile: Construction<unknown>): void {
	for (const mod of getBundles(gamefile.components)) {
		if (modCache[mod] === undefined) throw Error("Mod has not been loaded into cache");
		if (modCache[mod][1] === null) continue;
		console.log(`Setting up systems for ${mod}`);
		modCache[mod][1](gamefile);
	}
}

export type {
	Gamefile, Construction, ComponentName, Modname
};

export default {
	clearModCache,
	loadModList,

	setupModifierComponents,
	setupModifierSystems,
};