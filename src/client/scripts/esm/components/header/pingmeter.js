

/**
 * This script opens and closes our settings drop-down menu when it is clicked.
 */


// Document Elements -------------------------------------------------------------------------


const pingMeter = document.querySelector('.ping-meter');
const pingBars = document.querySelector('.ping-bars');
const pingValue = document.querySelector('.ping-value');
const loadingAnim = document.querySelector('.ping-meter .svg-pawn'); // Spinning-pawn loading animation


// Variables ---------------------------------------------------------------------------------



// Functions ---------------------------------------------------------------------------------


(function init() {
	initEventListeners();
})();

function initEventListeners() {
	document.addEventListener('ping', updatePing); // Custom event. When we receive this event, we know we are connected
	document.addEventListener('socket-opening', openMeterAndDisplayLoading); // Custom event that is dispatched whenever we start trying to open a new socket upgrade connection request.
	document.addEventListener('connection-lost', openMeterAndDisplayLoading); // Custom event
	document.addEventListener('socket-closed', socketClosed); // Custom event
}

function updatePing(event) {
	showPing_hideLoadingAnim();
	const newPing = event.detail;
	// console.log(`New ping! ${newPing}`);
	pingValue.textContent = newPing;
	updateBarCount(newPing);
}

function updateBarCount(ping) {
	removeAllColor();
	const newBarCount = getBarCount(ping);
	const color = newBarCount >= 3 ? 'green' : newBarCount === 2 ? 'yellow' : 'red';
	for (let i = 1; i <= newBarCount; i++) {
		const thisPingBar = pingBars.children[i - 1];
		thisPingBar.classList.add(color);
	}
}

function removeAllColor() {
	for (let i = 1; i <= pingBars.children.length; i++) {
		const thisPingBar = pingBars.children[i - 1];
		thisPingBar.classList.remove('green');
		thisPingBar.classList.remove('yellow');
		thisPingBar.classList.remove('red');
	}
}

/**
 * Returns the number of Bars that should be lit up according to the given ping.
 * This can be customized.
 * @param {number} ping 
 * @returns {number}
 */
function getBarCount(ping) {
	if (ping <= 150) return 4;
	else if (ping <= 300) return 3;
	else if (ping <= 550) return 2;
	else return 1;
}

function showPing_hideLoadingAnim() {
	pingMeter.classList.remove('hidden');
	pingBars.classList.remove('hidden');
	loadingAnim.classList.add('hidden');
}

/** Open meter. Hide the green bars, show the spinning-pawn loading animation, set the ping to ω */
function openMeterAndDisplayLoading() {
	pingMeter.classList.remove('hidden'); // Reveals ping meter
	loadingAnim.classList.remove('hidden');
	pingBars.classList.add('hidden');
	pingValue.textContent = 'ω';
}

/**
 * A callback function that is executed when we receive the custom socket closed event.
 * 1. If the soccer was close by choice, we close the ping meter.
 * 2. If the socket was closed by bad network, we display the loading animation
 * @param {CustomEvent} event 
 */
function socketClosed(event) {
	const notByChoise = event.detail; // This will be true if the user didn't intend to close the connection, they could have bad network.

	if (notByChoise) openMeterAndDisplayLoading(); // Hide the green bars, show the spinning-pawn loading animation
	else closeMeter(); // By choice. Just close the ping meter, we are no longer connected
}

/** Hides the ping meter from the settings dropdown document element */
function closeMeter() {
	pingMeter.classList.add('hidden');
	loadingAnim.classList.remove('hidden');
	pingValue.textContent = '-';
}


export default {};