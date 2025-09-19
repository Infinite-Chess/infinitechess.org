/**
 * This script manages the dynamic loading of modifiers.
 * The below types let modifiers dynamically alter the gamefiles type to add data to it.
 * @author Idontuse
 */
import type { GameEvents } from "../shared/chess/logic/events.js";
// @ts-ignore
import { getBundles } from "./modbundles.js";

const MOD_LOCATION_BASE = '/scripts/esm/modifiers/';

interface Eventable {
	events: GameEvents<this>,
	components: Set<ComponentName>
}

type Gamefile<T> = Eventable & T

interface PredictedEvent<T> {
	events: GameEvents<T>,
	components: Set<ComponentName>
}

type Construction<T, G> = PredictedEvent<G> & T

type Modname = 'atomic' | 'crazyhouse'
type ComponentName = Modname | 'game' | 'board' | 'match' | 'client' | 'events'

/**
 * To stop ts freaking out about the extension format is we do a little thing called lying
 * Since imports are dynamic ts has no clue what the setup function index signatures are actually
 * It allows for some very funny things
 */
// eslint-disable-next-line no-unused-vars
type SetupFunc = (gamefile: Construction<any, void>) => void

const modCache: {
	[name: string]: SetupFunc
} = {};

async function loadModList(complist: ComponentName[]): Promise<void> {
	await Promise.all(getBundles(complist).map(async(mod: string) => {
		if (mod in modCache) return;
		const location = `${MOD_LOCATION_BASE}${mod}`;
		console.log(`Importing a modifier from ${location}`);
		const {default: setup} = await import(location);
		if (typeof setup !== "function") throw Error(`Modifier at ${mod} is in invalid format`);
		modCache[mod] = setup;
	}));
}

function setupModifiers(gamefile: Construction<void, void>): void {
	for (const mod of getBundles(gamefile.components)) {
		if (modCache[mod] === undefined) throw Error("Mod has not been loaded into cache");
		console.log(`Setting up ${mod}`);
		modCache[mod](gamefile);
	}
}

export type {
	Gamefile, Construction, ComponentName, Modname
};

export default {
	loadModList,
	setupModifiers,
};