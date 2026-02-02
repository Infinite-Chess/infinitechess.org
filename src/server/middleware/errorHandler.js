import { getTranslationForReq } from '../utility/translate.js';
import { logEventsAndPrint } from './logEvents.js';

function errorHandler(err, req, res, _next) {
	try {
		const errMessage = `${err.stack}`;
		logEventsAndPrint(errMessage, 'errLog.txt');

		// This sends back to the browser the error, instead of the ENTIRE stack which is PRIVATE.
		const messageForClient = getTranslationForReq('server.javascript.ws-server_error', req);
		res.status(500).send(messageForClient); // 500: Server error
	} catch (error) {
		// Last line of defense if an error occurs in the middleware error catcher
		const errMessage = error instanceof Error ? error.stack : String(error);
		console.error('Critical error in errorHandler middleware:', errMessage);
		res.status(500).send('Critical server error.');
	}
}

export default errorHandler;
