
/**
 * This script stores our currently loaded game,
 * and holds our update and render methods.
 */

"use strict";

const game = (function(){

    /**
     * The currently loaded game. 
     * @type {gamefile}
     */
    let gamefile;

    /**
     * Returns the gamefile currently loaded
     * @returns {gamefile} The current gamefile
     */
    function getGamefile() {
        return gamefile;
    }

    function areInGame() {
        return gamefile != null;
    }

    // Initiates textures, buffer models for rendering, and the title screen.
    function init() {

        initTextures() // Load game textures

        guititle.open()

        board.recalcTileWidth_Pixels() // Without this, the first touch tile is NaN
    }

    // Initiates our textures, and our spritesheet data (where each piece's texture is located)
    function initTextures() {
        board.initTextures();
        pieces.initSpritesheet();
        pieces.initSpritesheetData()
    }

    function updateVariablesAfterScreenResize() {

        board.initDarkTilesModel();

        // Recalculate scale at which 1 tile = 1 pixel       world-space                physical pixels
        movement.setScale_When1TileIs1Pixel_Physical((camera.getScreenBoundingBox(false).right * 2) / camera.canvas.width);
        movement.setScale_When1TileIs1Pixel_Virtual(movement.getScale_When1TileIs1Pixel_Physical() * camera.getPixelDensity());
        // console.log(`Screen width: ${camera.getScreenBoundingBox(false).right * 2}. Canvas width: ${camera.canvas.width}`)
    }

    // Update the game every single frame
    function update() {
        if (input.isKeyDown('`')) options.toggleDeveloperMode();
        // if (input.isKeyDown('enter')) options.toggleChristmasTheme()
        if (input.isKeyDown('m')) options.toggleFPS();
        if (game.getGamefile()?.mesh.locked && input.isKeyDown('z')) main.sforceCalc(true);

        if (gui.getScreen().includes('title')) updateTitleScreen()
        else updateBoard() // Other screen, board is visible, update everything board related

        onlinegame.update();

        guinavigation.updateElement_Coords(); // Update the division on the screen displaying your current coordinates
    }

    // Called within update() when on title screen
    function updateTitleScreen() {
        movement.panBoard() // Animate background if not afk

        invites.update()
    }

    // Called within update() when we are in a game (not title screen)
    function updateBoard() {
        if (input.isKeyDown('1')) options.toggleEM() // EDIT MODE TOGGLE
        if (input.isKeyDown('escape')) guipause.toggle();
        if (input.isKeyDown('tab')) guipause.callback_TogglePointers();
        if (input.isKeyDown('r')) piecesmodel.regenModel(game.getGamefile(), options.getPieceRegenColorArgs(), true);
        if (input.isKeyDown('n')) options.toggleNavigationBar();
        if (input.isMouseDown_Right()) premove.clearPremoves();

        clock.update()
        miniimage.testIfToggled();
        animation.update()
        if (guipause.areWePaused() && !onlinegame.areInOnlineGame()) return;

        movement.recalcPosition()
        transition.update()
        board.recalcVariables() 
        movesscript.update()
        arrows.update()
        selection.update() // Test if a piece was clicked on or moved. Needs to be before updateNavControls()
        // We NEED THIS HERE as well as in gameLoop.render() so the game can detect mouse clicks
        // on the miniimages in perspective mode even when the screen isn't being rendered!
        miniimage.genModel()
        highlightline.genModel()
        movement.updateNavControls() // Navigation controls

        if (guipause.areWePaused()) return;

        movement.dragBoard() // Calculate new board position if it's being dragged. Needs to be after updateNavControls()
    } 

    function render() {
        
        board.render();
        renderEverythingInGame()
    }

    function renderEverythingInGame() {
        if (gui.getScreen().includes('title')) return;

        input.renderMouse();

        webgl.executeWithDepthFunc_ALWAYS(() => {
            highlights.render(); // Needs to be before and underneath the pieces
            highlightline.render();
        })
        
        animation.renderTransparentSquares();
        pieces.renderPiecesInGame(gamefile);
        animation.renderPieces();
        
        webgl.executeWithDepthFunc_ALWAYS(() => {
            promotionlines.render();
            selection.renderGhostPiece() // If not after pieces.renderPiecesInGame(), wont render on top of existing pieces
            arrows.renderThem()
            perspective.renderCrosshair()
        })
    }

    /**
     * Loads the provided gamefile onto the board.
     * Inits the promotion UI, mesh of all the pieces, and toggles miniimage rendering. (everything visual)
     * @param {gamefile} newGamefile - The gamefile
     */
    function loadGamefile(newGamefile) {
        if (gamefile) return console.error("Must unloadGame() before loading a new one!")

        gamefile = newGamefile;

        // Disable miniimages and arrows if there's over 50K pieces. They render too slow.
        if (newGamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate) {
            miniimage.disable();
            arrows.setMode(0); // Disables arrows
            wincondition.swapCheckmateForRoyalCapture(gamefile); // Checkmate alg too slow, use royalcapture instead!
        } else miniimage.enable();

        // If there are so many hippogonals so as to create issues with discovered attacks, let's use royal capture instead!
        if (organizedlines.areColinearSlidesPresentInGame(gamefile)) wincondition.swapCheckmateForRoyalCapture(gamefile);

        guipromotion.initUI(gamefile.gameRules.promotionsAllowed)

        // Regenerate the mesh of all the pieces.
        piecesmodel.regenModel(game.getGamefile(), options.getPieceRegenColorArgs())

        main.enableForceRender(); // Renders the screen EVEN in a local-pause
        guinavigation.update_MoveButtons();

        guigameinfo.updateWhosTurn(gamefile)
        // Immediately conclude the game if we loaded a game that's over already
        if (gamefile.gameConclusion) gamefileutility.concludeGame(gamefile, gamefile.gameConclusion);

        initListeners();
    }

    /** The canvas will no longer render the current game */
    function unloadGame() {
        // Terminate the mesh algorithm.
        gamefile.mesh.terminateIfGenerating()
        gamefile = undefined;

        selection.unselectPiece();
        transition.eraseTelHist();
        board.updateTheme(); // Resets the board color (the color changes when checkmate happens)
        closeListeners();
    }

    /** Called when a game is loaded, loads the event listeners for when we are in a game. */
    function initListeners() {
        document.addEventListener('copy', copypastegame.callbackCopy)
        document.addEventListener('paste', copypastegame.callbackPaste)
    }

    /** Called when a game is unloaded, closes the event listeners for being in a game. */
    function closeListeners() {
        document.removeEventListener('copy', copypastegame.callbackCopy)
        document.removeEventListener('paste', copypastegame.callbackPaste)
    }


    return Object.freeze({
        getGamefile,
        areInGame,
        init,
        updateVariablesAfterScreenResize,
        update,
        render,
        loadGamefile,
        unloadGame
    })

})();