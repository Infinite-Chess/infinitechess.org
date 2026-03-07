// src/client/scripts/esm/game/boardeditor/actions/editorSavesAPI.ts

/**
 * Client-side wrappers for the editor saves server API endpoints.
 */

import type { CompressionMode } from '../../../util/compression';

import validatorama from '../../../util/validatorama';

// Types ----------------------------------------------------------------------------

/** Abridged info returned by getSavedPositions */
export interface CloudSaveListRecord {
	name: string;
	piece_count: number;
	timestamp: number;
}

/** Full position info returned by getPosition */
export interface CloudPositionRecord {
	timestamp: number;
	/** The compressed ICN */
	icn: string;
	/** Compression mode used for the ICN */
	compression: CompressionMode;
	/** undefined represents the indeterminate (third) tristate */
	pawn_double_push?: boolean;
	/** undefined represents the indeterminate (third) tristate */
	castling?: boolean;
}

// Helpers --------------------------------------------------------------------------

async function buildAuthHeaders(): Promise<Record<string, string>> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'is-fetch-request': 'true',
	};
	const token = await validatorama.getAccessToken();
	if (token) headers['Authorization'] = `Bearer ${token}`;
	return headers;
}

// API Wrappers --------------------------------------------------------------------

/**
 * GET /api/editor-saves
 * Returns an array of abridged save records for the logged-in user.
 * @throws If the request fails or the server returns a non-OK response.
 */
async function getSavedPositions(): Promise<CloudSaveListRecord[]> {
	const headers = await buildAuthHeaders();
	const response = await fetch('/api/editor-saves', {
		method: 'GET',
		headers,
	});
	if (!response.ok) {
		const errorData = (await response.json()) as { error?: string };
		throw new Error(errorData.error || 'Failed to get saved positions');
	}
	const data = (await response.json()) as { saves: CloudSaveListRecord[] };
	return data.saves;
}

/**
 * POST /api/editor-saves
 * Saves a position to the server for the logged-in user.
 * @throws If the request fails or the server returns a non-OK response.
 */
async function savePosition(
	name: string,
	piece_count: number,
	timestamp: number,
	icn: string,
	compression: string,
	pawn_double_push?: boolean,
	castling?: boolean,
): Promise<CloudSaveListRecord[]> {
	const headers = await buildAuthHeaders();
	const response = await fetch('/api/editor-saves', {
		method: 'POST',
		headers,
		body: JSON.stringify({
			name,
			piece_count,
			timestamp,
			icn,
			compression,
			pawn_double_push,
			castling,
		}),
	});
	if (!response.ok) {
		const errorData = (await response.json()) as { error?: string };
		throw new Error(errorData.error || 'Unknown error');
	}
	const data = (await response.json()) as { success: true; saves: CloudSaveListRecord[] };
	return data.saves;
}

/**
 * GET /api/editor-saves/:position_name
 * Returns the full ICN and game rules for a saved position.
 * @throws If the request fails or the server returns a non-OK response.
 */
async function getPosition(position_name: string): Promise<CloudPositionRecord> {
	const headers = await buildAuthHeaders();
	const response = await fetch(`/api/editor-saves/${encodeURIComponent(position_name)}`, {
		method: 'GET',
		headers,
	});
	if (!response.ok) {
		const errorData = (await response.json()) as { error?: string };
		throw new Error(errorData.error || 'Unknown error');
	}
	return (await response.json()) as CloudPositionRecord;
}

/**
 * DELETE /api/editor-saves/:position_name
 * Deletes a saved position from the server.
 * Returns the updated list of abridged save records for the user.
 * @throws If the request fails or the server returns a non-OK response.
 */
async function deletePosition(position_name: string): Promise<CloudSaveListRecord[]> {
	const headers = await buildAuthHeaders();
	const response = await fetch(`/api/editor-saves/${encodeURIComponent(position_name)}`, {
		method: 'DELETE',
		headers,
	});
	if (!response.ok) {
		const errorData = (await response.json()) as { error?: string };
		throw new Error(errorData.error || 'Failed to delete position');
	}
	const data = (await response.json()) as { success: true; saves: CloudSaveListRecord[] };
	return data.saves;
}

// Exports -------------------------------------------------------------------------

export default {
	getSavedPositions,
	savePosition,
	getPosition,
	deletePosition,
};
