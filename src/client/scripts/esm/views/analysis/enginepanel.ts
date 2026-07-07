// src/client/scripts/esm/views/analysis/enginepanel.ts

/**
 * The analysis page's engine panel: the local-evaluation toggle, eval readout,
 * depth/nodes stats, settings drawer (MultiPV / threads / hash / search time),
 * the MultiPV line list (click a move to play the line), the eval gauge beside
 * the board, and the engine's best-move arrows drawn on the board.
 */

import type { Coords } from '../../../../../shared/chess/util/coordutil.js';
import type { EngineArrow } from '../../game/rendering/highlights/enginearrows.js';
import type { CevalLine, CevalStatus, CevalUpdate } from '../../game/misc/analysis/ceval.js';

import moveutil from '../../../../../shared/chess/util/moveutil.js';
import movevalidation from '../../../../../shared/chess/logic/movevalidation.js';
import coordutil, { CoordsKey } from '../../../../../shared/chess/util/coordutil.js';

import ceval from '../../game/misc/analysis/ceval.js';
import toast from '../../components/toast.js';
import gameslot from '../../game/chess/gameslot.js';
import gamesession from '../../game/chess/gamesession.js';
import { GameBus } from '../../game/GameBus.js';
import enginearrows from '../../game/rendering/highlights/enginearrows.js';
import movesequence from '../../game/chess/movesequence.js';
import { isTypingTarget } from './analysis.js';

// Elements -------------------------------------------------------------------------

const element_Toggle = document.getElementById('engine-toggle') as HTMLInputElement;
const element_Eval = document.getElementById('engine-eval')!;
const element_Stats = document.getElementById('engine-stats')!;
const element_GoDeeper = document.getElementById('btn-go-deeper') as HTMLButtonElement;
const element_SettingsBtn = document.getElementById('btn-engine-settings') as HTMLButtonElement;
const element_Settings = document.getElementById('engine-settings')!;
const element_Lines = document.getElementById('engine-lines')!;
const element_Gauge = document.getElementById('eval-gauge')!;
const element_GaugeBlack = document.getElementById('gauge-black')!;

const element_MultiPv = document.getElementById('setting-multipv') as HTMLInputElement;
const element_MultiPvValue = document.getElementById('setting-multipv-value')!;
const element_Hash = document.getElementById('setting-hash') as HTMLSelectElement;
const element_Depth = document.getElementById('setting-depth') as HTMLSelectElement;

// Constants ----------------------------------------------------------------------

const ENABLED_STORAGE_KEY = 'ceval.enabled';

// Functions -----------------------------------------------------------------------

/** Initializes the engine panel. Called once by the page entry. */
function init(): void {
	ceval.init({ workerUrl: window.analysisPageData.workerUrl });

	initSettingsUI();
	initListeners();

	ceval.onUpdate(onEngineUpdate);
	ceval.onStatus(onEngineStatus);

	// Draw engine arrows on top of the pieces each frame.
	GameBus.addEventListener('render-above-pieces', () => enginearrows.render());

	// Restore the persisted on/off state once the first game finishes loading.
	GameBus.addEventListener('game-loaded', () => {
		const wanted = localStorage.getItem(ENABLED_STORAGE_KEY) !== 'false';
		if (wanted && !ceval.isEnabled()) setEngineEnabled(true);
	});
}

function setEngineEnabled(value: boolean): void {
	element_Toggle.checked = value;
	localStorage.setItem(ENABLED_STORAGE_KEY, String(value));
	ceval.setEnabled(value);
	element_Gauge.classList.toggle('hidden', !value);
	if (!value) {
		enginearrows.clearArrows();
		renderLines([]);
		element_Eval.textContent = '-';
		element_Stats.textContent = 'Local evaluation off';
	}
}

// Settings UI ------------------------------------------------------------------------

function initSettingsUI(): void {
	const settings = ceval.getSettings();

	element_MultiPv.max = String(ceval.MAX_MULTI_PV);
	element_MultiPv.value = String(settings.multiPv);
	element_MultiPvValue.textContent = String(settings.multiPv);

	element_Hash.value = String(settings.hashMb);
	element_Depth.value = String(settings.depth);
}

function initListeners(): void {
	element_Toggle.addEventListener('change', () => setEngineEnabled(element_Toggle.checked));

	element_SettingsBtn.addEventListener('click', () =>
		element_Settings.classList.toggle('hidden'),
	);

	element_MultiPv.addEventListener('input', () => {
		element_MultiPvValue.textContent = element_MultiPv.value;
	});
	element_MultiPv.addEventListener('change', () => {
		ceval.updateSettings({ multiPv: Number(element_MultiPv.value) });
	});

	element_Hash.addEventListener('change', () => {
		ceval.updateSettings({ hashMb: Number(element_Hash.value) });
	});

	element_Depth.addEventListener('change', () => {
		ceval.updateSettings({ depth: Number(element_Depth.value) });
	});

	element_GoDeeper.addEventListener('click', () => {
		element_GoDeeper.classList.add('hidden');
		ceval.goDeeper();
	});

	// Keyboard shortcut: l = toggle local evaluation (ignored while typing).
	document.addEventListener('keydown', (e) => {
		if (isTypingTarget(e.target)) return;
		if (e.key === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey)
			setEngineEnabled(!element_Toggle.checked);
	});
}

// Engine output rendering ------------------------------------------------------------

function onEngineStatus(status: CevalStatus): void {
	if (status === 'loading') element_Stats.textContent = 'Loading engine…';
	else if (status === 'failed') {
		element_Toggle.checked = false;
		element_Gauge.classList.add('hidden');
		element_Stats.textContent = 'Engine failed to load';
		toast.show('The analysis engine failed to load.', { error: true });
	}
}

function onEngineUpdate(update: CevalUpdate | undefined): void {
	if (!ceval.isEnabled()) return;

	if (!update) {
		// Position changed; awaiting the first info of the new search.
		element_Eval.textContent = '…';
		element_Stats.textContent = 'Thinking…';
		element_GoDeeper.classList.add('hidden');
		enginearrows.clearArrows();
		renderLines([]);
		return;
	}

	if (update.terminal) {
		element_Eval.textContent = '-';
		element_Stats.textContent = 'Game over at this position';
		enginearrows.clearArrows();
		renderLines([]);
		updateGauge(undefined);
		return;
	}

	const best = update.lines[0];
	element_Eval.textContent = best ? formatEval(best) : '…';
	element_Stats.textContent = formatStats(update);
	// Offer "go deeper" once the target depth is reached and there's still room to go.
	const canDeepen = update.done && update.depth < ceval.MAX_DEPTH && best?.mate === undefined;
	element_GoDeeper.classList.toggle('hidden', !canDeepen);

	updateGauge(best);
	renderLines(update.lines);
	updateArrows(update);
}

/** Formats a white-POV line eval for display, e.g. "+1.4", "-0.3", "#5", "#-3". */
function formatEval(line: CevalLine): string {
	if (line.mate !== undefined) return line.mate > 0 ? `#${line.mate}` : `#-${Math.abs(line.mate)}`; // prettier-ignore
	const pawns = (line.cp ?? 0) / 100;
	return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

function formatStats(update: CevalUpdate): string {
	// "Depth 12/12" while running to a target; "Depth 27" when going deeper toward the max.
	const depth =
		update.targetDepth >= ceval.MAX_DEPTH
			? `Depth ${update.depth}`
			: `Depth ${update.depth}/${update.targetDepth}`;
	const nps =
		update.nps >= 1_000_000
			? `${(update.nps / 1_000_000).toFixed(1)} Mn/s`
			: `${Math.round(update.nps / 1000)} kn/s`;
	return `${depth} · ${nps}`;
}

/** Moves the eval gauge to the given best line's win probability (white POV). */
function updateGauge(best: CevalLine | undefined): void {
	const chances = best?.winningChances ?? 0;
	// chances=+1 (white winning) → black bar 0%; chances=-1 → 100%.
	element_GaugeBlack.style.height = `${50 - chances * 50}%`;
}

// PV lines ----------------------------------------------------------------------------

function renderLines(lines: CevalLine[]): void {
	element_Lines.replaceChildren();
	const atFront = isAnalyzingFrontPosition();

	for (const line of lines) {
		const row = document.createElement('div');
		row.className = 'engine-line';

		const evalSpan = document.createElement('span');
		evalSpan.className = 'line-eval';
		evalSpan.textContent = formatEval(line);

		const movesSpan = document.createElement('span');
		movesSpan.className = 'line-moves';
		line.moves.forEach((token, i) => {
			const moveSpan = document.createElement('span');
			moveSpan.className = 'line-move' + (atFront ? '' : ' unplayable');
			moveSpan.textContent = token;
			moveSpan.title = atFront
				? 'Play the line up to this move'
				: 'Go to the latest move to play engine lines';
			if (atFront) moveSpan.addEventListener('click', () => playLine(line.moves, i));
			movesSpan.append(moveSpan);
			if (i < line.moves.length - 1) movesSpan.append(' ');
		});

		row.append(evalSpan, movesSpan);
		element_Lines.append(row);
	}
}

/** Whether the position being analyzed is the game's front (moves can be played from it). */
function isAnalyzingFrontPosition(): boolean {
	const gamefile = gameslot.getGamefile();
	if (!gamefile) return false;
	return moveutil.areWeViewingLatestMove(gamefile);
}

/** Plays the PV's moves up to and including `untilIndex` onto the board. */
function playLine(tokens: string[], untilIndex: number): void {
	const gamefile = gameslot.getGamefile();
	if (!gamefile || gamesession.isLoading()) return;
	if (!moveutil.areWeViewingLatestMove(gamefile)) return;
	if (gamefile.gameConclusion) return;

	const mesh = gameslot.getMesh();
	for (let i = 0; i <= untilIndex; i++) {
		const result = movevalidation.isTokenMoveLegal(gamefile, tokens[i]!);
		if (!result.valid) {
			console.warn(`Engine line move "${tokens[i]}" is not legal here: ${result.reason}`);
			break;
		}
		// Animate only the final move of the sequence.
		if (i === untilIndex) movesequence.makeMoveAndAnimate(gamefile, mesh, result.tagged);
		else movesequence.makeMove(gamefile, mesh, result.tagged);
		if (gamefile.gameConclusion) break; // The line ended the game.
	}
}

// Engine arrows -------------------------------------------------------------------------

/** Points the board arrows at each line's first move (only for the viewed position). */
function updateArrows(update: CevalUpdate): void {
	const gamefile = gameslot.getGamefile();
	// Stale analysis (user already navigated elsewhere): don't draw wrong-position arrows.
	if (!gamefile || gamefile.state.local.moveIndex !== update.moveIndex)
		return enginearrows.clearArrows();

	const arrows: EngineArrow[] = [];
	update.lines.forEach((line, rank) => {
		const parsed = parseFirstMove(line);
		if (parsed) arrows.push({ start: parsed.start, end: parsed.end, rank });
	});
	enginearrows.setArrows(arrows);
}

/** Parses a compact move token "x,y>x,y=Q" into start/end coords. */
function parseFirstMove(line: CevalLine): { start: Coords; end: Coords } | undefined {
	const token = line.moves[0];
	if (!token) return undefined;
	const [fromStr, toStr] = token.split('>');
	if (!fromStr || !toStr) return undefined;
	const endStr = toStr.split('=')[0]!;
	try {
		return {
			start: coordutil.getCoordsFromKey(fromStr as CoordsKey),
			end: coordutil.getCoordsFromKey(endStr as CoordsKey),
		};
	} catch {
		return undefined;
	}
}

export default { init };
