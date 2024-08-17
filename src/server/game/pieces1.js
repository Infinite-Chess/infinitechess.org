

"use strict";

const pieces1 = (function() {

    /** A list of the royal pieces, without the color appended. */
    const royals = ['kings', 'royalQueens', 'royalCentaurs'];

    return Object.freeze({
        royals
    });

})();

module.exports = pieces1;