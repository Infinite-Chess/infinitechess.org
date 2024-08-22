// Import Start
import { webgl } from './webgl.mjs'
import { input } from '../input.mjs'
import { perspective } from './perspective.mjs'
import { bufferdata } from './bufferdata.mjs'
import { main } from '../main.mjs'
import { transition } from './transition.mjs'
import { movement } from './movement.mjs'
import { options } from './options.mjs'
import { pieces } from './pieces.mjs'
import { statustext } from '../gui/statustext.mjs'
import { buffermodel } from './buffermodel.mjs'
import { game } from '../chess/game.mjs'
import { area } from './area.mjs'
import { math } from '../misc/math.mjs'
// Import End

// This script handles the rendering of the mini images of our pieces when we're zoomed out

"use strict";

const miniimage = (function() {

    const width = 36; // Default: 36. Width of ghost-pieces when zoomed out, in virtual pixels
    let widthWorld;
    const opacity = 0.6;

    let data = [];
    /** The buffer model of the mini piece images when zoomed out.
     * @type {BufferModel} */
    let model;

    let piecesClicked = [];

    let hovering = false; // true if currently hovering over piece

    let disabled = false; // Disabled when there's too many pieces


    function gwidthWorld() {
        return widthWorld;
    }

    // Call after screen resize
    function recalcWidthWorld() {
        // Convert width to world-space
        widthWorld = math.convertPixelsToWorldSpace_Virtual(width);
    }

    function gopacity() {
        return opacity;
    }

    function isHovering() {
        return hovering;
    }

    function isDisabled() {
        return disabled;
    }

    function enable() {
        disabled = false;
    }

    function disable() {
        disabled = true;
    }

    function testIfToggled() {
        if (!input.isKeyDown('p')) return;

        // Toggled
        
        disabled = !disabled;
        main.renderThisFrame();

        if (disabled) statustext.showStatus(translations["rendering"]["icon_rendering_off"]);
        else statustext.showStatus(translations["rendering"]["icon_rendering_on"]);
    }

    // Called within update section
    // This also detects if we click on a mini-image and if so, teleports us there.
    function genModel() {

        hovering = false;
        
        if (!movement.isScaleLess1Pixel_Virtual()) return; // Quit if we're not even zoomed out.
        if (disabled) return; // Too many pieces to render icons!

        // Every frame we'll need to regenerate the buffer model

        data = [];
        piecesClicked = [];

        if (widthWorld == null) console.error('widthWorld is not defined yet');

        // Iterate through all pieces
        // ...

        const halfWidth = widthWorld / 2;
        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();

        // While we're iterating, test to see if mouse is hovering over, if so, make opacity 100%
        // We know the board coordinates of the pieces.. what is the world-space coordinates of the mouse? input.getMouseWorldLocation()

        pieces.forEachPieceType(concatBufferData, { ignoreVoids: true });
        
        // Adds pieces of that type's buffer to the overall data
        function concatBufferData(pieceType) {
            const thesePieces = game.getGamefile().ourPieces[pieceType];

            if (!thesePieces) return; // Don't concat data if there are no pieces of this type

            const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
            const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(pieceType, rotation);

            const { r, g, b } = options.getColorOfType(pieceType);

            for (let i = 0; i < thesePieces.length; i++) {
                const thisPiece = thesePieces[i];

                // Piece is undefined, skip! We have undefineds so others can retain their index.
                if (!thisPiece) continue;

                const startX = (thisPiece[0] - boardPos[0]) * boardScale - halfWidth;
                const startY = (thisPiece[1] - boardPos[1]) * boardScale - halfWidth;
                const endX = startX + widthWorld;
                const endY = startY + widthWorld;

                let thisOpacity = opacity;

                // Are we hovering over? If so, opacity needs to be 100%
                // input.getTouchHelds()[0]?.
                const touchClicked = input.getTouchClicked();
                const mouseWorldLocation = touchClicked ? input.getTouchClickedWorld() : input.getMouseWorldLocation();
                const mouseWorldX = mouseWorldLocation[0];
                const mouseWorldY = mouseWorldLocation[1];

                if (mouseWorldX > startX && mouseWorldX < endX && mouseWorldY > startY && mouseWorldY < endY) {
                    thisOpacity = 1;
                    hovering = true;
                    // If we also clicked, then teleport!
                    if (input.isMouseDown_Left() || input.getTouchClicked()) {
                        // Add them to a list of pieces we're hovering over.
                        // If we click, we teleport to a location containing them all.
                        piecesClicked.push(thisPiece);
                    }
                }

                const newData = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, thisOpacity);

                data.push(...newData);
            }
        }

        const floatData = new Float32Array(data);
        // model = buffermodel.createModel_ColorTexture(data)
        model = buffermodel.createModel_ColorTextured(floatData, 2, "TRIANGLES", pieces.getSpritesheet());

        // Teleport to clicked pieces
        if (piecesClicked.length > 0) {
            const theArea = area.calculateFromCoordsList(piecesClicked);

            const endCoords = theArea.coords;
            const endScale = theArea.scale;
            // const endScale = 0.00000000000001;
            const tel = { endCoords, endScale };
            transition.teleport(tel);
            // Remove the mouseDown so that other navigation controls don't use it (like board-grabbing)
            if (!input.getTouchClicked()) input.removeMouseDown_Left();
        }
    }

    function render() {
        if (!movement.isScaleLess1Pixel_Virtual()) return;
        if (disabled) return;

        if (!model) genModel(); // LEAVE THIS HERE or mobile will crash when zooming out

        webgl.executeWithDepthFunc_ALWAYS(() => {
            // render.renderModel(model, undefined, undefined, "TRIANGLES", pieces.getSpritesheet())
            model.render();
        });
    }

    return Object.freeze({
        gwidthWorld,
        gopacity,
        isHovering,
        isDisabled,
        testIfToggled,
        genModel,
        render,
        enable,
        disable,
        recalcWidthWorld
    });

})();

export { miniimage };