// src/server/controllers/analysisPageController.ts

/**
 * Builds the SSR render state for the `/analysis/:id?` page: the optional game id
 * to auto-load (validated to exist) and the variant groups that populate the
 * variant dropdown, with display names resolved server-side.
 */

import type { Request } from 'express';
import type { Player } from '../../shared/chess/util/typeutil.js';
import type { GameMetaViewModel } from './gamePageController.js';
import type { VariantGroup, VariantCode } from '../../shared/chess/variants/variantregistry.js';

import variantregistry from '../../shared/chess/variants/variantregistry.js';

import { decodeGameId } from '../database/gamesManager.js';
import { getDeadGameViewState } from './gamePageController.js';

/** The full render context for `analysis.njk`. */
interface AnalysisPageState {
	/** Numeric id of a game to auto-load client-side, or null for a fresh board. */
	gameId: number | null;
	/** The viewer's color if they were a participant, so the board auto-orients to their side. */
	role?: Player;
	/** Variant groups + their variants, in display order — feeds the shared variant selector macro. */
	variantGroups: { group: VariantGroup; iconId: string; variants: VariantCode[] }[];
	/** Game metadata shown when analysis is opened for a saved/live game. */
	meta?: GameMetaViewModel;
}

/** Cache all variant groups and their variants. */
const variantGroups = variantregistry.getVariantGroupsWithVariants();

/**
 * Resolves the render state for `/analysis/:id?`, or `undefined` if an id was
 * given but is malformed or names no game in the database (live-only games included).
 * @throws If a database error occurs.
 */
export function getAnalysisPageState(req: Request): AnalysisPageState | undefined {
	let gameId: number | null = null;
	const idParam = req.params['id'];
	let role: Player | undefined;
	let meta: GameMetaViewModel | undefined;
	if (idParam !== undefined) {
		// A game_id was provided in the URL
		const id = decodeGameId(idParam);
		if (id === undefined) return undefined; // Malformed id
		// The analysis page loads games from the DB only, so 404 on anything not in it
		// (unlike the game page, a still-live game not yet persisted doesn't count).
		const deadState = getDeadGameViewState(req, id);
		if (deadState === undefined) return undefined; // Game not in the database
		gameId = id;
		({ role, meta } = deadState);
	}

	return {
		gameId,
		...(role !== undefined && { role }),
		variantGroups,
		...(meta && { meta }),
	};
}
