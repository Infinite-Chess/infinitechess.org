// src/client/scripts/esm/util/compression.ts

/**
 * General-purpose string compression utilities using the Web Streams
 * CompressionStream / DecompressionStream APIs.
 *
 * Compressed output is base64-encoded so it can be safely stored and
 * transmitted as a plain string.
 */

// Types -----------------------------------------------------------------------

/** The compression algorithm used when storing a compressed string. */
export type CompressionMode = 'none' | 'deflate-raw';

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

/**
 * Decompresses a base64-encoded string that was previously compressed with
 * `CompressionStream('deflate-raw')`.
 * @throws If `DecompressionStream` is unavailable or decompression fails.
 */
async function decompressStringBase64(compressedBase64: string): Promise<string> {
	const binary = atob(compressedBase64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	const stream = new DecompressionStream('deflate-raw');
	const writer = stream.writable.getWriter();
	writer.write(bytes);
	writer.close();

	const decompressed = await readAllChunks(stream.readable);
	return new TextDecoder().decode(decompressed);
}

// API ---------------------------------------------------------------------

/**
 * Attempts to compress a string using `CompressionStream('deflate-raw')`.
 *
 * The compressed output is base64-encoded so it can be stored as a plain string.
 * Falls back gracefully to `'none'` if:
 * - `CompressionStream` is not available in the current environment, or
 * - Compression does not actually reduce the string length, or
 * - An unexpected error occurs during compression.
 *
 * @returns An object with `data` (the compressed-and-base64-encoded string, or
 *          the original string when compression is `'none'`) and `compression`
 *          indicating which mode was used.
 */
async function compressString(
	str: string,
): Promise<{ data: string; compression: CompressionMode }> {
	if (typeof CompressionStream === 'undefined') {
		return { data: str, compression: 'none' };
	}

	const label = `Compressed ${str.length} characters`;
	if (DEBUG_COMPRESSION) console.time(label);

	try {
		const encoded = new TextEncoder().encode(str);
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
				`Before: ${str.length} characters. After: ${base64.length} characters. (${ratio}% of original)`,
			);
		}

		// Only use compression if it actually reduces size
		if (base64.length < str.length) {
			return { data: base64, compression: 'deflate-raw' };
		}
	} catch (err) {
		if (DEBUG_COMPRESSION) console.timeEnd(label);
		console.warn('Compression failed, falling back to uncompressed:', err);
	}

	// Fallback to uncompressed if compression is unavailable, fails, or doesn't reduce size
	return { data: str, compression: 'none' };
}

/**
 * Decompresses a string according to its stored compression mode.
 * - `'none'`: returns `data` unchanged.
 * - `'deflate-raw'`: base64-decodes then inflates the data.
 *
 * @throws If the mode is `'deflate-raw'` and `DecompressionStream` is not
 *         available in the current environment, or if decompression fails.
 */
async function decompressString(data: string, mode: CompressionMode): Promise<string> {
	if (mode === 'none') return data;
	if (typeof DecompressionStream === 'undefined') {
		throw new Error('Browser does not support DecompressionStream.');
	}

	const label = `Decompressed ${data.length} characters`;
	if (DEBUG_COMPRESSION) console.time(label);

	const result = await decompressStringBase64(data);

	if (DEBUG_COMPRESSION) console.timeEnd(label);

	return result;
}

// Exports ---------------------------------------------------------------------

export default {
	compressString,
	decompressString,
};
