/**
 * This module handles the addition
 * and removal of roles from members.
 * 
 * And contains logic for setting a request's role.
 */

import path from 'path';
import fs from 'fs';
import { writeFile } from '../utility/lockFile.js';

import { writeFile_ensureDirectory } from '../utility/fileUtils.js';

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));


const rolesPath = path.resolve('database/roles.json');
(function ensureRolesFileExists() {
    if (fs.existsSync(rolesPath)) return; // Already exists

    const content = JSON.stringify({
        owners: {},
        patrons: {}
    }, null, 2);
    writeFile_ensureDirectory(rolesPath, content);
    console.log("Generated roles file");
})();
import roles from '../../../database/roles.json' with { 'type': 'json' }

let rolesHaveBeenEdited = false; // Set to true if we need to save the members after a change
const intervalToSaveRolesMillis = 10000; // 10 seconds.

async function saveRolesIfChangesMade() {
    if (!rolesHaveBeenEdited) return; // No change made, don't save the file!
    if (await save()) rolesHaveBeenEdited = false;
}

setInterval(saveRolesIfChangesMade, intervalToSaveRolesMillis);

async function save() {
    console.log("Saving roles file..");
    return await writeFile(
        path.join(__dirname, '..', '..', '..', 'database', 'roles.json'),
        roles,
        "Failed to lock/write roles.json! Please attempt role change again."
    );
}


/**
 * Returns true if the given member is an owner.
 * @param {string} member - The member's username, in lowercase.
 * @returns {boolean}
 */
const isOwner = function(member) {
    return roles.owners[member] != null;
};

/**
 * Returns true if the given member is a patron.
 * @param {string} member - The member's username, in lowercase.
 * @returns {boolean}
 */
const isPatron = function(member) {
    return roles.patrons[member] != null;
};

/**
 * Sets the `role` property of the request to the
 * member's role, if they have one.
 * @param {Object} req - The request object.
 * @param {string} req.user - Their username, in lowercase, if logged in.
 */
function setRole(req) {
    const user = req.user;
    if (!user) return; // Not logged in, no role

    if (isOwner(user)) req.role = 'owner';
    else if (isPatron(user)) req.role = 'patron';
}

/**
 * Sets the socket metadata's `role` property to the
 * member's role, if they have one.
 * @param {Object} ws - The websocket.
 * @param {string} req.metadata.user - Their username, in lowercase, if logged in.
 */
function setRoleWebSocket(ws) {
    const user = ws.metadata.user;
    if (!user) return; // Not logged in, no role

    if (isOwner(user)) ws.metadata.role = 'owner';
    else if (isPatron(user)) ws.metadata.role = 'patron';
}


/**
 * Gives a user the owner role.
 * @param {string} user - Their username, in lowercase.
 * @param {string} description - A 1 or 2 word description
 */
function giveRole_Owner(user, description) {
    removeAllRoles(user);
    roles.owners[user] = description;
    rolesHaveBeenEdited = true;
}

/**
 * Gives a user the patron role.
 * @param {string} user - Their username, in lowercase.
 * @param {string} description - A 1 or 2 word description
 */
function giveRole_Patron(user, description) {
    removeAllRoles(user);
    roles.patrons[user] = description;
    rolesHaveBeenEdited = true;
}

/**
 * Deletes a user's roles. Call before deleting their account.
 * @param {string} user - Their username, in lowercase.
 */
function removeAllRoles(user) {
    delete roles.owners[user];
    delete roles.patrons[user];
    rolesHaveBeenEdited = true; // Flag to be saved
}

export {
    saveRolesIfChangesMade,
    setRole,
    setRoleWebSocket,
    giveRole_Owner,
    giveRole_Patron,
    removeAllRoles
};
