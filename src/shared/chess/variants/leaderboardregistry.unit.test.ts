// src/shared/chess/variants/leaderboardregistry.unit.test.ts

/**
 * Catches a variant being put on a leaderboard without server validation. Only unvalidated
 * games can be cheat-reported, and an overturn never reverses ratings, so a rated one must never be.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import variantcache from './variantcache.js';
import servervalidation from './servervalidation.js';
import { VARIANT_CODES } from '../util/variantcodes.js';
import leaderboardregistry from './leaderboardregistry.js';

beforeAll(() => variantcache.loadAllVariants());

describe('BY_VARIANT', () => {
	const codes = VARIANT_CODES.filter((code) => code in leaderboardregistry.BY_VARIANT);
	it.each(codes)('server-validates %s', (code) => {
		const loaded = { code, dateTimestamp: Date.now(), mod: variantcache.getModule(code) };
		const validated = servervalidation.isGameValidated({ kind: 'preset', code }, loaded);
		expect(validated, `${code} is on a leaderboard but isn't server-validated. Remove it from BY_VARIANT.`).toBe(true); // prettier-ignore
	});
});
