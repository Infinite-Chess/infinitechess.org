
/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 */

// Import Start
import onlinegame from '../misc/onlinegame.js';
import localstorage from '../misc/localstorage.js';
import formatconverter from './formatconverter.js';
import game from './game.js';
import backcompatible from './backcompatible.js';
import gamefile from './gamefile.js';
import gamefileutility from './gamefileutility.js';
import statustext from '../gui/statustext.js';
import jsutil from '../misc/jsutil.js';
import docutil from '../misc/docutil.js';
import winconutil from '../misc/winconutil.js';
// Import End

"use strict";

/**
 * This script handles copying and pasting games
 */

/** Enable to only copy a single position without all the moves prior */
const copySinglePosition = false; 

/**
 * A list of metadata properties that are retained from the current game when pasting an external game.
 * These will overwrite the pasted game's metadata with the current game's metadata.
 */
const retainMetadataWhenPasting = ['White','Black','TimeControl','Event','Site','Round'];

/**
 * Copies the current game to the clipboard in ICN notation.
 * This callback is called when the "Copy Game" button is pressed.
 * @param {event} event - The event fired from the event listener
 */
function callbackCopy(event) {
    const gamefile = game.getGamefile();
    const Variant = gamefile.metadata.Variant;

    const primedGamefile = primeGamefileForCopying(gamefile);
    const largeGame = Variant === 'Omega_Squared' || Variant === 'Omega_Cubed' || Variant === 'Omega_Fourth';
    const specifyPosition = !largeGame;
    const shortformat = formatconverter.LongToShort_Format(primedGamefile, { compact_moves: 1, make_new_lines: false, specifyPosition });
        
    docutil.copyToClipboard(shortformat);
    statustext.showStatus(translations.copypaste.copied_game);
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

    const gameRulesCopy = jsutil.deepCopyObject(gamefile.gameRules);

    primedGamefile.metadata = gamefile.metadata;
    primedGamefile.metadata.Variant = translations[primedGamefile.metadata.Variant] || primedGamefile.metadata.Variant; // Convert the variant metadata code to spoken language if translation is available
    primedGamefile.enpassant = gamefile.startSnapshot.enpassant;
    if (gameRulesCopy.moveRule) primedGamefile.moveRule = `${gamefile.startSnapshot.moveRuleState}/${gameRulesCopy.moveRule}`; delete gameRulesCopy.moveRule;
    primedGamefile.fullMove = gamefile.startSnapshot.fullMove;
    primedGamefile.startingPosition = gamefile.startSnapshot.positionString;
    primedGamefile.moves = gamefile.moves;
    primedGamefile.gameRules = gameRulesCopy;

    if (copySinglePosition) {
        primedGamefile.startingPosition = gamefile.startSnapshot.position;
        primedGamefile.specialRights = gamefile.startSnapshot.specialRights;
        primedGamefile = formatconverter.GameToPosition(primedGamefile, Infinity);
    }

    return primedGamefile;
}

/**
 * Pastes the clipboard ICN to the current game.
 * This callback is called when the "Paste Game" button is pressed.
 * @param {event} event - The event fired from the event listener
 */
async function callbackPaste(event) {
    // Make sure we're not in a public match
    if (onlinegame.areInOnlineGame() && !onlinegame.getIsPrivate()) return statustext.showStatus(translations.copypaste.cannot_paste_in_public);

    // Make sure it's legal in a private match
    if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate() && game.getGamefile().moves.length > 0) return statustext.showStatus(translations.copypaste.cannot_paste_after_moves);

    // Do we have clipboard permission?
    let clipboard;
    try {
        clipboard = await navigator.clipboard.readText();
    } catch (error) {
        const message = translations.copypaste.clipboard_denied;
        return statustext.showStatus((message + "\n" + error), true);
    }

    // Convert clipboard text to object
    let longformat;
    try {
        longformat = JSON.parse(clipboard); // Gamefile is already primed for the constructor
    } catch (error) {
        try {
            longformat = formatconverter.ShortToLong_Format(clipboard, true, true);
        } catch (e) {
            console.error(e);
            statustext.showStatus(translations.copypaste.clipboard_invalid, true);
            return;
        }
    }

    longformat = backcompatible.getLongformatInNewNotation(longformat);

    if (!verifyLongformat(longformat)) return;

    console.log(longformat);
    
    pasteGame(longformat);
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

    if (!longformat.metadata) throw new Error("formatconvert must specify metadata when copying game.");
    if (!longformat.fullMove) throw new Error("formatconvert must specify fullMove when copying game.");
    if (!longformat.startingPosition && !longformat.metadata.Variant) { statustext.showStatus(translations.copypaste.game_needs_to_specify, true); return false; }
    if (longformat.startingPosition && !longformat.specialRights) throw new Error("formatconvert must specify specialRights when copying game, IF startingPosition is provided.");
    if (!longformat.gameRules) throw new Error("Pasted game doesn't specify gameRules! This is an error of the format converter, it should always return default gameRules if it's not specified in the pasted ICN.");
    if (!longformat.gameRules.winConditions) throw new Error("Pasted game doesn't specify winConditions! This is an error of the format converter, it should always return default win conditions if it's not specified in the pasted ICN.");
    if (!verifyWinConditions(longformat.gameRules.winConditions)) return false;
    if (longformat.gameRules.promotionRanks && !longformat.gameRules.promotionsAllowed) throw new Error("Pasted game specifies promotion lines, but no promotions allowed! This is an error of the format converter, it should always return default promotions if it's not specified in the pasted ICN.");
    if (!longformat.gameRules.turnOrder) throw new Error("Pasted game doesn't specify turn order! This is an error of the format converter, it should always return default turn order if it's not specified in the pasted ICN.");

    return true;
}

/** For now doesn't verify if the required royalty is present. */
function verifyWinConditions(winConditions) {
    for (let i = 0; i < winConditions.white.length; i++) {
        const winCondition = winConditions.white[i];
        if (winconutil.isWinConditionValid(winCondition)) continue;
        // Not valid
        statustext.showStatus(`${translations.copypaste.invalid_wincon_white} "${winCondition}".`, true);
        return false;
    }

    for (let i = 0; i < winConditions.black.length; i++) {
        const winCondition = winConditions.black[i];
        if (winconutil.isWinConditionValid(winCondition)) continue;
        // Not valid
        statustext.showStatus(`${translations.copypaste.invalid_wincon_black} "${winCondition}".`, true);
        return false;
    }

    return true;
}

/**
 * Loads a game from the provided game in longformat.
 * @param {Object} longformat - The game in longformat, or primed for copying. This is NOT the gamefile, we'll need to use the gamefile constructor.
 */
function pasteGame(longformat) { // game: { startingPosition (key-list), patterns, promotionRanks, moves, gameRules }
    console.log(translations.copypaste.pasting_game);

    /** longformat properties:
     * metadata
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
    });
    // Only keep the Date of the current game if the starting position of the pasted game isn't specified,
    // because loading the variant version relies on that.
    if (longformat.shortposition || longformat.startingPosition) {
        longformat.metadata.UTCDate = currentGameMetadata.UTCDate;
        longformat.metadata.UTCTime = currentGameMetadata.UTCTime;
    } else if (backcompatible.isDateMetadataInOldFormat(longformat.metadata.Date)) { // Import Date metadata from pasted game, converting it if it is in an old format.
        const { UTCDate, UTCTime } = backcompatible.convertDateMetdatatoUTCDateUTCTime(longformat.metadata.Date);
        longformat.metadata.UTCDate = UTCDate;
        longformat.metadata.UTCTime = UTCTime;
    }

    // If the variant has been translated, the variant metadata needs to be converted from language-specific to internal game code else keep it the same
    longformat.metadata.Variant = convertVariantFromSpokenLanguageToCode(longformat.metadata.Variant) || longformat.metadata.Variant;

    delete longformat.metadata.Clock;

    // Don't transfer the pasted game's Result and Condition metadata. For all we know,
    // the game could have ended by time, in which case we want to further analyse what could have happened.
    delete longformat.metadata.Result;
    delete longformat.metadata.Condition; // Old format
    delete longformat.metadata.Termination; // New format

    // The variant options passed into the variant loader needs to contain the following properties:
    // `fullMove`, `enpassant`, `moveRule`, `positionString`, `startingPosition`, `specialRights`, `gameRules`.
    const variantOptions = {
        fullMove: longformat.fullMove,
        enpassant: longformat.enpassant,
        moveRule: longformat.moveRule,
        positionString: longformat.shortposition,
        startingPosition: longformat.startingPosition,
        specialRights: longformat.specialRights,
        gameRules: longformat.gameRules
    };

    if (onlinegame.areInOnlineGame() && onlinegame.getIsPrivate()) {
        // Playing a custom private game! Save the pasted position in browser
        // storage so that we can remember it upon refreshing.
        const gameID = onlinegame.getGameID();
        localstorage.saveItem(gameID, variantOptions);
    }

    const newGamefile = new gamefile(longformat.metadata, { moves: longformat.moves, variantOptions });

    // What is the warning message if pasting in a private match?
    const privateMatchWarning = onlinegame.getIsPrivate() ? ` ${translations.copypaste.pasting_in_private}` : "";

    // Change win condition of there's too many pieces!
    let tooManyPieces = false;
    if (newGamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate) { // TOO MANY pieces!
        tooManyPieces = true;
        statustext.showStatus(`${translations.copypaste.piece_count} ${newGamefile.startSnapshot.pieceCount} ${translations.copypaste.exceeded} ${gamefileutility.pieceCountToDisableCheckmate}! ${translations.copypaste.changed_wincon}${privateMatchWarning}`, false, 1.5);

        // Make win condition from checkmate to royal capture
        const whiteHasCheckmate = newGamefile.gameRules.winConditions.white.includes('checkmate');
        const blackHasCheckmate = newGamefile.gameRules.winConditions.black.includes('checkmate');
        if (whiteHasCheckmate) {
            jsutil.removeObjectFromArray(newGamefile.gameRules.winConditions.white, 'checkmate', true);
            newGamefile.gameRules.winConditions.white.push('royalcapture');
        }
        if (blackHasCheckmate) {
            jsutil.removeObjectFromArray(newGamefile.gameRules.winConditions.black, 'checkmate', true);
            newGamefile.gameRules.winConditions.black.push('royalcapture');
        }
    }

    // Only print "Loaded game!" if we haven't already shown a different status message cause of too many pieces
    if (!tooManyPieces) {
        const message = `${translations.copypaste.loaded_from_clipboard}${privateMatchWarning}`;
        statustext.showStatus(message);
    }

    game.unloadGame();
    game.loadGamefile(newGamefile);

    console.log(translations.copypaste.loaded);
}

function convertVariantFromSpokenLanguageToCode(Variant) {
    // Iterate through all translations until we find one that matches this name
    for (const translationCode in translations) {
        if (translations[translationCode] === Variant) {
            return translationCode;
        }
    }
    // Else unknown variant, return undefined
}

/**
 * Returns true if all gamerules are valid values.
 * @param {Object} gameRules - The gamerules in question
 * @returns {boolean} *true* if the gamerules are valid
 */
function verifyGamerules(gameRules) {
    if (gameRules.slideLimit !== undefined && typeof gameRules.slideLimit !== 'number') {
        statustext.showStatus(`${translations.copypaste.slidelimit_not_number} "${gameRules.slideLimit}"`, true);
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
//     const oppositeColor = colorutil.getOppositeColor(color)

//     // Check to make sure there is zero royals
//     const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, typeutil.royals, color)
//     if (royalCount > 0) return displayError(`${color.toUpperCase()} does not need royalty for the win conditions ${oppositeColor} has!`);
    
//     return true;
// }

// // makes sure that the starting position is valid with checkmate! Exactly 1 jumping royal piece (not sliding)
// function verifyCheckmate(piecesOrganizedByType, color) {
//     const oppositeColor = colorutil.getOppositeColor(color)
    
//     // Check to make sure there is exactly 1 jumping royal! (not sliding)
//     const jumpingRoyalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, typeutil.jumpingRoyals, oppositeColor)
//     if (jumpingRoyalCount !== 1) return displayError(`When ${color.toUpperCase()} has a win condition of 'checkmate', ${oppositeColor.toUpperCase()} should have exactly 1 king or royal centuar! Counted: ${jumpingRoyalCount}`)

//     // Also make sure there are no royal queens! We can't calculate checkmate with sliding pieces.
//     const royalQueenCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, ['royalQueens'], oppositeColor)
//     if (royalQueenCount > 0) return displayError(`When ${color.toUpperCase()} has a win condition of 'checkmate', ${oppositeColor.toUpperCase()} should have zero royal queens! Counted: ${royalQueenCount}`)

//     return true;
// }

// function verifyRoyalcapture(piecesOrganizedByType, color) {
//     const oppositeColor = colorutil.getOppositeColor(color)

//     // Check to make sure there is atleast 1 royal!
//     const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, typeutil.royals, oppositeColor)
//     if (royalCount < 1) return displayError(`When ${color.toUpperCase()} has a win condition of 'royalcapture', ${oppositeColor.toUpperCase()} should have atleast 1 royal! Counted: ${royalCount}`)
    
//     return true;
// }

// function verifyAllroyalscaptured(piecesOrganizedByType, color) {
//     const oppositeColor = colorutil.getOppositeColor(color)

//     // Check to make sure there is atleast 1 royal!
//     const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, typeutil.royals, oppositeColor)
//     if (royalCount < 1) return displayError(`When ${color.toUpperCase()} has a win condition of 'allroyalscaptured', ${oppositeColor.toUpperCase()} should have exactly atleast 1 royal! Counted: ${royalCount}`)
    
//     return true;
// }

// function verifyAllpiecescaptured(piecesOrganizedByType, color) {
//     const oppositeColor = colorutil.getOppositeColor(color)

//     // Check to make sure there is atleast 1 piece!
//     const pieceCount = gamefileutility.getPieceCountOfColorFromPiecesByType(piecesOrganizedByType, oppositeColor)
//     if (pieceCount < 1) return displayError(`When ${color.toUpperCase()} has a win condition of 'allpiecescaptured', ${oppositeColor.toUpperCase()} should have atleast 1 piece!`)
    
//     return true;
// }

// function verifyThreecheck(piecesOrganizedByType, color) {
//     const oppositeColor = colorutil.getOppositeColor(color)

//     // Check to make sure there is atleast 1 royal!
//     const royalCount = gamefileutility.getCountOfTypesFromPiecesByType(piecesOrganizedByType, typeutil.royals, oppositeColor)
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

export default {
    callbackCopy,
    callbackPaste
};