
const { logEvents } = require('./logEvents');

function errorHandler(err, req, res, next) {
    const errMessage = err.stack;
    logEvents(errMessage, 'errLog.txt', { print: true });
    
    // This sends back to the browser the error, instead of the ENTIRE stack which is PRIVATE.
    const messageForClient = "Sorry, there was a server error! Please go back."
    res.status(500).send(messageForClient); // 500: Server error
}

module.exports = errorHandler;