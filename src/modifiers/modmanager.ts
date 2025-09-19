import type { FullGame } from "../shared/chess/logic/gamefile.js";

const MOD_LOCATION_BASE = '/scripts/esm/modifiers/';
const modLocations = {
	atomic: 'atomic.js'
} as const;

type Modname = keyof typeof modLocations

// eslint-disable-next-line no-unused-vars
type SetupFunc = (gamefile: FullGame) => void

const modCache: {
	[name in Modname]?: SetupFunc
} = {};

async function loadModList(modlist: Modname[] = ['atomic']): Promise<void> {
	await Promise.all(modlist.map(async mod => {
		if (mod in modCache) return;
		const location = `${MOD_LOCATION_BASE}${modLocations[mod]}`;
		console.log(`Importing ${mod} from ${location}`);
		const {default: setup} = await import(location);
		if (typeof setup !== "function") throw Error(`${mod} mod is in invalid format`);
		modCache[mod] = setup;
	}));
}

function setupModifiers(modList: Modname[] = ['atomic'], ...args: Parameters<SetupFunc>): void {
	for (const mod of modList) {
		if (modCache[mod] === undefined) throw Error("Mod has not been loaded into cache");
		modCache[mod](...args);
	}
}

export default {
	loadModList,
	setupModifiers,
};