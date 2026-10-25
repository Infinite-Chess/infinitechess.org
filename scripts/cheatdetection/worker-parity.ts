// scripts/cheatdetection/worker-parity.ts

/**
 * Checks the research engine (lib/researchengine.ts, which the offline pass searches with) and the
 * production engine worker search alike: runs both over the same snapshot games with the
 * experiment's search settings, and compares every position's legal-move count, check, and lines.
 *
 * Usage: npx tsx scripts/cheatdetection/worker-parity.ts --snapshot=<path> [games, default 3]
 */

import gameReplay from '../../src/server/game/cheatdetection/gameReplay.js';

import snapshot from './lib/snapshot.js';
import settings from './lib/settings.js';
import researchengine from './lib/researchengine.js';
import detectorworker from './lib/detectorworker.js';

const count = Number(settings.positional()[0] ?? 3);
const worker = await detectorworker.start();
await researchengine.load(settings.SEARCH.hashMb);

let differences = 0;
for (const row of snapshot
	.corpus()
	.filter((r) => r.icn.length < 3000)
	.slice(0, count)) {
	const reply = await detectorworker.analyse(worker, { gameId: row.game_id, icn: row.icn });
	if (reply.outcome !== 'analysed') continue;
	const game = await gameReplay.loadAtStart(row.icn);
	const moves = game.longformat.moves ?? [];
	const session = new researchengine.Session();
	reply.positions.forEach((position, ply) => {
		const searched = session.search(gameReplay.engineIcn(game, moves.slice(0, ply)), settings.SEARCH.multiPv, settings.SEARCH.positionNodes); // prettier-ignore
		const production = position.refused ? undefined : { legal: position.legal, inCheck: position.inCheck, lines: position.lines.map(({ move, score }) => ({ move, score })) }; // prettier-ignore
		if (JSON.stringify(searched) !== JSON.stringify(production)) {
			differences++;
			console.log(`game ${row.game_id} ply ${ply} differs`);
		}
	});
	session.free();
	console.log(`game ${row.game_id}: ${reply.positions.length} positions compared`);
}
await worker.terminate();
console.log(differences === 0 ? 'identical' : `${differences} positions differ`);
