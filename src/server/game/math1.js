
// This script contains many generalized mathematical operations, and javascript 
// object functions, we've created for the game and its variables

const math1 = (function(){

    /**
     * Deep copies an entire object, no matter how deep its nested.
     * No properties will contain references to the source object.
     * Use this instead of structuredClone() when that throws an error due to nested functions.
     * 
     * SLOW. Avoid using for very massive objects.
     * @param {Object | string | number | bigint | boolean} src - The source object
     * @returns {Object | string | number | bigint | boolean} The copied object
     */
    function deepCopyObject(src) {
        if (typeof src !== "object" || src === null) return src;
        
        let copy = Array.isArray(src) ? [] : {}; // Create an empty array or object
        
        for (let key in src) {
            const value = src[key];
            copy[key] = deepCopyObject(value); // Recursively copy each property
        }
        
        return copy; // Return the copied object
    }

    /**
     * Returns the opposite of the provided color.
     * @param {string} color - `white` or `black`
     * @returns {string} `white` or `black`
     */
    function getOppositeColor(color) {
        if (color === "white") return "black"
        else if (color === "black") return "white";
        else console.trace(`We should never get the opposite color of an invalid color ${color}!`)
    }

    function getNextColor4p(color){
        if(color === "white") return "green";
        if(color === "green") return "black";
        if(color === "black") return "blue";
        if(color === "blue") return "white";
        console.trace(`We should never get the next color of an invalid color ${color}!`)
    }

    function getPreviousColor4p(color){
        if(color === "green") return "white";
        if(color === "black") return "green";
        if(color === "blue") return "black";
        if(color === "white") return "blue";
        console.trace(`We should never get the previous color of an invalid color ${color}!`)
    }

    /**
     * Generates a random ID of the provided length, with the characters 0-9 and a-z.
     * @param {number} length - The length of the desired ID
     * @returns {string} The ID
     */
    function generateID(length) {
        let result           = '';
        const characters       = '0123456789abcdefghijklmnopqrstuvwxyz';
        const charactersLength = characters.length;
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.random() * charactersLength);
        }
        return result;
    }

    /**
     * Generates a **UNIQUE** ID of the provided length, with the characters 0-9 and a-z.
     * The provided object should contain the keys of the existing IDs.
     * @param {number} length - The length of the desired ID
     * @param {Object} object - The object that contains keys of the existing IDs.
     * @returns {string} The ID
     */
    function genUniqueID(length, object) { // object contains the key value list where the keys are the ids we want to not have duplicates of.
        let id;
        do {
            id = math1.generateID(length);
        } while (object[id] != null)
        return id;
    }

    /**
     * Generates a random numeric ID of the provided length, with the numbers 0-9.
     * @param {number} length - The length of the desired ID
     * @returns {number} The ID
     */
    function generateNumbID(length) {
        const zeroOne = Math.random();
        const multiplier = 10 ** length;
        return Math.floor(zeroOne * multiplier);
    }
    
    // Removes specified object from given array. Logs to the console if it fails. The object cannot be an object or array, only a single value.
    function removeObjectFromArray(array, object) { // object can't be an array
        const index = array.indexOf(object);
        if (index !== -1) array.splice(index, 1)
        else console.log(`Could not delete object from array, not found! Array: ${JSON.stringify(array)}. Object: ${object}`)
    }

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
     * Returns the date and time in UTC in the format `YYYY/MM/DD HH:MM:SS`.
     * If a timestamp is provided, it will be used; otherwise, the current date and time will be used.
     * Useful for recording the `Date` metadata of new games.
     * @param {number} [timestamp] - Optional. The timestamp in milliseconds. Defaults to the current time if not provided.
     * @returns {string} The date and time in the format `YYYY/MM/DD HH:MM:SS`.
     */
    function getUTCDateTime(timestamp) {
        const currentDate = timestamp ? new Date(timestamp) : new Date();
        
        const year = currentDate.getUTCFullYear();
        const month = ('0' + (currentDate.getUTCMonth() + 1)).slice(-2); // Adding 1 because months are zero-based
        const day = ('0' + currentDate.getUTCDate()).slice(-2);
        const hours = ('0' + currentDate.getUTCHours()).slice(-2);
        const minutes = ('0' + currentDate.getUTCMinutes()).slice(-2);
        const seconds = ('0' + currentDate.getUTCSeconds()).slice(-2);
        
        return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
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

    /**
     * Capitalizes the first letter of the string.
     * @param {string} str - Thes tring
     * @returns 
     */
    function capitalizeFirstLetter(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    /**
     * Converts a date and time string in the format `YYYY/MM/DD HH:MM:SS` to a UTC timestamp.
     * @param {string} dateTimeString - The date and time string.
     * @returns {number} The timestamp in milliseconds since the Unix epoch.
     */
    function getUTCTimestamp(dateTimeString) {
        const [datePart, timePart] = dateTimeString.split(' ');
        const [year, month, day] = datePart.split('/').map(num => parseInt(num, 10));
        const [hours, minutes, seconds] = timePart.split(':').map(num => parseInt(num, 10));
        
        // Constructing a Date object from the parts
        const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
        
        // Return the timestamp in milliseconds
        return date.getTime();
    }
    /**
     * Gets the current month in 'yyyy-mm' format.
     * @returns {string} The current month in 'yyyy-mm' format.
     */
    function getCurrentMonth() {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Add 1 because getMonth() returns 0-11
        return `${year}-${month}`;
    }

    /**
     * Gets the current day in 'yyyy-mm-dd' format.
     * @returns {string} The current day in 'yyyy-mm-dd' format.
     */
    function getCurrentDay() {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Returns the key string of the coordinates: [x,y] => 'x,y'
     * @param {number[]} coords - The coordinates
     * @returns {string} The key
     */
    // Receives coords, returns it's key to access it in game.getGamefile().piecesOrganizedByKey object.
    function getKeyFromCoords (coords) {
        return `${coords[0]},${coords[1]}`
    }

    /**
     * Returns a length-2 array of the provided coordinates
     * @param {string} key - 'x,y'
     * @return {number[]} The coordinates of the piece, [x,y]
     */
    function getCoordsFromKey(key) {
        // const coords = key.split(',');
        // return [parseInt(coords[0]), parseInt(coords[1])];

        // ChatGPT's method!
        return key.split(',').map(Number);
    }

    /**
     * Trims the W, B, or N from the end of the piece type. "pawnsW" => "pawns"
     * @param {string} type - The type of piece (eg "pawnsW").
     * @returns {string} The trimmed type.
     */
    function trimWorBFromType(type) {
        return type.slice(0, -1); // Returns a new string that starts from the first character (index 0) and excludes the last character (because of -1).
    }

    return Object.freeze({
        deepCopyObject,
        getOppositeColor,
        getPreviousColor4p,
        getNextColor4p,
        generateID,
        genUniqueID,
        generateNumbID,
        removeObjectFromArray,
        minutesToMillis,
        secondsToMillis,
        getTotalMilliseconds,
        getUTCDateTime,
        capitalizeFirstLetter,
        getUTCTimestamp,
        getCurrentMonth,
        getCurrentDay,
        getKeyFromCoords,
        getCoordsFromKey,
        trimWorBFromType
    })
})();

module.exports = math1;