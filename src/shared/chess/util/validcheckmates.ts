/**
 * This script stores the list of valid checkmates for the practice mode, and is used for verification clientside and serverside
 * It should have no dependencies at all.
 */

const validCheckmates = {
	easy: [
		"2Q-1k",
		"3R-1k",
		"1Q1R1B-1k",
		"1Q1R1N-1k",
		"1K2R-1k",
		"1Q1CH-1k",
		"2CH-1k",
		"3B3B-1k",
		"1K2B2B-1k",
		"3AR-1k",
		"1K1AM-1k"
	],
	medium: [
		"1K1Q1B-1k",
		"1K1Q1N-1k",
		"1Q1B1B-1k",
		"1K1N2B1B-1k",
		"1K2N1B1B-1k",
		"1K1R1B1B-1k",
		"1K1R1N1B-1k",
		"1K1AR1R-1k",
		"2R1N1P-1k",
		"2AM-1rc"
	],
	hard: [
		"1Q1N1B-1k",
		"1Q2N-1k",
		"1K1R2N-1k",
		"2K1R-1k",
		"1K2N6B-1k",
		"1K2AR-1k",
		"1K2HA1B-1k",
		"1K1CH1N-1k",
		"5HU-1k",
	],
	insane: [
		"1K1Q1P-1k",
		"1K3HA-1k",
		"1K3NR-1k",
	]

	// superhuman (way too hard):
	// "1K1AR1HA1P-1k" (the white pawn only exists in order to mitigate zugzwang for white)
	// "2B60N-1k" (fewer knights suffice but exact amount unknown, see proof in https://chess.stackexchange.com/q/45998/35006 )
};


// Export ------------------------------------------------------------------------------

export default {
	validCheckmates
};