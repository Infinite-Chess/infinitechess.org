// src/client/scripts/esm/game/boardeditor/actions/ecloud.ts

/**
 * Handles cloud (server) save/load operations for the board editor.
 * Mirrors esave.ts for cloud storage.
 */

import type { MetaData } from '../../../../../../shared/chess/util/metadata';
import type { LongFormatIn } from '../../../../../../shared/chess/logic/icn/icnconverter';
import type { VariantOptions } from '../../../../../../shared/chess/logic/initvariant';
import type { EditorSaveState } from '../editortypes';
import type { CloudPositionRecord } from './editorSavesAPI';

import icnconverter from '../../../../../../shared/chess/logic/icn/icnconverter';

import toast from '../../gui/toast';
import esave from './esave';
import eactions from './eactions';
import egamerules from '../egamerules';
import boardeditor from '../boardeditor';
import editorSavesAPI from './editorSavesAPI';

// Actions ----------------------------------------------------------------------

/**
 * Parses a CloudPositionRecord into an EditorSaveState.
 * @returns An EditorSaveState on success, undefined if ICN parsing fails.
 */
function parseCloudPosition(
	position_name: string,
	cloudPosition: CloudPositionRecord,
): EditorSaveState | undefined {
	let longFormOut;
	try {
		longFormOut = icnconverter.ShortToLong_Format(cloudPosition.icn);
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
 * @returns Whether the upload succeeded (errors are toasted internally).
 */
async function saveCloudState(editorSaveState: EditorSaveState): Promise<boolean> {
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
		return false;
	}

	try {
		await editorSavesAPI.savePosition(
			editorSaveState.position_name,
			editorSaveState.piece_count,
			editorSaveState.timestamp,
			icn,
			editorSaveState.pawnDoublePush ?? false,
			editorSaveState.castling ?? false,
		);
	} catch (err) {
		console.error('Failed to upload position to cloud:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to upload position to cloud: ' + errMsg, { error: true });
		return false;
	}

	toast.show('Position saved to cloud.');
	return true;
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

/** Deletes a position from the server. */
async function deleteCloud(position_name: string): Promise<void> {
	try {
		await editorSavesAPI.deletePosition(position_name);
	} catch (err) {
		console.error('Failed to delete cloud position:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show('Failed to delete position from the cloud: ' + errMsg, { error: true });
	}
}

/** Transfers a local position to the server and removes the local copy. */
async function transferPositionToCloud(position_name: string): Promise<void> {
	const editorSaveState = await esave.readLocal(position_name);
	if (editorSaveState === undefined) return;

	const success = await saveCloudState(editorSaveState);
	if (!success) return;

	// Success! Delete local copy now.
	await esave.deleteLocal(position_name);

	if (boardeditor.isActivePosition(position_name, 'local'))
		boardeditor.setActivePosition(position_name, 'cloud');
}

/**
 * Downloads a cloud position to local storage and removes it from the server.
 */
async function removePositionFromCloud(position_name: string): Promise<void> {
	const editorSaveState = await readCloud(position_name);
	if (editorSaveState === undefined) return;

	// Delete from server
	try {
		await editorSavesAPI.deletePosition(position_name);
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
}

// Exports --------------------------------------------------------------------

export default {
	saveCloud,
	readCloud,
	deleteCloud,
	transferPositionToCloud,
	removePositionFromCloud,
};
