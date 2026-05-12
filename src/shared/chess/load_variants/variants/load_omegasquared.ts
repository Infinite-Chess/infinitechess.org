// src/shared/chess/load_variants/variants/load_omegasquared.ts

/*
 * Load data for the "Showcase: Omega^2" variant.
 */

export function getAnnotePresets(): { squares?: string; rays?: string } {
	return {
		squares: '-42,76|16,86|15,84|27,88|35,80|37,82|33,86|37,90|41,86|41,80|44,80|27,2|53,71',
		rays: '23,94>-1,0|23,76>-1,0|17,88>0,1|16,82>0,-1|68,72>0,1|68,71>0,-1|60,64>0,1|72,68>0,-1',
	};
}
