// scripts/insuffmat/verify.ts

/**
 * Verifies every mate the generator found with the site's own code: the position is checkmate with
 * the defender to move, legal with the attacker to move, and reached by a legal attacker move from
 * a position where the defender was not in check.
 *
 * Usage: npx tsx scripts/insuffmat/verify.ts <mates.tsv...>
 */

import type { Coords, CoordsKey } from '../../src/shared/util/coordutil.js';

import fs from 'node:fs';

import coordutil from '../../src/shared/util/coordutil.js';
import boardutil from '../../src/shared/chess/logic/boardutil.js';
import checkmate from '../../src/shared/chess/logic/checkmate.js';
import legalmoves from '../../src/shared/chess/logic/legalmoves.js';
import icnconverter from '../../src/shared/chess/logic/icn/icnconverter.js';
import gameformulator from '../../src/shared/chess/game/gameformulator.js';

// Verification ----------------------------------------------------------------

/** Every reason the site rejects a witness line. Empty when it holds. */
async function findProblems(mateIcn: string, priorIcn: string, move: string): Promise<string[]> {
	const problems: string[] = [];
	const mated = await build(mateIcn);
	if (checkmate.detect(mated)?.condition !== 'checkmate') problems.push('not checkmate');
	if ((await build(flipTurn(mateIcn))).state.local.inCheck !== false)
		problems.push('illegal: the mating side is in check');
	if ((await build(flipTurn(priorIcn))).state.local.inCheck !== false)
		problems.push('the defender was already in check before the last move');
	const prior = await build(priorIcn);
	// A promotion's "=X" names the piece the pawn became; the move itself is the pawn's.
	const [from, to] = move
		.replace(/=.*/, '')
		.split('>')
		.map((c) => coordutil.getCoordsFromKey(c as CoordsKey)) as [Coords, Coords];
	const piece = boardutil.getPieceFromCoords(prior.pieces, from);
	if (!piece) problems.push(`no piece on ${move.split('>')[0]} before the last move`);
	else if (
		!legalmoves.checkIfMoveLegal(
			prior,
			legalmoves.calculateAll(prior, piece),
			from,
			to,
			prior.whosTurn,
		)
	)
		problems.push(`last move ${move} is illegal`);
	return problems;
}

/** Builds the site's game from an ICN. */
function build(icn: string): ReturnType<typeof gameformulator.formulateGame> {
	return gameformulator.formulateGame(icnconverter.ShortToLong_Format(icn), undefined, true);
}

/** The same ICN with the other side to move. */
function flipTurn(icn: string): string {
	return (icn.startsWith('w ') ? 'b' : 'w') + icn.slice(1);
}

// Entry -----------------------------------------------------------------------

const lines = process.argv
	.slice(2)
	.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean));
let verified = 0;
let failed = 0;
for (const line of lines) {
	const [label, mateIcn, priorIcn, move] = line.split('\t') as [string, string, string, string];
	const problems = await findProblems(mateIcn, priorIcn, move);
	if (problems.length === 0) verified++;
	else {
		failed++;
		console.log(`FAIL ${label}: ${problems.join('; ')}\n     ${mateIcn}`);
	}
}
console.log(`${verified} mates verified by the site, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
