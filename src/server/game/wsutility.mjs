
// This script contains generalized methods for working with websocket objects,
// thus the only dependancies it has are for the type definitions.

import { getTranslation } from '../utility/translate.mjs';
import { ensureJSONString } from '../utility/JSONUtils.mjs';
// eslint-disable-next-line no-unused-vars
import { Socket } from './TypeDefinitions.mjs';

const wsutility = (function() {

    /**
     * Prints the websocket to the console, temporarily removing self-referencing first.
     * @param {Socket} ws - The websocket
     */
    function printSocket(ws) { console.log(stringifySocketMetadata(ws)); }

    /**
     * Simplifies the websocket's metadata and stringifies it.
     * @param {Socket} ws - The websocket object
     * @returns {string} The stringified simplified websocket metadata.
     */
    function stringifySocketMetadata(ws) {
        // Removes the recursion from the metadata, making it safe to stringify.
        const simplifiedMetadata = getSimplifiedMetadata(ws);
        return ensureJSONString(simplifiedMetadata, 'Error while stringifying socket metadata:');
    }

    /**
     * Creates a new object with simplified metadata information from the websocket,
     * and removes recursion. This can be safely be JSON.stringified() afterward.
     * Excludes the stuff like the sendmessage() function and clearafter timer.
     * 
     * BE CAREFUL not to modify the return object, for it will modify the original socket!
     * @param {Socket} ws - The websocket object
     * @returns {Object} A new object containing simplified metadata.
     */
    function getSimplifiedMetadata(ws) {
        if (!ws) return console.error("Cannot get simplified metadata of an undefined websocket!");

        const metadata = ws.metadata;
        if (!metadata) return console.error("We should not be simplifying a websockets metadata when it is undefined!");
        const metadataCopy = {};
        if (metadata.user) metadataCopy.user = metadata.user;
        if (metadata.role) metadataCopy.role = metadata.role;
        if (metadata['browser-id']) metadataCopy['browser-id'] = metadata['browser-id'];
        metadataCopy.id = metadata.id;
        if (metadata.IP) metadataCopy.IP = metadata.IP;
        //if (metadata.id) metadataCopy.id = metadata.id;
        if (metadata.subscriptions) metadataCopy.subscriptions = metadata.subscriptions;
        return metadataCopy;
    }

    /**
     * Returns the owner of the websocket.
     * @param {Socket} ws - The websocket
     * @returns {Object} An object that contains either the `member` or `browser` property.
     */
    function getOwnerFromSocket(ws) {
        if (ws.metadata.user) return { member: ws.metadata.user };
        else if (ws.metadata['browser-id']) return { browser: ws.metadata['browser-id']};
        else return console.error(`Cannot get owner info from socket in gamesweb.js when socket doesn't contain authentication! Metadata: ${wsutility.stringifySocketMetadata(ws)}`);
    }

    /**
     * Sends a notification message to the client through the WebSocket connection, to be displayed on-screen.
     * @param {Socket} ws - The WebSocket connection object.
     * @param {string} translationCode - The code corresponding to the message that needs to be retrieved for language-specific translation. For example, `"server.javascript.ws-already_in_game"`.
     * @param {Object} options - An object containing additional options.
     * @param {number} options.replyto - The ID of the incoming WebSocket message to which this message is replying.
     * @param {number} [options.number] - A number to include with special messages if applicable, typically representing a duration in minutes.
     */
    function sendNotify(ws, translationCode, { replyto, number } = {}) {
        const i18next = ws.metadata.i18next;
        let text = getTranslation(translationCode, i18next);
        // Special case: number of minutes to be displayed upon server restart
        if (translationCode === "server.javascript.ws-server_restarting" && number !== undefined) {
            const minutes = Number(number); // Cast to number in case it's a string
            const minutes_plurality = minutes === 1 ? getTranslation("server.javascript.ws-minute", i18next) : getTranslation("server.javascript.ws-minutes", i18next);
            text += ` ${minutes} ${minutes_plurality}.`;
        }
        ws.metadata.sendmessage(ws, "general", "notify", text, replyto);
    }

    /**
     * Sends a message to the client through the websocket, to be displayed on-screen as an ERROR.
     * @param {Socket} ws - The socket
     * @param {string} translationCode - The code of the message to retrieve the language-specific translation for. For example, `"server.javascript.ws-already_in_game"`
     */
    function sendNotifyError(ws, translationCode) {
        ws.metadata.sendmessage(ws, "general", "notifyerror", getTranslation(translationCode, ws.metadata.i18next));
    }

    return Object.freeze({
        printSocket,
        stringifySocketMetadata,
        getOwnerFromSocket,
        sendNotify,
        sendNotifyError
    });
})();

export { wsutility };