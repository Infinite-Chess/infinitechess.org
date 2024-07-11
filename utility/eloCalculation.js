function getRatingDelta(myRating, opponentRating, myGameResult, factor) {
    if ([0, 0.5, 1].indexOf(myGameResult) === -1) {
        return null;
    }

    var myChanceToWin = 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));

    return Math.round(factor * (myGameResult - myChanceToWin));
}

function getNewRating(myRating, opponentRating, myGameResult, factor) {
    return myRating + getRatingDelta(myRating, opponentRating, myGameResult, factor);
}

module.exports = {getRatingDelta, getNewRating}