// Import Start
import { gui } from './gui.js'
import { camera } from '../rendering/camera.js'
import { style } from './style.js'
// Import End


// This script is able to stop the loading animation as soon as the page fully loads.

"use strict";

const guiloading = (function() {

    // Loading Animation Before Page Load
    const element_loadingAnimation = document.getElementById('loading-animation');
    const element_loadingText = document.getElementById('loading-text');

    /** Stops the loading screen animation. */
    function closeAnimation() {
        // Fade in the canvas (which is hidden by default because it renders grey over the loading animation)
        style.fadeIn1s(camera.canvas);
        // Fade in the overlay which contains all our html elements overtop our canvas
        gui.fadeInOverlay1s();
        setTimeout(style.hideElement, 1000, element_loadingAnimation);
    }
    
    return Object.freeze({
        closeAnimation
    });

})();

export { guiloading };