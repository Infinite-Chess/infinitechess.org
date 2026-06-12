// src/server/config/certOptions.ts

import fs from 'fs';

import { ensureSelfSignedCertificate, keyPath, certPath } from './generateCert.js';

/**
 * Retrieves SSL/TLS certificate options (a self-signed key + cert).
 *
 * This certificate only secures the loopback hop between cloudflared and this
 * server — public TLS terminates at Cloudflare's edge, and cloudflared reaches
 * the origin with `noTLSVerify`. So a self-signed cert is sufficient in every
 * environment, and its validity is never checked by anything.
 */
export function getCertOptions(): { key: Buffer; cert: Buffer } {
	ensureSelfSignedCertificate(); // Generates cert.key/cert.pem on first run if missing
	return {
		key: fs.readFileSync(keyPath),
		cert: fs.readFileSync(certPath),
	};
}
