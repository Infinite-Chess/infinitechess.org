
/*
 * This module contains middleware methods for ensuring
 * a user is of a specified role, before giving them
 * access to protected resources.
 */

import { getTranslationForReq } from '../utility/translate.js';


/**
 * Middleware method that passes if the request has the
 * `owner` role. If not, it redirects them to login
 * before bringing them back to this resource.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The function to call, when finished, to continue the middleware waterfall.
 */
function ensureOwner(req, res, next) {
	if (isOwner(req)) return next(); // Valid, you may pass
	if (req.user) { // Logged in, but don't have the right permissions
		console.log(`Forbid user ${req.user} from accessing an owner-protected resource!`);
		return res.status(403).send(getTranslationForReq("server.javascript.ws-forbidden", req));
	}
	// NOT logged in... Redirect them to the login page,
	// BUT add a query parameter that will bring them back here after logging in!
	const redirectTo = encodeURIComponent(req.originalUrl);
	res.redirect(`/login?redirectTo=${redirectTo}`);
}

/**
 * Middleware method that passes if the request has the
 * `patron` role. If not, it redirects them to login
 * before bringing them back to this resource.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The function to call, when finished, to continue the middleware waterfall.
 */
function ensurePatron(req, res, next) {
	if (isPatron(req)) return next(); // Pass
	if (req.user) { // Logged in, but don't have the right permissions
		console.log(`Stopped user ${req.user} from accessing a patron-protected resource.`);
		return res.status(403).send(getTranslationForReq("server.javascript.ws-unauthorized_patron_page", req));
	}
	// NOT logged in... Redirect them to the login page,
	// BUT add a query parameter that will bring them back here after logging in!
	const redirectTo = encodeURIComponent(req.originalUrl);
	res.redirect(`/login?redirectTo=${redirectTo}`); // Redirect them to login if they are not
}

function isOwner(req) {
	return req.role === 'owner';
}

function isPatron(req) {
	return req.role === 'patron';
}



export {
	ensureOwner,
	ensurePatron,
	isOwner,
	isPatron
};