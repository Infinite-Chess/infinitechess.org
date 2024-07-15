// This script handles the rendering of our promotion lines

"use strict";

// Module
const promotionlines = {

    startEnd: [-3, 12],
    thickness: 0.010,

    render: function() {
        if (!game.getGamefile().gameRules.promotionRanks && !game.getGamefile().gameRules.promotionColumns) return; // No promotion ranks and columns in this game
        const model = promotionlines.initModel()

        const boardPos = movement.getBoardPos();
        const position = [
            -boardPos[0], // Add the model's offset
            -boardPos[1],
            0
        ]
        const boardScale = movement.getBoardScale();
        const scale = [boardScale, boardScale, 1]
        // render.renderModel(model, position, scale, "TRIANGLES")
        model.render(position, scale);
    },

    generateModelCoordinates(ranks=[1,2]){
        const startX = promotionlines.startEnd[0] - board.gsquareCenter();
        const endX = promotionlines.startEnd[1] + 1 - board.gsquareCenter();
        
        const yLow1 = ranks[0] + 1 - board.gsquareCenter() - promotionlines.thickness;
        const yHigh1 = ranks[0] + 1 - board.gsquareCenter() + promotionlines.thickness;

        const yLow2 = ranks[1] - board.gsquareCenter() - promotionlines.thickness;
        const yHigh2 = ranks[1] - board.gsquareCenter() + promotionlines.thickness;

        return [
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
        ]
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
        const gamefile = game.getGamefile()
        const data = [];
        if(gamefile.gameRules.promotionRanks != null) data.push(...this.getRowModelData(gamefile));
        if(gamefile.gameRules.promotionColumns != null) data.push(...this.getColumnModelData(gamefile));

        return buffermodel.createModel_Colored(new Float32Array(data), 2, "TRIANGLES");
    },

    getRowModelData: function(gamefile) {
        const ranks = gamefile.gameRules.promotionRanks;

        return this.generateModelCoordinates(ranks);
    },

    getColumnModelData: function(gamefile) {
        const columns = gamefile.gameRules.promotionColumns;

        const modelCoordinates = this.generateModelCoordinates(columns);
        for(let i = 0; i < modelCoordinates; i += 6){
            // x, y, r,g,b,a
            modelCoordinates[i] += board.gsquareCenter();
            modelCoordinates[i+1] += board.gsquareCenter();

            // swapping [x,y]->[y,-x] for a 90 degree rotation
            const tmp = modelCoordinates[i];
            modelCoordinates[i] = modelCoordinates[i+1];
            modelCoordinates[i+1] = -tmp;

            modelCoordinates[i] -= board.gsquareCenter();
            modelCoordinates[i+1] -= board.gsquareCenter();
        }

        return modelCoordinates;
    }
};