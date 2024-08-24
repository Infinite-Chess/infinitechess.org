/**
 * This middleware sets the 'Access-Control-Allow-Credentials' header
 * to true if the origin is on our whitelist.
 * This allows creditials (cookies, HTTP authentication...) from those origins.
 */

import { allowedOrigins } from '../config/config.mjs';

const credentials = (req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        // Allows credentials (cookies, HTTP authentication...) from
        // origins on the whitelist.
        res.header('Access-Control-Allow-Credentials', true);
    }
    next();
};

export { credentials };
