
import express from 'express';
import path from 'path';
import { isOwner, isPatron } from './verifyRoles.js';

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function protectedStatic(req, res, next) {
	// If express.static does not find a file, it will return a function we need call to move on!
	// Use (req, res, next)
	if      (isOwner(req)) return express.static(path.join(__dirname, '..', 'protected-owner'))(req, res, next);
	else if (isPatron(req)) return express.static(path.join(__dirname, '..', 'protected-patron'))(req, res, next);

	// NOTE: If you don't have the owner role, then requesting the dev files will just return 404 Not Found
	// instead of Forbidden.

	next();
}

export {
	protectedStatic
};