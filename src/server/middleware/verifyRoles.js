
/*
 * This module contains middleware methods for ensuring
 * a user is of a specified role, before giving them
 * access to protected resources.
 */

import { logEvents } from './logEvents.js';


function isOwner(req) {
	if (req.user === undefined) logEvents('Should not be asking if member is owner if req.user is not defined!', 'errLog.txt', { print: true });
	return req.role === 'owner';
}

function isPatron(req) {
	if (req.user === undefined) logEvents('Should not be asking if member is patron if req.user is not defined!', 'errLog.txt', { print: true });
	return req.role === 'patron';
}

export {
	isOwner,
	isPatron
};