// src/client/scripts/esm/savedpositions/cloudstore.ts

/**
 * Low-level cloud read/write operations for board editor saves.
 */

import type { LongFormatIn } from '../../../../shared/chess/logic/icn/icnconverter.js';
import type { EditorSaveState } from './storetypes.js';
import type { CloudPositionRecord, CloudSaveListRecord } from './savesapi.js';

import jsutil from '../../../../shared/util/jsutil.js';
import icnimport from '../../../../shared/chess/logic/icn/icnimport.js';
import gamelimits from '../../../../shared/chess/util/gamelimits.js';
import compression from '../../../../shared/util/compression.js';
import icnconverter from '../../../../shared/chess/logic/icn/icnconverter.js';

import savesapi from './savesapi.js';

// Error classes ---------------------------------------------------------------

/** Thrown by {@link saveCloudState} when the compressed ICN exceeds the cloud size limit. */
export class PositionTooLargeError extends Error {}

/** Thrown by {@link saveCloudState} when the position cannot be serialised to ICN. */
export class ICNConversionError extends Error {}

/** Thrown by {@link parseCloudPosition} when the ICN string cannot be parsed. */
export class ICNParseError extends Error {}

/** Thrown by {@link parseCloudPosition} when the compressed ICN cannot be decompressed. */
export class ICNDecompressionError extends Error {
	constructor(cause: unknown) {
		super(jsutil.getErrorMessage(cause));
	}
}

// Actions ---------------------------------------------------------------------

/**
 * Parses a CloudPositionRecord into an EditorSaveState, decompressing the ICN.
 * @throws On decompression or ICN parse failure.
 */
async function parseCloudPosition(
	position_name: string,
	cloudPosition: CloudPositionRecord,
): Promise<EditorSaveState> {
	let icn: string;
	try {
		icn = await compression.decompressString(cloudPosition.icn, cloudPosition.compression);
	} catch (err) {
		console.error('Failed to decompress cloud position ICN:', err);
		throw new ICNDecompressionError(err);
	}

	let longFormOut;
	try {
		longFormOut = icnconverter.ShortToLong_Format(icn);
	} catch (err) {
		console.error('Failed to parse cloud position ICN:', err);
		throw new ICNParseError();
	}
	const variantOptions = icnimport.variantOptionsFromLongFormat(longFormOut);
	return {
		position_name,
		timestamp: cloudPosition.timestamp,
		piece_count: variantOptions.position.size,
		variantOptions,
		pawnDoublePush: cloudPosition.pawn_double_push,
		castling: cloudPosition.castling,
	};
}

/**
 * Downloads and parses a position from the server.
 * @throws On network error or parse failure.
 */
async function readCloud(position_name: string): Promise<EditorSaveState> {
	const cloudPosition = await savesapi.getPosition(position_name);
	return parseCloudPosition(position_name, cloudPosition);
}

/**
 * Converts an EditorSaveState to ICN and uploads it to the cloud.
 * Does NOT modify local storage or the active position state.
 * @returns The updated list of cloud save records.
 * @throws {ICNConversionError} If the position cannot be serialised to ICN.
 * @throws {PositionTooLargeError} If the compressed ICN exceeds the cloud size limit.
 * @throws On upload failure.
 */
async function saveCloudState(editorSaveState: EditorSaveState): Promise<CloudSaveListRecord[]> {
	const longFormatIn: LongFormatIn = {
		metadata: {},
		position: editorSaveState.variantOptions.position,
		gameRules: editorSaveState.variantOptions.gameRules,
		state_global: editorSaveState.variantOptions.state_global,
		fullMove: editorSaveState.variantOptions.fullMove ?? 1,
	};

	let icn: string;
	try {
		icn = icnconverter.LongToShort_Format(longFormatIn, icnconverter.COMPACT_FORMAT_OPTIONS);
	} catch (err) {
		console.error('Failed to convert position to ICN:', err);
		throw new ICNConversionError();
	}

	const { data: compressedICN, compression: compressionMode } =
		await compression.compressString(icn);

	if (compressedICN.length > gamelimits.MAX_ICN_LENGTH) throw new PositionTooLargeError();

	return savesapi.savePosition(
		editorSaveState.position_name,
		editorSaveState.piece_count,
		editorSaveState.timestamp,
		compressedICN,
		compressionMode,
		editorSaveState.pawnDoublePush,
		editorSaveState.castling,
	);
}

// Exports ---------------------------------------------------------------------

export default {
	readCloud,
	saveCloudState,
};
