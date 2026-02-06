// src/server/config/certoptions.ts

import fs from 'fs';
import path from 'path';

const pathToCertFolder = path.resolve('cert'); // Resolve results in an absolute path

/**
 * Retrieves SSL/TLS certificate options based on the application's
 * build environment, including the certificate and private key.
 */
export function getCertOptions(): { key: Buffer; cert: Buffer } {
	if (process.env['NODE_ENV'] !== 'production') {
		// Use self-signed certificates for development environment
		return {
			key: fs.readFileSync(path.join(pathToCertFolder, 'cert.key')),
			cert: fs.readFileSync(path.join(pathToCertFolder, 'cert.pem')),
		};
	} else {
		// Use officially signed certificates for production environment
		return {
			key: fs.readFileSync(path.join(process.env['CERT_PATH'] ?? '', 'privkey.pem')),
			cert: fs.readFileSync(path.join(process.env['CERT_PATH'] ?? '', 'fullchain.pem')),
		};
	}
}
