// src/client/scripts/components/header/pingmeter.ts

/**
 * The settings dropdown's ping meter: the socket's round-trip time as a number and colored bars,
 * or a loading animation while a connection is opening.
 */

import { SocketBus } from '../../socket/SocketBus.js';

// Elements --------------------------------------------------------------------

const pingMeter = document.querySelector('.ping-meter')!;
const pingBars = document.querySelector('.ping-bars')!;
const pingValue = document.querySelector('.ping-value')!;
const loadingAnim = document.querySelector('.ping-meter .svg-pawn')!; // Spinning-pawn loading animation

// Listeners -------------------------------------------------------------------

SocketBus.addEventListener('ping', (event) => updatePing(event.detail));
SocketBus.addEventListener('opening', () => openMeterAndDisplayLoading());
SocketBus.addEventListener('closed', () => closeMeter());
// Fires right after `closed` on an involuntary close, overriding closeMeter()
// above so a reconnecting socket shows the loading animation instead.
SocketBus.addEventListener('connection-lost', () => openMeterAndDisplayLoading());

// Functions -------------------------------------------------------------------

/** Shows a fresh round-trip time, in milliseconds. */
function updatePing(ping: number): void {
	showPing_hideLoadingAnim();
	pingValue.textContent = String(ping);
	updateBarCount(ping);
}

/** Lights as many bars as the ping earns, colored by how many that is. */
function updateBarCount(ping: number): void {
	const newBarCount = getBarCount(ping);
	const color = newBarCount >= 3 ? 'green' : newBarCount === 2 ? 'yellow' : 'red';
	for (const [i, bar] of [...pingBars.children].entries()) {
		bar.classList.remove('green', 'yellow', 'red');
		if (i < newBarCount) bar.classList.add(color);
	}
}

/** Returns the number of bars that should be lit up according to the given ping. */
function getBarCount(ping: number): number {
	if (ping <= 150) return 4;
	else if (ping <= 300) return 3;
	else if (ping <= 550) return 2;
	else return 1;
}

/** Shows the bars in place of the loading animation. */
function showPing_hideLoadingAnim(): void {
	pingMeter.classList.remove('hidden');
	pingBars.classList.remove('hidden');
	loadingAnim.classList.add('hidden');
}

/** Open meter. Hide the green bars, show the spinning-pawn loading animation, set the ping to ω */
function openMeterAndDisplayLoading(): void {
	pingMeter.classList.remove('hidden'); // Reveals ping meter
	loadingAnim.classList.remove('hidden');
	pingBars.classList.add('hidden');
	pingValue.textContent = 'ω';
}

/** Hides the ping meter from the settings dropdown document element */
function closeMeter(): void {
	pingMeter.classList.add('hidden');
}
