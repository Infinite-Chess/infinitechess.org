
// This script handles and stores the matrixes of our shader programs, which
// store the location of the camera, and contains data about our canvas and window.
// Note that our camera is going to be at a FIXED location no matter what our board
// location is or our scale is, the camera remains still while the board moves beneath us.

// viewMatrix  is the camera location and rotation.
// projMatrix  needed for perspective mode rendering (is even enabled in 2D view).
// worldMatrix  is custom for each rendered object, translating it how desired.

"use strict";

const camera = (function() {
    
    // This will NEVER change! The camera stays while the board position is what moves!
    // What CAN change is the rotation of the view matrix!
    const position = [0, 0, 12]; // [x, y, z]
    const position_devMode = [0, 0, 18];
    
    let fieldOfView = 90 * Math.PI / 180; // Converted to radians
    // The closer near & far limits are in terms of orders of magnitude, the more accurate
    // and less often things appear out of order. Should be within 5-6 magnitude orders.
    const zNear = 1;
    const zFar = 1500 * Math.SQRT2; // Default 1500. Has to atleast be  perspective.distToRenderBoard * sqrt(2)
        
    // Header = 40
    // Footer = 59.5
    const MARGIN_OF_HEADER_AND_FOOTER = 40; // UPDATE with the html document  ---  !!! This is the sum of the heights of the page's navigation bar and footer.
    // How many physical pixels per virtual pixel on the device screen? For retina displays this is usually 2 or 3.
    const pixelDensity = window.devicePixelRatio
    let PIXEL_HEIGHT_OF_TOP_NAV = undefined // In virtual pixels
    let PIXEL_HEIGHT_OF_BOTTOM_NAV = undefined // In virtual pixels.

    let canvas = document.getElementById('game') // The element on the document WebGL renders onto
    let canvasWidthVirtualPixels;
    let canvasHeightVirtualPixels;
    let canvasRect; // accessed by mouse move listener in input script
    let aspect; // Aspect ratio of the canvas width to height.

    /**
     * The location in world-space of the edges of the screen.
     * Not affected by position or scale (zoom).
     * @type {BoundingBox}
     */
    let screenBoundingBox;
    /**
     * The location in world-space of the edges of the screen, when in developer mode.
     * Not affected by position or scale (zoom).
     * @type {BoundingBox}
     */
    let screenBoundingBox_devMode;

    /** Contains the matrix for transforming our camera to look like it's in perspective.
     * This ONLY needs to update on the gpu whenever the screen size changes. */
    let projectionMatrix; // Same for every shader program

    /** Contains the camera's position and rotation, updated once per frame on the gpu.
     * 
     * When compared to the world matrix, that uniform is updated with every draw call,
     * because it specifies the translation and rotation of the bound mesh. */
    let viewMatrix;

    // Returns devMode-sensitive camera position.
    function getPosition(ignoreDevmode) {
        return math.deepCopyObject(!ignoreDevmode && options.isDebugModeOn() ? position_devMode : position);
    }

    function getZFar() {
        return zFar;
    }

    /**
     * Returns the pixel density of the screen using window.devicePixelRatio.
     * 1 is non-retina, 2+ is retina.
     * @returns {number} The pixel density
     */
    function getPixelDensity() {
        return pixelDensity;
    }

    function getPIXEL_HEIGHT_OF_TOP_NAV() {
        return PIXEL_HEIGHT_OF_TOP_NAV;
    }

    function getPIXEL_HEIGHT_OF_BOTTOM_NAV() {
        return PIXEL_HEIGHT_OF_BOTTOM_NAV;
    }

    function getCanvasWidthVirtualPixels() {
        return canvasWidthVirtualPixels;
    }

    function getCanvasHeightVirtualPixels() {
        return canvasHeightVirtualPixels;
    }

    function getCanvasRect() {
        return math.deepCopyObject(canvasRect);
    }

    // Returns the bounding box of the screen in world-space, NOT tile/board space.

    /**
     * Returns a copy of the current screen bounding box,
     * or the world-space coordinates of the edges of the canvas.
     * @param {boolean} devMode - Whether or not developer mode is enabled.
     * @returns {BoundingBox} The bounding box of the screen
     */
    function getScreenBoundingBox(devMode) {
        return math.deepCopyObject(devMode ? screenBoundingBox_devMode : screenBoundingBox)
    }

    /**
     * Returns a copy of the current view matrix.
     * @returns {Float32Array} The view matrix
     */
    function getViewMatrix() {
        return math.copyFloat32Array(viewMatrix);
    }

    // Initiates the matrixes (uniforms) of our shader programs: viewMatrix (Camera), projMatrix (Projection), worldMatrix (world translation)
    function init() {
        initMatrixes()
        canvasRect = canvas.getBoundingClientRect()
    }

    // Inits the matrix uniforms: viewMatrix (camera) & projMatrix
    function initMatrixes() {
        
        projectionMatrix = mat4.create(); // Same for every shader program

        initPerspective() // Initiates perspective, including the projection matrix

        initViewMatrix() // Camera

        // World matrix only needs to be initiated when rendering objects
    }

    // Call this when window resized. Also updates the projection matrix.
    function initPerspective() {

        updateCanvasDimensions() // Also updates viewport

        initProjMatrix()
    }

    // Also updates viewport, and updates canvas-dependant variables
    function updateCanvasDimensions() {

        canvasWidthVirtualPixels = window.innerWidth
        canvasHeightVirtualPixels = (window.innerHeight - MARGIN_OF_HEADER_AND_FOOTER)

        // Size of entire window in physical pixels, not virtual. Retina displays have a greater width.
        canvas.width = canvasWidthVirtualPixels * pixelDensity; 
        canvas.height = canvasHeightVirtualPixels * pixelDensity;

        gl.viewport(0, 0, canvas.width, canvas.height)

        updatePIXEL_HEIGHT_OF_NAVS()

        recalcCanvasVariables() // Recalculate canvas-dependant variables
    }

    function updatePIXEL_HEIGHT_OF_NAVS() {
        PIXEL_HEIGHT_OF_TOP_NAV = !options.gnavigationVisible() ? 0
                                       : window.innerWidth > 700 ? 84  // Update with the css stylesheet!
                                       : window.innerWidth > 550 ? window.innerWidth * 0.12
                                       : window.innerWidth > 368 ? 66
                                                                 : window.innerWidth * 0.179;
        PIXEL_HEIGHT_OF_BOTTOM_NAV = !options.gnavigationVisible() ? 0 : 84;
        main.renderThisFrame();

        stats.updateStatsCSS()
    }
    
    function recalcCanvasVariables() {
        
        aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        initScreenBoundingBox();

        game.updateVariablesAfterScreenResize()
        miniimage.recalcWidthWorld();
    }

    // Set view matrix
    function setViewMatrix(newMatrix) {
        viewMatrix = newMatrix
        sendViewMatrixToGPU()
    }

    // Initiates the camera matrix. View matrix.
    function initViewMatrix(ignoreRotations) {
        const newViewMatrix = mat4.create()

        const cameraPos = getPosition(); // devMode-sensitive

        // Translates the view (camera) matrix to be looking at point..
        //             Camera,     Position, Looking-at, Up-direction
        mat4.lookAt(newViewMatrix, cameraPos, [0, 0, 0], [0, 1, 0]);

        if (!ignoreRotations) perspective.applyRotations(newViewMatrix)

        viewMatrix = newViewMatrix;

        sendViewMatrixToGPU()
    }

    /** Updates the view matrix uniform on the gpu for each of our shader programs. */
    function sendViewMatrixToGPU() {
        for (const programName in shaders.programs) { // Iterate over an object's properties
            /** @type {ShaderProgram} */
            const program = shaders.programs[programName];
            const viewMatrixLocation = program.uniformLocations.viewMatrix;
            if (viewMatrixLocation == null) continue; // This shader program doesn't have the viewMatrix uniform, skip.
            gl.useProgram(program.program)
            gl.uniformMatrix4fv(viewMatrixLocation, false, viewMatrix);
        }
    }

    /** Inits the projection matrix uniform and sends that over to the gpu for each of our shader programs. */
    function initProjMatrix() {
        mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
        // Send the projectionMatrix to the gpu
        for (const programName in shaders.programs) { // Iterate over an object's properties
            /** @type {ShaderProgram} */
            const program = shaders.programs[programName];
            const projMatrixLocation = program.uniformLocations.projectionMatrix;
            if (projMatrixLocation == null) continue; // This shader program doesn't have the projectionMatrix uniform, skip.
            gl.useProgram(program.program)
            gl.uniformMatrix4fv(projMatrixLocation, gl.FALSE, projectionMatrix);
        }
    }

    // Return the world-space x & y positions of the screen edges. Not affected by scale or board position.
    function initScreenBoundingBox() {

        // Camera dist
        let dist = position[2];
        // const dist = 7;
        const thetaY = fieldOfView / 2; // Radians

        // Length of missing side:
        // tan(theta) = x / dist
        // x = tan(theta) * dist
        let distToVertEdge = Math.tan(thetaY) * dist;
        let distToHorzEdge = distToVertEdge * aspect;

        screenBoundingBox = {
            left: -distToHorzEdge,
            right: distToHorzEdge,
            bottom: -distToVertEdge,
            top: distToVertEdge
        }

        // Now init the developer-mode screen bounding box

        dist = position_devMode[2];

        distToVertEdge = Math.tan(thetaY) * dist;
        distToHorzEdge = distToVertEdge * aspect;

        screenBoundingBox_devMode = {
            left: -distToHorzEdge,
            right: distToHorzEdge,
            bottom: -distToVertEdge,
            top: distToVertEdge
        }
    }

    function onScreenResize() {
        initPerspective() // The projection matrix needs to be recalculated every screen resize
        perspective.initCrosshairModel();
        main.renderThisFrame(); // Visual change. Render the screen this frame.
        // console.log('Resized window.')
    }

    // Call both when camera moves or rotates
    function onPositionChange() {
        initViewMatrix();
    }


    return Object.freeze({
        getPosition,
        getPixelDensity,
        getPIXEL_HEIGHT_OF_TOP_NAV,
        getPIXEL_HEIGHT_OF_BOTTOM_NAV,
        canvas,
        getCanvasWidthVirtualPixels,
        getCanvasHeightVirtualPixels,
        getCanvasRect,
        getScreenBoundingBox,
        getViewMatrix,
        init,
        updatePIXEL_HEIGHT_OF_NAVS,
        setViewMatrix,
        onScreenResize,
        onPositionChange,
        initViewMatrix,
        getZFar,
    })

})();