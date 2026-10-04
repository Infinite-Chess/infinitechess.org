// src/client/scripts/esm/views/icnvalidator/icnvalidator.ts

/**
 * The ICN validator page. Replays the games json from an Apeiron SPRT run against
 * the website's own move and game-end logic, reporting every game the two disagree
 * on — each one a bug in the engine or the site.
 *
 * The games are split into chunks across one worker per hardware thread.
 */

import type { ValidationResults } from './gui/guivalidationresults.js';
import type {
	ChunkResults,
	ValidationRequest,
	ValidationResponse,
} from './icnvalidatorprotocol.js';

import * as z from 'zod';

import jsutil from '../../../../../shared/util/jsutil.js';

import guivalidationresults from './gui/guivalidationresults.js';

// Types -----------------------------------------------------------------------

/** How an activity log entry is colored. */
type LogType = 'info' | 'success' | 'warning' | 'error';

// Elements --------------------------------------------------------------------

const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const fileName = document.querySelector<HTMLParagraphElement>('#file-name')!;
const uploadSection = document.querySelector<HTMLDivElement>('#upload-section')!;
const progressSection = document.querySelector<HTMLDivElement>('#progress-section')!;
const progressFill = document.querySelector<HTMLDivElement>('#progress-fill')!;
const progressText = document.querySelector<HTMLParagraphElement>('#progress-text')!;
const logOutput = document.querySelector<HTMLDivElement>('#log-output')!;

// Schemas ---------------------------------------------------------------------

/** The games json an SPRT run writes: one ICN per game. */
const SPRTGamesSchema = z.array(z.string());

// State -----------------------------------------------------------------------

/** Bumped to cancel the running validation, e.g. when a new file is selected. */
let currentValidationId = 0;
/** The running validation's workers, so it can be cancelled. */
let activeWorkers: Worker[] = [];

// File Input ------------------------------------------------------------------

/** Cancels any running validation, then reads the selected file. */
function handleFileSelect(): void {
	const file = fileInput.files?.[0];

	// Reset the input so the 'change' event fires even if the same file is selected again
	fileInput.value = '';

	if (!file) return;

	// Cancel any existing validation immediately
	currentValidationId++;
	terminateWorkers();

	progressSection.style.display = 'none';
	guivalidationresults.hide();

	fileName.textContent = `Selected: ${file.name}`;
	fileName.style.color = 'var(--accent-color)';
	addLog(`File selected: ${file.name}`, 'info');

	const reader = new FileReader();
	reader.onload = () => loadGames(file.name, reader.result);
	reader.readAsText(file);
}

/** Parses the file's text as a games json, then starts validating it. */
function loadGames(name: string, result: FileReader['result']): void {
	let unvalidatedJSON: unknown;
	try {
		if (typeof result !== 'string') throw new Error('Failed to read file');
		unvalidatedJSON = JSON.parse(result);
	} catch (error) {
		addLog(`✗ Error parsing JSON: ${jsutil.getErrorMessage(error)}`, 'error');
		markFileInvalid('INVALID JSON SYNTAX', name);
		return;
	}

	const parseResult = SPRTGamesSchema.safeParse(unvalidatedJSON);
	if (!parseResult.success) {
		addLog('✗ JSON schema validation failed', 'error');
		const issues = parseResult.error.issues.map((i) => i.message).join(', ');
		addLog(`Details: ${issues}`, 'error');
		markFileInvalid('INVALID SCHEMA', name);
		return;
	}

	addLog(`✓ Loaded ${parseResult.data.length} game notation(s)`, 'success');
	validateGames(parseResult.data);
}

/** Flags the selected file as unusable, naming why. */
function markFileInvalid(reason: string, name: string): void {
	fileName.textContent = `❌ ${reason}: ${name}`;
	fileName.style.color = 'var(--danger-color)';
}

// Validation Run --------------------------------------------------------------

/** Stops every worker of the running validation. */
function terminateWorkers(): void {
	activeWorkers.forEach((w) => w.terminate());
	activeWorkers = [];
}

/** Splits the games into one chunk per hardware thread, and validates each in its own worker. */
function validateGames(games: string[]): void {
	const runId = currentValidationId;

	// Use hardware concurrency (logic cores), default to 4 if unavailable
	const threadCount = navigator.hardwareConcurrency || 4;
	const totalGames = games.length;

	const globalResults: ValidationResults = {
		total: totalGames,
		successfulCount: 0,
		icnconverterErrors: 0,
		formulatorErrors: 0,
		illegalMoveErrors: 0,
		terminationMismatchErrors: 0,
		errors: [],
		variantErrors: {},
	};

	updateProgress(0, totalGames);
	progressSection.style.display = 'block';

	addLog(`Starting parallel validation with ${threadCount} workers...`, 'info');

	let gamesProcessed = 0;
	let workersDone = 0;
	const chunkSize = Math.ceil(totalGames / threadCount);

	for (let i = 0; i < threadCount; i++) {
		const start = i * chunkSize;
		const end = Math.min(start + chunkSize, totalGames);

		// If we ran out of games (e.g., 3 games, 4 threads), skip
		if (start >= totalGames) {
			workersDone++; // Count as done so we don't hang
			continue;
		}

		// Tag each game with its index so its errors can be traced back
		const slice = games.slice(start, end).map((game, idx) => ({
			index: start + idx + 1, // 1-based index for UI
			icn: game,
		}));

		const worker = new Worker(window.$icnValidatorWorkerUrl, { type: 'module' });
		activeWorkers.push(worker);

		// Loading errors (e.g., 404, script syntax error)
		worker.onerror = (error) => {
			if (runId === currentValidationId) abortRun(error);
		};

		// Track progress specific to this worker to avoid double-counting at the end
		let itemsProcessedInChunk = 0;

		worker.onmessage = (e: MessageEvent<ValidationResponse>) => {
			if (e.data.type === 'progress') {
				itemsProcessedInChunk += e.data.count;
				gamesProcessed += e.data.count;
				updateProgress(gamesProcessed, totalGames);
				return;
			}

			mergeChunkResults(globalResults, e.data.results);

			// Count the games that weren't reported in progress (errors, or the final batch < 10)
			gamesProcessed += end - start - itemsProcessedInChunk;
			workersDone++;
			updateProgress(gamesProcessed, totalGames);

			if (workersDone === threadCount) {
				globalResults.errors.sort((a, b) => a.gameIndex - b.gameIndex);
				finishValidation(globalResults, runId);
			}
		};

		worker.postMessage({ chunkId: i, games: slice } satisfies ValidationRequest);
	}
}

/** Sets the progress bar to how many games have been validated. */
function updateProgress(processed: number, total: number): void {
	const pct = ((processed / total) * 100).toFixed(1);
	progressFill.style.width = pct + '%';
	progressFill.textContent = pct + '%';
	progressText.textContent = `Processed ${processed} / ${total}`;
}

/** Aborts the whole run when a worker fails to start. */
function abortRun(error: ErrorEvent): void {
	const msg = error.message || 'Failed to load worker script';
	addLog(`✗ System Error: Worker failed to start - ${msg}`, 'error');

	fileName.textContent = `❌ SYSTEM ERROR: Worker Script Failed`;
	fileName.style.color = 'var(--danger-color)';

	terminateWorkers();
	currentValidationId++; // Invalidate runId to stop loop/other callbacks

	progressSection.style.display = 'none';
}

/** Adds one worker's chunk tallies into the run-wide totals. */
function mergeChunkResults(globalResults: ValidationResults, results: ChunkResults): void {
	globalResults.successfulCount += results.successfulCount;
	globalResults.icnconverterErrors += results.icnconverterErrors;
	globalResults.formulatorErrors += results.formulatorErrors;
	globalResults.illegalMoveErrors += results.illegalMoveErrors;
	globalResults.terminationMismatchErrors += results.terminationMismatchErrors;

	globalResults.errors.push(...results.errors);

	for (const [variant, stats] of Object.entries(results.variantErrors)) {
		const existing = globalResults.variantErrors[variant];
		if (!existing) {
			globalResults.variantErrors[variant] = { ...stats };
			continue;
		}
		existing.total += stats.total;
		existing.icn += stats.icn;
		existing.formulator += stats.formulator;
		existing.illegal += stats.illegal;
		existing.termination += stats.termination;
	}
}

/** Shows the run's results once every worker is done, unless the run was cancelled. */
function finishValidation(results: ValidationResults, runId: number): void {
	if (runId !== currentValidationId) return;

	progressSection.style.display = 'none';
	guivalidationresults.display(results);

	const pct = results.total > 0 ? (results.successfulCount / results.total) * 100 : 0;
	let logType: LogType = 'error';
	if (results.successfulCount === results.total) logType = 'success';
	else if (pct >= 90) logType = 'warning';

	addLog(`✓ Validation complete: ${results.successfulCount}/${results.total} successful`, logType); // prettier-ignore
	terminateWorkers(); // Clean up
}

// Activity Log ----------------------------------------------------------------

/** Appends a timestamped entry to the activity log, scrolling it into view. */
function addLog(message: string, type: LogType = 'info'): void {
	const entry = document.createElement('div');
	entry.className = `log-entry ${type}`;
	entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
	logOutput.appendChild(entry);
	logOutput.scrollTop = logOutput.scrollHeight;
}

// Event Listeners -------------------------------------------------------------

fileInput.addEventListener('change', handleFileSelect);
uploadSection.addEventListener('dragover', (e) => {
	e.preventDefault();
	uploadSection.classList.add('drag-over');
});
uploadSection.addEventListener('dragleave', () => {
	uploadSection.classList.remove('drag-over');
});
uploadSection.addEventListener('drop', (e) => {
	e.preventDefault();
	uploadSection.classList.remove('drag-over');
	if (e.dataTransfer?.files.length) {
		fileInput.files = e.dataTransfer.files;
		handleFileSelect();
	}
});
