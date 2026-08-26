// scripts/move-module.ts

/**
 * `git mv`s one or more modules and rewrites every relative import specifier pointing
 * at them, plus the specifiers inside the moved files (vi.mock/vi.doMock module ids
 * included). Paths are recomputed from each file's NEW home, so no hand-counting "../".
 * Pass all moves in ONE run so they resolve against each other. Preserves each
 * specifier's .js/extensionless style.
 *
 * It moves FILES only. Renaming a module's import identifier, and re-sorting the import
 * block, are yours — though the precommit hook re-sorts anyway.
 *
 * Usage:
 *   npx tsx scripts/move-module.ts <old> <new> [<old> <new> ...]
 *   (paths repo-relative; run from the repo root, then type-check)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) throw new Error('need old/new pairs');

/** old abs path -> new abs path */
const moves = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
	moves.set(path.resolve(ROOT, args[i]!), path.resolve(ROOT, args[i + 1]!));
}

/** Where a file lives after the moves are applied. */
function newHome(file: string): string {
	return moves.get(file) ?? file;
}

/** Resolves an import specifier to the .ts file it means, or null if it isn't first-party. */
function resolveSpec(fromDir: string, spec: string): string | null {
	if (!spec.startsWith('.')) return null;
	const base = path.resolve(fromDir, spec).replace(/\.js$/, '');
	for (const cand of [`${base}.ts`, `${base}.js`, path.join(base, 'index.ts')]) {
		if (fs.existsSync(cand) || moves.has(cand)) return cand;
	}
	return null;
}

function toSpec(fromDir: string, target: string, hadJsExt: boolean): string {
	let rel = path.relative(fromDir, target).replace(/\.ts$/, hadJsExt ? '.js' : '');
	if (!rel.startsWith('.')) rel = `./${rel}`;
	return rel.split(path.sep).join('/');
}

// Every tracked script except the archived dev-utils/ — scripts/ and build/ import src/ too.
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
	.split('\n')
	.filter((f) => /\.[cm]?[tj]s$/.test(f) && !f.startsWith('dev-utils/'))
	.map((f) => path.resolve(ROOT, f));

// Do the git mv's first so resolution below sees the new tree.
for (const [from, to] of moves) {
	fs.mkdirSync(path.dirname(to), { recursive: true });
	execFileSync('git', ['mv', path.relative(ROOT, from), path.relative(ROOT, to)]);
}

let touched = 0;
for (const file of files) {
	const home = newHome(file);
	const oldDir = path.dirname(file);
	const newDir = path.dirname(home);
	const src = fs.readFileSync(home, 'utf8');

	const out = src.replace(
		/(from\s+|import\s+|import\(|vi\.mock\(|vi\.doMock\()(['"])(\.[^'"]*)\2/g,
		(m, lead, q, spec) => {
			const target = resolveSpec(oldDir, spec);
			if (target === null) return m;
			const dest = newHome(target);
			if (dest === target && newDir === oldDir) return m;
			return `${lead}${q}${toSpec(newDir, dest, spec.endsWith('.js'))}${q}`;
		},
	);

	if (out !== src) {
		fs.writeFileSync(home, out);
		touched++;
		console.log(`  rewrote ${path.relative(ROOT, home)}`);
	}
}
console.log(`\n${moves.size} module(s) moved, ${touched} file(s) rewritten.`);
