// Import the necessary modules from the source code
// Note: This assumes the tool is being served via the dev server or has access to the built files

let gamesData = null;
let icnconverter = null;
let gameformulator = null;

// Load the required modules
async function loadModules() {
	try {
		addLog('Loading required modules...', 'info');
		addLog('Note: This tool requires the dev server to be running (npm run dev)', 'info');

		// Try to load from the built distribution first
		let icnLoaded = false;
		let gameformulatorLoaded = false;

		try {
			const icnModule = await import('../../dist/shared/chess/logic/icn/icnconverter.js');
			icnconverter = icnModule.default;
			addLog('✓ ICN converter module loaded from dist', 'success');
			icnLoaded = true;
		} catch (e) {
			addLog('⚠ Could not load ICN converter from dist, will try from dev server...', 'info');
		}

		try {
			const gameformulatorModule =
				await import('../../dist/client/scripts/esm/game/chess/gameformulator.js');
			gameformulator = gameformulatorModule.default;
			addLog('✓ Game formulator module loaded from dist', 'success');
			gameformulatorLoaded = true;
		} catch (e) {
			addLog(
				'⚠ Could not load game formulator from dist, will try from dev server...',
				'info',
			);
		}

		// If either module is missing, try loading from dev server paths
		if (!icnLoaded) {
			try {
				const icnModule = await import('/dist/shared/chess/logic/icn/icnconverter.js');
				icnconverter = icnModule.default;
				addLog('✓ ICN converter module loaded from dev server', 'success');
				icnLoaded = true;
			} catch (e) {
				addLog('✗ Failed to load ICN converter from dev server', 'error');
			}
		}

		if (!gameformulatorLoaded) {
			try {
				const gameformulatorModule =
					await import('/dist/client/scripts/esm/game/chess/gameformulator.js');
				gameformulator = gameformulatorModule.default;
				addLog('✓ Game formulator module loaded from dev server', 'success');
				gameformulatorLoaded = true;
			} catch (e) {
				addLog('✗ Failed to load game formulator from dev server', 'error');
			}
		}

		if (icnLoaded && gameformulatorLoaded) {
			addLog('All modules loaded successfully!', 'success');
			return true;
		} else {
			addLog('✗ Failed to load required modules', 'error');
			addLog('Please ensure the dev server is running: npm run dev', 'error');
			return false;
		}
	} catch (error) {
		addLog(`✗ Error loading modules: ${error.message}`, 'error');
		addLog('Please ensure the dev server is running: npm run dev', 'error');
		return false;
	}
}

// Initialize the tool
loadModules().then((success) => {
	if (!success) {
		document.getElementById('upload-section').innerHTML +=
			'<p style="color: var(--danger-color); margin-top: 1rem; font-weight: bold;">⚠ Failed to load required modules</p>' +
			'<p style="color: var(--text-color); margin-top: 0.5rem;">This tool requires the development server to be running.</p>' +
			'<p style="color: var(--accent-color); margin-top: 0.5rem;">Please run: <code style="background: #111; padding: 0.25rem 0.5rem; border-radius: 4px;">npm run dev</code></p>' +
			'<p style="color: var(--text-color); margin-top: 0.5rem; font-size: 0.9em;">Once the server is running, refresh this page.</p>';
	}
});

// File upload handling
const fileInput = document.getElementById('file-input');
const fileName = document.getElementById('file-name');
const validateBtn = document.getElementById('validate-btn');
const uploadSection = document.getElementById('upload-section');

fileInput.addEventListener('change', handleFileSelect);
validateBtn.addEventListener('click', validateGames);

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
	if (e.dataTransfer.files.length) {
		fileInput.files = e.dataTransfer.files;
		handleFileSelect();
	}
});

function handleFileSelect() {
	const file = fileInput.files[0];
	if (file) {
		fileName.textContent = `Selected: ${file.name}`;
		addLog(`File selected: ${file.name}`, 'info');

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				gamesData = JSON.parse(e.target.result);
				if (!Array.isArray(gamesData)) {
					throw new Error('JSON file must contain an array of game notations');
				}
				addLog(`✓ Loaded ${gamesData.length} game notation(s)`, 'success');
				validateBtn.disabled = false;
			} catch (error) {
				addLog(`✗ Error parsing JSON: ${error.message}`, 'error');
				fileName.textContent += ' (Invalid JSON)';
				gamesData = null;
				validateBtn.disabled = true;
			}
		};
		reader.readAsText(file);
	}
}

async function validateGames() {
	if (!gamesData || !icnconverter || !gameformulator) {
		addLog('✗ Cannot validate: missing data or modules', 'error');
		return;
	}

	validateBtn.disabled = true;

	const results = {
		total: gamesData.length,
		successful: 0,
		icnconverterErrors: 0,
		formulatorErrors: 0,
		errors: [],
		variantErrors: {},
	};

	// Show progress section
	const progressSection = document.getElementById('progress-section');
	const progressFill = document.getElementById('progress-fill');
	const progressText = document.getElementById('progress-text');
	progressSection.style.display = 'block';

	addLog(`Starting validation of ${results.total} games...`, 'info');

	for (let i = 0; i < gamesData.length; i++) {
		const gameICN = gamesData[i];
		const progress = (((i + 1) / results.total) * 100).toFixed(1);

		progressFill.style.width = progress + '%';
		progressFill.textContent = progress + '%';
		progressText.textContent = `Processing game ${i + 1} of ${results.total}`;

		try {
			// Step 1: Convert ICN to long format
			let longFormat;
			try {
				longFormat = icnconverter.ShortToLong_Format(gameICN);
			} catch (error) {
				results.icnconverterErrors++;
				results.errors.push({
					gameIndex: i + 1,
					phase: 'icnconverter',
					error: error.message,
					icn: gameICN.substring(0, 100) + (gameICN.length > 100 ? '...' : ''),
				});
				continue;
			}

			// Extract variant from metadata for error tracking
			const variant = longFormat.metadata?.Variant || 'Unknown';

			// Step 2: Formulate the game
			try {
				const game = gameformulator.formulateGame(longFormat);
				results.successful++;
			} catch (error) {
				results.formulatorErrors++;
				results.errors.push({
					gameIndex: i + 1,
					phase: 'formulator',
					error: error.message,
					variant: variant,
					icn: gameICN.substring(0, 100) + (gameICN.length > 100 ? '...' : ''),
				});

				// Track errors by variant
				if (!results.variantErrors[variant]) {
					results.variantErrors[variant] = 0;
				}
				results.variantErrors[variant]++;
			}
		} catch (error) {
			// Unexpected error
			addLog(`✗ Unexpected error processing game ${i + 1}: ${error.message}`, 'error');
			results.formulatorErrors++;
			results.errors.push({
				gameIndex: i + 1,
				phase: 'unknown',
				error: error.message,
				icn: gameICN.substring(0, 100) + (gameICN.length > 100 ? '...' : ''),
			});
		}

		// Allow UI to update
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	// Hide progress, show results
	progressSection.style.display = 'none';
	displayResults(results);
	validateBtn.disabled = false;

	addLog(
		`✓ Validation complete: ${results.successful}/${results.total} successful`,
		results.successful === results.total ? 'success' : 'error',
	);
}

function displayResults(results) {
	// Update summary
	document.getElementById('total-games').textContent = results.total;
	document.getElementById('successful-games').textContent = results.successful;
	document.getElementById('icnconverter-errors').textContent = results.icnconverterErrors;
	document.getElementById('formulator-errors').textContent = results.formulatorErrors;
	document.getElementById('summary-section').style.display = 'block';

	// Display variant errors
	if (Object.keys(results.variantErrors).length > 0) {
		const variantStats = document.getElementById('variant-stats');
		variantStats.innerHTML = '';

		const sortedVariants = Object.entries(results.variantErrors).sort((a, b) => b[1] - a[1]);

		for (const [variant, count] of sortedVariants) {
			const variantItem = document.createElement('div');
			variantItem.className = 'variant-item';
			variantItem.innerHTML = `
                <span class="variant-name">${variant}</span>
                <span class="variant-errors">${count} error(s)</span>
            `;
			variantStats.appendChild(variantItem);
		}

		document.getElementById('variant-section').style.display = 'block';
	}

	// Display error details
	if (results.errors.length > 0) {
		const errorList = document.getElementById('error-list');
		errorList.innerHTML = '';

		for (const error of results.errors) {
			const errorItem = document.createElement('div');
			errorItem.className = `error-item ${error.phase}`;
			errorItem.innerHTML = `
                <div class="error-header">
                    <span>Game #${error.gameIndex}${error.variant ? ` - ${error.variant}` : ''}</span>
                    <span class="error-type ${error.phase}">${error.phase}</span>
                </div>
                <div class="error-message">${error.error}</div>
                <details style="margin-top: 0.5rem;">
                    <summary style="cursor: pointer; color: var(--accent-color);">View ICN snippet</summary>
                    <div class="error-message" style="margin-top: 0.5rem;">${error.icn}</div>
                </details>
            `;
			errorList.appendChild(errorItem);
		}

		document.getElementById('errors-section').style.display = 'block';
	}
}

function addLog(message, type = 'info') {
	const logOutput = document.getElementById('log-output');
	const entry = document.createElement('div');
	entry.className = `log-entry ${type}`;
	const timestamp = new Date().toLocaleTimeString();
	entry.textContent = `[${timestamp}] ${message}`;
	logOutput.appendChild(entry);
	logOutput.scrollTop = logOutput.scrollHeight;
}
