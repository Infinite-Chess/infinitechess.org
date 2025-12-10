/**
 * This script manages the dynamic loading of modifiers.
 * The below types let modifiers dynamically alter the gamefiles type to add data to it.
 * @author Idontuse
 */
import type { GameEvents, LoadingEvents } from '../shared/chess/logic/events.js';
import type { Additional } from '../shared/chess/logic/gamefile.js';

interface Eventable {
	events: GameEvents<this>;
	components: Set<ComponentName>;
}

type Gamefile<T> = Eventable & T;

interface PredictedEvent {
	events: LoadingEvents<this>;
	components: Set<ComponentName>;
}

type Construction<T> = PredictedEvent & Partial<T>;

type Modname = 'atomic' | 'crazyhouse' | 'clock';
type ComponentName = Modname | 'game' | 'board' | 'match' | 'client' | 'events' | 'server';

/**
 * To stop ts freaking out about the extension format is we do a little thing called lying
 * Since imports are dynamic ts has no clue what the setup function index signatures are actually
 * It allows for some very funny things
 */
interface SetupFunctions {
	setupComponents?: (gamefile: Construction<any>, addition: Additional) => void;
	setupSystems?: (gamefile: any) => void;
}

const IMPORTS: { [name: string]: () => Promise<any> } = {
	'atomic/base': () => import('./atomic/base.js'),
	'atomic/graphics': () => import('./atomic/graphics.js'),
};

const MOD_BUNDLES: [string, ComponentName[]][] = [
	['atomic/base', ['atomic', 'board', 'game']],
	['atomic/graphics', ['atomic', 'board', 'game', 'client']],
];

// LATER: Switch to standard methods when we switch to ES2024+
function isSubset<T>(s1: Iterable<T>, s2: Iterable<T>): boolean {
	return new Set([...s1, ...s2]).size === new Set(s1).size;
}

function getBundles(componenets: Iterable<ComponentName>): string[] {
	return MOD_BUNDLES.filter((v) => isSubset(componenets, v[1])).map((v) => v[0]);
}

let modCache: {
	[name: string]: SetupFunctions;
} = {};

function clearModCache(): void {
	modCache = {};
}

function isSetupValid(setup: unknown): setup is SetupFunctions {
	if (Array.isArray(setup) || typeof setup !== 'object' || setup === null) return false;

	let canbesetup = false;

	for (const i of ['setupSystems', 'setupComponents']) {
		// @ts-ignore While this may look sus we are expecting it sometimes not match our type
		const test = setup[i];
		if (test === undefined) continue;
		if (typeof test === 'function') {
			canbesetup = true;
			continue;
		}

		return false;
	}
	return canbesetup;
}

async function loadModList(complist: Set<ComponentName>): Promise<void> {
	await Promise.all(
		getBundles(complist).map(async (mod: string) => {
			if (mod in modCache) return;
			if (!(mod in IMPORTS)) throw Error();

			const setup = await IMPORTS[mod]!();
			if (!isSetupValid(setup)) throw Error(`Modifier at ${mod} is in invalid format`);
			modCache[mod] = setup;
		}),
	);
}

function setupModifierComponents(gamefile: Construction<unknown>): void {
	for (const mod of getBundles(gamefile.components)) {
		if (modCache[mod] === undefined) throw Error('Mod has not been loaded into cache');
		if (modCache[mod].setupComponents === undefined) continue;
		console.log(`Setting up components for ${mod}`);
		modCache[mod].setupComponents(gamefile, {});
	}
}

function setupModifierSystems(gamefile: Construction<unknown>): void {
	for (const mod of getBundles(gamefile.components)) {
		if (modCache[mod] === undefined) throw Error('Mod has not been loaded into cache');
		if (modCache[mod].setupSystems === undefined) continue;
		console.log(`Setting up systems for ${mod}`);
		modCache[mod].setupSystems(gamefile);
	}
}

export type { Gamefile, Construction, ComponentName, Modname };

export default {
	clearModCache,
	loadModList,

	setupModifierComponents,
	setupModifierSystems,
};
