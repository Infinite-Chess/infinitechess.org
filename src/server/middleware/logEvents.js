const { format } = require('date-fns');
const { v4: uuid } = require('uuid');

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const { getClientIP } = require("./IP");
const wsfunctions = require('../game/wsfunctions');
const { Socket } = require('../game/TypeDefinitions');
const { ensureDirectoryExists } = require('../utility/fileUtils');


const giveLoggedItemsUUID = false;

/**
 * Logs the provided message by appending a line to the end of the specified log file.
 * @param {string} message - The message to log.
 * @param {string} logName - The name of the log file.
 * @param {Object} [options] - Optional parameters.
 * @param {boolean} [options.print] - If true, prints the message to the console as an error.
 * @returns {Promise<void>} - A promise that resolves when the log operation is complete.
 */
const logEvents = async (message, logName, { print } = {}) => {
    if (typeof message !== 'string') return console.trace("Cannot log message when it is not a string.")

    if (print) console.error(message);
    const dateTime = format(new Date(), 'yyyy/MM/dd  HH:mm:ss');
    const logItem = giveLoggedItemsUUID ? `${dateTime}   ${uuid()}   ${message}\n` // With unique UUID
                                        : `${dateTime}   ${message}\n`;
    
    try {
        const logsPath = path.join(__dirname, '..', '..', '..', 'logs');
        ensureDirectoryExists(logsPath)
        await fsPromises.appendFile(path.join(logsPath, logName), logItem);
    } catch (err) {
        console.log(err);
    }
}

/**
 * Middleware that logs the incoming request, then calls `next()`.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The function to call, once finished, to continue down the middleware waterfall.
 */
const logger = (req, res, next) => {
    const clientIP = getClientIP(req)

    let logThis = `${req.headers.origin}   ${clientIP}   ${req.method}   ${req.url}   ${req.headers['user-agent']}`;
    // Delete passwords from incoming form data
    let sensoredBody;
    if (JSON.stringify(req.body) !== '{}') { // Not an empty object
        sensoredBody = Object.assign({}, req.body);
        delete sensoredBody.password;
        logThis += `\n${JSON.stringify(sensoredBody)}`;
    }

    logEvents(logThis, 'reqLog.txt');
    
    next(); // Continue to next middleware
}

/**
 * Logs websocket connection upgrade requests into `wsInLog.txt`
 * @param {Object} req - The request object
 * @param {Socket} ws - The websocket object
 */
function logWebsocketStart(req, ws) {
    const stringifiedSocketMetadata = wsfunctions.stringifySocketMetadata(ws);
    const userAgent = req.headers['user-agent']
    // const userAgent = ws.metadata.userAgent;
    let logThis = `Socket: ${stringifiedSocketMetadata}   User agent: ${userAgent}`;
    logEvents(logThis, 'wsInLog.txt');
}

/**
 * Logs incoming websocket messages into `wsInLog.txt`
 * @param {Socket} ws - The websocket object
 * @param {string} messageData - The raw data of the incoming message, as a string
 */
function logReqWebsocketIn(ws, messageData) {
    const stringifiedSocketMetadata = wsfunctions.stringifySocketMetadata(ws);
    let logThis = `Socket: ${stringifiedSocketMetadata}`;
    if (messageData) logThis += `\n${messageData}`;
    logEvents(logThis, 'wsInLog.txt');
}

/**
 * Logs outgoing websocket messages into `wsOutLog.txt`
 * @param {Socket} ws - The websocket object
 * @param {string} messageData - The raw data of the outgoing message, as a string
 */
function logReqWebsocketOut(ws, messageData) {
    const stringifiedSocketMetadata = wsfunctions.stringifySocketMetadata(ws);
    let logThis = `To socket: ${stringifiedSocketMetadata}\n${messageData}`;
    logEvents(logThis, 'wsOutLog.txt');
}

module.exports = {
    logEvents,
    logger,
    logWebsocketStart,
    logReqWebsocketIn,
    logReqWebsocketOut
};
