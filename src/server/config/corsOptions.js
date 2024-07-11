
const { allowedOrigins } = require('./config'); // Whitelist

/**
 * CORS configuration options to control which requests are allowed to interact with the server.
 * @type {Object}
 */
const corsOptions = {
    /**
     * Determines if the given origin is allowed.
     * @param {string|null} origin - The origin of the request.
     * @param {Function} callback - The callback function to call with the result.
     *                              This follows the pattern callback(error, success).
     */
    origin: (origin, callback) => {
        // Check if the origin is in the allowed list or not defined (allowing requests from origins like local files)
        if (allowedOrigins.indexOf(origin) !== -1 || !origin) callback(null, true); // Origin is allowed or not defined, proceed with the request
        else callback(new Error('Not allowed by CORS')); // Origin is not allowed, block the request
    },
    /**
     * Sets the status code to return for a successful OPTIONS request.
     * @type {number}
     */
    optionsSuccessStatus: 200
};
 
module.exports = corsOptions;