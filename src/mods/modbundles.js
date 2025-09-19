/** @type {[string, ComponentName[]][]} */
const ModBundles = [
	["atomic/base", ['atomic', 'board', 'game']],
	["atomic/graphics", ['atomic', 'board', 'game', 'client']],
].map(m => [m[0], new Set(m[1])]);

/** @typedef {import('./modmanager').ComponentName} ComponentName */

// LATER: Switch to standard methods when we switch to ES2024+
function isSubset(s1, s2) {
	return (new Set([...s1, ...s2])).size === s1.size;
}


function isDisjoint(s1, s2) {
	return (new Set([...s1, ...s2])).size === s1.size + s2.size;
}

/**
 * 
 * @param {Iterable<ComponentName>} componenets 
 * @returns {string[]}
 */
function getBundles(componenets) {
	return ModBundles.filter(v => isSubset(componenets, v[1])).map(v => v[0]);
}

/**
 * 
 * @param {Iterable<ComponentName>} exeptions
 * @returns {string[]}
 */
function getBundleExceptions(exeptions) {
	return ModBundles.filter(v => !isDisjoint(v[1], exeptions)).map(v => v[0]);
}

export {
	getBundles,
	getBundleExceptions,
};