
// This script when called as a function using the new keyword, will return a new gamefile.

'use strict';

/**
 * Constructs a gamefile from provided arguments. Use the *new* keyword.
 * @param {Object} metadata - An object containing the property `Variant`, and optionally `UTCDate` and `UTCTime`, which can be used to extract the version of the variant. Without the date, the latest version will be used.
 * @param {Object} [options] - Options for constructing the gamefile.
 * @param {string[]} [options.moves=[]] - Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online game or pasting a game. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`.
 * @param {Object} [options.variantOptions] - If a custom position is needed, for instance, when pasting a game, then these options should be included.
 * @param {Object} [options.gameConclusion] - The conclusion of the game, if loading an online game that has already ended.
 * @param {Number} [options.drawOfferWhite] - The last move when white has made a draw offer
 * @param {Number} [options.drawOfferBlack] - The last move when black has made a draw offer
 * @returns {Object} The gamefile
 */
function gamefile(metadata, { moves = [], variantOptions, gameConclusion, drawOfferWhite, drawOfferBlack } = {}) {

    // Everything for JSDoc stuff...

    /** Information about the game */
    this.metadata = {
        Variant: undefined,
        White: undefined,
        Black: undefined,
        TimeControl: undefined,
        UTCDate: undefined,
        UTCTime: undefined,
        /** 1-0 = White won */
        Result: undefined,
        /** What caused the game to end, in spoken language. For example, "Time forfeit". This will always be the win condition that concluded the game. */
        Termination: undefined,
        /** What kind of game (rated/casual), and variant, in spoken language. For example, "Casual local Classical infinite chess game" */
        Event: undefined,
        /** What website hosted the game. "https://www.infinitechess.org/" */
        Site: undefined,
    }
    
    /** Information about the beginning of the game (position, positionString, specialRights, turn) */
    this.startSnapshot = {
        /** In key format 'x,y':'type' */
        position: undefined,
        positionString: undefined,
        specialRights: undefined,
        /** What square coords, if legal, enpassant capture is possible in the starting position of the game. */
        enpassant: undefined,
        /** The state of the move-rule at the start of the game (how many plies have passed since a capture or pawn push) */
        moveRuleState: undefined,
        /** This is the full-move number at the start of the game. Used for converting to ICN notation. */
        fullMove: undefined,
        /** Whos turn it was at the beginning of the game. */
        turn: undefined,
        /** The count of pieces the game started with. */
        pieceCount: undefined,
        /** The bounding box surrounding the starting position, without padding.
         * @type {BoundingBox} */
        box: undefined,
        /** A set of all types of pieces that are in this game, without their color extension: `['pawns','queens']` */
        existingTypes: undefined,
        /** Possible sliding moves in this game, dependant on what pieces there are: `[[1,1],[1,0]]` @type {number[][]}*/
        slidingPossible: undefined
    }
    
    this.gameRules = {
        winConditions: undefined,
        promotionRanks: undefined,
        promotionsAllowed: {
            /** An array of types white can promote to, with the W/B removed from the end: `['queens','rooks']` @type {Array} */
            white: undefined,
            /** An array of types black can promote to, with the W/B removed from the end: `['queens','rooks']` @type {Array} */
            black: undefined,
        },
        slideLimit: undefined,
        /** How many plies (half-moves) may pass until a draw is automatically pronounced! */
        moveRule: undefined
    }

    /** Pieces organized by type: `{ queensW:[[1,2],[2,3]] }` */
    this.ourPieces = undefined;
    /** Pieces organized by key: `{ '1,2':'queensW', '2,3':'queensW' }` */
    this.piecesOrganizedByKey = undefined;
    /** Pieces organized by lines: `{ '1,0' { 2:[{type:'queensW',coords:[1,2]}] } }` */
    this.piecesOrganizedByLines = undefined;

    /** The object that contains the buffer model to render the pieces */
    this.mesh = {
        /** A Float64Array for retaining higher precision arithmetic, but these values
         * need to be transferred into `data32` before contructing/updating the model. */
        data64: undefined,
        /** The Float32Array of vertex data that goes into the contruction of the model. */
        data32: undefined,
        /** A Float64Array for retaining higher precision of the pieces, rotated 180°, but these values
         * need to be transferred into `data32` before contructing/updating the model. */
        rotatedData64: undefined,
        /** The Float32Array of vertex data, that goes into the contruction of the model, rotated 180°. */
        rotatedData32: undefined,
        /** The buffer model of the pieces (excluding voids).
         * @type {BufferModel} */
        model: undefined,
        /** The buffer model of the pieces, rotated 180°.
         * @type {BufferModel} */
        rotatedModel: undefined,
        /** *true* if the model is using the coloredTextureProgram instead of the textureProgram. */
        usingColoredTextures: undefined,
        /** The stride-length of the vertex data within the Float32Array making up the model.
         * This is effected by how many floats each point uses for position, texture coords, and color. */
        stride: undefined,
        /** The amount the mesh data has been linearly shifted to make it closer to the origin, in coordinates `[x,y]`.
         * This helps require less severe uniform translations upon rendering when traveling massive distances.
         * The amount it is shifted depends on the nearest `regenRange`. */
        offset: undefined,
        /** A number for whether the mesh of the pieces is currently being generated.
         * @type {number} 0+. When > 0, is it generating. */
        isGenerating: 0,
        /** A number representing whether the mesh of the pieces is currently locked or not.
         * Don't perform actions that would otherwise modify the piece list,
         * such as rewinding/forwarding the game, moving a piece, etc..
         * It can lock when we are generating the mesh, or looking for legal moves.
         * @type {number} 0+. When > 0, the mesh is locked. */
        locked: 0,
        /** Call when unloading the game, as we don't need to finish the mesh generation, this immediately terminates it. */
        terminateIfGenerating: () => { if (this.mesh.isGenerating) this.mesh.terminate = true; },
        /** A flag the mesh generation reads to know whether to terminate or not.
         * Do ***NOT*** set manually, call `terminateIfGenerating()` instead. */
        terminate: false
    }

    /** The object that contains the buffer model to render the voids */
    this.voidMesh = {
        /** High precision Float64Array for performing arithmetic. */
        data64: undefined,
        /** Low precision Float32Array for passing into gpu. */
        data32: undefined,
        /** The buffer model of the void squares. These are rendered separately
         * from the pieces because we can simplify the mesh greatly.
         * @type {BufferModel} */
        model: undefined,
    }

    /** Contains the movesets of every piece for this game. 
     * When this object's parameters are called as a function,
     * it returns that piece's moveset as an object.
     * Pawns NOT included. */
    this.pieceMovesets = undefined;
    /** Contains a list of square in the immediate vicinity with
     * the names of pieces that could capture you from the distance.
     * This is used for efficient calculating if a king move would put you in check.
     * In the format: `{ '1,2': ['knights', 'chancellors'], '1,0': ['guards', 'king']... }`
     * DOES NOT include pawn moves. */
    this.vicinity = undefined;
    /** Contains the methods for detecting legal special moves for this game. */
    this.specialDetects = undefined;
    /** Contains the methods for executing special moves for this game. */
    this.specialMoves = undefined;
    /** Contains the methods for undo'ing special moves for this game. */
    this.specialUndos = undefined;

    // JSDoc stuff over...

    // this.metadata = metadata; // Breaks the above JSDoc
    math.copyPropertiesToObject(metadata, this.metadata);

    // Init things related to the variant, and the startSnapshot of the position
    variant.setupVariant(this, metadata, variantOptions) // Initiates startSnapshot, gameRules, and pieceMovesets
    /** The number of half-moves played since the last capture or pawn push. */
    this.moveRuleState = this.gameRules.moveRule ? this.startSnapshot.moveRuleState : undefined;
    area.initStartingAreaBox(this);
    /** The move list. @type {Move[]} */
    this.moves = [];
    /** Index of the move we're currently viewing in the moves list. -1 means we're looking at the very beginning of the game. */
    this.moveIndex = -1;
    /** If enpassant is allowed at the front of the game, this defines the coordinates. */
    this.enpassant = math.deepCopyObject(this.startSnapshot.enpassant);
    /** An object containing the information if each individual piece has its special move rights. */
    this.specialRights = math.deepCopyObject(this.startSnapshot.specialRights);
    /** Whos turn it currently is at the FRONT of the game.
     * This is to be distinguished from the `turn` property in the startSnapshot,
     * which is whos turn it was at the *beginning* of the game. */
    this.whosTurn = this.startSnapshot.turn;
    /** If the currently-viewed move is in check, this will be a list of coordinates
     * of all the royal pieces in check: `[[5,1],[10,1]]`, otherwise *false*. @type {number[][]} */
    this.inCheck = undefined;
    /** List of maximum 2 pieces currently checking whoever's turn is next,
     * with their coords and slidingCheck property. ONLY USED with `checkmate` wincondition!!
     * Only used to calculate legal moves, and checkmate. */
    this.attackers = undefined;
    /** If 3-Check is enabled, this is a running count of checks given: `{ white: 0, black: 0 }` */
    this.checksGiven = undefined;
    /** Last draw offer move in plies */
    this.drawOfferWhite = 0;
    this.drawOfferBlack = 0;

    this.ourPieces = organizedlines.buildStateFromKeyList(this.startSnapshot.position)
    this.startSnapshot.pieceCount = gamefileutility.getPieceCountOfGame(this)
    
    organizedlines.initOrganizedPieceLists(this, { appendUndefineds: false });
    // movepiece.forwardToFront(this, { updateData: false }); // Fast-forward to the most-recently played move, or the front of the game.
    // gamefileutility.updateGameConclusion(this, { concludeGameIfOver: false });
    movepiece.makeAllMovesInGame(this, moves);
    /** The game's conclusion, if it is over. For example, `'white checkmate'`
     * Server's gameConclusion should overwrite preexisting gameConclusion. */
    this.gameConclusion = gameConclusion || this.gameConclusion;

    this.drawOfferWhite = drawOfferWhite || this.drawOfferWhite;
    this.drawOfferBlack = drawOfferBlack || this.drawOfferBlack;

    organizedlines.addMoreUndefineds(this, { regenModel: false })
};

