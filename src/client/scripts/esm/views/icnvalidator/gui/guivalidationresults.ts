// src/client/scripts/esm/views/icnvalidator/gui/guivalidationresults.ts

/**
 * The ICN validator's results panels: the pass-rate summary,
 * the per-variant error breakdown, and the list of every failed game.
 */

import type { VNode } from 'snabbdom';
import type { ChunkResults, ValidationError, VariantStats } from '../icnvalidatorprotocol.js';

import { h, init } from 'snabbdom';

// Types -----------------------------------------------------------------------

/** Every worker's chunk tallies, merged into one run-wide total. */
export interface ValidationResults extends ChunkResults {
	/** How many games the run validated. */
	total: number;
}

// Elements --------------------------------------------------------------------

const summarySection = document.querySelector<HTMLElement>('#summary-section')!;
const passRatio = document.querySelector<HTMLElement>('#pass-ratio')!;
const passPercentage = document.querySelector<HTMLElement>('#pass-percentage')!;
const variantSection = document.querySelector<HTMLElement>('#variant-section')!;
const errorsSection = document.querySelector<HTMLElement>('#errors-section')!;

// Constants -------------------------------------------------------------------

const patch = init([]);

// State -----------------------------------------------------------------------

/** The variant breakdown's snabbdom tree, replaced by each patch. Starts as the element it renders into. */
let variantStatsVNode: VNode | Element = document.querySelector('#variant-stats')!;
/** The failed-game list's snabbdom tree, replaced by each patch. Starts as the element it renders into. */
let errorListVNode: VNode | Element = document.querySelector('#error-list')!;

// Panels ----------------------------------------------------------------------

/** Hides every results panel, ahead of a new run. */
function hide(): void {
	summarySection.style.display = 'none';
	variantSection.style.display = 'none';
	errorsSection.style.display = 'none';
}

/** Shows the results of a finished run. */
function display(results: ValidationResults): void {
	displaySummary(results);
	displayVariantStats(results.variantErrors);
	displayErrorList(results.errors);
}

// Summary ---------------------------------------------------------------------

/** Fills and shows the pass-rate summary and the per-phase error counts. */
function displaySummary(results: ValidationResults): void {
	const percentage = results.total > 0 ? (results.successfulCount / results.total) * 100 : 0;
	passRatio.textContent = `${results.successfulCount} / ${results.total}`;
	passPercentage.textContent = Number.isInteger(percentage)
		? percentage.toString() + '%'
		: percentage.toFixed(1) + '%';

	const rateClass = getPassRateClass(results, percentage);
	passRatio.className = `hero-value ${rateClass}`;
	passPercentage.className = `hero-value ${rateClass}`;

	updateStat('icnconverter-errors', results.icnconverterErrors);
	updateStat('formulator-errors', results.formulatorErrors);
	updateStat('illegal-move-errors', results.illegalMoveErrors);
	updateStat('movegen-mismatch-errors', results.movegenMismatchErrors);
	updateStat('termination-mismatch-errors', results.terminationMismatchErrors);

	summarySection.style.display = 'block';
}

/** The color class of the pass-rate figures. */
function getPassRateClass(results: ValidationResults, percentage: number): string {
	if (results.successfulCount === results.total && results.total > 0) return 'perfect';
	if (percentage >= 90) return 'good';
	if (percentage >= 80) return 'bad';
	return 'terrible';
}

/** Sets one per-phase error count, colored by how many there are. */
function updateStat(id: string, count: number): void {
	const el = document.querySelector<HTMLElement>(`#${id}`)!;
	el.textContent = String(count);
	el.className = 'stat-value';
	if (count === 0) el.classList.add('success');
	else if (count < 10) el.classList.add('warning');
	else el.classList.add('error');
}

// Variant Breakdown -----------------------------------------------------------

/** Fills and shows the per-variant error breakdown, if any variant had errors. */
function displayVariantStats(variantErrors: Record<string, VariantStats>): void {
	if (Object.keys(variantErrors).length === 0) return;
	const sortedVariants = Object.entries(variantErrors).sort((a, b) => b[1].total - a[1].total);
	variantStatsVNode = patch(
		variantStatsVNode,
		h(
			'div#variant-stats.variant-stats',
			sortedVariants.map(([variant, stats]) => createVariantItemVNode(variant, stats)),
		),
	);
	variantSection.style.display = 'block';
}

/** One variant's error total and its per-phase tallies. */
function createVariantItemVNode(variant: string, stats: VariantStats): VNode {
	const totalClass = stats.total > 4 ? 'err' : 'warn';
	return h('div.variant-item', [
		h('div.variant-header', [
			h('span.variant-name', variant),
			h(`span.variant-errors.${totalClass}`, `${stats.total} total error(s)`),
		]),
		h('div.variant-details', [
			createStatVNode('ICN', stats.icn, true),
			createStatVNode('Formulator', stats.formulator),
			createStatVNode('Illegal', stats.illegal),
			createStatVNode('Movegen', stats.movegen),
			createStatVNode('Termination', stats.termination),
		]),
	]);
}

/** One variant's tally for one phase, or nothing when it is zero. */
function createStatVNode(
	label: string,
	count: number,
	isAlwaysWarn: boolean = false,
): VNode | null {
	if (count === 0) return null;
	const type = !isAlwaysWarn && count > 3 ? 'err' : 'warn';
	return h(`div.v-stat.${type}`, [h('span', String(count)), ` ${label}`]);
}

// Failed Games ----------------------------------------------------------------

/** Fills and shows the failed-game list, if any game failed. */
function displayErrorList(errors: ValidationError[]): void {
	if (errors.length === 0) return;
	errorListVNode = patch(
		errorListVNode,
		h(
			'div#error-list.error-list',
			errors.map((error) => createErrorItemVNode(error)),
		),
	);
	errorsSection.style.display = 'block';
}

/** One failed game: where it failed, why, and its ICN. */
function createErrorItemVNode(error: ValidationError): VNode {
	return h(`div.error-item.${error.phase}`, [
		h('div.error-header', [
			h('span', `Game #${error.gameIndex}${error.variant ? ` - ${error.variant}` : ''}`),
			h(`span.error-type.${error.phase}`, error.phase),
		]),
		h('div.error-message', error.error),
		error.phase === 'termination-mismatch' ? createTerminationVNode(error) : null,
		h('details.error-icn', [
			h('summary', 'View ICN snippet'),
			h('div.error-message', error.icn),
		]),
	]);
}

/** A termination mismatch's recorded metadata, beside the conclusion the site reached. */
function createTerminationVNode(error: ValidationError): VNode {
	return h('div.error-metadata', [
		h('div', [h('strong', 'Termination:'), ` ${error.termination || 'undefined'}`]),
		h('div', [h('strong', 'Result:'), ` ${error.result || 'undefined'}`]),
		h('div', [
			h('strong', 'Game Conclusion:'),
			` ${JSON.stringify(error.gameConclusion) || 'undefined'}`,
		]),
	]);
}

// Exports ---------------------------------------------------------------------

export default {
	// Panels
	hide,
	display,
};
