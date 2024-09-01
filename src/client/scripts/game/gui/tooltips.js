import input from "../input.js";

/**
 * This script creates event listeners for managing the current classes
 * of all elements with a tooltip available.
 * If you hover for a tooltip, following tooltips pop up instantly,
 * until you go a little but without viewing another tooltip.
 */

(function() {

    const tooltipClasses = ['tooltip-dl', 'tooltip-d', 'tooltip-dr'];
    const tooltipClasses_Dotted = tooltipClasses.map(classname => { return '.' + classname; });

    const tooltips = document.querySelectorAll(tooltipClasses_Dotted.join(', '));

    /** The time, in the css, it takes for a tooltip to appear. KEEP THE SAME AS IN PLAY.CSS */
    const tooltipDelayMillis = 500;
    /** The time, after the tooltip class is deleted (clicked button),
     * in which it will be added again if we're still hovering over. */
    const timeToReAddTooltipClassAfterDeletionMillis = 2000;

    /** If true, tooltips IMMEDIATELY appear without delay. */
    let fastTransitionMode = false;
    /** The ID of the timer at the end of which to turn off fast transition mode.
     * If we view another tooltip before the timer is over, this gets canceled. */
    let fastTransitionTimeoutID;
    /** The time after which fast tooltip transitions will be disabled,
     * if no tooltipped has been viewed for a bit. */
    const fastTransitionCooldownMillis = 750;


    
    /** Enables fast transition mode for tooltips. */
    function enableFastTransition() {
        if (fastTransitionMode) return; // Already on!

        // console.log("Enabled fast transition");
        fastTransitionMode = true;
        tooltips.forEach(tooltip => {
            tooltip.classList.add('fast-transition');
        });
    }

    /** Cancels the timer to exit fast transition mode. */
    function cancelFastTransitionExpiryTimer() {
        // if (fastTransitionTimeoutID == null) return;
        clearTimeout(fastTransitionTimeoutID);
        fastTransitionTimeoutID = undefined;
    }
    
    /** Disables fast transition mode for tooltips.  */
    function disableFastTransition() {
        if (!fastTransitionMode) return;
    
        // console.log("Disabled fast transition");
        fastTransitionTimeoutID = undefined;
        fastTransitionMode = false;
        tooltips.forEach(tooltip => {
            tooltip.classList.remove('fast-transition');
        });
    }

    /**
     * Gets the specific tooltip class of an element, whether that's
     * 'tooltip-d', 'tooltip-dl', or 'tooltip-dr'.
     * @param {Element} element - The DOM element to check.
     * @returns {string|null} The tooltip class if present, otherwise null.
     */
    function getTooltipClass(element) {
        return tooltipClasses.find(cls => element.classList.contains(cls)) || null;
    }

    if (!input.isMouseSupported()) return; // Don't add listeners for fast transition mode on mobile
    
    /** Add event listeners for entering fast transition mode (tooltips appear immediately) */
    tooltips.forEach(tooltip => {
        const tooltipThisHas = getTooltipClass(tooltip); // What kind of tooltip class?

        let isHovering = false;
        let isHolding = false;
        let tooltipVisible = false;

        /** The timeout of the timer at the end of which the tooltip will be visible. */
        let hoveringTimer;
        /** True if we have temporarily removed the tooltip class (element clicked) */
        let removedClass = false;
        let addBackClassTimeoutID;

        function onTooltipVisible() {
            tooltipVisible = true;
        }

        function cancelHoveringTimer() {
            clearTimeout(hoveringTimer);
            hoveringTimer = undefined;
        }

        function removeClass() {
            if (removedClass) return;

            // console.log("Removed tooltip class");
            tooltip.classList.remove(tooltipThisHas);
            removedClass = true;
            tooltipVisible = false;
            disableFastTransition();
            cancelHoveringTimer();
        }

        function cancelTimerToAddClass() {
            clearTimeout(addBackClassTimeoutID);
            addBackClassTimeoutID = undefined;
        }

        function resetTimerToAddClass() {
            cancelTimerToAddClass();
            addBackClassTimeoutID = setTimeout(addBackClass, timeToReAddTooltipClassAfterDeletionMillis);
        }

        function addBackClass() {
            if (!removedClass || isHolding) return;

            // console.log("Added tooltip class");
            cancelTimerToAddClass();
            tooltip.classList.add(tooltipThisHas);
            removedClass = false;
            if (isHovering) onTooltipVisible();
        }

        tooltip.addEventListener('mouseenter', () => {
            isHovering = true;
            cancelFastTransitionExpiryTimer();

            if (fastTransitionMode) onTooltipVisible();
            else hoveringTimer = setTimeout(onTooltipVisible, tooltipDelayMillis);
        });

        tooltip.addEventListener('mouseleave', function() {
            isHovering = false;
            isHolding = false;
            cancelHoveringTimer();
            addBackClass();

            if (tooltipVisible) {
                enableFastTransition();
                fastTransitionTimeoutID = setTimeout(disableFastTransition, fastTransitionCooldownMillis);
            }

            tooltipVisible = false;
        });

        tooltip.addEventListener('mousedown', function() {
            isHolding = true;
            removeClass();
            resetTimerToAddClass();
        });

        tooltip.addEventListener('mouseup', function() {
            isHolding = false;
            removeClass();
            resetTimerToAddClass();
        });
    });
})();

// The ONLY reason we export is so that tooltips can be tied into the dependancy tree of our game,
// otherwise esbuild won't include it.
export default null;