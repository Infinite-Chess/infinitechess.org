
/**
 * This module extends the 'fs' module with methods
 * that lock a file while it is being read/written.
 * If you try to read/write a file while it is locked,
 * you will get an error.
 * 
 * This prevents data corruption when multiple code points
 * try to read/write the members file at the same time.
 */

const lockfile = require('proper-lockfile');
const fs = require('fs');
const { logEvents } = require('../middleware/logEvents');

// Locks the file while reading, then immediately unlocks and returns the data.
// MUST BE CALLED WITH 'await' or this returns a promise!
const readFile = async (path, errorString) => {
    let data;
    await lockfile.lock(path)
    .then((releaseFunc) => {
        // Do something while the file is locked
        try {
            data = JSON.parse(fs.readFileSync(path));
        } catch(e) { // Catching the error within JSON parsing like this allows us to unlock the file afterwards!
            console.error(e);
        } finally {
            releaseFunc();
            return;
        }
    })
    .catch((e) => {
        // either lock could not be acquired or releasing it failed
        const errText = `${errorString}${e.stack}`
        logEvents(errText, 'errLog.txt', { print: true });
    });
    return data;
}

// Returns false when failed to lock/write file.
// MUST BE CALLED WITH 'await' or this returns a promise!
const writeFile = async (path, object, errorString) => {
    let status = true;
    await lockfile.lock(path)
    .then((release) => {
        // Do something while the file is locked
        fs.writeFileSync(
            path,
            JSON.stringify(object, null, 1)
            // , (err) => {
            //     if (err) console.error(errorString, err);
            //     else status = true;
            // }
        )
        return release(); // Unlocks file
    })
    .catch((e) => {
        // either lock could not be acquired or releasing it failed
        const errText = `${errorString}${e.stack}`
        logEvents(errText, 'errLog.txt', { print: true });
        status = false;
    });
    return status;
}

// Locks file before reading, editing, and saving.
// MUST BE CALLED WITH 'await' or this returns a promise!
const editFile = async (path, callback, errorString) => {
    let status = true;
    await lockfile.lock(path)
    .then((release) => {
        // Do something while the file is locked
        let data = JSON.parse(fs.readFileSync(path));
        data = callback(data);
        fs.writeFileSync(
            path,
            JSON.stringify(data, null, 1)
        )
        return release(); // Unlocks file
    })
    .catch((e) => {
        // either lock could not be acquired or releasing it failed
        const errText = `${errorString}${e.stack}`
        logEvents(errText, 'errLog.txt', { print: true });
        status = false;
    });
    return status;
}

module.exports = {
    readFile,
    writeFile,
    editFile
}