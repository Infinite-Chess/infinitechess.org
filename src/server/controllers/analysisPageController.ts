// src/server/controllers/analysisPageController.ts

/**
 * Builds the SSR render state for the `/analysis/:id?` page: the optional game id
 * to auto-load (validated to exist) and the variant groups that populate the
 * variant dropdown, with display names resolved server-side.
 */

import type { Request } from 'express';

import variantregistry from '../../shared/chess/variants/variantregistry.js';

import { decodeGameId } from '../database/gamesManager.js';
import { produceStaticGameState } from '../game/gamemanager/gamemanager.js';

/** The full render context for `analysis.njk`. */
interface AnalysisPageState {
	/** Base62 game id to auto-load client-side, or null for a fresh board. */
	gameId: string | null;
	/** Variant dropdown contents, in display order. */
	variantGroups: { name: string; variants: { code: string; name: string }[] }[];
}

/**
 * Resolves the render state for `/analysis/:id?`, or `undefined`
 * if an id was given but is malformed or names no existing game.
 * @throws If a database error occurs (from the underlying producers).
 */
export function getAnalysisPageState(req: Request): AnalysisPageState | undefined {
	let gameId: string | null = null;
	const idParam = req.params['id'];
	if (idParam !== undefined) {
		const id = decodeGameId(idParam);
		if (id === undefined) return undefined; // Malformed id
		if (produceStaticGameState(id) === undefined) return undefined; // Game doesn't exist
		gameId = idParam;
	}

	const variantGroups = variantregistry.getVariantGroupsWithVariants().map((g) => ({
		name: req.t.shared.variant_groups[g.group].name,
		variants: g.variants.map((code) => ({
			code,
			name: variantregistry.getVariantName(code, req.t.shared),
		})),
	}));

	return { gameId, variantGroups };
}
