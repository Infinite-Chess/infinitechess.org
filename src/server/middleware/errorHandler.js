
import { getTranslationForReq } from '../utility/translate.js';
import { logEventsAndPrint } from './logEvents.js';

function errorHandler(err, req, res, next) {
	const errMessage = `${err.stack}`;
	logEventsAndPrint(errMessage, 'errLog.txt');
    
	// This sends back to the browser the error, instead of the ENTIRE stack which is PRIVATE.
	const messageForClient = getTranslationForReq("server.javascript.ws-server_error", req);
	res.status(500).send(messageForClient); // 500: Server error
}

export default errorHandler;