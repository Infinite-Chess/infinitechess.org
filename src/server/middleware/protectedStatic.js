
const express = require('express');
const path = require('path');
const { isOwner, isPatron } = require("./verifyRoles")

function protectedStatic(req, res, next) {
    // If express.static does not find a file, it will return a function we need call to move on!
    // Use (req, res, next)
    if      (isOwner(req)) return express.static(path.join(__dirname, '..', 'protected-owner'))(req, res, next);
    else if (isPatron(req)) return express.static(path.join(__dirname, '..', 'protected-patron'))(req, res, next);

    // NOTE: If you don't have the owner role, then requesting the dev files will just return 404 Not Found
    // instead of Forbidden.

    next();
}

module.exports = {
    protectedStatic
}