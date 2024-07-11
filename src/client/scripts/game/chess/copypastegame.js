
/*
 * This script handles copying and pasting games
 */

"use strict";

const copypastegame = (function(){

    /**
     * A list of metadata properties that are retained when pasting a new game.
     * These will overwrite the pasted game's metadata with the current game's metadata.
     */
    const retainMetadataWhenPasting = ['White','Black','Clock','Rated']

    /**
     * Copies the current game to the clipboard in ICN notation.
     * This callback is called when the "Copy Game" button is pressed.
     * @param {event} event - The event fired from the event listener
     */
    function callbackCopy(event) {
        event = event || window.event;

        const gamefile = game.getGamefile();
        const Variant = gamefile.metadata.Variant;

        const primedGamefile = primeGamefileForCopying(gamefile);
        const largeGame = Variant === 'Omega^2' || Variant === 'Omega^3' || Variant === 'Omega^4';
        const specifyPosition = !largeGame;
        const shortformat = formatconverter.LongToShort_Format(primedGamefile, { compact_moves: 1, make_new_lines: false, specifyPosition });
          
        main.copyToClipboard(shortformat)
        statustext.showStatus('Copied game to clipboard!')
    }

    /**
     * Primes the provided gamefile to for the formatconverter to turn it into an ICN
     * @param {gamefile} gamefile - The gamefile
     * @returns {Object} The primed gamefile for converting into ICN format
     */
    function primeGamefileForCopying(gamefile) { // Compress the entire gamefile for copying
        let primedGamefile = {};
        /** What values do we need?
         * 
         * metadata
         * turn
         * enpassant
         * moveRule
         * fullMove
         * startingPosition (can pass in shortformat string instead)
         * specialRights
         * moves
         * gameRules
         */

        const gameRulesCopy = math.deepCopyObject(gamefile.gameRules);

        primedGamefile.metadata = gamefile.metadata;
        primedGamefile.turn = gamefile.startSnapshot.turn;
        primedGamefile.enpassant = gamefile.startSnapshot.enpassant;
        if (gameRulesCopy.moveRule) primedGamefile.moveRule = `${gamefile.startSnapshot.moveRuleState}/${gameRulesCopy.moveRule}`; delete gameRulesCopy.moveRule;
        primedGamefile.fullMove = gamefile.startSnapshot.fullMove;
        primedGamefile.startingPosition = gamefile.startSnapshot.positionString;
        primedGamefile.moves = gamefile.moves;
        primedGamefile.gameRules = gameRulesCopy;

        const copySinglePosition = false; // Enable to only copy a single position without all the moves
        if (copySinglePosition) {
            primedGamefile.startingPosition = gamefile.startSnapshot.position;
            primedGamefile.specialRights = gamefile.startSnapshot.specialRights;
            primedGamefile = formatconverter.GameToPosition(primedGamefile, Infinity)
        }

        return primedGamefile;
    }
    
    /**
     * Pastes the clipboard ICN to the current game.
     * This callback is called when the "Paste Game" button is pressed.
     * @param {event} event - The event fired from the event listener
     */
    async function callbackPaste(event) {
        event = event || window.event;

        // Make sure we're not in a public match
        if (onlinegame.areInOnlineGame() && !onlinegame.getIsPrivate()) return statustext.showStatus('Cannot paste game in a public match!')

        // Make sure it's legal in a private match
        if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && game.getGamefile().moves.length > 0) return statustext.showStatus('Cannot paste game after moves are made!')

        // Do we have clipboard permission?
        let clipboard;
        try {
            clipboard = await navigator.clipboard.readText()
        } catch (error) {
            const message = "Clipboard permission denied. This might be your browser."
            return statustext.showStatus((message + "\n" + error), true)
        }

        // Convert clipboard text to object
        let longformat;
        try {
            longformat = JSON.parse(clipboard); // Gamefile is already primed for the constructor
        } catch (error) {
            try {
                longformat = formatconverter.ShortToLong_Format(clipboard, true, true)
            } catch(e) {
                console.error(e);
                statustext.showStatus("Clipboard is not in valid ICN notation.", true)
                return;
            }
        }

        longformat = backcompatible.getLongformatInNewNotation(longformat);

        if (!verifyLongformat(longformat)) return;
        
        pasteGame(longformat)
    }

    /**
     * Makes sure longformat has all the correct properties before we cast it to a gamefile.
     * If it doesn't, it displays an error to the user the reason why, and returns false.
     * @param {Object} longformat - The gamefile spat out by the formatconverter
     * @returns {boolean} *false* if the longformat is invalid.
     */
    function verifyLongformat(longformat) {
        /** We need all of these properties:
         * metadata
         * turn
         * enpassant
         * moveRule
         * fullMove
         * startingPosition
         * specialRights
         * moves
         * gameRules
         */

        if (!longformat.metadata) longformat.metadata = {};
        if (!longformat.turn) longformat.turn = 'white';
        if (!longformat.fullMove) longformat.fullMove = 1;
        if (!longformat.startingPosition && !longformat.metadata.Variant) { statustext.showStatus("Game needs to specify either the 'Variant' metadata, or 'startingPosition' property.", true); return false; }
        if (longformat.startingPosition && !longformat.specialRights) longformat.specialRights = {};
        if (!longformat.gameRules) longformat.gameRules = variant.getBareMinimumGameRules();
        longformat.gameRules.winConditions = longformat.gameRules.winConditions || variant.getDefaultWinConditions();
        if (!verifyWinConditions(longformat.gameRules.winConditions)) return false;
        longformat.gameRules.promotionRanks = longformat.gameRules.promotionRanks || null
        longformat.gameRules.promotionsAllowed = longformat.gameRules.promotionsAllowed || { white: [], black: [] }

        return true;
    }

    /** For now doesn't verify if the required royalty is present. */
    function verifyWinConditions(winConditions) {
        for (let i = 0; i < winConditions.white.length; i++) {
            const winCondition = winConditions.white[i];
            if (wincondition.validWinConditions.includes(winCondition)) continue;
            // Not valid
            statustext.showStatus(`White has an invalid win condition "${winCondition}".`, true)
            return false;
        }

        for (let i = 0; i < winConditions.black.length; i++) {
            const winCondition = winConditions.black[i];
            if (wincondition.validWinConditions.includes(winCondition)) continue;
            // Not valid
            statustext.showStatus(`Black has an invalid win condition "${winCondition}".`, true)
            return false;
        }

        return true;
    }

    /**
     * Loads a game from the provided game in longformat.
     * @param {Object} longformat - The game in longformat, or primed for copying. This is NOT the gamefile, we'll need to use the gamefile constructor.
     */
    function pasteGame(longformat) { // game: { startingPosition (key-list), patterns, promotionRanks, moves, gameRules }
        console.log("Pasting game...")

        /** longformat properties:
         * metadata
         * turn
         * enpassant
         * moveRule
         * fullMove
         * shortposition
         * startingPosition
         * specialRights
         * moves
         * gameRules
         */

        if (!verifyGamerules(longformat.gameRules)) return; // If this is false, it will have already displayed the error

        // Create a new gamefile from the longformat...

        // Retain most of the existing metadata on the currently loaded gamefile
        const currentGameMetadata = game.getGamefile().metadata;
        retainMetadataWhenPasting.forEach((metadataName) => {
            longformat.metadata[metadataName] = currentGameMetadata[metadataName];
        })
        // Only transfer the Date of the pasted game if the starting position isn't specified,
        // because loading the variant version relies on that.
        if (longformat.shortposition || longformat.startingPosition) longformat.metadata.Date = currentGameMetadata.Date;

        // Don't transfer the pasted game's Result and Condition metadata. For all we know,
        // the game could have ended by time, in which case we want to further analyse what could have happened.
        delete longformat.metadata.Result;
        delete longformat.metadata.Condition;

        // The variant options passed into the variant loader needs to contain the following properties:
        // `turn`, `fullMove`, `enpassant`, `moveRule`, `positionString`, `startingPosition`, `specialRights`, `gameRules`.
        const variantOptions = {
            turn: longformat.turn,
            fullMove: longformat.fullMove,
            enpassant: longformat.enpassant,
            moveRule: longformat.moveRule,
            positionString: longformat.shortposition,
            startingPosition: longformat.startingPosition,
            specialRights: longformat.specialRights,
            gameRules: longformat.gameRules
        }

        if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) {
            // Playing a custom private game! Save the pasted position in browser
            // storage so that we can remember it upon refreshing.
            const gameID = onlinegame.getGameID();
            localstorage.saveItem(gameID, variantOptions)
        }

        const newGamefile = new gamefile(longformat.metadata, { moves: longformat.moves, variantOptions })

        // What is the warning message if pasting in a private match?
        const privateMatchWarning = onlinegame.getIsPrivate() ? ` Pasting a game in a private match will cause a desync if your opponent doesn't do the same!` : "";

        // Change win condition of there's too many pieces!
        let tooManyPieces = false;
        if (newGamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate) { // TOO MANY pieces!
            tooManyPieces = true;
            statustext.showStatus(`Piece count ${newGamefile.startSnapshot.pieceCount} exceeded ${gamefileutility.pieceCountToDisableCheckmate}! Changed checkmate win conditions to royalcapture, and toggled off icon rendering. Hit 'P' to re-enable (not recommended).${privateMatchWarning}`, false, 1.5)

            // Make win condition from checkmate to royal capture
            const whiteHasCheckmate = newGamefile.gameRules.winConditions.white.includes('checkmate');
            const blackHasCheckmate = newGamefile.gameRules.winConditions.black.includes('checkmate');
            if (whiteHasCheckmate) {
                math.removeObjectFromArray(newGamefile.gameRules.winConditions.white, 'checkmate', true);
                newGamefile.gameRules.winConditions.white.push('royalcapture');
            }
            if (blackHasCheckmate) {
                math.removeObjectFromArray(newGamefile.gameRules.winConditions.black, 'checkmate', true);
                newGamefile.gameRules.winConditions.black.push('royalcapture');
            }
        }

        // Only print "Loaded game!" if we haven't already shown a different status message cause of too many pieces
        if (!tooManyPieces) {
            const message = `Loaded game from clipboard!${privateMatchWarning}`
            statustext.showStatus(message)
        }

        game.unloadGame();
        game.loadGamefile(newGamefile);

        console.log("Loaded game!")
    }

    /**
     * Returns true if all gamerules are valid values.
     * @param {Object} gameRules - The gamerules in question
     * @returns {boolean} *true* if the gamerules are valid
     */
    function verifyGamerules(gameRules) {
        if (gameRules.slideLimit !== undefined && typeof gameRules.slideLimit !== 'number') {
            statustext.showStatus(`slideLimit gamerule must be a number. Received "${gameRules.slideLimit}"`, true)
            return false;
        }
        return true;
    }

    // Old methods for determining what win conditions are compatible with each other,
    // and for making sure you have the right royals, etc...
    // Currently, all win conditions have no piece restrictions

    // function verifyWinConditions(winConditions, piecesOrganizedByType) {
    //     if (!winConditions) {
    //         if (!verifyCheckmate(piecesOrganizedByType, 'white')) return false;
    //         if (!verifyCheckmate(piecesOrganizedByType, 'black')) return false;
    //         return true;
    //     }

    //     // {
    //     //     // The value can be 1 of 3 options:  both/white/black
    //     //     // LEFT UNDEFINED if neither!
    //     //     checkmate: 'both',
    //     //     royalcapture: undefined,
    //     //     allroyalscaptured: undefined,
    //     //     allpiecescaptured: undefined,
    //     //     threecheck: undefined,
    //     //     koth: undefined,
    //     // }

    //     // 1. There must be atleast 1 win condition specified for both colors
    //     if (winConditions.white.length === 0) return displayError(`WHITE must have atleast 1 win condition!`)
    //     if (winConditions.black.length === 0) return displayError(`BLACK must have atleast 1 win condition!`)

    //     // 2. The specified win conditions must be compatible with each other (checkmate not compatible with royalcapture)

    //     // There can only be one of these: checkmate, royalcapture, allroyalscaptured.

    //     let whiteRoyalWinconditions = 0;
    //     let blackRoyalWinconditions = 0;

    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'checkmate')) whiteRoyalWinconditions++;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'checkmate')) blackRoyalWinconditions++;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'royalcapture')) whiteRoyalWinconditions++;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'royalcapture')) blackRoyalWinconditions++;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'allroyalscaptured')) whiteRoyalWinconditions++;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'allroyalscaptured')) blackRoyalWinconditions++;

    //     if (whiteRoyalWinconditions > 1) return displayError(`WHITE must have no more than 1 of the following win conditions: checkmate, royalcapture, and allroyalscaptured. Counted: ${whiteRoyalWinconditions}`)
    //     if (blackRoyalWinconditions > 1) return displayError(`BLACK must have no more than 1 of the following win conditions: checkmate, royalcapture, and allroyalscaptured. Counted: ${blackRoyalWinconditions}`)

    //     // allpiecescaptured requires there be no checkmate/royalcapture/allroyalscaptured.

    //     const whiteHasAllpiecescaptured = wincondition.doesColorHaveWinCondition(winConditions, 'white', 'allpiecescaptured');
    //     const blackHasAllpiecescaptured = wincondition.doesColorHaveWinCondition(winConditions, 'black', 'allpiecescaptured');
    //     if (whiteHasAllpiecescaptured && whiteRoyalWinconditions > 0) return displayError(`WHITE must not have win condition 'allpiecescaptured' when they also have one of checkmate/royalcapture/allroyalscaptured!`)
    //     if (blackHasAllpiecescaptured && blackRoyalWinconditions > 0) return displayError(`BLACK must not have win condition 'allpiecescaptured' when they also have one of checkmate/royalcapture/allroyalscaptured!`)

    //     // threecheck requires there be one of checkmate/royalcapture/allroyalscaptured

    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'threecheck') && whiteRoyalWinconditions === 0) return displayError(`WHITE win condition of 'threecheck' must be paired with atleast 1 win condition of checkmate/royalcapture/allroyalscaptured!`)
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'threecheck') && blackRoyalWinconditions === 0) return displayError(`BLACK win condition of 'threecheck' must be paired with atleast 1 win condition of checkmate/royalcapture/allroyalscaptured!`)

    //     // koth, if your opponent can capture your king without winning, they don't have checkmate/royalcapture
    //     // requires there be one of:  checkmate/royalcapture/allroyalscaptured/allpiecescaptured,
    //     // because if your king is captured, you need a back-up win condition.

    //     const whiteHasCheckmate = wincondition.doesColorHaveWinCondition(winConditions, 'white', 'checkmate')
    //     const blackHasCheckmate = wincondition.doesColorHaveWinCondition(winConditions, 'black', 'checkmate')
    //     const whiteHasRoyalcapture = wincondition.doesColorHaveWinCondition(winConditions, 'white', 'royalcapture')
    //     const blackHasRoyalcapture = wincondition.doesColorHaveWinCondition(winConditions, 'black', 'royalcapture')
    //     const whiteHasKOTH = wincondition.doesColorHaveWinCondition(winConditions, 'white', 'koth')
    //     const blackHasKOTH = wincondition.doesColorHaveWinCondition(winConditions, 'black', 'koth')
    //     if (whiteHasKOTH && !blackHasCheckmate && !blackHasRoyalcapture && whiteRoyalWinconditions === 0 && !whiteHasAllpiecescaptured) return displayError(`WHITE with the win condition of 'koth' and black with neither checkmate/royalcapture, requires a backup win condition: checkmate/royalcapture/allroyalscaptured/allpiecescaptured!`)
    //     if (blackHasKOTH && !whiteHasCheckmate && !whiteHasRoyalcapture && blackRoyalWinconditions === 0 && !blackHasAllpiecescaptured) return displayError(`BLACK with the win condition of 'koth' and white with neither checkmate/royalcapture, requires a backup win condition: checkmate/royalcapture/allroyalscaptured/allpiecescaptured!`)
    
    //     // All win conditions specified are compatible...

    //     // For each active win condition, make sure the position has necessary royalty!
    //     // Also NOT too much royalty!

    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'checkmate')) if (!verifyCheckmate(piecesOrganizedByType, 'white')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'checkmate')) if (!verifyCheckmate(piecesOrganizedByType, 'black')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'royalcapture')) if (!verifyRoyalcapture(piecesOrganizedByType, 'white')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'royalcapture')) if (!verifyRoyalcapture(piecesOrganizedByType, 'black')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'allroyalscaptured')) if (!verifyAllroyalscaptured(piecesOrganizedByType, 'white')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'allroyalscaptured')) if (!verifyAllroyalscaptured(piecesOrganizedByType, 'black')) return false;
    //     if (blackRoyalWinconditions === 0 && !whiteHasKOTH) if (!verifyNoRoyals(piecesOrganizedByType, 'white')) return false;
    //     if (whiteRoyalWinconditions === 0 && !blackHasKOTH) if (!verifyNoRoyals(piecesOrganizedByType, 'black')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'allpiecescaptured')) if (!verifyAllpiecescaptured(piecesOrganizedByType, 'white')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'allpiecescaptured')) if (!verifyAllpiecescaptured(piecesOrganizedByType, 'black')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'threecheck')) if (!verifyThreecheck(piecesOrganizedByType, 'white')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'threecheck')) if (!verifyThreecheck(piecesOrganizedByType, 'black')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'white', 'koth')) if (!verifyKoth(piecesOrganizedByType, 'white')) return false;
    //     if (wincondition.doesColorHaveWinCondition(winConditions, 'black', 'koth')) if (!verifyKoth(piecesOrganizedByType, 'black')) return false;
    
    //     return true;
    // }

    // // Makes sure that with no royal win condition there are no royals of specified color
    // function verifyNoRoyals(piecesOrganizedByType, color) {
    //     const oppositeColor = math.getOppositeColor(color)

    //     // Check to make sure there is zero royals
    //     const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, pieces.royals, color)
    //     if (royalCount > 0) return displayError(`${color.toUpperCase()} does not need royalty for the win conditions ${oppositeColor} has!`);
        
    //     return true;
    // }

    // // makes sure that the starting position is valid with checkmate! Exactly 1 jumping royal piece (not sliding)
    // function verifyCheckmate(piecesOrganizedByType, color) {
    //     const oppositeColor = math.getOppositeColor(color)
        
    //     // Check to make sure there is exactly 1 jumping royal! (not sliding)
    //     const jumpingRoyalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, pieces.jumpingRoyals, oppositeColor)
    //     if (jumpingRoyalCount !== 1) return displayError(`When ${color.toUpperCase()} has a win condition of 'checkmate', ${oppositeColor.toUpperCase()} should have exactly 1 king or royal centuar! Counted: ${jumpingRoyalCount}`)

    //     // Also make sure there are no royal queens! We can't calculate checkmate with sliding pieces.
    //     const royalQueenCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, ['royalQueens'], oppositeColor)
    //     if (royalQueenCount > 0) return displayError(`When ${color.toUpperCase()} has a win condition of 'checkmate', ${oppositeColor.toUpperCase()} should have zero royal queens! Counted: ${royalQueenCount}`)

    //     return true;
    // }

    // function verifyRoyalcapture(piecesOrganizedByType, color) {
    //     const oppositeColor = math.getOppositeColor(color)

    //     // Check to make sure there is atleast 1 royal!
    //     const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, pieces.royals, oppositeColor)
    //     if (royalCount < 1) return displayError(`When ${color.toUpperCase()} has a win condition of 'royalcapture', ${oppositeColor.toUpperCase()} should have atleast 1 royal! Counted: ${royalCount}`)
        
    //     return true;
    // }

    // function verifyAllroyalscaptured(piecesOrganizedByType, color) {
    //     const oppositeColor = math.getOppositeColor(color)

    //     // Check to make sure there is atleast 1 royal!
    //     const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, pieces.royals, oppositeColor)
    //     if (royalCount < 1) return displayError(`When ${color.toUpperCase()} has a win condition of 'allroyalscaptured', ${oppositeColor.toUpperCase()} should have exactly atleast 1 royal! Counted: ${royalCount}`)
        
    //     return true;
    // }

    // function verifyAllpiecescaptured(piecesOrganizedByType, color) {
    //     const oppositeColor = math.getOppositeColor(color)

    //     // Check to make sure there is atleast 1 piece!
    //     const pieceCount = gamefileutility.getPieceCountOfColorFromPiecesByType(piecesOrganizedByType, oppositeColor)
    //     if (pieceCount < 1) return displayError(`When ${color.toUpperCase()} has a win condition of 'allpiecescaptured', ${oppositeColor.toUpperCase()} should have atleast 1 piece!`)
        
    //     return true;
    // }

    // function verifyThreecheck(piecesOrganizedByType, color) {
    //     const oppositeColor = math.getOppositeColor(color)

    //     // Check to make sure there is atleast 1 royal!
    //     const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, pieces.royals, oppositeColor)
    //     if (royalCount < 1) return displayError(`When ${color.toUpperCase()} has a win condition of 'threecheck', ${oppositeColor.toUpperCase()} should have exactly atleast 1 royal! Counted: ${royalCount}`)
        
    //     return true;
    // }

    // function verifyKoth(piecesOrganizedByType, color) {
    //     // Check to make sure there is atleast 1 king! (no other royals reaching the top of the hill counts)
    //     const kingCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, ['kings'], color)
    //     if (kingCount === 0) return displayError(`${color.toUpperCase()} with a win condition of 'koth' should have atleast 1 king! Royal queens and centaurs don't count.`)
        
    //     return true;
    // }

    // function displayError(message) {
    //     statustext.showStatus(message, true)
    // }


    return Object.freeze({
        callbackCopy,
        callbackPaste
    })

})();