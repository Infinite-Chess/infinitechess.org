
/**
 * This module configures the middleware waterfall of our server
 */

const express = require('express');
const path = require('path');
const cors = require('cors');

// Middleware
const cookieParser = require('cookie-parser');
const credentials = require('./credentials');
const secureRedirect = require('./secureRedirect');
const errorHandler = require('./errorHandler');
const { logger } = require('./logEvents');
const { verifyJWT } = require('./verifyJWT');
const { rateLimit } = require('./rateLimit')
const { protectedStatic } = require('./protectedStatic')

// Other imports
const { useOriginWhitelist } = require('../config/config');

/**
 * Configures the Middleware Waterfall
 * 
 * app.use adds the provided function to EVERY SINGLE router and incoming connection.
 * Each middleware function must call next() to go to the next middleware.
 * Connections that do not pass one middleware will not continue.
 * 
 * @param {object} app - The express application instance.
 */
function configureMiddleware(app) {

    // Note: requests that are rate limited will not be logged, to mitigate slow-down during a DDOS.
    app.use(rateLimit);

    // This allows us to retrieve json-received-data as a parameter/data!
    // The logger can't log the request body without this
    app.use(express.json());

    app.use(logger); // Log the request

    app.use(secureRedirect); // Redirects http to secure https

    app.use(credentials); // Handle credentials check. Must be before CORS.

    /**
     * Cross Origin Resource Sharing
     * 
     * This allows 3rd party middleware. Without this, other sites will get an
     * error when retreiving data on your site to serve to their customers.
     * Be careful, incorrectly setting will block our own customers.
     * For many applications though, you don't want it open to the public,
     * but perhaps you do want search engines to have access?
     * 
     * Does this create a 'Access-Control-Allow-Origin' header?
     */
    const options = useOriginWhitelist ? require('../config/corsOptions') : undefined;
    app.use(cors(options));

    /**
     * Allow processing urlencoded (FORM) data so that we can retrieve it as a parameter/variable.
     * (e.g. when the content-type header is 'application/x-www-form-urlencoded')
     */
    app.use(express.urlencoded({ extended: false}));

    app.use(cookieParser());

    // Serve public assets. (e.g. css, scripts, images, audio. EXCLUDING htmls)
    app.use(express.static(path.join(__dirname, '..', 'public'))); // Serve public assets

    /**
     * Sets the req.user and req.role properties if they have an authorization
     * header (contains access token) or refresh cookie (contains refresh token).
     * Don't send unauthorized people private stuff without the proper role.
     */
    app.use(verifyJWT);

    // Serve protected assets. Needs to be after verifying their jwt and setting their role
    app.use(protectedStatic);

    // Provide a route
    app.use('/', require('../routes/root'));
    app.use('/createaccount(.html)?', require('../routes/createaccount'));
    app.use('/member', require('../routes/member'));

    // If we've reached this point, send our 404 page.
    app.all('*', require('./send404'))

    // Custom error handling. Comes after 404.
    app.use(errorHandler);
}

module.exports = configureMiddleware;
