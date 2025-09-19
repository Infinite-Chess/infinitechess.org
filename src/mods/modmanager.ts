/**
 * This script manages the dynamic loading of modifiers.
 * The below types let modifiers dynamically alter the gamefiles type to add data to it.
 * @author Idontuse
 */
import type { GameEvents } from "../shared/chess/logic/events.js";

const MOD_LOCATION_BASE = '/scripts/esm/modifiers/';
const modLocations = {
	atomic: 'atomic.js',
	crazyhouse: 'crazyhouse.js'
} as const;

type Modname = keyof typeof modLocations
type ComponentName = Modname | 'game' | 'board' | 'match' | 'client' | 'events'

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

/**
 * To stop ts freaking out about the extension format is we do a little thing called lying
 * Since imports are dynamic ts has no clue what the setup function index signatures are actually
 * It allows for some very funny things
 */
// eslint-disable-next-line no-unused-vars
type SetupFunc = (gamefile: Construction<any, void>) => void


const modCache: {
	// eslint-disable-next-line no-unused-vars
	[name in Modname]?: SetupFunc
} = {};

async function loadModList(modlist: Modname[]): Promise<void> {
	await Promise.all(modlist.map(async mod => {
		if (mod in modCache) return;
		const location = `${MOD_LOCATION_BASE}${modLocations[mod]}`;
		console.log(`Importing ${mod} from ${location}`);
		const {default: setup} = await import(location);
		if (typeof setup !== "function") throw Error(`${mod} mod is in invalid format`);
		modCache[mod] = setup;
	}));
}

function setupModifiers(gamefile: Construction<any, void>, modList: Modname[]): void {
	for (const mod of modList) {
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