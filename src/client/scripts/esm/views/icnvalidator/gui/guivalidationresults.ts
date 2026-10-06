// src/client/scripts/esm/views/icnvalidator/gui/guivalidationresults.ts

/**
 * The ICN validator's results panel. Once a run finishes, it shows how many games
 * passed, where the failures came from, and every failed game to inspect, keeping
 * the panel's own view state (the filter, unfolded ICNs) between redraws.
 */

import type { VNode } from 'snabbdom';
import type {
	ChunkResults,
	ValidationError,
	ValidationPhase,
	VariantErrorType,
	VariantStats,
} from '../icnvalidatorprotocol.js';

import { attributesModule, classModule, eventListenersModule, h, init } from 'snabbdom';

import docutil from '../../../util/docutil.js';

// Types -----------------------------------------------------------------------

/** Every worker's chunk tallies, merged into one run-wide total. */
export interface ValidationResults extends ChunkResults {
	/** How many games the run validated. */
	total: number;
	/** How long the run took, in milliseconds. */
	ms: number;
	/** Whether the run included the movegen check. */
	movegen: boolean;
}

/** How one failure type is labeled, and where its tallies are counted. */
interface PhaseInfo {
	label: string;
	countKey:
		| 'icnconverterErrors'
		| 'formulatorErrors'
		| 'illegalMoveErrors'
		| 'movegenMismatchErrors'
		| 'terminationMismatchErrors';
	variantKey: VariantErrorType;
}

// Constants -------------------------------------------------------------------

/** Every failure type, in the order games move through them. */
const PHASES: Record<ValidationPhase, PhaseInfo> = {
	icnconverter: { label: 'ICN parse', countKey: 'icnconverterErrors', variantKey: 'icn' },
	formulator: { label: 'Build', countKey: 'formulatorErrors', variantKey: 'formulator' },
	'illegal-move': { label: 'Illegal move', countKey: 'illegalMoveErrors', variantKey: 'illegal' },
	'movegen-mismatch': { label: 'Movegen', countKey: 'movegenMismatchErrors', variantKey: 'movegen' }, // prettier-ignore
	'termination-mismatch': { label: 'Termination', countKey: 'terminationMismatchErrors', variantKey: 'termination' }, // prettier-ignore
};

const PHASE_ORDER = Object.keys(PHASES) as ValidationPhase[];

/** How long a copy button reads "Copied" after a click. */
const COPIED_CONFIRMATION_MS = 1500;

const patch = init([attributesModule, classModule, eventListenersModule]);

// State -----------------------------------------------------------------------

/** The results' snabbdom tree, replaced by each patch. Starts as the element it renders into. */
let resultsVNode: VNode | Element = document.querySelector('#results')!;
/** The finished run on display, or undefined while there is none. */
let results: ValidationResults | undefined;
/** The failure type the failed-game list is narrowed to, if any. */
let filter: ValidationPhase | undefined;
/** The failures whose full ICN is unfolded. */
const expandedIcns = new Set<ValidationError>();
/** The failure whose ICN was just copied, while its button confirms it. */
let copiedFailure: ValidationError | undefined;
let copiedTimer: number | undefined;

// Rendering -------------------------------------------------------------------

/** Clears the results, ahead of a new run. */
function hide(): void {
	results = undefined;
	render();
}

/** Shows the results of a finished run. */
function display(finished: ValidationResults): void {
	results = finished;
	filter = undefined;
	expandedIcns.clear();
	render();
}

/** Redraws the results from the current state. */
function render(): void {
	const children = results
		? [
				createSummaryVNode(results),
				createVariantTableVNode(results.variantErrors),
				createFailuresVNode(results.errors),
			]
		: [];
	resultsVNode = patch(resultsVNode, h('div#results.results', children));
}

// Summary ---------------------------------------------------------------------

/** The pass-rate ring and headline, and a filter tile per failure type. A perfect run gets the celebration. */
function createSummaryVNode(run: ValidationResults): VNode {
	const percentage = run.total > 0 ? (run.successfulCount / run.total) * 100 : 0;
	const rateClass = getPassRateClass(run, percentage);
	const perfect = rateClass === 'perfect';
	const headline = perfect
		? 'Every game agrees'
		: `${run.successfulCount} / ${run.total} games passed`;
	const meta = [
		perfect ? `${run.total} games` : null,
		formatDuration(run.ms),
		run.movegen ? 'movegen check on' : 'movegen check off',
	];

	return h('section.card.summary', { class: { perfect } }, [
		h(`div.pass-ring.${rateClass}`, { attrs: { style: `--pct: ${percentage}` } }, [
			perfect
				? h('svg.pass-ring-check', { attrs: { viewBox: '0 0 24 24' } }, [
						h('use', { attrs: { href: '#glyph-check' } }),
					])
				: h('span.pass-ring-value', formatPercentage(percentage)),
		]),
		h('div.summary-body', [
			h('div.summary-headline', headline),
			h('div.summary-meta', meta.filter((part) => part !== null).join(' · ')),
			perfect ? null : h('div.phase-tiles', PHASE_ORDER.map((phase) => createTileVNode(run, phase))), // prettier-ignore
		]),
	]);
}

/** The color class of the pass rate. */
function getPassRateClass(run: ValidationResults, percentage: number): string {
	if (run.successfulCount === run.total && run.total > 0) return 'perfect';
	if (percentage >= 90) return 'good';
	if (percentage >= 80) return 'bad';
	return 'terrible';
}

/** The pass rate to one decimal, rounded down so a run with any failure never reads 100%. */
function formatPercentage(percentage: number): string {
	return `${Math.floor(percentage * 10) / 10}%`;
}

/** A run's duration, as seconds under a minute and minutes plus seconds above. */
function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds} s`;
	return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** One failure type's count, which narrows the failed-game list to it when clicked. */
function createTileVNode(run: ValidationResults, phase: ValidationPhase): VNode {
	const { label, countKey } = PHASES[phase];
	const count = run[countKey];
	return h(
		`button.phase-tile.phase-${phase}`,
		{
			class: { active: filter === phase },
			attrs: { type: 'button', disabled: count === 0 },
			on: { click: () => toggleFilter(phase) },
		},
		[h('span.phase-tile-count', String(count)), h('span.phase-tile-label', label)],
	);
}

/** Narrows the failed-game list to one failure type, or widens it back if it already was. */
function toggleFilter(phase: ValidationPhase): void {
	filter = filter === phase ? undefined : phase;
	render();
}

// Variant Breakdown -----------------------------------------------------------

/** Each variant's failures per type, worst first. Nothing when no variant failed. */
function createVariantTableVNode(variantErrors: Record<string, VariantStats>): VNode | null {
	const variants = Object.entries(variantErrors).sort((a, b) => b[1].total - a[1].total);
	if (variants.length === 0) return null;

	const header = h('tr', [
		h('th', 'Variant'),
		h('th.num', 'Total'),
		...PHASE_ORDER.map((phase) =>
			h(`th.num.phase-${phase}`, [h('span.phase-dot'), PHASES[phase].label]),
		),
	]);
	const rows = variants.map(([variant, stats]) =>
		h('tr', [
			h('td.variant-name', variant),
			h('td.num.variant-total', String(stats.total)),
			...PHASE_ORDER.map((phase) => {
				const count = stats[PHASES[phase].variantKey];
				return h(`td.num.phase-count.phase-${phase}`, count > 0 ? String(count) : '');
			}),
		]),
	);

	return h('section.card', [
		h('h2.section-title', 'Failures by variant'),
		h('div.variant-table-scroll', [
			h('table.variant-table', [h('thead', [header]), h('tbody', rows)]),
		]),
	]);
}

// Failed Games ----------------------------------------------------------------

/** Every failure, narrowed to the filtered type if there is one. Nothing when every game passed. */
function createFailuresVNode(errors: ValidationError[]): VNode | null {
	if (errors.length === 0) return null;
	const shown = filter ? errors.filter((error) => error.phase === filter) : errors;

	return h('section.failures', [
		h('div.failures-head', [
			h('h2.section-title', ['Failures', h('span.section-count', String(shown.length))]),
			filter ? createFilterClearVNode(filter) : null,
		]),
		h(
			'ol.failure-list',
			shown.map((error) => createFailureVNode(error)),
		),
	]);
}

/** The active filter, which shows every failed game again when clicked. */
function createFilterClearVNode(phase: ValidationPhase): VNode {
	return h(
		`button.filter-clear.phase-${phase}`,
		{ attrs: { type: 'button' }, on: { click: () => toggleFilter(phase) } },
		`${PHASES[phase].label} only · Show all`,
	);
}

/** One failure: its game, where it failed, why, and the ICN. A game may fail more than one check. */
function createFailureVNode(error: ValidationError): VNode {
	const copied = copiedFailure === error;
	const expanded = expandedIcns.has(error);
	return h(`li.failure.phase-${error.phase}`, { key: `${error.gameIndex}-${error.phase}` }, [
		h('div.failure-head', [
			h('span.failure-game', `#${error.gameIndex}`),
			error.variant ? h('span.failure-variant', error.variant) : null,
			h('span.phase-badge', PHASES[error.phase].label),
			h(
				'button.copy-button',
				{
					class: { copied },
					attrs: { type: 'button' },
					on: { click: () => copyIcn(error) },
				},
				copied ? 'Copied ✓' : 'Copy ICN',
			),
		]),
		h('pre.failure-message', error.error),
		error.phase === 'termination-mismatch' ? createTerminationVNode(error) : null,
		h('div.failure-icn', { class: { expanded } }, [
			h('code.failure-icn-text.scrollbar-thin', error.icn),
			h(
				'button.icn-toggle',
				{ attrs: { type: 'button' }, on: { click: () => toggleIcn(error) } },
				expanded ? 'Collapse' : 'Expand',
			),
		]),
	]);
}

/** A termination mismatch's recorded metadata, beside the conclusion the site reached. */
function createTerminationVNode(error: ValidationError): VNode {
	return h('dl.termination', [
		h('dt', 'Termination'),
		h('dd', error.termination ?? '—'),
		h('dt', 'Result'),
		h('dd', error.result ?? '—'),
		h('dt', 'Site conclusion'),
		h('dd', error.gameConclusion ? JSON.stringify(error.gameConclusion) : 'none'),
	]);
}

/** Copies a failure's ICN, then briefly confirms it on its button. */
async function copyIcn(error: ValidationError): Promise<void> {
	if (!(await docutil.copyToClipboard(error.icn))) return;
	copiedFailure = error;
	render();
	clearTimeout(copiedTimer);
	copiedTimer = window.setTimeout(() => {
		copiedFailure = undefined;
		render();
	}, COPIED_CONFIRMATION_MS);
}

/** Unfolds a failure's full ICN, or folds it back to one line. */
function toggleIcn(error: ValidationError): void {
	if (!expandedIcns.delete(error)) expandedIcns.add(error);
	render();
}

// Exports ---------------------------------------------------------------------

export default {
	// Rendering
	hide,
	display,
};
