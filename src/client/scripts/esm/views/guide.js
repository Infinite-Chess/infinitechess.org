/**
 * This script handles the Guide page fairy piece carousel
 */

// The element that holds all fairy images and their descriptions.
const element_FairyImg = document.getElementById('fairy-pieces');
// The element that holds all fairy descriptions
const element_FairyCard = document.getElementById('fairy-card');
const element_FairyBack = document.getElementById('fairy-back');
const element_FairyForward = document.getElementById('fairy-forward');

let fairyIndex = 0;
const maxFairyIndex = element_FairyImg.querySelectorAll('picture').length - 1;

function initListeners() {
	element_FairyBack.addEventListener('click', callback_FairyBack);
	element_FairyForward.addEventListener('click', callback_FairyForward);
}

function callback_FairyBack(event) {
	if (fairyIndex === 0) return;
	hideCurrentFairy();
	fairyIndex--;
	revealCurrentFairy();
	updateArrowTransparency();
}

function callback_FairyForward(event) {
	if (fairyIndex === maxFairyIndex) return;
	hideCurrentFairy();
	fairyIndex++;
	revealCurrentFairy();
	updateArrowTransparency();
}

function hideCurrentFairy() {
	const allFairyImgs = element_FairyImg.querySelectorAll('picture');
	const targetFairyImg = allFairyImgs[fairyIndex];
	targetFairyImg.classList.add('hidden');

	const allFairyCards = element_FairyCard.querySelectorAll('.fairy-card-desc');
	const targetFairyCard = allFairyCards[fairyIndex];
	targetFairyCard.classList.add('hidden');
}

function revealCurrentFairy() {
	const allFairyImgs = element_FairyImg.querySelectorAll('picture');
	const targetFairyImg = allFairyImgs[fairyIndex];
	targetFairyImg.classList.remove('hidden');

	const allFairyCards = element_FairyCard.querySelectorAll('.fairy-card-desc');
	const targetFairyCard = allFairyCards[fairyIndex];
	targetFairyCard.classList.remove('hidden');
}

function updateArrowTransparency() {
	if (fairyIndex === 0) element_FairyBack.classList.add('opacity-0_25');
	else                  element_FairyBack.classList.remove('opacity-0_25');

	if (fairyIndex === maxFairyIndex) element_FairyForward.classList.add('opacity-0_25');
	else                              element_FairyForward.classList.remove('opacity-0_25');
}

// Initialize on page load
initListeners();
