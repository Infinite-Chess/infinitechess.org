
import { getTranslationForReq } from '../utility/translate.js';
import { logEvents } from './logEvents.js';

function errorHandler(err, req, res, next) {
    const errMessage = `${err.stack}`;
    logEvents(errMessage, 'errLog.txt', { print: true });
    
    // This sends back to the browser the error, instead of the ENTIRE stack which is PRIVATE.
    const messageForClient = getTranslationForReq("server.javascript.ws-server_error", req);
    res.status(500).send(messageForClient); // 500: Server error
}

export default errorHandler;