// Import the necessary modules directly
import icnconverter from '../../../../shared/chess/logic/icn/icnconverter.js';
import { players as p } from '../../../../shared/chess/util/typeutil.js';
import winconutil from '../../../../shared/chess/util/winconutil.js';
import gameformulator from '../game/chess/gameformulator.js';

import * as zod from 'zod';

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

type LogType = 'info' | 'success' | 'error';

const SPRTGamesSchema = zod.object({
	games: zod.array(
		zod.object({
			rawICN: zod.string(),
		}),
	),
});

let gamesData: zod.infer<typeof SPRTGamesSchema> | null = null;
// Used for cancelling ongoing validation when a new file is selected
let currentValidationId = 0;

// File upload handling
const fileInput = document.getElementById('file-input')! as HTMLInputElement;
const fileName = document.getElementById('file-name')! as HTMLParagraphElement;
const uploadSection = document.getElementById('upload-section')! as HTMLDivElement;

fileInput.addEventListener('change', handleFileSelect);

// Drag and drop
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

		// Reset UI: Hide progress bar and results from any previous run
		document.getElementById('progress-section')!.style.display = 'none';
		document.getElementById('summary-section')!.style.display = 'none';
		document.getElementById('variant-section')!.style.display = 'none';
		document.getElementById('errors-section')!.style.display = 'none';

		fileName.textContent = `Selected: ${file.name}`;
		fileName.style.color = 'var(--accent-color)';
		addLog(`File selected: ${file.name}`, 'info');

		const reader = new FileReader();
		reader.onload = (e) => {
			let unvalidatedJSON: any;
			try {
				const result = e.target?.result;
				if (typeof result !== 'string') {
					throw new Error('Failed to read file');
				}
				unvalidatedJSON = JSON.parse(result);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				addLog(`✗ Error parsing JSON: ${message}`, 'error');

				// Make error obvious
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

				// Make error obvious
				fileName.textContent = `❌ INVALID SCHEMA: ${file.name}`;
				fileName.style.color = 'var(--danger-color)';

				gamesData = null;
				return;
			}

			gamesData = parseResult.data;
			addLog(`✓ Loaded ${gamesData.games.length} game notation(s)`, 'success');
			// Automatically start the validation process
			validateGames();
		};
		reader.readAsText(file);
	}
}

async function validateGames(): Promise<void> {
	// Capture the ID specific to THIS run
	const runId = currentValidationId;

	if (!gamesData) {
		addLog('✗ Cannot validate: missing data or modules', 'error');
		return;
	}

	const results: ValidationResults = {
		total: gamesData.games.length,
		successful: 0,
		icnconverterErrors: 0,
		formulatorErrors: 0,
		illegalMoveErrors: 0,
		terminationMismatchErrors: 0,
		errors: [],
		variantErrors: {},
	};

	// Helper to track errors by variant
	const incrementVariantError = (variantName: string, type: keyof VariantStats): void => {
		if (!results.variantErrors[variantName]) {
			results.variantErrors[variantName] = {
				total: 0,
				icn: 0,
				formulator: 0,
				illegal: 0,
				termination: 0,
			};
		}
		results.variantErrors[variantName]!.total++;
		results.variantErrors[variantName]![type]++;
	};

	// Reset UI state (Clear previous run's errors)
	document.getElementById('summary-section')!.style.display = 'none';

	document.getElementById('variant-section')!.style.display = 'none';
	document.getElementById('variant-stats')!.innerHTML = '';

	document.getElementById('errors-section')!.style.display = 'none';
	document.getElementById('error-list')!.innerHTML = '';

	// Show progress section
	const progressSection = document.getElementById('progress-section')! as HTMLDivElement;
	const progressFill = document.getElementById('progress-fill')! as HTMLDivElement;
	const progressText = document.getElementById('progress-text')! as HTMLParagraphElement;
	progressSection.style.display = 'block';

	addLog(`Starting validation of ${results.total} games...`, 'info');

	for (let i = 0; i < gamesData.games.length; i++) {
		// Stop if a new file has been selected (ID mismatch)
		if (runId !== currentValidationId) return;

		const gameICN = gamesData.games[i]!.rawICN!;
		const progress = (((i + 1) / results.total) * 100).toFixed(1);

		progressFill.style.width = progress + '%';
		progressFill.textContent = progress + '%';
		progressText.textContent = `Processing game ${i + 1} of ${results.total}`;

		try {
			// Stage 1: Convert ICN to long format
			let longFormat: any;
			try {
				longFormat = icnconverter.ShortToLong_Format(gameICN);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				results.icnconverterErrors++;
				results.errors.push({
					gameIndex: i + 1,
					phase: 'icnconverter',
					error: message,
					icn: gameICN,
				});
				incrementVariantError('Unknown (ICN Parse Failed)', 'icn');
				continue;
			}

			// Extract variant and termination from metadata for error tracking
			const variant = longFormat.metadata?.Variant || 'Unknown';
			const termination = longFormat.metadata?.Termination;
			const result = longFormat.metadata?.Result;

			// Stage 2: Formulate the game (without move validation)
			let game: any;
			try {
				game = gameformulator.formulateGame(longFormat);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				results.formulatorErrors++;
				results.errors.push({
					gameIndex: i + 1,
					phase: 'formulator',
					error: message,
					variant: variant,
					icn: gameICN,
				});
				incrementVariantError(variant, 'formulator');
				continue;
			}

			// Stage 3: Validate move legality
			try {
				// Re-formulate with move validation enabled
				gameformulator.formulateGame(longFormat, true);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				results.illegalMoveErrors++;
				results.errors.push({
					gameIndex: i + 1,
					phase: 'illegal-move',
					error: message,
					variant: variant,
					icn: gameICN,
				});
				incrementVariantError(variant, 'illegal');
				continue;
			}

			// Stage 4: Validate termination matches game conclusion
			try {
				validateTermination(termination, result, game.basegame.gameConclusion);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				results.terminationMismatchErrors++;
				results.errors.push({
					gameIndex: i + 1,
					phase: 'termination-mismatch',
					error: message,
					variant: variant,
					termination: termination,
					result: result,
					gameConclusion: game.basegame.gameConclusion,
					icn: gameICN,
				});
				incrementVariantError(variant, 'termination');
				continue;
			}

			// All stages passed!
			results.successful++;
		} catch (error) {
			// Unexpected error
			const message = error instanceof Error ? error.message : String(error);
			addLog(`✗ Unexpected error processing game ${i + 1}: ${message}`, 'error');
			results.formulatorErrors++;
			results.errors.push({
				gameIndex: i + 1,
				phase: 'unknown',
				error: message,
				icn: gameICN,
			});
		}

		// Allow UI to update
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	// Hide progress, show results
	progressSection.style.display = 'none';
	displayResults(results);

	addLog(
		`✓ Validation complete: ${results.successful}/${results.total} successful`,
		results.successful === results.total ? 'success' : 'error',
	);
}

// Helper function to validate termination metadata
function validateTermination(
	termination: string | undefined,
	result: string | undefined,
	gameConclusion: string | undefined,
): void {
	// Check mappings before running through getVictorAndConditionFromGameConclusion
	if (termination === 'Draw by maximum moves reached') {
		if (gameConclusion !== undefined) {
			throw new Error(
				`Termination is "Draw by maximum moves reached" but gameConclusion is not undefined: ${gameConclusion}`,
			);
		}
		return;
	}

	if (termination && termination.startsWith('Material adjudication')) {
		if (gameConclusion !== undefined) {
			throw new Error(
				`Termination starts with "Material adjudication" but gameConclusion is not undefined: ${gameConclusion}`,
			);
		}
		return;
	}

	if (termination === 'Loss on time') {
		if (gameConclusion !== undefined) {
			throw new Error(
				`Termination is "Loss on time" but gameConclusion is not undefined: ${gameConclusion}`,
			);
		}
		return;
	}

	// If gameConclusion is undefined at this point, and termination is specified, that's an error
	if (gameConclusion === undefined) {
		if (termination) {
			throw new Error(
				`gameConclusion is undefined but Termination metadata is specified: ${termination}`,
			);
		}
		return; // Both undefined is OK (game not over)
	}

	// Parse the gameConclusion
	const { victor, condition } =
		winconutil.getVictorAndConditionFromGameConclusion(gameConclusion);

	// Check condition mappings
	const conditionMappings: Record<string, string> = {
		Checkmate: 'checkmate',
		'Draw by stalemate': 'stalemate',
		'Draw by threefold repetition': 'repetition',
		'Draw by fifty-move rule': 'moverule',
		'Draw by insufficient material': 'insuffmat',
	};

	// Check if termination starts with specific patterns
	if (termination && termination.startsWith('Win by capturing all')) {
		if (condition !== 'allpiecescaptured') {
			throw new Error(
				`Termination starts with "Win by capturing all" but condition is "${condition}", expected "allpiecescaptured"`,
			);
		}
	} else if (termination && termination in conditionMappings) {
		if (condition !== conditionMappings[termination]) {
			throw new Error(
				`Termination "${termination}" does not match condition "${condition}", expected "${conditionMappings[termination]}"`,
			);
		}
	} else if (termination) {
		// No matching mapping found
		throw new Error(`Unknown Termination metadata: "${termination}"`);
	}

	// Validate Result metadata matches victor
	if (victor !== undefined && result) {
		const resultMappings: Record<string, number> = {
			'1-0': p.WHITE,
			'0-1': p.BLACK,
			'1/2-1/2': p.NEUTRAL,
		};

		if (result in resultMappings) {
			if (victor !== resultMappings[result]) {
				throw new Error(
					`Result "${result}" does not match victor ${victor}, expected victor ${resultMappings[result]}`,
				);
			}
		} else {
			throw new Error(`Unknown Result metadata: "${result}"`);
		}
	}
}

function displayResults(results: ValidationResults): void {
	// Calculate Percentage
	const percentage = results.total > 0 ? (results.successful / results.total) * 100 : 0;

	const percentageStr = Number.isInteger(percentage)
		? percentage.toString() + '%'
		: percentage.toFixed(1) + '%';

	// Update Hero Stats
	const ratioEl = document.getElementById('pass-ratio')!;
	const percentEl = document.getElementById('pass-percentage')!;

	ratioEl.textContent = `${results.successful} / ${results.total}`;
	percentEl.textContent = percentageStr;

	// Set colors based on score
	ratioEl.className = 'hero-value'; // reset
	percentEl.className = 'hero-value'; // reset

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

	// Update Error Counts
	// Helper function for dynamic coloring
	const updateStat = (id: string, count: number): void => {
		const el = document.getElementById(id)!;
		el.textContent = String(count);

		// Reset class to base
		el.className = 'stat-value';

		// Apply logic: 0 = Green, 1-9 = Orange, 10+ = Red
		if (count === 0) {
			el.classList.add('success');
		} else if (count < 10) {
			el.classList.add('warning');
		} else {
			el.classList.add('error');
		}
	};

	updateStat('icnconverter-errors', results.icnconverterErrors);
	updateStat('formulator-errors', results.formulatorErrors);
	updateStat('illegal-move-errors', results.illegalMoveErrors);
	updateStat('termination-mismatch-errors', results.terminationMismatchErrors);

	document.getElementById('summary-section')!.style.display = 'block';

	// Display variant errors
	if (Object.keys(results.variantErrors).length > 0) {
		const variantStats = document.getElementById('variant-stats')!;
		variantStats.innerHTML = '';

		const sortedVariants = Object.entries(results.variantErrors).sort(
			(a, b) => b[1].total - a[1].total,
		);

		for (const [variant, stats] of sortedVariants) {
			const variantItem = document.createElement('div');
			variantItem.className = 'variant-item';

			// Build the stats HTML
			const buildStat = (
				label: string,
				count: number,
				isAlwaysWarn: boolean = false,
			): string => {
				if (count === 0) return '';

				// Logic: Red ('err') if > 3, otherwise Orange ('warn')
				// Exception: ICN is always 'warn' if isAlwaysWarn is true
				let type = 'warn';
				if (!isAlwaysWarn && count > 3) {
					type = 'err';
				}

				return `<div class="v-stat ${type} active"><span>${count}</span> ${label}</div>`;
			};

			// Logic for total header: Red if > 5, Orange otherwise
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

	// Display error details
	if (results.errors.length > 0) {
		const errorList = document.getElementById('error-list')!;
		errorList.innerHTML = '';

		for (const error of results.errors) {
			const errorItem = document.createElement('div');
			errorItem.className = `error-item ${error.phase}`;

			// Build additional metadata for termination mismatches
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
	const timestamp = new Date().toLocaleTimeString();
	entry.textContent = `[${timestamp}] ${message}`;
	logOutput.appendChild(entry);
	logOutput.scrollTop = logOutput.scrollHeight;
}
