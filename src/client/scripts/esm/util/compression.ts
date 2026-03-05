// src/client/scripts/esm/util/compression.ts

/**
 * General-purpose string compression utilities.
 *
 * Two compression paths are available:
 *  1. `'deflate-raw-dict'` – synchronous DEFLATE via `fflate` with a preset
 *     ICN dictionary. Yields the best compression for ICN position strings.
 *  2. `'deflate-raw'` – asynchronous DEFLATE via the browser's native
 *     `CompressionStream('deflate-raw')` API (no dictionary).
 *
 * `compressString` automatically selects the best path: it tries the
 * dictionary-based path first, then falls back to `'deflate-raw'`, and
 * finally falls back to `'none'` if compression does not reduce size.
 *
 * Compressed output is base64-encoded so it can be safely stored and
 * transmitted as a plain string.
 */

import { deflateSync, inflateSync } from 'fflate';

import ICN_DEFLATE_DICTIONARY from './icnDictionary.js';

// Types -----------------------------------------------------------------------

/** The compression algorithm used when storing a compressed string. */
export type CompressionMode = 'none' | 'deflate-raw' | 'deflate-raw-dict';

// Constants -----------------------------------------------------------------------

/**
 * Set to `true` to enable verbose compression/decompression diagnostics:
 * - `console.time` timing for every compress/decompress call.
 * - After compression: before/after character counts, bytes saved, and ratio.
 */
const DEBUG_COMPRESSION = false;

// Helpers ---------------------------------------------------------------------

/** Reads all chunks from a ReadableStream into a single Uint8Array. */
async function readAllChunks(readable: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	const reader = readable.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}
	const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.length;
	}
	return combined;
}

/** Base64-encodes a Uint8Array in fixed-size chunks to avoid stack overflow on large payloads. */
function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunkSize = 8192;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
	}
	return btoa(binary);
}

/** Base64-decodes a string into a Uint8Array. */
function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * Compresses `encoded` with DEFLATE using the ICN preset dictionary via `fflate`.
 * Returns the base64-encoded result, or `undefined` if compression fails.
 */
function compressWithDictionary(encoded: Uint8Array): string | undefined {
	try {
		const compressed = deflateSync(encoded, { dictionary: ICN_DEFLATE_DICTIONARY });
		return uint8ArrayToBase64(compressed);
	} catch {
		return undefined;
	}
}

/**
 * Decompresses a base64-encoded, dictionary-compressed string back to the
 * original text using `fflate` and the ICN preset dictionary.
 * @throws If decompression fails.
 */
function decompressWithDictionary(compressedBase64: string): string {
	const bytes = base64ToUint8Array(compressedBase64);
	const decompressed = inflateSync(bytes, { dictionary: ICN_DEFLATE_DICTIONARY });
	return new TextDecoder().decode(decompressed);
}

/**
 * Decompresses a base64-encoded string that was previously compressed with
 * `CompressionStream('deflate-raw')`.
 * @throws If `DecompressionStream` is unavailable or decompression fails.
 */
async function decompressStringBase64(compressedBase64: string): Promise<string> {
	const bytes = base64ToUint8Array(compressedBase64);

	const stream = new DecompressionStream('deflate-raw');
	const writer = stream.writable.getWriter();
	writer.write(bytes);
	writer.close();

	const decompressed = await readAllChunks(stream.readable);
	return new TextDecoder().decode(decompressed);
}

// API ---------------------------------------------------------------------

/**
 * Attempts to compress a string, trying the following strategies in order:
 *
 * 1. **`'deflate-raw-dict'`** – synchronous DEFLATE via `fflate` with the ICN
 *    preset dictionary. Gives the best compression for ICN position strings.
 * 2. **`'deflate-raw'`** – asynchronous DEFLATE via the browser's native
 *    `CompressionStream` API (no dictionary). Used if the dictionary path
 *    doesn't reduce size or throws an error.
 * 3. **`'none'`** – the original string is returned unchanged. Used if neither
 *    compression path reduces size, or if `CompressionStream` is unavailable.
 *
 * The compressed output is base64-encoded so it can be stored as a plain string.
 *
 * @returns An object with `data` (the compressed-and-base64-encoded string, or
 *          the original string when compression is `'none'`) and `compression`
 *          indicating which mode was used.
 */
async function compressString(
	str: string,
): Promise<{ data: string; compression: CompressionMode }> {
	const label = `Compressed ${str.length} characters`;
	if (DEBUG_COMPRESSION) console.time(label);

	const encoded = new TextEncoder().encode(str);

	// ── Strategy 1: fflate DEFLATE with ICN preset dictionary ─────────────────
	const dictBase64 = compressWithDictionary(encoded);
	if (dictBase64 !== undefined && dictBase64.length < str.length) {
		if (DEBUG_COMPRESSION) {
			console.timeEnd(label);
			const ratio = ((dictBase64.length * 100) / str.length).toFixed(1);
			console.log(
				`[deflate-raw-dict] Before: ${str.length} chars. After: ${dictBase64.length} chars. (${ratio}% of original)`,
			);
		}
		return { data: dictBase64, compression: 'deflate-raw-dict' };
	}

	// ── Strategy 2: native browser CompressionStream (no dictionary) ──────────
	if (typeof CompressionStream !== 'undefined') {
		try {
			const stream = new CompressionStream('deflate-raw');
			const writer = stream.writable.getWriter();
			writer.write(encoded);
			writer.close();

			const compressed = await readAllChunks(stream.readable);
			const base64 = uint8ArrayToBase64(compressed);

			if (DEBUG_COMPRESSION) {
				console.timeEnd(label);
				const ratio = ((base64.length * 100) / str.length).toFixed(1);
				console.log(
					`[deflate-raw] Before: ${str.length} chars. After: ${base64.length} chars. (${ratio}% of original)`,
				);
			}

			if (base64.length < str.length) {
				return { data: base64, compression: 'deflate-raw' };
			}
		} catch (err) {
			if (DEBUG_COMPRESSION) console.timeEnd(label);
			console.warn('Native CompressionStream failed, falling back to uncompressed:', err);
		}
	}

	if (DEBUG_COMPRESSION) console.timeEnd(label);

	// ── Strategy 3: no compression ────────────────────────────────────────────
	return { data: str, compression: 'none' };
}

/**
 * Decompresses a string according to its stored compression mode.
 * - `'none'`: returns `data` unchanged.
 * - `'deflate-raw-dict'`: base64-decodes then inflates using the ICN preset
 *   dictionary via `fflate`.
 * - `'deflate-raw'`: base64-decodes then inflates using the browser's native
 *   `DecompressionStream`.
 *
 * @throws If the mode is `'deflate-raw'` and `DecompressionStream` is not
 *         available in the current environment, or if decompression fails.
 */
async function decompressString(data: string, mode: CompressionMode): Promise<string> {
	if (mode === 'none') return data;

	const label = `Decompressed ${data.length} characters`;
	if (DEBUG_COMPRESSION) console.time(label);

	let result: string;

	if (mode === 'deflate-raw-dict') {
		result = decompressWithDictionary(data);
	} else {
		// mode === 'deflate-raw'
		if (typeof DecompressionStream === 'undefined') {
			throw new Error('Browser does not support DecompressionStream.');
		}
		result = await decompressStringBase64(data);
	}

	if (DEBUG_COMPRESSION) console.timeEnd(label);

	return result;
}

// Exports ---------------------------------------------------------------------

export default {
	compressString,
	decompressString,
};
