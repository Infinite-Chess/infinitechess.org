
/**
 * This script contains utility methods for working with dates and timestamps.
 * 
 * ZERO dependancies.
 */
const timeutil = (function() {

    /**
     * Converts minutes to milliseconds
     * @param {number} minutes 
     * @returns {number} Milliseconds
     */
    function minutesToMillis(minutes) { return minutes * 60 * 1000; }

    /**
     * Converts seconds to milliseconds
     * @param {number} seconds 
     * @returns {number} Milliseconds
     */
    function secondsToMillis(seconds) { return seconds * 1000; }

    /**
     * Returns the current UTC date in the "YYYY.MM.DD" format.
     * @returns {string} The current UTC date.
     */
    function getCurrentUTCDate() {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        
        return `${year}.${month}.${day}`;
    }
    
    /**
     * Returns the current UTC time in the "HH:MM:SS" format.
     * @returns {string} The current UTC time.
     */
    function getCurrentUTCTime() {
        const now = new Date();
        const hours = String(now.getUTCHours()).padStart(2, '0');
        const minutes = String(now.getUTCMinutes()).padStart(2, '0');
        const seconds = String(now.getUTCSeconds()).padStart(2, '0');
        
        return `${hours}:${minutes}:${seconds}`;
    }

    /**
     * Converts a timestamp to an object with UTCDate and UTCTime.
     * @param {number} timestamp - The timestamp in milliseconds since the Unix Epoch.
     * @returns {Object} An object with the properties { UTCDate: "YYYY.MM.DD", UTCTime: "HH:MM:SS" }.
     */
    function convertTimestampToUTCDateUTCTime(timestamp) {
        const date = new Date(timestamp);
        
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        
        const UTCDate = `${year}.${month}.${day}`;
        const UTCTime = `${hours}:${minutes}:${seconds}`;
        
        return { UTCDate, UTCTime };
    }
    
    /**
     * Converts a UTCDate and optional UTCTime to a UTC timestamp in milliseconds since the Unix Epoch.
     * @param {string} UTCDate - The date in the format "YYYY.MM.DD".
     * @param {string} UTCTime - The time in the format "HH:MM:SS". Defaults to "00:00:00".
     * @returns {number} The UTC timestamp in milliseconds since the Unix Epoch.
     */
    function convertUTCDateUTCTimeToTimeStamp(UTCDate, UTCTime = "00:00:00") {
        const [year, month, day] = UTCDate.split('.').map(Number);
        const [hours, minutes, seconds] = UTCTime.split(':').map(Number);
    
        const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        return date.getTime();
    }

    /**
     * Calculates the total milliseconds based on the provided options.
     * @param {Object} options - An object containing time units and their values.
     * @param {number} [options.milliseconds=0] - The number of milliseconds.
     * @param {number} [options.seconds=0] - The number of seconds.
     * @param {number} [options.minutes=0] - The number of minutes.
     * @param {number} [options.hours=0] - The number of hours.
     * @param {number} [options.days=0] - The number of days.
     * @param {number} [options.weeks=0] - The number of weeks.
     * @param {number} [options.months=0] - The number of months.
     * @param {number} [options.years=0] - The number of years.
     * @returns {number} The total milliseconds calculated from the provided options.
     */
    function getTotalMilliseconds(options) {
        const millisecondsIn = {
            milliseconds: 1,
            seconds: 1000,
            minutes: 1000 * 60,
            hours: 1000 * 60 * 60,
            days: 1000 * 60 * 60 * 24,
            weeks: 1000 * 60 * 60 * 24 * 7,
            months: 1000 * 60 * 60 * 24 * 30, // Approximation, not precise
            years: 1000 * 60 * 60 * 24 * 365, // Approximation, not precise
        };
    
        let totalMilliseconds = 0;
    
        for (const option in options) {
            if (millisecondsIn[option]) totalMilliseconds += options[option] * millisecondsIn[option];
        }
    
        return totalMilliseconds;
    }

    return Object.freeze({
        minutesToMillis,
        secondsToMillis,
        getCurrentUTCDate,
        getCurrentUTCTime,
        convertTimestampToUTCDateUTCTime,
        convertUTCDateUTCTimeToTimeStamp,
        getTotalMilliseconds
    });
    
})();

export default timeutil;