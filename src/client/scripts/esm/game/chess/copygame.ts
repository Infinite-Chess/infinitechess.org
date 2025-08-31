
// src/client/scripts/esm/game/chess/copygame.ts

/**
 * This script handles copying games
 */


// @ts-ignore
import statustext from '../gui/statustext.js';
import docutil from '../../util/docutil.js';
import gameslot, { PresetAnnotes } from './gameslot.js';
import gamecompressor from './gamecompressor.js';
import icnconverter from '../../chess/logic/icn/icnconverter.js';
import drawrays from '../rendering/highlights/annotations/drawrays.js';
import drawsquares from '../rendering/highlights/annotations/drawsquares.js';


const variantsTooBigToCopyPositionToICN: string[] = ['Omega_Squared', 'Omega_Cubed', 'Omega_Fourth', '5D_Chess'];


/**
 * Copies the current game to the clipboard in ICN notation.
 * This callback is called when the "Copy Game" button is pressed.
 * @param copySinglePosition - If true, only copy the current position, not the entire game. It won't have the moves list.
 */
function copyGame(copySinglePosition: boolean): void {
	const gamefile = gameslot.getGamefile()!;
	const Variant = gamefile.basegame.metadata.Variant!;

	// Add the preset annotation overrides from the previously pasted game, if present.
	const preset_squares = drawsquares.getPresetOverrides();
	const preset_rays = drawrays.getPresetOverrides();
	let presetAnnotes: PresetAnnotes | undefined;
	if (preset_squares || preset_rays) {
		presetAnnotes = {};
		if (preset_squares) presetAnnotes.squares = preset_squares;
		if (preset_rays) presetAnnotes.rays = preset_rays;
	}

	const longformatIn = gamecompressor.compressGamefile(gamefile, copySinglePosition, presetAnnotes);
	// Convert the variant metadata code to spoken language if translation is available
	if (longformatIn.metadata.Variant) longformatIn.metadata.Variant = translations[longformatIn.metadata.Variant];
	
	const largeGame: boolean = variantsTooBigToCopyPositionToICN.includes(Variant);
	// Also specify the position if we're copying a single position, so the starting position will be different.
	const skipPosition: boolean = largeGame && !copySinglePosition;
	const shortformat: string = icnconverter.LongToShort_Format(longformatIn, { skipPosition, compact: false, spaces: false, comments: false, make_new_lines: false, move_numbers: false });
    
	docutil.copyToClipboard(shortformat);
	statustext.showStatus(translations['copypaste'].copied_game);
}


export default {
	copyGame,
};