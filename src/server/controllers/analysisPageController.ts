// src/server/controllers/analysisPageController.ts

/**
 * Builds the SSR render state for the `/analysis/:id?/:color?` page: the optional game id
 * to auto-load (validated to exist) and the variant groups that populate the
 * variant dropdown, with display names resolved server-side.
 */

import type { Request } from 'express';
import type { Player } from '../../shared/chess/util/typeutil.js';
import type { VariantCode } from '../../shared/chess/util/variantcodes.js';
import type { VariantGroup } from '../../shared/chess/variants/variantregistry.js';
import type { GameMetaViewModel } from './gamePageController.js';

import variantregistry from '../../shared/chess/variants/variantregistry.js';
import { players as p } from '../../shared/chess/util/typeutil.js';

import gamesManager from '../database/gamesManager.js';
import gamePageController from './gamePageController.js';

// Types -----------------------------------------------------------------------

/** The full render context for `analysis.njk`. */
interface AnalysisPageState {
	/** Numeric id of a game to auto-load client-side, or null for a fresh board. */
	gameId: number | null;
	/** The side the board is viewed from: the URL's color segment, else the side they played on. */
	viewColor: Player;
	/** Variant groups + their variants, in display order — feeds the shared variant selector macro. */
	variantGroups: { group: VariantGroup; iconId: string; variants: VariantCode[] }[];
	/** Game metadata shown when analysis is opened for a saved/live game. */
	meta?: GameMetaViewModel;
}

// Constants -------------------------------------------------------------------

/** Cache all variant groups and their variants. */
const variantGroups = variantregistry.getVariantGroupsWithVariants();

// Functions -------------------------------------------------------------------

/**
 * Resolves the render state for `/analysis/:id?/:color?`, or `undefined` if an id was
 * given but is malformed or names no game in the database (live-only games included).
 * @throws If a database error occurs.
 */
function getPageState(req: Request): AnalysisPageState | undefined {
	let gameId: number | null = null;
	// A fresh board has no participants to orient by, and no id for a color segment to follow.
	let viewColor: Player = p.WHITE;
	const idParam = req.params['id'];
	let meta: GameMetaViewModel | undefined;
	if (idParam !== undefined) {
		// A game_id was provided in the URL
		const id = gamesManager.decodeID(idParam);
		if (id === undefined) return undefined; // Malformed id
		// The analysis page loads games from the DB only, so 404 on anything not in it
		// (unlike the game page, a still-live game not yet persisted doesn't count).
		const deadState = gamePageController.getDeadGameViewState(req, id);
		if (deadState === undefined) return undefined; // Game not in the database
		gameId = id;
		({ viewColor, meta } = deadState);
	}

	return {
		gameId,
		viewColor,
		variantGroups,
		...(meta && { meta }),
	};
}

// Exports ---------------------------------------------------------------------

export default { getPageState };
