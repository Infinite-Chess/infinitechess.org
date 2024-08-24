import { DEV_BUILD } from '../config/config.mjs';

/**
 * Middleware that redirects all http requests to https
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The function to call, when finished, to continue the middleware waterfall.
 */
const secureRedirect = (req, res, next) => {
    // 1-year is minimum remember time with preload parameter. Preload means google will always pre-tell clickers-of-your-site to connect via https.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    if (req.secure) return next();

    // Force redirect to https...

    const httpsPort = DEV_BUILD ? (':' + (process.env.HTTPSPORT_LOCAL || '3443')) : '';
    res.redirect(`https://${req.hostname}${httpsPort}${req.url}`);
};

export { secureRedirect };
