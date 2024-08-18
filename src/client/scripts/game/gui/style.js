
// This script holds common operations on document elements,
// such as show, hide, fade-after-1s...
// And it keeps track of our javascript-inserted css in the style element of the html document
// for things like the color of the navigation bar when theme changes.

"use strict";

const style = (function() {

    const element_style = document.getElementById('style'); // The in-html-doc style element containing css stylings

    // What things require styling that our javascript changes?
    // * The navigation bar, when the theme changes.
    let navigationStyle;

    // Add and remove classes

    function addClass(element, className) {
        element.classList.add(className);
    }

    function removeClass(element, className) {
        element.classList.remove(className);
    }

    // Removes the class, THEN adds it back! This starts over animations
    function reinstateClass(element, className) {
        removeClass(element, className);
        addClass(element, className);
    }

    // Hide and show elements...

    /**
     * Hides the provided document element by giving it a class with the property "display: none".
     * @param {HTMLElement} element - The document element
     */
    function hideElement(element) {
        addClass(element, "hidden");
    }

    /**
     * Reveals the provided document element by **removing** the class with the property "display: none".
     * @param {HTMLElement} element - The document element
     */
    function revealElement(element) {
        removeClass(element, "hidden");
    }

    // Animate elements

    // Fades in the element over the span of 1 second
    function fadeIn1s(element) {
        revealElement(element); // Make sure the element no longer has the 'display: none' property.
        reinstateClass(element, 'fade-in-2_3s'); // This class contain the fade-in animation that begins immediately upon receiving this property

        if (!element.fadeIn1sLayers) element.fadeIn1sLayers = 1;
        else element.fadeIn1sLayers++;

        setTimeout(() => { // After that 1 second, remove this no longer needed animation class from them.
            element.fadeIn1sLayers--;
            if (element.fadeIn1sLayers > 0) return; // The fade-in-1s animation was RENEWED
            delete element.fadeIn1sLayers;
            removeClass(element, 'fade-in-2_3s');
        }, 1000);
    }

    // Fades out the element over the span of 1 second
    function fadeOut1s(element) {
        revealElement(element);
        reinstateClass(element,'fade-out-2_3s'); // This class contain the fade-out animation that begins immediately upon receiving this property.
        
        if (!element.fadeOut1sLayers) element.fadeOut1sLayers = 1;
        else element.fadeOut1sLayers++;

        setTimeout(() => { // After that 1 second, remove this no longer needed animation class from them.
            element.fadeOut1sLayers--;
            if (element.fadeOut1sLayers > 0) return; // The fade-in-1s animation was RENEWED
            delete element.fadeOut1sLayers;
            removeClass(element, 'fade-out-2_3s');
            hideElement(element);
        }, 1000);
    }

    // Other operations

    function setNavStyle(cssStyle) {
        navigationStyle = cssStyle;
        onStyleChange();
    }

    function onStyleChange() {
        updateJavascriptStyling();
    }

    function updateJavascriptStyling() {
        element_style.innerHTML = navigationStyle; // Other styles can be appended here later
    }

    /**
     * Gets all children of an element and returns an array of their text contents.
     * @param {HTMLElement} parentElement - The parent element.
     * @returns {string[]} An array of text contents of the child elements.
     */
    function getChildrenTextContents(parentElement) {
        // Get all child elements
        const children = parentElement.children;
        
        // Create an array to hold the text contents
        const textContents = [];

        // Loop through the child elements and extract their text content
        for (let i = 0; i < children.length; i++) {
            textContents.push(children[i].textContent);
        }

        return textContents;
    }

    return Object.freeze({
        hideElement,
        revealElement,
        setNavStyle,
        fadeIn1s,
        fadeOut1s,
        getChildrenTextContents
    });

})();

export { style };