/**
 * Ensures any type of object is JSON stringified. Strings are left unchanged.
 * If there's a provided error message, it will log any ocurred error.
 * @param {*} input - The input to stringify.
 * @param {string} errorMessage - If specified, then this message will be printed if an error occurs.
 * @returns {string} - The JSON stringified input or the original string if input was a string. Or, if an error ocurred, 'Error: Input could not be JSON stringified'.
 */
function ensureJSONString(input, errorMessage) {
    if (typeof input === 'string') return input;
    try {
        return JSON.stringify(input);
    } catch (error) {
        // Handle cases where input cannot be stringified
        if (errorMessage) { // Print the error...
            const errText = `${errorMessage}\n${error.stack}`;
            console.log(errText);
        }
        return 'Error: Input could not be JSON stringified';
    }
}

export { ensureJSONString };
