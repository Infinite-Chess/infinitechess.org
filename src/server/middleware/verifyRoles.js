
/*
 * This module contains middleware methods for ensuring
 * a user is of a specified role, before giving them
 * access to protected resources.
 */

import { logEvents } from './logEvents.js';


function isOwner(req) {
	if (req.memberInfo === undefined) logEvents('Should not be asking if member is owner if req.memberInfo is not defined!', 'errLog.txt', { print: true });
	return req.memberInfo.roles.includes('owner');
}

function isPatron(req) {
	if (req.memberInfo === undefined) logEvents('Should not be asking if member is patron if req.memberInfo is not defined!', 'errLog.txt', { print: true });
	return req.memberInfo.roles.includes('patron');
}

export {
	isOwner,
	isPatron
};