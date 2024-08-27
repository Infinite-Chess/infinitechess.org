// Import Start
import board from './board.js';
import game from '../chess/game.js';
import movement from './movement.js';
import buffermodel from './buffermodel.js';
// Import End

// This script handles the rendering of our promotion lines

"use strict";

// Module
const promotionlines = {

    startEnd: [-3, 12],
    thickness: 0.010,

    render: function() {
        if (!game.getGamefile().gameRules.promotionRanks) return; // No promotion ranks in this game
        const model = promotionlines.initModel();

        const boardPos = movement.getBoardPos();
        const position = [
            -boardPos[0], // Add the model's offset
            -boardPos[1],
            0
        ];
        const boardScale = movement.getBoardScale();
        const scale = [boardScale, boardScale, 1];
        // render.renderModel(model, position, scale, "TRIANGLES")
        model.render(position, scale);
    },

    /**
     * Generates the buffer model of the promotion lines
     * 
     * TODO: Make the lines more clear as to what side they belong to and what
     * square you need to reach. Perhaps a color gradient? Perhaps it glows
     * brighter when you have a pawn selected?
     * 
     * This also needs to be centered with the pieces.
     * @returns {BufferModel} The buffer model
     */
    initModel: function() {
        const startX = promotionlines.startEnd[0] - board.gsquareCenter();
        const endX = promotionlines.startEnd[1] + 1 - board.gsquareCenter();

        const gamefile = game.getGamefile();
        
        const yLow1 = gamefile.gameRules.promotionRanks[0] + 1 - board.gsquareCenter() - promotionlines.thickness;
        const yHigh1 = gamefile.gameRules.promotionRanks[0] + 1 - board.gsquareCenter() + promotionlines.thickness;

        const yLow2 = gamefile.gameRules.promotionRanks[1] - board.gsquareCenter() - promotionlines.thickness;
        const yHigh2 = gamefile.gameRules.promotionRanks[1] - board.gsquareCenter() + promotionlines.thickness;

        const data = new Float32Array([
            // x      y             r g b a
            startX, yLow1,        0, 0, 0,  1,
            startX, yHigh1,       0, 0, 0,  1,
            endX, yLow1,          0, 0, 0,  1,
            endX, yLow1,          0, 0, 0,  1,
            startX, yHigh1,       0, 0, 0,  1,
            endX, yHigh1,         0, 0, 0,  1,

            startX, yLow2,        0, 0, 0,  1,
            startX, yHigh2,       0, 0, 0,  1,
            endX, yLow2,          0, 0, 0,  1,
            endX, yLow2,          0, 0, 0,  1,
            startX, yHigh2,       0, 0, 0,  1,
            endX, yHigh2,         0, 0, 0,  1,
        ]);

        // return buffermodel.createModel_Color(data)
        return buffermodel.createModel_Colored(data, 2, "TRIANGLES");
    }
};

export default promotionlines