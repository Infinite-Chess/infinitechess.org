
/**
 * This script contains utility methods for the document/window objects, or the page.
 * 
 * ZERO dependancies.
 */
const docutil = (function() {

    /**
     * Determines if the current page is running on a local environment (localhost or local IP).
     * @returns {boolean} *true* if the page is running locally, *false* otherwise.
     */
    function isLocalEnvironment() {
        const hostname = window.location.hostname;
        
        // Check for common localhost hostnames and local IP ranges
        return (
            hostname === 'localhost' || // Localhost
            hostname === '127.0.0.1' || // Loopback IP address
            hostname.startsWith('192.168.') || // Private IPv4 address space
            hostname.startsWith('10.') || // Private IPv4 address space
            hostname.startsWith('172.') && parseInt(hostname.split('.')[1], 10) >= 16 && parseInt(hostname.split('.')[1], 10) <= 31 // Private IPv4 address space
        );
    }

    /**
     * Copies the provided text to the operating system's clipboard.
     * @param {string} text - The text to copy
     */
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text)
            .then(() => { console.log('Copied to clipboard'); })
            .catch((error) => { console.error('Failed to copy to clipboard', error); });
    }

    /**
     * Returns true if the current device has a mouse pointer.
     * @returns {boolean}
     */
    function isMouseSupported() {
        // "pointer: coarse" are devices will less pointer accuracy (not "fine" like a mouse)
        // See W3 documentation: https://www.w3.org/TR/mediaqueries-4/#mf-interaction
        return window.matchMedia("(pointer: fine)").matches;
    }

    return Object.freeze({
        isLocalEnvironment,
        copyToClipboard,
        isMouseSupported,
    });

})();

export default docutil;