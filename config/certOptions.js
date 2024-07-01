const path = require('path');

const { DEV_BUILD } = require('./config');
const { readFileIfExists, ensureDirectoryExists } = require('../Utility/fileUtils')

// Ensure the "cert" directory exists
const pathToCertFolder = path.resolve("./cert"); // Resolve results in an absolute path
ensureDirectoryExists(pathToCertFolder);

/**
 * Holds SSL/TLS certificate files for both development and production environments.
 */
const certs = {
    cert: readFileIfExists(path.join(pathToCertFolder, 'fullchain.pem')),
    key: readFileIfExists(path.join(pathToCertFolder, 'privkey.pem')),
    cert_SelfSigned: readFileIfExists(path.join(pathToCertFolder, 'cert.pem')),
    key_SelfSigned: readFileIfExists(path.join(pathToCertFolder, 'cert.key')),
}

/**
 * Retrieves SSL/TLS certificate options based on the application's build environment.
 * @returns {Object} SSL/TLS certificate options, including the certificate and private key.
 */
function getCertOptions() {
    if (DEV_BUILD) {
        // Use self-signed certificates for development environment
        return {
            cert: certs.cert_SelfSigned,
            key: certs.key_SelfSigned
        }
    } else {
        // Use officially signed certificates for production environment
        return {
            cert: certs.cert,
            key: certs.key
        }
    }
}

module.exports = getCertOptions;