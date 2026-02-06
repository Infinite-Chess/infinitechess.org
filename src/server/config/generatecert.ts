// src/server/config/generatecert.ts

import fs from 'fs';
import path from 'path';
import forge from 'node-forge';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const certDir = path.join(__dirname, '..', '..', '..', 'cert');

// Define the paths for the key and certificate files
const keyPath = path.join(certDir, 'cert.key');
const certPath = path.join(certDir, 'cert.pem');

/** Generates a self-signed certificate. */
function generateSelfSignedCertificate(): void {
	const pki = forge.pki;
	const keys = pki.rsa.generateKeyPair(2048);
	const cert = pki.createCertificate();

	cert.publicKey = keys.publicKey;
	cert.serialNumber = '01';
	cert.validity.notBefore = new Date();
	cert.validity.notAfter = new Date();
	cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

	const attrs = [
		{
			name: 'commonName',
			value: 'localhost',
		},
	];

	cert.setSubject(attrs);
	cert.setIssuer(attrs);

	cert.sign(keys.privateKey, forge.md.sha256.create());

	// Convert the PEM-formatted keys to strings
	const privateKeyPem = pki.privateKeyToPem(keys.privateKey);
	const certPem = pki.certificateToPem(cert);

	// Write the private key and certificate to the specified paths
	fs.writeFileSync(keyPath, privateKeyPem);
	fs.writeFileSync(certPath, certPem);

	console.log('Generated self-signed certificate.');
}

/**
 * Ensure that a self-signed certificate exists in the cert directory.
 * If cert.key and cert.pem do not exist, generate them.
 */
export function ensureSelfSignedCertificate(): void {
	// Create the cert directory if it doesn't exist
	fs.mkdirSync(certDir, { recursive: true });

	if (fs.existsSync(keyPath) && fs.existsSync(certPath)) return; // Self-signed certificate already exists

	generateSelfSignedCertificate();
}
