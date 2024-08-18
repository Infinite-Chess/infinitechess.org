// Import Start
import { style } from './style.js'
import { gui } from './gui.js'
import { movement } from '../rendering/movement.js'
import { guiguide } from './guiguide.js'
import { guiplay } from './guiplay.js'
// Import End


/*
 * This script handles our Title Screen
 */

"use strict";

const guititle = (function() {

    // Variables

    // Title Screen
    const boardVel = 0.6; // Speed at which board slowly moves while on title screen

    const titleElement = document.getElementById('title'); // Visible when on the title screen
    const element_play = document.getElementById('play');
    const element_guide = document.getElementById('rules');
    const element_boardEditor = document.getElementById('board-editor');
    const element_menuExternalLinks = document.getElementById('menu-external-links');

    // Functions

    // Call when title screen is loaded
    function open() {
        perspective.disable();
        if (!gui.getScreen()?.includes('title')) movement.randomizePanVelDir(); // Randomize pan velocity direction
        gui.setScreen('title');
        movement.setBoardScale(1.8, 'pidough'); // 1.8
        style.revealElement(titleElement);
        style.revealElement(element_menuExternalLinks);
        initListeners(); // These need to be canceled when leaving screen
    }

    function close() {
        // Cancel all title screen button event listeners to save cpu...
        closeListeners();
        style.hideElement(titleElement);
        style.hideElement(element_menuExternalLinks);
    }

    function initListeners() {
        element_play.addEventListener('click', callback_Play);
        element_guide.addEventListener('click', callback_Guide);
        element_boardEditor.addEventListener('click', gui.callback_featurePlanned);
    }

    function closeListeners() {
        element_play.removeEventListener('click', callback_Play);
        element_guide.removeEventListener('click', callback_Guide);
        element_boardEditor.removeEventListener('click', gui.callback_featurePlanned);
    }

    function callback_Play(event) {
        event = event || window.event;
        close();
        guiplay.open();
    }

    function callback_Guide(event) {
        event = event || window.event;
        close();
        guiguide.open();
    }

    return Object.freeze({
        boardVel,
        open,
        close
    });

})();

export { guititle };