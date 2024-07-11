
// This script handles the smooth animation when moving a piece from one coord to another
// Also plays our sounds!

"use strict";

const animation = (function() {

    const z = 0.01;

    const timeToPlaySoundEarly = 100;

    const maxDistB4Teleport = 80; // 80

    const animations = []; // { duration, startTime, type, startCoords, endCoords, captured, distIsGreater }

    /**
     * Animates a piece after moving it.   
     * @param {string} type - The type of piece to animate
     * @param {number[]} startCoords - [x,y]
     * @param {number[]} endCoords - [x,y]
     * @param {string} [captured] The type of piece captured, if one was captured.
     * @param {boolean} [resetAnimations] If false, allows animation of multiple pieces at once. Useful for castling. Default: true
     */
    function animatePiece(type, startCoords, endCoords, captured, resetAnimations = true) { // captured: { type, coords }
        if (resetAnimations) clearAnimations()

        // let dist = math.euclideanDistance(startCoords, endCoords); // Distance between start and end points of animation.
        let dist = math.chebyshevDistance(startCoords, endCoords); // Distance between start and end points of animation.
        const distIsGreater = dist > maxDistB4Teleport; // True if distance requires a teleport because it's so big
        const distToAnimate = distIsGreater ? maxDistB4Teleport : dist; // It will never VISUALLY travel over 80 blocks! Because it will teleport

        const newAnimation = {
            startTime: performance.now(),
            soundPlayed: false,
    
            type,
            startCoords,
            endCoords,
            captured,
    
            dist,
            distIsGreater,
    
            duration: 150 + distToAnimate * 6, // Default: 150 + dist * 6
        }

        // Set a timer when to play the sound
        const timeToPlaySound = newAnimation.duration - timeToPlaySoundEarly;
        newAnimation.soundTimeoutID = setTimeout(playAnimationsSound, timeToPlaySound, newAnimation)

        animations.push(newAnimation);
    }

    // All animations cleared (skipping through moves quickly),
    // make the sounds from the skipped ones quieter as well.
    function clearAnimations() {
        for (const animation of animations) {
            clearTimeout(animation.soundTimeoutID) // Don't play it twice..
            if (!animation.soundPlayed) playAnimationsSound(animation, true) // .. play it NOW.
        }
        animations.length = 0; // Empties existing animations
    }

    // For each animation, plays the sound if it's time, and deletes the animation if over.
    function update() {
        if (animations.length === 0) return;

        main.renderThisFrame();
        // main.enableForceRender()

        for (let i = animations.length - 1; i >= 0; i--) {
            const thisAnimation = animations[i];

            const passedTime = performance.now() - thisAnimation.startTime;

            if (passedTime > thisAnimation.duration) animations.splice(i, 1) // Delete this animation
        }
    }

    // Set dampen to true if we're skipping quickly through moves
    // and we don't want this sound to be so loud
    function playAnimationsSound(animation, dampen) {
        if (animation.captured) sound.playSound_capture(animation.dist, dampen)
        else                    sound.playSound_move(animation.dist, dampen)

        animation.soundPlayed = true;
    }

    function renderTransparentSquares() {
        if (animations.length === 0) return;

        const transparentModel = genTransparentModel()
        // render.renderModel(transparentModel, undefined, undefined, "TRIANGLES");
        transparentModel.render();
    }

    function renderPieces() {
        if (animations.length === 0) return;

        const pieceModel = genPieceModel()
        // render.renderModel(pieceModel, undefined, undefined, "TRIANGLES", pieces.getSpritesheet());
        pieceModel.render();
    }

    /**
     * Generates the model of a completely transparent square.
     * This is used to render-over, or block the normal rendering
     * of the piece in animation until the animation is over.
     * Otherwise there would be 2 copies of it, one in animation and one at its destination.
     * @returns {BufferModel} The buffer model
     */
    function genTransparentModel() {
        const data = [];

        const color = [0, 0, 0, 0];
        for (const thisAnimation of animations) {
            data.push(...getDataOfSquare3D(thisAnimation.endCoords, color))
        }

        // return buffermodel.createModel_Color3D(new Float32Array(data))
        return buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES")
    }

    // This can be merged with the functions within buferdata module
    function getDataOfSquare3D(coords, color) {
        
        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();
        const startX = (coords[0] - boardPos[0] - board.gsquareCenter()) * boardScale;
        const startY = (coords[1] - boardPos[1] - board.gsquareCenter()) * boardScale;
        const endX = startX + 1 * boardScale;
        const endY = startY + 1 * boardScale;

        const [ r, g, b, a ] = color;

        return [
        //      Vertex              Color
            startX, startY, z,       r, g, b, a,
            startX, endY, z,         r, g, b, a,
            endX, startY, z,         r, g, b, a,

            endX, startY, z,         r, g, b, a,
            startX, endY, z,         r, g, b, a,
            endX, endY, z,           r, g, b, a
        ]
    }

    /**
     * Generates the buffer model of the pieces currently being animated.
     * @returns {BufferModel} The buffer model
     */
    function genPieceModel() {

        const data = []

        for (const thisAnimation of animations) {

            const passedTime = performance.now() - thisAnimation.startTime;
            const equaX = passedTime / thisAnimation.duration;
            const equaY = -0.5 * Math.cos(equaX * Math.PI) + 0.5;
    
            let diffX = thisAnimation.endCoords[0] - thisAnimation.startCoords[0]
            let diffY = thisAnimation.endCoords[1] - thisAnimation.startCoords[1]
    
            // const dist = Math.hypot(diffX, diffY)
            const dist = thisAnimation.dist;
    
            let newX;
            let newY;
    
            if (!thisAnimation.distIsGreater) {
                const addX = diffX * equaY;
                const addY = diffY * equaY;
    
                newX = thisAnimation.startCoords[0] + addX;
                newY = thisAnimation.startCoords[1] + addY;
    
            } else {
                // 1st half or 2nd half?
                const firstHalf = equaX < 0.5
                const neg = firstHalf ? 1 : -1;
                const actualEquaY = firstHalf ? equaY : 1 - equaY;
    
                const ratio = maxDistB4Teleport / dist
    
                diffX *= ratio;
                diffY *= ratio;
    
                const target = firstHalf ? thisAnimation.startCoords : thisAnimation.endCoords
    
                const addX = diffX * actualEquaY * neg;
                const addY = diffY * actualEquaY * neg;
    
                newX = target[0] + addX
                newY = target[1] + addY
            }
    
            const newCoords = [newX, newY]
    
            if (thisAnimation.captured) appendDataOfPiece3D(data, thisAnimation.captured.type, thisAnimation.captured.coords)
    
            appendDataOfPiece3D(data, thisAnimation.type, newCoords)
        }

        // return buffermodel.createModel_ColorTexture3D(new Float32Array(data))
        return buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", pieces.getSpritesheet())
    }
    
    function appendDataOfPiece3D(data, type, coords) {

        const rotation = perspective.getIsViewingBlackPerspective() ? -1 : 1;
        const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(type, rotation)

        const boardPos = movement.getBoardPos();
        const boardScale = movement.getBoardScale();
        const startX = (coords[0] - boardPos[0] - board.gsquareCenter()) * boardScale;
        const startY = (coords[1] - boardPos[1] - board.gsquareCenter()) * boardScale;
        const endX = startX + 1 * boardScale;
        const endY = startY + 1 * boardScale;

        const { r, g, b, a } = options.getColorOfType(type);

        const bufferData = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY, r, g, b, a)

        data.push(...bufferData)
    }

    return Object.freeze({
        animatePiece,
        update,
        renderTransparentSquares,
        renderPieces
    })
})();