
// This script contains generalized methods for working with websocket objects,
// thus the only dependancies it has are for the type definitions.

const { ensureJSONString } = require('../utility/JSONUtils');
const { Socket } = require('./TypeDefinitions')

const wsfunctions = (function() {

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
        return ensureJSONString(simplifiedMetadata, 'Error while stringifying socket metadata:')
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
        if (!ws) return console.error("Cannot get simplified metadata of an undefined websocket!")

        const metadata = ws.metadata;
        if (!metadata) return console.error("We should not be simplifying a websockets metadata when it is undefined!")
        const metadataCopy = {}
        if (metadata.user) metadataCopy.user = metadata.user;
        if (metadata.role) metadataCopy.role = metadata.role;
        if (metadata['browser-id']) metadataCopy['browser-id'] = metadata['browser-id'];
        metadataCopy.id = metadata.id;
        if (metadata.IP) metadataCopy.IP = metadata.IP;
        //if (metadata.id) metadataCopy.id = metadata.id;
        if (metadata.subscriptions) metadataCopy.subscriptions = metadata.subscriptions;
        return metadataCopy
    }

    /**
     * Returns the owner of the websocket.
     * @param {Socket} ws - The websocket
     * @returns {Object} An object that contains either the `member` or `browser` property.
     */
    function getOwnerFromSocket(ws) {
        if (ws.metadata.user) return { member: ws.metadata.user }
        else if (ws.metadata['browser-id']) return { browser: ws.metadata['browser-id']}
        else return console.error(`Cannot get owner info from socket in gamesweb.js when socket doesn't contain authentication! Metadata: ${wsfunctions.stringifySocketMetadata(ws)}`)
    }

    return Object.freeze({
        printSocket,
        stringifySocketMetadata,
        getOwnerFromSocket
    })
})();

module.exports = wsfunctions