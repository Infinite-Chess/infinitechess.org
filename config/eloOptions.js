/**
 * Returns options for Elo Calculation
 * @returns {Object} Elo calculation options
 */
function getEloCalculationOptions() {
    return {
        KFactor: 32,      // The K factor for calculations
        starting_elo: 1200 // Default elo for new accounts
    }
}

module.exports = getEloCalculationOptions();