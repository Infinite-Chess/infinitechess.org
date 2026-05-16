// src/client/scripts/esm/game/boardeditor/actions/ecloud.ts

/**
 * Handles cloud (server) save/load operations for the board editor.
 * Mirrors esavestore.ts for cloud storage.
 */

import type { EditorSaveState } from '../editortypes';
import type { CloudSaveListRecord } from '../../editorstores/editorSavesAPI';

import toast from '../../gui/toast';
import eactions from './eactions';
import eautosave from './eautosave';
import esavestore from '../../editorstores/esavestore';
import egamerules from '../egamerules';
import boardeditor from '../boardeditor';
import validatorama from '../../../util/validatorama';
import editorSavesAPI from '../../editorstores/editorSavesAPI';
import ecloudstore, {
	ICNConversionError,
	ICNDecompressionError,
	ICNParseError,
	PositionTooLargeError,
} from '../../editorstores/ecloudstore';

// Actions ----------------------------------------------------------------------

/** Helper that maps a saveCloudState failure to the correct toast message. */
function toastSaveCloudError(err: unknown): void {
	if (err instanceof PositionTooLargeError) {
		toast.show(translations.editor.too_large_for_cloud, { error: true });
	} else if (err instanceof ICNConversionError) {
		toast.show(translations.editor.failed_to_convert_icn, { error: true });
	} else {
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show(translations.editor.failed_to_upload + ' ' + errMsg, { error: true });
	}
}

/**
 * Uploads the currently loaded editor position to the cloud,
 * saving over whatever is already there.
 * Reads live game state instead of local storage.
 */
async function saveCloud(position_name: string): Promise<void> {
	if (!boardeditor.isPositionDirty()) {
		toast.show(translations.editor.no_changes);
		return;
	}

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

	try {
		await ecloudstore.saveCloudState(editorSaveState);
	} catch (err) {
		console.error('Failed to save cloud position:', err);
		toastSaveCloudError(err);
		return;
	}

	toast.show(translations.editor.saved_to_cloud);
	boardeditor.markPositionClean();
	eautosave.markPositionDirty();
	void eautosave.autosaveCurrentPositionOnce();
}

/**
 * Downloads a position from the server.
 * @returns An EditorSaveState on success, undefined on failure.
 */
async function readCloud(position_name: string): Promise<EditorSaveState | undefined> {
	try {
		return await ecloudstore.readCloud(position_name);
	} catch (err) {
		if (err instanceof ICNDecompressionError) {
			console.error('Failed to decompress cloud position ICN:', err);
			const errMsg = err instanceof Error ? err.message : String(err);
			toast.show(`${translations.editor.failed_to_load} ${errMsg}`, { error: true });
		} else if (err instanceof ICNParseError) {
			console.error('Failed to parse cloud position ICN:', err);
			toast.show(translations.editor.position_corrupted, { error: true });
		} else {
			console.error('Failed to load cloud position:', err);
			const errMsg = err instanceof Error ? err.message : String(err);
			toast.show(`${translations.editor.failed_to_load_cloud} ${errMsg}`, { error: true });
		}
		return undefined;
	}
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
		toast.show(translations.editor.failed_to_delete_cloud + ' ' + errMsg, { error: true });
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
	const editorSaveState = await esavestore.readLocal(position_name);
	if (editorSaveState === undefined) {
		toast.show(translations.editor.position_corrupted, { error: true });
		return;
	}

	let saves: CloudSaveListRecord[];
	try {
		saves = await ecloudstore.saveCloudState(editorSaveState);
	} catch (err) {
		console.error('Failed to upload position to cloud during transfer:', err);
		toastSaveCloudError(err);
		return;
	}

	toast.show(translations.editor.saved_to_cloud);

	// Success! Delete local copy now.
	await esavestore.deleteLocal(position_name);

	if (boardeditor.isActivePosition(position_name, 'local'))
		boardeditor.setActivePosition({
			name: position_name,
			storage_type: 'cloud',
			owner: validatorama.getOurUsername()!,
		});

	return saves;
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
		toast.show(translations.editor.failed_to_remove_cloud + ' ' + errMsg, { error: true });
		return;
	}

	// Success! Save locally now.
	await esavestore.saveState(editorSaveState);

	if (boardeditor.isActivePosition(position_name, 'cloud'))
		boardeditor.setActivePosition({ name: position_name, storage_type: 'local' });

	toast.show(translations.editor.saved_locally);
	return saves;
}

/**
 * Fetches all cloud saves for the current user.
 * Mirrors esavestore.getAllLocalSaveInfos() for cloud storage.
 * @returns An array of cloud save records, or an empty array on failure.
 */
async function getAllCloudSaveInfos(): Promise<CloudSaveListRecord[]> {
	try {
		return await editorSavesAPI.getSavedPositions();
	} catch (err) {
		console.error('Failed to fetch cloud saves:', err);
		const errMsg = err instanceof Error ? err.message : String(err);
		toast.show(translations.editor.failed_to_fetch_cloud + ' ' + errMsg, { error: true });
		return [];
	}
}

// Exports --------------------------------------------------------------------

export default {
	saveCloud,
	readCloud,
	deleteCloud,
	transferPositionToCloud,
	removePositionFromCloud,
	getAllCloudSaveInfos,
};
