
const clockweb = (function() {

    const validClockValues = ['0','0.3+2','1+2','2+2','3+2','5+2','8+3','10+4','12+5','15+6','20+8','25+10','30+15','40+20']

    /**
     * Returns true if the provided clock value is valid.
     * If false, that means somebody is trying to hack when creating an illegal invite.
     * @param {string} clock - The clock value (e.g. "10+5").
     * @returns {boolean} *true* if it is valid.
     */
    function isClockValueValid(clock) { return validClockValues.includes(clock) }

    /**
     * Splits the clock from the form `10+5` into the `minutes` and `increment` properties.
     * If it is an untimed game (represented by `0`), then `minutes` will be 0, and `increment` will be undefined.
     * @param {string} clock - The string representing the clock value.
     * @returns {Object} An object with 2 properties: `minutes`, `increment`.
     */
    function getMinutesAndIncrementFromClock(clock) {
        const [ minutes, increment ] = clock.split('+').map(part => +part); // Convert them into a number
        return { minutes, increment };
    }

    /**
     * Returns true if the clock value is infinite. Internally, untimed games are represented with a "0".
     * @param {string} clock - The clock value (e.g. "10+5").
     * @returns {boolean} *true* if it's infinite.
     */
    function isClockValueInfinite(clock) { return clock === '0'; }

    return Object.freeze({
        isClockValueValid,
        getMinutesAndIncrementFromClock,
        isClockValueInfinite,
    })

})();

module.exports = clockweb;