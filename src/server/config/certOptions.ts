// src/server/config/certOptions.ts

import fs from 'fs';
import path from 'path';
import forge from 'node-forge';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const certDir = path.join(__dirname, '..', '..', '..', 'cert');

// Paths for the self-signed key and certificate files
const keyPath = path.join(certDir, 'cert.key');
const certPath = path.join(certDir, 'cert.pem');

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

/**
 * Ensures a self-signed cert.key and cert.pem exist in the
 * cert directory, generating them if missing. Idempotent.
 */
function ensureSelfSignedCertificate(): void {
	if (fs.existsSync(keyPath) && fs.existsSync(certPath)) return; // Already exist

	const pki = forge.pki;
	const keys = pki.rsa.generateKeyPair(2048);
	const cert = pki.createCertificate();

	cert.publicKey = keys.publicKey;
	cert.serialNumber = '01';
	cert.validity.notBefore = new Date();
	cert.validity.notAfter = new Date();
	cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

	const attrs = [{ name: 'commonName', value: 'localhost' }];

	cert.setSubject(attrs);
	cert.setIssuer(attrs);

	cert.sign(keys.privateKey, forge.md.sha256.create());

	// Convert the PEM-formatted keys to strings
	const privateKeyPem = pki.privateKeyToPem(keys.privateKey);
	const certPem = pki.certificateToPem(cert);

	// Write the key and cert
	fs.mkdirSync(certDir, { recursive: true });
	fs.writeFileSync(keyPath, privateKeyPem);
	fs.writeFileSync(certPath, certPem);

	console.log('Generated self-signed certificate.');
}
