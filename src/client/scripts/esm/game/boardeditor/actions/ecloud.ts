// src/client/scripts/esm/game/boardeditor/actions/ecloud.ts

/**
 * Handles cloud (server) save/load operations for the board editor.
 * Mirrors esave.ts for cloud storage.
 */

import type { MetaData } from '../../../../../../shared/chess/util/metadata';
import type { LongFormatIn } from '../../../../../../shared/chess/logic/icn/icnconverter';
import type { VariantOptions } from '../../../../../../shared/chess/logic/initvariant';
import type { EditorSaveState } from '../editortypes';
import type { CloudPositionRecord, CloudSaveListRecord } from './editorSavesAPI';

import editorutil from '../../../../../../shared/editor/editorutil';
import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter';

import toast from '../../gui/toast';
import esave from './esave';
import eactions from './eactions';
import egamerules from '../egamerules';
import compression from '../../../util/compression';
import boardeditor from '../boardeditor';
import editorSavesAPI from './editorSavesAPI';

// Actions ----------------------------------------------------------------------

/**
 * Parses a CloudPositionRecord into an EditorSaveState, decompressing the ICN
 * if necessary.
 * @returns An EditorSaveState on success, undefined on failure (errors are toasted internally).
 */
async function parseCloudPosition(
	position_name: string,
	cloudPosition: CloudPositionRecord,
): Promise<EditorSaveState | undefined> {
	let icn: string;
	try {
		icn = await compression.decompressString(cloudPosition.icn, cloudPosition.compression);
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		console.error('Failed to decompress cloud position ICN:', err);
		toast.show(`Failed to load position: ${errMsg}`, { error: true });
		return undefined;
	}

	let longFormOut;
	try {
		longFormOut = icnconverter.ShortToLong_Format(icn);
	} catch (err) {
		console.error('Failed to parse cloud position ICN:', err);
		toast.show('The position was corrupted.', { error: true });
		return;
	}
	const variantOptions: VariantOptions = {
		position: longFormOut.position ?? new Map(),
		gameRules: longFormOut.gameRules,
		state_global: {
			...longFormOut.state_global,
			specialRights: longFormOut.state_global.specialRights ?? new Set(),
		},
		fullMove: longFormOut.fullMove,
	};
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
 * Converts an EditorSaveState to ICN and uploads it to the cloud.
 * Does NOT modify local storage or the active position state.
 * @returns `{ success: true, saves }` on success, `{ success: false }` on failure (errors are toasted internally).
 */
async function saveCloudState(
	editorSaveState: EditorSaveState,
): Promise<{ success: true; saves: CloudSaveListRecord[] } | { success: false }> {
	// Convert variantOptions to ICN
	const longFormatIn: LongFormatIn = {
		metadata: {} as MetaData, // Empty metadata object required by ICN converter
		position: editorSaveState.variantOptions.position,
		gameRules: editorSaveState.variantOptions.gameRules,
		state_global: editorSaveState.variantOptions.state_global,
		fullMove: editorSaveState.variantOptions.fullMove ?? 1,
	};
	let icn: string;
	try {
		icn = icnconverter.LongToShort_Format(longFormatIn, {
			skipPosition: false,
			compact: true,
			spaces: false,
			comments: false,
			make_new_lines: false,
			move_numbers: false,
		});
	} catch (err) {
		console.error('Failed to convert position to ICN:', err);
		toast.show('Failed to convert position to ICN for cloud upload.', { error: true });
		return { success: false };
	}

	// Compress ICN first
	const { data: compressedICN, compression: compressionMode } =
		await compression.compressString(icn);

	if (compressedICN.length > editorutil.MAX_ICN_LENGTH) {
		toast.show(`Position is too large to save to the cloud.`, { error: true });
		return { success: false };
	}

	let saves: CloudSaveListRecord[];
	try {
		saves = await editorSavesAPI.savePosition(
			editorSaveState.position_name,
			editorSaveState.piece_count,
			editorSaveState.timestamp,
			compressedICN,
			compressionMode,
			editorSaveState.pawnDoublePush ?? false,
			editorSaveState.castling ?? false,
		);
	} catch (err) {
		console.error('Failed to upload position to cloud:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to upload position to cloud: ' + errMsg, { error: true });
		return { success: false };
	}

	toast.show('Position saved to cloud.');
	return { success: true, saves };
}

/**
 * Uploads the currently loaded editor position to the cloud,
 * saving over whatever is already there.
 * Reads live game state instead of local storage.
 */
async function saveCloud(position_name: string): Promise<void> {
	const variantOptions = eactions.getCurrentPositionInformation(false);
	const { pawnDoublePush, castling } = egamerules.getPositionDependentGameRules();
	const timestamp = Date.now();
	const piece_count = variantOptions.position.size;

	const editorSaveState: EditorSaveState = {
		position_name,
		timestamp,
		piece_count,
		variantOptions,
		pawnDoublePush,
		castling,
	};

	await saveCloudState(editorSaveState);
}

/**
 * Downloads a position from the server.
 * @returns An EditorSaveState on success, undefined on failure.
 */
async function readCloud(position_name: string): Promise<EditorSaveState | undefined> {
	let cloudPosition: CloudPositionRecord;
	try {
		cloudPosition = await editorSavesAPI.getPosition(position_name);
	} catch (err) {
		console.error('Failed to load cloud position:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to load position from the cloud: ' + errMsg, { error: true });
		return;
	}
	return parseCloudPosition(position_name, cloudPosition);
}

/**
 * Deletes a position from the server.
 * @returns The updated cloud saves list on success, undefined on failure.
 */
async function deleteCloud(position_name: string): Promise<CloudSaveListRecord[] | undefined> {
	try {
		return await editorSavesAPI.deletePosition(position_name);
	} catch (err) {
		console.error('Failed to delete cloud position:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to delete position from the cloud: ' + errMsg, { error: true });
		return undefined;
	}
}

/**
 * Transfers a local position to the server and removes the local copy.
 * @returns The updated cloud saves list on success, undefined on failure.
 */
async function transferPositionToCloud(
	position_name: string,
): Promise<CloudSaveListRecord[] | undefined> {
	const editorSaveState = await esave.readLocal(position_name);
	if (editorSaveState === undefined) return;

	const result = await saveCloudState(editorSaveState);
	if (!result.success) return;

	// Success! Delete local copy now.
	await esave.deleteLocal(position_name);

	if (boardeditor.isActivePosition(position_name, 'local'))
		boardeditor.setActivePosition(position_name, 'cloud');

	return result.saves;
}

/**
 * Downloads a cloud position to local storage and removes it from the server.
 * @returns The updated cloud saves list on success, undefined on failure.
 */
async function removePositionFromCloud(
	position_name: string,
): Promise<CloudSaveListRecord[] | undefined> {
	// Read first so that we don't lose the position if the delete succeeds but request doesn't return
	const editorSaveState = await readCloud(position_name);
	if (editorSaveState === undefined) return;

	// Delete from server (returns the updated list)
	let saves: CloudSaveListRecord[];
	try {
		saves = await editorSavesAPI.deletePosition(position_name);
	} catch (err) {
		console.error('Failed to delete cloud position after download:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to remove position from cloud: ' + errMsg, { error: true });
		return;
	}

	// Success! Save locally now.
	await esave.saveState(editorSaveState);

	if (boardeditor.isActivePosition(position_name, 'cloud'))
		boardeditor.setActivePosition(position_name, 'local');

	toast.show('Position saved locally.');
	return saves;
}

// Exports --------------------------------------------------------------------

export default {
	saveCloud,
	readCloud,
	deleteCloud,
	transferPositionToCloud,
	removePositionFromCloud,
};
