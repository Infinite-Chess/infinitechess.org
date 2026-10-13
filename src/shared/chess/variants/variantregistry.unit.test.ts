// src/shared/chess/variants/variantregistry.unit.test.ts

/**
 * Catches a variant whose declared position box no longer matches its starting position.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import gamefile from '../logic/gamefile.js';
import boardutil from '../logic/boardutil.js';
import variantcache from './variantcache.js';
import { VARIANT_CODES } from '../util/variantcodes.js';

beforeAll(() => variantcache.loadAllVariants());

describe('getPositionBox', () => {
	it.each(VARIANT_CODES)('matches the starting position of %s', (code) => {
		const now = Date.now();
		const mod = variantcache.getModule(code);
		if (mod.getPositionBox === undefined) return;
		const startPosition = gamefile.initGameFile('-', now, { code, dateTimestamp: now, mod });
		const actualBox = boardutil.getBoundingBoxOfAllPieces(startPosition.pieces);
		expect(mod.getPositionBox(now), `${code}'s getPositionBox doesn't match its position. Update it.`).toEqual(actualBox); // prettier-ignore
	});
});
