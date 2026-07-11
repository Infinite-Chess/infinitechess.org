// src/server/controllers/analysisPageController.ts

/**
 * Builds the SSR render state for the `/analysis/:id?` page: the optional game id
 * to auto-load (validated to exist) and the variant groups that populate the
 * variant dropdown, with display names resolved server-side.
 */

import type { Request } from 'express';
import type { GameMetaViewModel } from './gamePageController.js';

import variantregistry from '../../shared/chess/variants/variantregistry.js';

import { decodeGameId } from '../database/gamesManager.js';
import { getDeadGameMetaViewModel } from './gamePageController.js';

/** The full render context for `analysis.njk`. */
interface AnalysisPageState {
	/** Base62 game id to auto-load client-side, or null for a fresh board. */
	gameId: string | null;
	/** Variant dropdown contents, in display order. */
	variantGroups: { name: string; variants: { code: string; name: string }[] }[];
	/** Game metadata shown when analysis is opened for a saved/live game. */
	meta?: GameMetaViewModel;
}

/**
 * Resolves the render state for `/analysis/:id?`, or `undefined` if an id was
 * given but is malformed or names no game in the database (live-only games included).
 * @throws If a database error occurs (from the underlying producers).
 */
export function getAnalysisPageState(req: Request): AnalysisPageState | undefined {
	let gameId: string | null = null;
	const idParam = req.params['id'];
	let meta: GameMetaViewModel | undefined;
	if (idParam !== undefined) {
		// A game_id was provided in the URL
		const id = decodeGameId(idParam);
		if (id === undefined) return undefined; // Malformed id
		// The analysis page loads games from the DB only, so 404 on anything not in it
		// (unlike the game page, a still-live game not yet persisted doesn't count).
		meta = getDeadGameMetaViewModel(req, id);
		if (meta === undefined) return undefined; // Game not in the database
		gameId = idParam;
	}

	const variantGroups = variantregistry.getVariantGroupsWithVariants().map((g) => ({
		name: req.t.shared.variant_groups[g.group].name,
		variants: g.variants.map((code) => ({
			code,
			name: variantregistry.getVariantName(code, req.t.shared),
		})),
	}));

	return {
		gameId,
		variantGroups,
		...(meta && { meta }),
	};
}
