const path = require('path');
const fs = require('fs');
const { DEV_BUILD } = require('./config');
const pathToCertFolder = path.resolve("cert"); // Resolve results in an absolute path

/**
 * Retrieves SSL/TLS certificate options based on the application's build environment.
 * @returns {Object} SSL/TLS certificate options, including the certificate and private key.
 */
function getCertOptions() {
    if (DEV_BUILD) { // Use self-signed certificates for development environment
        return {
            key: fs.readFileSync(path.join(pathToCertFolder, 'cert.key')),
            cert: fs.readFileSync(path.join(pathToCertFolder, 'cert.pem'))
        }
    } else { // Use officially signed certificates for production environment
        return {
            key: fs.readFileSync(path.join(process.env.CERT_PATH, 'privkey.pem')),
            cert: fs.readFileSync(path.join(process.env.CERT_PATH, 'fullchain.pem')),
        }
    }
}

module.exports = getCertOptions;
