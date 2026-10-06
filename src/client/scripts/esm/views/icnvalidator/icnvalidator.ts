// src/client/scripts/esm/views/icnvalidator/icnvalidator.ts

/**
 * The ICN validator page. Replays the games json from an Apeiron SPRT run against
 * the website's own move and game-end logic, reporting every game the two disagree
 * on — each one a bug in the engine or the site.
 *
 * The games are split into chunks across one worker per hardware thread.
 */

import type { ValidationResults } from './gui/guivalidationresults.js';

import jsutil from '../../../../../shared/util/jsutil.js';

import toast from '../../components/toast.js';
import chunks from './chunks.js';
import guivalidationresults from './gui/guivalidationresults.js';
import { SPRTGamesSchema, ValidationRequest, ValidationResponse } from './icnvalidatorprotocol.js';

// Types -----------------------------------------------------------------------

/** How an activity log entry is colored. */
type LogType = 'info' | 'success' | 'warning' | 'error';

// Elements --------------------------------------------------------------------

const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
const dropzoneTitle = document.querySelector<HTMLElement>('#dropzone-title')!;
const dropzoneHint = document.querySelector<HTMLElement>('#dropzone-hint')!;
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const movegenCheckbox = document.querySelector<HTMLInputElement>('#movegen-check')!;
const runButton = document.querySelector<HTMLButtonElement>('#run-button')!;
const runProgress = document.querySelector<HTMLElement>('#run-progress')!;
const lanes = document.querySelector<HTMLElement>('#lanes')!;
const progressCount = document.querySelector<HTMLElement>('#progress-count')!;
const progressPercent = document.querySelector<HTMLElement>('#progress-percent')!;
const logCard = document.querySelector<HTMLDetailsElement>('#log-card')!;
const logCount = document.querySelector<HTMLElement>('#log-count')!;
const logOutput = document.querySelector<HTMLElement>('#log-output')!;

// State -----------------------------------------------------------------------

/** The selected file's games, ready to validate. Undefined until a valid file is chosen. */
let loadedGames: string[] | undefined;
/** Bumped to cancel the running validation, so its late messages are ignored. */
let currentValidationId = 0;
/** The running validation's workers. Empty while no validation runs. */
let activeWorkers: Worker[] = [];

// File Input ------------------------------------------------------------------

/** Cancels any running validation, then reads the selected file. */
function handleFileSelect(): void {
	const file = fileInput.files?.[0];
	// Reset the input so the 'change' event fires even if the same file is selected again
	fileInput.value = '';
	if (!file) return;

	cancelRun();
	guivalidationresults.hide();
	loadedGames = undefined;
	syncRunControls();
	addLog(`File selected: ${file.name}`);

	const reader = new FileReader();
	reader.onload = () => loadGames(file.name, reader.result);
	reader.readAsText(file);
}

/** Parses the file's text as a games json, readying it to run. */
function loadGames(name: string, result: FileReader['result']): void {
	let unvalidatedJSON: unknown;
	try {
		if (typeof result !== 'string') throw new Error('Failed to read file');
		unvalidatedJSON = JSON.parse(result);
	} catch (error) {
		addLog(`Error parsing JSON: ${jsutil.getErrorMessage(error)}`, 'error');
		showFile(name, 'Not valid JSON. Expected an array of ICN strings.', 'invalid');
		return;
	}

	const parseResult = SPRTGamesSchema.safeParse(unvalidatedJSON);
	if (!parseResult.success) {
		const issues = parseResult.error.issues.map((i) => i.message).join(', ');
		addLog(`Not an SPRT games file: ${issues}`, 'error');
		showFile(name, 'Not an SPRT games file. Expected an array of ICN strings.', 'invalid');
		return;
	}

	loadedGames = parseResult.data;
	addLog(`Loaded ${loadedGames.length} game(s)`, 'success');
	showFile(name, `${loadedGames.length} games · drop or click to replace`, 'ready');
	syncRunControls();
}

/** Shows the chosen file in the drop zone, as ready to run or as unusable. */
function showFile(name: string, hint: string, state: 'ready' | 'invalid'): void {
	dropzone.classList.toggle('ready', state === 'ready');
	dropzone.classList.toggle('invalid', state === 'invalid');
	dropzoneTitle.textContent = name;
	dropzoneHint.textContent = hint;
}

// Validation Run --------------------------------------------------------------

/** Starts validating the loaded games, or cancels the validation already running. */
function handleRunClick(): void {
	if (activeWorkers.length > 0) cancelRun();
	else if (loadedGames) validateGames(loadedGames);
}

/** Matches the run button, movegen checkbox and progress to whether a validation is running. */
function syncRunControls(): void {
	const running = activeWorkers.length > 0;
	runButton.textContent = running ? 'Cancel' : 'Validate';
	runButton.classList.toggle('cancel', running);
	runButton.disabled = !running && loadedGames === undefined;
	movegenCheckbox.disabled = running;
	runProgress.classList.toggle('hidden', !running);
}

/** Splits the games into one chunk per hardware thread, and validates each in its own worker. */
function validateGames(games: string[]): void {
	const runId = ++currentValidationId;
	const gameChunks = chunks.split(games, navigator.hardwareConcurrency || 4);
	const engineUrl = movegenCheckbox.checked ? window.icnValidatorPageData.engineUrl : undefined;
	const results = chunks.createResults();
	const startTime = performance.now();
	let processed = 0;
	let workersDone = 0;

	guivalidationresults.hide();
	lanes.replaceChildren();
	updateProgress(0, games.length);
	addLog(`Validating ${games.length} games on ${gameChunks.length} workers${engineUrl ? ', with the movegen check' : ''}`); // prettier-ignore

	gameChunks.forEach((chunk, chunkId) => {
		const laneFill = createLane();
		let chunkProcessed = 0;

		const worker = new Worker(window.icnValidatorPageData.workerUrl, { type: 'module' });
		activeWorkers.push(worker);
		// Loading errors (e.g., 404, script syntax error)
		worker.onerror = (error) => {
			if (runId === currentValidationId) abortRun(error.message || 'Failed to load worker script'); // prettier-ignore
		};
		worker.onmessage = (e: MessageEvent<ValidationResponse>) => {
			if (runId !== currentValidationId) return;
			if (e.data.type === 'initerror') return abortRun(e.data.message);

			// The final batch is too short to have been reported in progress
			const count = e.data.type === 'progress' ? e.data.count : chunk.length - chunkProcessed;
			chunkProcessed += count;
			processed += count;
			laneFill.style.width = `${(chunkProcessed / chunk.length) * 100}%`;
			updateProgress(processed, games.length);
			if (e.data.type === 'progress') return;

			laneFill.classList.add('done');
			chunks.mergeResults(results, e.data.results);
			if (++workersDone < gameChunks.length) return;
			const ms = performance.now() - startTime;
			finishValidation({
				...results,
				total: games.length,
				ms,
				movegen: engineUrl !== undefined,
			});
		};
		worker.postMessage({ chunkId, games: chunk, engineUrl } satisfies ValidationRequest);
	});

	syncRunControls();
}

/** Adds a worker's progress lane, returning the fill that tracks its chunk. */
function createLane(): HTMLElement {
	const lane = document.createElement('div');
	lane.className = 'lane';
	const fill = document.createElement('div');
	fill.className = 'lane-fill';
	lane.append(fill);
	lanes.append(lane);
	return fill;
}

/** Sets the progress readout to how many games have been validated. */
function updateProgress(processed: number, total: number): void {
	progressCount.textContent = `${processed} / ${total} games`;
	progressPercent.textContent = `${((processed / total) * 100).toFixed(1)}%`;
}

/** Stops every worker of the running validation. */
function terminateWorkers(): void {
	activeWorkers.forEach((w) => w.terminate());
	activeWorkers = [];
	syncRunControls();
}

/** Cancels the running validation, if there is one. */
function cancelRun(): void {
	if (activeWorkers.length === 0) return;
	currentValidationId++;
	terminateWorkers();
	addLog('Validation cancelled', 'warning');
}

/** Aborts the whole run when a worker can't start validating. */
function abortRun(reason: string): void {
	currentValidationId++;
	terminateWorkers();
	addLog(`System error: ${reason}`, 'error');
	toast.show(`Validation failed: ${reason}`, { error: true });
}

/** Shows the run's results once every worker is done. */
function finishValidation(results: ValidationResults): void {
	terminateWorkers();
	results.errors.sort((a, b) => a.gameIndex - b.gameIndex);
	guivalidationresults.display(results);

	const passed = results.successfulCount === results.total;
	addLog(`Validation complete: ${results.successfulCount}/${results.total} passed`, passed ? 'success' : 'warning'); // prettier-ignore
}

// Activity Log ----------------------------------------------------------------

/** Appends a timestamped entry to the activity log, opening the log for errors. */
function addLog(message: string, type: LogType = 'info'): void {
	const time = document.createElement('time');
	time.textContent = new Date().toLocaleTimeString();
	const entry = document.createElement('div');
	entry.className = `log-entry ${type}`;
	entry.append(time, message);
	logOutput.append(entry);
	logOutput.scrollTop = logOutput.scrollHeight;
	logCount.textContent = String(logOutput.childElementCount);
	if (type === 'error') logCard.open = true;
}

// Event Listeners -------------------------------------------------------------

fileInput.addEventListener('change', handleFileSelect);
runButton.addEventListener('click', handleRunClick);
dropzone.addEventListener('dragover', (e) => {
	e.preventDefault();
	dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', () => {
	dropzone.classList.remove('drag-over');
});
dropzone.addEventListener('drop', (e) => {
	e.preventDefault();
	dropzone.classList.remove('drag-over');
	if (e.dataTransfer?.files.length) {
		fileInput.files = e.dataTransfer.files;
		handleFileSelect();
	}
});
