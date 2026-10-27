// src/shared/chess/variants/enginevariants.unit.test.ts

/**
 * Catches the engine card's UNSUPPORTED_VARIANTS drifting from what the engine actually accepts,
 * and a supported variant that can't be played against the engine.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import gamefile from '../logic/gamefile.js';
import boardbase from '../logic/boardbase.js';
import apeironcard from '../engines/apeironcard.js';
import variantcache from './variantcache.js';
import { VARIANT_CODES } from '../util/variantcodes.js';

beforeAll(() => variantcache.loadAllVariants());

describe('apeironcard.UNSUPPORTED_VARIANTS', () => {
	it.each(VARIANT_CODES)('agrees with the card on %s', (code) => {
		const variant = { code, dateTimestamp: Date.now(), mod: variantcache.getModule(code) };
		const gameRules = gamefile.resolveGameRules(variant, {});
		const result = apeironcard.isGameReviewSupported(boardbase.init(gameRules, variant));
		const message = result.supported
			? `${code} is in UNSUPPORTED_VARIANTS, but the engine supports it. Remove it.`
			: `${code} is missing from UNSUPPORTED_VARIANTS. The engine rejects it with '${result.reason}'. Add it.`; // prettier-ignore
		expect(apeironcard.UNSUPPORTED_VARIANTS.has(code), message).toBe(!result.supported);
		if (!result.supported) return;

		// Throws if the variant declares neither a position box nor a world border.
		const engineGame = gamefile.initGameFile('-', Date.now(), variant, { engineGame: true });
		expect(apeironcard.isPlaySupported(engineGame)).toEqual({ supported: true });
	});
});
