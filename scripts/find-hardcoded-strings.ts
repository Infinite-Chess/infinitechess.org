// scripts/find-hardcoded-strings.ts

/**
 * Lists the hardcoded English one page may show: the starting inventory of a localization pass.
 *
 * Usage:
 *   npx tsx scripts/find-hardcoded-strings.ts <page>     e.g. game, analysis, index
 *
 * Reads src/server/views/<page>.njk and every template it imports or includes, reporting its text,
 * user-facing attributes, and prose inside its tags and expressions. Then bundles every script those
 * templates load, exactly as the build does, and reports each prose-looking string literal in
 * every first-party module the bundle ships — including shared/ ones far from the page.
 *
 * A heuristic, so expect some noise (ICN metadata tags, variant codes) and judge each hit. It
 * can't see strings the server builds for the page (its controller, socket replies): sweep
 * those by hand.
 */

import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';

import srcgraph from './modules/srcgraph.js';

// Constants -------------------------------------------------------------------

const VIEWS_DIR = 'src/server/views';

/** Attributes whose value a user reads. */
const TEXT_ATTRIBUTES = ['title', 'placeholder', 'data-tooltip', 'aria-label', 'alt', 'value'];

/** A Nunjucks comment, tag or expression: `{# … #}`, `{% … %}` or `{{ … }}`. */
const NUNJUCKS_SYNTAX = /\{#[\s\S]*?#\}|\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g;

/** Callees whose string arguments are never shown: logging, errors, DOM lookups, event names. */
const SILENT_CALLEE = /^(console\.\w+|logEvents?\.\w+|Error)$|\.(getElementById|querySelector(All)?|closest|addEventListener|removeEventListener|dispatch|getAttribute|removeAttribute|hasAttribute)$/; // prettier-ignore

/** A literal reads as prose if it has a word gap, or starts with a capitalized word. */
const PROSE = /[A-Za-z]{2,} [A-Za-z]|^[A-Z][a-z]{2,}/;

/** A `KeyboardEvent.code`, e.g. `KeyD` or `ShiftLeft`: prose-shaped, but never shown. */
const KEY_CODE = /^(Key[A-Z]|Digit\d|Arrow(Up|Down|Left|Right)|(Shift|Control|Alt|Meta)(Left|Right)|Space|Tab|Enter|Escape|Backquote|Backspace)$/; // prettier-ignore

// Arguments -------------------------------------------------------------------

const page = process.argv[2];
if (page === undefined) {
	console.error('Usage: npx tsx scripts/find-hardcoded-strings.ts <page>');
	process.exit(1);
}
const rootTemplate = `${page}.njk`;
if (!fs.existsSync(path.join(VIEWS_DIR, rootTemplate))) {
	console.error(`No template at ${VIEWS_DIR}/${rootTemplate}.`);
	process.exit(1);
}

// Templates -------------------------------------------------------------------

/** The page's template plus every template it imports or includes, transitively. Not its layout. */
function collectTemplates(entry: string): string[] {
	const seen = new Set<string>();
	const queue = [entry];
	while (queue.length) {
		const name = queue.shift()!;
		if (seen.has(name)) continue;
		seen.add(name);
		const src = fs.readFileSync(path.join(VIEWS_DIR, name), 'utf8');
		for (const m of src.matchAll(/\{%-?\s*(?:from|import|include)\s+"([^"]+)"/g))
			queue.push(m[1]!);
	}
	return [...seen];
}

/**
 * Prints the template's hardcoded text nodes, user-facing attribute values, and prose-looking
 * string literals inside its tags and expressions.
 */
function sweepTemplate(name: string): void {
	const file = `${VIEWS_DIR}/${name}`;
	const original = fs.readFileSync(file, 'utf8');
	const src = stripTemplateSyntax(original);
	const lineOf = (index: number): number => original.slice(0, index).split('\n').length;
	const attrs = new RegExp(`\\b(?:${TEXT_ATTRIBUTES.join('|')})=(?:"([^"]*)"|'([^']*)')`, 'g');

	for (const m of src.matchAll(/>([^<>]+)</g)) {
		if (/[A-Za-z]{2,}/.test(m[1]!)) report(file, lineOf(m.index!), m[1]!);
	}
	for (const m of src.matchAll(attrs)) {
		if (/[A-Za-z]{2,}/.test(m[1] ?? m[2]!)) report(file, lineOf(m.index!), m[0]);
	}
	for (const tag of original.matchAll(NUNJUCKS_SYNTAX)) {
		if (tag[0].startsWith('{#')) continue;
		for (const m of tag[0].matchAll(/'([^']*)'|"([^"]*)"/g)) {
			const text = m[1] ?? m[2]!;
			if (PROSE.test(text)) report(file, lineOf(tag.index! + m.index!), text);
		}
	}
}

/**
 * Blanks out comments, tags, expressions, scripts, styles and svgs, keeping every offset
 * (and so every line number) where it was.
 */
function stripTemplateSyntax(src: string): string {
	const blank = (s: string): string => s.replace(/[^\n]/g, ' ');
	const syntax = new RegExp(String.raw`${NUNJUCKS_SYNTAX.source}|<(script|style|svg)\b[\s\S]*?<\/\1>`, 'g'); // prettier-ignore
	return src.replace(syntax, blank);
}

/** Every client script the templates load through the asset manifest. */
function collectScriptEntries(templates: string[]): string[] {
	const entries = new Set<string>();
	for (const name of templates) {
		const src = fs.readFileSync(path.join(VIEWS_DIR, name), 'utf8');
		for (const m of src.matchAll(/manifest\['(scripts\/[^']+\.ts)'\]/g)) {
			entries.add(`src/client/${m[1]!}`);
		}
	}
	return [...entries];
}

// Scripts ---------------------------------------------------------------------

/** Every first-party module the entries' bundles ship, resolved exactly as the build does. */
async function collectModules(entryPoints: string[]): Promise<string[]> {
	if (entryPoints.length === 0) return [];
	const result = await srcgraph.bundle(entryPoints);
	return Object.keys(result.metafile.inputs)
		.filter((f) => f.startsWith('src/') && /\.(ts|js)$/.test(f))
		.sort();
}

/** Prints the module's prose-looking string literals that could reach the user. */
function sweepModule(file: string): void {
	const source = fs.readFileSync(file, 'utf8');
	const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
	const visit = (node: ts.Node): void => {
		const text = literalText(node);
		if (text === undefined) return ts.forEachChild(node, visit);
		if (PROSE.test(text) && !KEY_CODE.test(text) && !isNeverShown(node)) {
			report(file, src.getLineAndCharacterOfPosition(node.getStart()).line + 1, text);
		}
	};
	visit(src);
}

/** A string or template literal's text, or `undefined` for any other node. */
function literalText(node: ts.Node): string | undefined {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (ts.isTemplateExpression(node)) return node.getText().slice(1, -1);
	return undefined;
}

/** Whether a literal sits somewhere a user can never read it. */
function isNeverShown(node: ts.Node): boolean {
	const parent = node.parent;
	if (ts.isCaseClause(parent)) return true;
	if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
	if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
	if (ts.isBinaryExpression(parent) && /^[!=]==?$/.test(parent.operatorToken.getText()))
		return true;
	// Stops at the enclosing function: a callback's body is shown by whatever it calls, not by the
	// call it's passed to (a toast inside an addEventListener callback).
	for (let n: ts.Node = parent; !ts.isSourceFile(n) && !ts.isFunctionLike(n); n = n.parent) {
		if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isLiteralTypeNode(n))
			return true;
		if (ts.isNewExpression(n) && /Error$/.test(n.expression.getText())) return true;
		if (ts.isCallExpression(n) && SILENT_CALLEE.test(n.expression.getText())) return true;
	}
	return false;
}

// Report ----------------------------------------------------------------------

/** Prints one hit as a clickable `file:line`, its text collapsed onto one line. */
function report(file: string, line: number, text: string): void {
	console.log(`${file}:${line}\t${text.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
}

const templates = collectTemplates(rootTemplate);
for (const name of templates) sweepTemplate(name);
const modules = await collectModules(collectScriptEntries(templates));
for (const file of modules) sweepModule(file);
console.error(`\nSwept ${templates.length} template(s) and ${modules.length} module(s).`);
