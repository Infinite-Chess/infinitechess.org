// src/client/scripts/esm/views/icnvalidator.ts

import * as z from 'zod';

// Type definitions
interface VariantStats {
	total: number;
	icn: number;
	formulator: number;
	illegal: number;
	termination: number;
}

interface ValidationResults {
	total: number;
	successful: number;
	icnconverterErrors: number;
	formulatorErrors: number;
	illegalMoveErrors: number;
	terminationMismatchErrors: number;
	errors: ValidationError[];
	variantErrors: Record<string, VariantStats>;
}

interface ValidationError {
	gameIndex: number;
	phase: string;
	error: string;
	variant?: string;
	icn: string;
	termination?: string;
	result?: string;
	gameConclusion?: string;
}

type LogType = 'info' | 'success' | 'warning' | 'error';

const SPRTGamesSchema = z.array(z.string());

let gamesData: z.infer<typeof SPRTGamesSchema> | null = null;
// Used for cancelling ongoing validation when a new file is selected
let currentValidationId = 0;
// Track active workers to terminate them if user cancels
let activeWorkers: Worker[] = [];

// File upload handling
const fileInput = document.getElementById('file-input')! as HTMLInputElement;
const fileName = document.getElementById('file-name')! as HTMLParagraphElement;
const uploadSection = document.getElementById('upload-section')! as HTMLDivElement;
const progressSection = document.getElementById('progress-section')! as HTMLDivElement;
const progressFill = document.getElementById('progress-fill')! as HTMLDivElement;
const progressText = document.getElementById('progress-text')! as HTMLParagraphElement;

// Event Listeners
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

function handleFileSelect(): void {
	const file = fileInput.files?.[0];

	// Reset the input so the 'change' event fires even if the same file is selected again
	fileInput.value = '';

	if (file) {
		// Cancel any existing validation loop immediately
		currentValidationId++;
		terminateWorkers(); // Kill any running threads

		// Reset UI: Hide progress bar and results from any previous run
		progressSection.style.display = 'none';
		document.getElementById('summary-section')!.style.display = 'none';
		document.getElementById('variant-section')!.style.display = 'none';
		document.getElementById('errors-section')!.style.display = 'none';

		fileName.textContent = `Selected: ${file.name}`;
		fileName.style.color = 'var(--accent-color)';
		addLog(`File selected: ${file.name}`, 'info');

		// Read File
		const reader = new FileReader();
		reader.onload = (e) => {
			let unvalidatedJSON: any;
			try {
				const result = e.target?.result;
				if (typeof result !== 'string') throw new Error('Failed to read file');
				unvalidatedJSON = JSON.parse(result);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				addLog(`✗ Error parsing JSON: ${message}`, 'error');
				fileName.textContent = `❌ INVALID JSON SYNTAX: ${file.name}`;
				fileName.style.color = 'var(--danger-color)';
				gamesData = null;
				return;
			}

			const parseResult = SPRTGamesSchema.safeParse(unvalidatedJSON);
			if (!parseResult.success) {
				addLog('✗ JSON schema validation failed', 'error');
				const issues = parseResult.error.issues.map((i) => i.message).join(', ');
				addLog(`Details: ${issues}`, 'error');
				fileName.textContent = `❌ INVALID SCHEMA: ${file.name}`;
				fileName.style.color = 'var(--danger-color)';
				gamesData = null;
				return;
			}

			gamesData = parseResult.data;
			addLog(`✓ Loaded ${gamesData.length} game notation(s)`, 'success');
			validateGames();
		};
		reader.readAsText(file);
	}
}

function terminateWorkers(): void {
	activeWorkers.forEach((w) => w.terminate());
	activeWorkers = [];
}

async function validateGames(): Promise<void> {
	const runId = currentValidationId;
	if (!gamesData) return;

	// -- Parallelization Setup --
	// Use hardware concurrency (logic cores), default to 4 if unavailable
	const threadCount = navigator.hardwareConcurrency || 4;
	const totalGames = gamesData.length;

	// Initialize Result Container
	const globalResults: ValidationResults = {
		total: totalGames,
		successful: 0,
		icnconverterErrors: 0,
		formulatorErrors: 0,
		illegalMoveErrors: 0,
		terminationMismatchErrors: 0,
		errors: [],
		variantErrors: {},
	};

	// Reset UI displays
	document.getElementById('summary-section')!.style.display = 'none';
	document.getElementById('variant-section')!.style.display = 'none';
	document.getElementById('variant-stats')!.innerHTML = '';
	document.getElementById('errors-section')!.style.display = 'none';
	document.getElementById('error-list')!.innerHTML = '';

	// Reset progress UI immediately
	progressFill.style.width = '0%';
	progressFill.textContent = '0%';
	progressText.textContent = `Processed 0 / ${totalGames}`;
	progressSection.style.display = 'block';

	addLog(`Starting parallel validation with ${threadCount} workers...`, 'info');

	let gamesProcessed = 0;
	let workersDone = 0;

	// Determine chunk size
	const chunkSize = Math.ceil(totalGames / threadCount);

	for (let i = 0; i < threadCount; i++) {
		// Stop if cancelled during spawn loop
		if (runId !== currentValidationId) return;

		const start = i * chunkSize;
		const end = Math.min(start + chunkSize, totalGames);

		// If we ran out of games (e.g., 3 games, 4 threads), skip
		if (start >= totalGames) {
			workersDone++; // Count as done so we don't hang
			continue;
		}

		// Prepare data slice (Add index so we know which game is which)
		const slice = gamesData.slice(start, end).map((game, idx) => ({
			index: start + idx + 1, // 1-based index for UI
			icn: game,
		}));

		// Spawn Worker
		const worker = new Worker('scripts/esm/workers/icnvalidator.worker.js', { type: 'module' });
		activeWorkers.push(worker);

		// Track progress specific to this worker to avoid double-counting at the end
		let itemsProcessedInChunk = 0;

		// Handle Messages
		worker.onmessage = (e) => {
			if (e.data.type === 'progress') {
				// Update counters
				const count = e.data.count;
				itemsProcessedInChunk += count;
				gamesProcessed += count;

				// Update UI immediately
				const pct = ((gamesProcessed / totalGames) * 100).toFixed(1);
				progressFill.style.width = pct + '%';
				progressFill.textContent = pct + '%';
				progressText.textContent = `Processed ${gamesProcessed} / ${totalGames}`;
			} else if (e.data.type === 'done') {
				// Worker finished its batch
				const { results } = e.data;

				// Merge Counts
				globalResults.successful += results.successfulCount;
				globalResults.icnconverterErrors += results.icnconverterErrors;
				globalResults.formulatorErrors += results.formulatorErrors;
				globalResults.illegalMoveErrors += results.illegalMoveErrors;
				globalResults.terminationMismatchErrors += results.terminationMismatchErrors;

				// Merge Arrays/Objects
				globalResults.errors.push(...results.errors);

				// Merge Variant Stats
				for (const [variant, stats] of Object.entries(
					results.variantErrors as Record<string, VariantStats>,
				)) {
					if (!globalResults.variantErrors[variant]) {
						globalResults.variantErrors[variant] = { ...stats };
					} else {
						const existing = globalResults.variantErrors[variant]!;
						existing.total += stats.total;
						existing.icn += stats.icn;
						existing.formulator += stats.formulator;
						existing.illegal += stats.illegal;
						existing.termination += stats.termination;
					}
				}

				// Calculate remaining items (errors or final batch < 50) that weren't reported in progress
				const chunkTotal = end - start;
				const remainder = chunkTotal - itemsProcessedInChunk;
				gamesProcessed += remainder;
				workersDone++;

				// Final UI update for this chunk
				const pct = ((gamesProcessed / totalGames) * 100).toFixed(1);
				progressFill.style.width = pct + '%';
				progressFill.textContent = pct + '%';
				progressText.textContent = `Processed ${gamesProcessed} / ${totalGames}`;

				// Check completion
				if (workersDone === threadCount) {
					// Sort errors by index so they appear in order
					globalResults.errors.sort((a, b) => a.gameIndex - b.gameIndex);

					finishValidation(globalResults, runId);
				}
			}
		};

		// Start the worker
		worker.postMessage({ chunkId: i, games: slice });
	}
}

function finishValidation(results: ValidationResults, runId: number): void {
	if (runId !== currentValidationId) return;

	progressSection.style.display = 'none';
	displayResults(results);

	const pct = results.total > 0 ? (results.successful / results.total) * 100 : 0;
	let logType: LogType = 'error';
	if (results.successful === results.total) logType = 'success';
	else if (pct >= 90) logType = 'warning';

	addLog(`✓ Validation complete: ${results.successful}/${results.total} successful`, logType);
	terminateWorkers(); // Clean up
}

// --- Display Logic ---

function displayResults(results: ValidationResults): void {
	// Percentage Calculation
	const percentage = results.total > 0 ? (results.successful / results.total) * 100 : 0;
	const percentageStr = Number.isInteger(percentage)
		? percentage.toString() + '%'
		: percentage.toFixed(1) + '%';

	// Hero Stats
	const ratioEl = document.getElementById('pass-ratio')!;
	const percentEl = document.getElementById('pass-percentage')!;
	ratioEl.textContent = `${results.successful} / ${results.total}`;
	percentEl.textContent = percentageStr;

	// Set colors based on score
	ratioEl.className = 'hero-value';
	percentEl.className = 'hero-value';

	if (results.successful === results.total && results.total > 0) {
		ratioEl.classList.add('perfect');
		percentEl.classList.add('perfect');
	} else if (percentage >= 90) {
		ratioEl.classList.add('good');
		percentEl.classList.add('good');
	} else if (percentage >= 80) {
		ratioEl.classList.add('bad');
		percentEl.classList.add('bad');
	} else {
		ratioEl.classList.add('terrible');
		percentEl.classList.add('terrible');
	}

	// Update Grid
	const updateStat = (id: string, count: number): void => {
		const el = document.getElementById(id)!;
		el.textContent = String(count);
		el.className = 'stat-value';
		if (count === 0) el.classList.add('success');
		else if (count < 10) el.classList.add('warning');
		else el.classList.add('error');
	};

	updateStat('icnconverter-errors', results.icnconverterErrors);
	updateStat('formulator-errors', results.formulatorErrors);
	updateStat('illegal-move-errors', results.illegalMoveErrors);
	updateStat('termination-mismatch-errors', results.terminationMismatchErrors);

	document.getElementById('summary-section')!.style.display = 'block';

	// Variant Stats
	if (Object.keys(results.variantErrors).length > 0) {
		const variantStats = document.getElementById('variant-stats')!;
		variantStats.innerHTML = '';
		const sortedVariants = Object.entries(results.variantErrors).sort(
			(a, b) => b[1].total - a[1].total,
		);

		for (const [variant, stats] of sortedVariants) {
			const variantItem = document.createElement('div');
			variantItem.className = 'variant-item';

			const buildStat = (
				label: string,
				count: number,
				isAlwaysWarn: boolean = false,
			): string => {
				if (count === 0) return '';
				let type = 'warn';
				if (!isAlwaysWarn && count > 3) type = 'err';
				return `<div class="v-stat ${type} active"><span>${count}</span> ${label}</div>`;
			};

			const totalClass = stats.total > 4 ? 'err' : 'warn';
			variantItem.innerHTML = `
                <div class="variant-header">
                    <span class="variant-name">${variant}</span>
                    <span class="variant-errors ${totalClass}">${stats.total} total error(s)</span>
                </div>
                <div class="variant-details">
                    ${buildStat('ICN', stats.icn, true)}
                    ${buildStat('Formulator', stats.formulator)}
                    ${buildStat('Illegal', stats.illegal)}
                    ${buildStat('Mismatch', stats.termination)}
                </div>
            `;
			variantStats.appendChild(variantItem);
		}
		document.getElementById('variant-section')!.style.display = 'block';
	}

	// Error List
	if (results.errors.length > 0) {
		const errorList = document.getElementById('error-list')!;
		errorList.innerHTML = '';
		for (const error of results.errors) {
			const errorItem = document.createElement('div');
			errorItem.className = `error-item ${error.phase}`;
			let metadataHtml = '';
			if (error.phase === 'termination-mismatch') {
				metadataHtml = `
					<div style="margin-top: 0.5rem; font-size: 0.9em; color: var(--accent-color);">
						<div><strong>Termination:</strong> ${error.termination || 'undefined'}</div>
						<div><strong>Result:</strong> ${error.result || 'undefined'}</div>
						<div><strong>Game Conclusion:</strong> ${error.gameConclusion || 'undefined'}</div>
					</div>
				`;
			}
			errorItem.innerHTML = `
                <div class="error-header">
                    <span>Game #${error.gameIndex}${error.variant ? ` - ${error.variant}` : ''}</span>
                    <span class="error-type ${error.phase}">${error.phase}</span>
                </div>
                <div class="error-message">${error.error}</div>
                ${metadataHtml}
                <details style="margin-top: 0.5rem;">
                    <summary style="cursor: pointer; color: var(--accent-color);">View ICN snippet</summary>
                    <div class="error-message" style="margin-top: 0.5rem;">${error.icn}</div>
                </details>
            `;
			errorList.appendChild(errorItem);
		}
		document.getElementById('errors-section')!.style.display = 'block';
	}
}

function addLog(message: string, type: LogType = 'info'): void {
	const logOutput = document.getElementById('log-output')!;
	const entry = document.createElement('div');
	entry.className = `log-entry ${type}`;
	entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
	logOutput.appendChild(entry);
	logOutput.scrollTop = logOutput.scrollHeight;
}
