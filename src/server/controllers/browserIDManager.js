import uuid from '../../shared/util/uuid.js';
import { isBrowserIDBanned } from '../middleware/banned.js';
import { logEventsAndPrint } from '../middleware/logEvents.js';

const expireOfBrowserIDCookieMillis = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Assigns/renews the browser-id cookie to all requests for an html file.
 * If they have an existing browser id, it renews it for 7 more days.
 * If they don't, it gives them a new browser id for 7 day.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The Express next middleware function.
 */
function assignOrRenewBrowserID(req, res, next) {
	// We don't have to worry about the request being for a resource because those have already been served.
	// The only scenario this request could be for now is an HTML or fetch API request
	// The 'is-fetch-request' header is a custom header we add on all fetch requests to let us know is is a fetch request.
	if (req.headers['is-fetch-request'] === 'true' || !req.accepts('html')) return next(); // Not an HTML request (but a fetch), don't set the cookie

	const cookies = req.cookies;
	if (!cookies['browser-id']) giveBrowserID(req, res);
	else refreshBrowserID(req, res);

	next();
}

function giveBrowserID(req, res) {
	const cookieName = 'browser-id';
	const id = uuid.generateID_Base62(6);

	// console.log(`Assigning new browser-id: "${id}" for url: ` + req.url + ' --------');

	// Readable by server with web socket connections, NOT by javascript: MAX AGE IN MILLIS NOT SECS
	res.cookie(cookieName, id, {
		httpOnly: true,
		sameSite: 'None',
		secure: true,
		maxAge: expireOfBrowserIDCookieMillis /* 1 day */,
	});
}

function refreshBrowserID(req, res) {
	const cookieName = 'browser-id';
	const cookies = req.cookies;
	const id = cookies[cookieName];

	if (isBrowserIDBanned(id)) return makeBrowserIDPermanent(req, res, id);

	// console.log(`Renewing browser-id: "${id}" for url: ` + req.url);

	// Readable by server with web socket connections, NOT by javascript
	res.cookie(cookieName, id, {
		httpOnly: true,
		sameSite: 'None',
		secure: true,
		maxAge: expireOfBrowserIDCookieMillis,
	});
}

function makeBrowserIDPermanent(req, res, browserID) {
	// Readable by server with web socket connections, NOT by javascript: MAX AGE IN MILLIS NOT SECS
	res.cookie('browser-id', browserID, {
		httpOnly: true,
		sameSite: 'None',
		secure: true,
		maxAge: Number.MAX_SAFE_INTEGER /* FOREVER!! */,
	});

	const logThis = `Making banned browser-id PERMANENT: ${browserID} !!!!!!!!!!!!!!!!!!! ${req.headers.origin}   ${req.method}   ${req.url}   ${req.headers['user-agent']}`;
	logEventsAndPrint(logThis, 'bannedIPLog.txt');
}

export { assignOrRenewBrowserID };
