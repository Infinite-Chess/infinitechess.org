// This script keeps track of both players timer, updates them,
// and ends game if somebody loses on time.

"use strict";

const clock = (function() {

    const element_timerWhite = document.getElementById('timer-white');
    const element_timerBlack = document.getElementById('timer-black');
    const element_timerContainerWhite = document.getElementById('timer-container-white');
    const element_timerContainerBlack = document.getElementById('timer-container-black');

    /** True if the game is not timed. */
    let untimed;
    /** Contains information about the start time of the game. */
    const startTime = {
        /** The number of minutes both sides started with. */
        minutes: undefined,
        /** The number of miliseconds both sides started with. */
        millis: undefined,
        /** The increment used, in milliseconds. */
        increment: undefined,
    };

    /** The time each player has remaining, in milliseconds. */
    const currentTime = {
        white: undefined,
        black: undefined,
    };

    /** Which color's clock is currently running. This is usually the same as the gamefile's whosTurn property. */
    let colorTicking;
    /** The amount of time in millis the current player had at the beginning of their turn, in milliseconds. */
    let timeRemainAtTurnStart;
    /** The time at the beginning of the current player's turn, in milliseconds elapsed since the Unix epoch. */
    let timeAtTurnStart;
    let timeNextPlayerLosesAt;

    /** All variables related to the lowtime tick notification at 1 minute remaining. */
    const lowtimeNotif = {
        /** True if white's clock has reached 1 minute or less and the ticking sound effect has been played. */
        whiteNotified: false,
        /** True if black's clock has reached 1 minute or less and the ticking sound effect has been played. */
        blackNotified: false,
        /** The timer that, when ends, will play the lowtime ticking audio cue. */
        timeoutID: undefined,
        /** The amount of milliseconds before losing on time at which the lowtime tick notification will be played. */
        timeToStartFromEnd: 65615,
        /** The minimum start time required to give a lowtime notification at 1 minute remaining. */
        clockMinsRequiredToUse: 2,
    };

    /** All variables related to the 10s countdown when you're almost out of time. */
    const countdown = {
        drum: {
            timeoutID: undefined,
        },
        tick: {
            /**
             * The current sound object, if specified, that is playing our tick sound effects right before the 10s countdown.
             * This can be used to stop the sound from playing.
             */
            sound: undefined,
            timeoutID: undefined,
            timeToStartFromEnd: 15625,
            fadeInDuration: 300,
            fadeOutDuration: 100,
        },
        ticking: {
            /**
             * The current sound object, if specified, that is playing our ticking sound effects during the 10s countdown.
             * This can be used to stop the sound from playing.
             */
            sound: undefined,
            timeoutID: undefined,
            timeToStartFromEnd: 10380,
            fadeInDuration: 300,
            fadeOutDuration: 100,
        },
    };

    /**
     * Sets the clocks.
     * @param {string} clock - The clock value (e.g. "10+5").
     * @param {Object} [currentTimes] - An object containing the properties `timerWhite`, and `timerBlack` for the current time of the players. Often used if we re-joining an online game.
     */
    function set(clock, currentTimes) {
        const gamefile = game.getGamefile();
        if (!gamefile) return console.error("Game must be initialized before starting the clocks.");

        startTime.minutes = null;
        startTime.millis = null;
        startTime.increment = null;

        const clockPartsSplit = getMinutesAndIncrementFromClock(clock); // { minutes, increment }
        if (clockPartsSplit !== null) {
            startTime.minutes = clockPartsSplit.minutes;
            startTime.millis = math.minutesToMillis(startTime.minutes);
            startTime.increment = clockPartsSplit.increment;
        }

        untimed = isClockValueInfinite(clock);

        if (untimed) { // Hide clock elements
            style.hideElement(element_timerContainerWhite);
            style.hideElement(element_timerContainerBlack);
            return;
        } else { // Reveal clock elements
            style.revealElement(element_timerContainerWhite);
            style.revealElement(element_timerContainerBlack);
        }

        // Edit the closk if we're re-loading an online game
        if (currentTimes) edit(currentTimes.timerWhite, currentTimes.timerBlack, currentTimes.timeNextPlayerLosesAt);
        else { // No current time specified, start both players with the default.
            currentTime.white = startTime.millis;
            currentTime.black = startTime.millis;
        }

        updateTextContent();
    }

    /**
     * Called when receive updated clock info from the server.
     * @param {number} newTimeWhite - White's current time, in milliseconds.
     * @param {number} newTimeBlack - Black's current time, in milliseconds.
     * @param {number} timeNextPlayerLoses - The time at which the current player will lose on time if they don't move in time.
     */
    function edit(newTimeWhite, newTimeBlack, timeNextPlayerLoses) {   
        const gamefile = game.getGamefile();
        colorTicking = gamefile.whosTurn; // Update colorTicking because we don't call push() with this.

        currentTime.white = newTimeWhite;
        currentTime.black = newTimeBlack;
        timeNextPlayerLosesAt = timeNextPlayerLoses;
        const now = Date.now();
        timeAtTurnStart = now;

        if (timeNextPlayerLoses) {
            const nextPlayerTrueTime = timeNextPlayerLoses - now;
            currentTime[colorTicking] = nextPlayerTrueTime;
        }
        timeRemainAtTurnStart = colorTicking === 'white' ? currentTime.white : currentTime.black;

        updateTextContent();
        
        // Remove colored border
        if (colorTicking === 'white') removeBorder(element_timerBlack);
        else removeBorder(element_timerWhite);

        if (!movesscript.isGameResignable(gamefile) || gamefile.gameConclusion) return;
        rescheduleMinuteTick(); // Lowtime notif at 1 minute left
        rescheduleCountdown(); // Schedule 10s drum countdown
    }

    /**
     * Call after flipping whosTurn. Flips colorTicking in local games.
     */
    function push() {
        if (onlinegame.areInOnlineGame()) return; // Only the server can push clocks
        if (untimed) return;
        const gamefile = game.getGamefile();
        if (!movesscript.isGameResignable(gamefile)) return; // Don't push unless atleast 2 moves have been played

        // Add increment
        currentTime[colorTicking] += math.secondsToMillis(startTime.increment);
        // Flip colorTicking
        colorTicking = !colorTicking ? gamefile.startSnapshot.turn : math.getOppositeColor(colorTicking);

        timeRemainAtTurnStart = currentTime[colorTicking];
        timeAtTurnStart = Date.now();
        timeNextPlayerLosesAt = timeAtTurnStart + timeRemainAtTurnStart;

        rescheduleMinuteTick(); // Lowtime notif at 1 minute left
        rescheduleCountdown(); // Schedule 10s drum countdown

        // Remove colored border
        if (colorTicking === 'white') removeBorder(element_timerBlack);
        else removeBorder(element_timerWhite);
    }

    function stop() {
        timeRemainAtTurnStart = undefined;
        timeAtTurnStart = undefined;
        timeNextPlayerLosesAt = undefined;
        colorTicking = undefined;
        clearTimeout(lowtimeNotif.timeoutID);
        clearTimeout(countdown.ticking.timeoutID);
        clearTimeout(countdown.tick.timeoutID);
        clearTimeout(countdown.drum.timeoutID);
        countdown.ticking.sound?.fadeOut(countdown.ticking.fadeOutDuration);
        countdown.tick.sound?.fadeOut(countdown.tick.fadeOutDuration);
    }

    function reset() {
        stop();
        untimed = undefined;
        startTime.minutes = undefined;
        startTime.millis = undefined;
        startTime.increment = undefined;
        currentTime.white = undefined;
        currentTime.black = undefined;
        lowtimeNotif.whiteNotified = false;
        lowtimeNotif.blackNotified = false;
        countdown.drum.timeoutID = undefined;
        countdown.tick.sound = undefined;
        countdown.ticking.sound = undefined;
        countdown.tick.timeoutID = undefined;
        countdown.ticking.timeoutID = undefined;
        removeBorder(element_timerWhite);
        removeBorder(element_timerBlack);
    }

    function removeBorder(element) {
        element.style.outline = '';
    }

    /** Called every frame, updates values. */
    function update() {
        const gamefile = game.getGamefile();
        if (untimed || gamefile.gameConclusion || !movesscript.isGameResignable(gamefile) || timeAtTurnStart == null) return;

        // Update border color
        if (colorTicking === 'white') updateBorderColor(element_timerWhite, currentTime.white);
        else updateBorderColor(element_timerBlack, currentTime.black);

        // Update current values
        const timePassedSinceTurnStart = Date.now() - timeAtTurnStart;
        if (colorTicking === 'white') currentTime.white = Math.ceil(timeRemainAtTurnStart - timePassedSinceTurnStart);
        else currentTime.black = Math.ceil(timeRemainAtTurnStart - timePassedSinceTurnStart);

        updateTextContent();

        // Has either clock run out of time?
        if (onlinegame.areInOnlineGame()) return; // Don't conclude game by time if in an online game, only the server does that.
        if (currentTime.white <= 0) {
            gamefile.gameConclusion = 'black time';
            gamefileutility.concludeGame(game.getGamefile());
        } else if (currentTime.black <= 0) {
            gamefile.gameConclusion = 'white time';
            gamefileutility.concludeGame(game.getGamefile());
        }
    }

    /** Changes the border color gradually */
    function updateBorderColor(element, currentTimeRemain) {
        const percRemain = currentTimeRemain / (startTime.minutes * 60 * 1000);

        // Green => Yellow => Orange => Red
        const perc = 1 - percRemain;
        let r = 0, g = 0, b = 0;
        if (percRemain > 1 + 1 / 3) {
            g = 1;
            b = 1;
        } else if (percRemain > 1) {
            const localPerc = (percRemain - 1) * 3;
            g = 1;
            b = localPerc;
        } else if (perc < 0.5) { // Green => Yellow
            const localPerc = perc * 2;
            r = localPerc;
            g = 1;
        } else if (perc < 0.75) { // Yellow => Orange
            const localPerc = (perc - 0.5) * 4;
            r = 1;
            g = 1 - localPerc * 0.5;
        } else { // Orange => Red
            const localPerc = (perc - 0.75) * 4;
            r = 1;
            g = 0.5 - localPerc * 0.5;
        }

        element.style.outline = `3px solid rgb(${r * 255},${g * 255},${b * 255})`;
    }

    /** Updates the clocks' text content in the document. */
    function updateTextContent() {
        const whiteText = getTextContentFromTimeRemain(currentTime.white);
        const blackText = getTextContentFromTimeRemain(currentTime.black);
        element_timerWhite.textContent = whiteText;
        element_timerBlack.textContent = blackText;
    }

    function getTextContentFromTimeRemain(time) {
        let seconds = Math.ceil(time / 1000);
        let minutes = 0;
        while (seconds >= 60) {
            seconds -= 60;
            minutes++;
        }
        if (seconds < 0) seconds = 0;

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Returns the clock in a slightly more human-readable format: `10m+5s`
     * @param {string} key - The clock string: `600+5`, where the left is the start time in seconds, right is increment in seconds.
     * @returns {string}
     */
    function getClockFromKey(key) { // ssss+ss  converted to  15m+15s
        const minutesAndIncrement = getMinutesAndIncrementFromClock(key);
        if (minutesAndIncrement === null) return translations["no_clock"];
        return `${minutesAndIncrement.minutes}m+${minutesAndIncrement.increment}s`;
    }

    /**
     * Splits the clock from the form `10+5` into the `minutes` and `increment` properties.
     * If it is an untimed game (represented by `-`), then this will return null.
     * @param {string} clock - The string representing the clock value: `10+5`
     * @returns {Object} An object with 2 properties: `minutes`, `increment`, or `null` if the clock is infinite.
     */
    function getMinutesAndIncrementFromClock(clock) {
        if (isClockValueInfinite(clock)) return null;
        const [ seconds, increment ] = clock.split('+').map(part => +part); // Convert them into a number
        const minutes = seconds / 60;
        return { minutes, increment };
    }

    /**
     * Returns true if the clock value is infinite. Internally, untimed games are represented with a "-".
     * @param {string} clock - The clock value (e.g. "10+5").
     * @returns {boolean} *true* if it's infinite.
     */
    function isClockValueInfinite(clock) { return clock === '-'; }

    function printClocks() {
        console.log(`White time: ${currentTime.white}`);
        console.log(`Black time: ${currentTime.black}`);
        console.log(`timeRemainAtTurnStart: ${timeRemainAtTurnStart}`);
        console.log(`timeAtTurnStart: ${timeAtTurnStart}`);
    }

    // The lowtime notification...

    /** Reschedules the timer to play the ticking sound effect at 1 minute remaining. */
    function rescheduleMinuteTick() {
        if (startTime.minutes < lowtimeNotif.clockMinsRequiredToUse) return; // 1 minute lowtime notif is not used in bullet games.
        clearTimeout(lowtimeNotif.timeoutID);
        if (onlinegame.areInOnlineGame() && colorTicking !== onlinegame.getOurColor()) return; // Don't play the sound effect for our opponent.
        if (colorTicking === 'white' && lowtimeNotif.whiteNotified || colorTicking === 'black' && lowtimeNotif.blackNotified) return;
        const timeRemain = timeRemainAtTurnStart - lowtimeNotif.timeToStartFromEnd;
        lowtimeNotif.timeoutID = setTimeout(playMinuteTick, timeRemain);
    }

    function playMinuteTick() {
        sound.playSound_tick({ volume: 0.07 });
        if (colorTicking === 'white') lowtimeNotif.whiteNotified = true;
        else if (colorTicking === 'black') lowtimeNotif.blackNotified = true;
        else console.error("Cannot set white/lowtimeNotif.blackNotified when colorTicking is undefined");
    }

    // The 10s drum countdown...
    
    /** Reschedules the timer to play the 10-second countdown effect. */
    function rescheduleCountdown() {
        const now = Date.now();
        rescheduleDrum(now);
        rescheduleTicking(now);
        rescheduleTick(now);
    }

    function rescheduleDrum(now) {
        clearTimeout(countdown.drum.timeoutID);
        if (onlinegame.areInOnlineGame() && colorTicking !== onlinegame.getOurColor() || !timeNextPlayerLosesAt) return; // Don't play the sound effect for our opponent.
        const timeUntil10SecsRemain = timeNextPlayerLosesAt - now - 10000;
        let timeNextDrum = timeUntil10SecsRemain;
        let secsRemaining = 10;
        if (timeNextDrum < 0) {
            const addTimeNextDrum = -Math.floor(timeNextDrum / 1000) * 1000;
            timeNextDrum += addTimeNextDrum;
            secsRemaining -= addTimeNextDrum / 1000;
        }
        countdown.drum.timeoutID = setTimeout(playDrumAndQueueNext, timeNextDrum, secsRemaining);
    }

    function rescheduleTicking(now) {
        clearTimeout(countdown.ticking.timeoutID);
        countdown.ticking.sound?.fadeOut(countdown.ticking.fadeOutDuration);
        if (onlinegame.areInOnlineGame() && colorTicking !== onlinegame.getOurColor() || !timeNextPlayerLosesAt) return; // Don't play the sound effect for our opponent.
        if (timeAtTurnStart < 10000) return;
        const timeToStartTicking = timeNextPlayerLosesAt - countdown.ticking.timeToStartFromEnd;
        const timeRemain = timeToStartTicking - now;
        if (timeRemain > 0) countdown.ticking.timeoutID = setTimeout(playTickingEffect, timeRemain);
        else {
            const offset = -timeRemain;
            playTickingEffect(offset);
        }
    }

    // Tick sound effect right BEFORE 10 seconds is hit
    function rescheduleTick(now) {
        clearTimeout(countdown.tick.timeoutID);
        countdown.tick.sound?.fadeOut(countdown.tick.fadeOutDuration);
        if (onlinegame.areInOnlineGame() && colorTicking !== onlinegame.getOurColor() || !timeNextPlayerLosesAt) return; // Don't play the sound effect for our opponent.
        const timeToStartTick = timeNextPlayerLosesAt - countdown.tick.timeToStartFromEnd;
        const timeRemain = timeToStartTick - now;
        if (timeRemain > 0) countdown.tick.timeoutID = setTimeout(playTickEffect, timeRemain);
        else {
            const offset = -timeRemain;
            playTickEffect(offset);
        }
    }

    function playDrumAndQueueNext(secsRemaining) {
        if (!secsRemaining) return console.error("Cannot play drum without secsRemaining");
        sound.playSound_drum();

        const timeRemain = timeNextPlayerLosesAt - Date.now();
        if (timeRemain < 1500) return;

        // Schedule next drum...
        const newSecsRemaining = secsRemaining - 1;
        if (newSecsRemaining === 0) return; // Stop
        const timeUntilNextDrum = timeNextPlayerLosesAt - Date.now() - newSecsRemaining * 1000;
        countdown.drum.timeoutID = setTimeout(playDrumAndQueueNext, timeUntilNextDrum, newSecsRemaining);
    }

    function playTickingEffect(offset) {
        countdown.ticking.sound = sound.playSound_ticking({ fadeInDuration: countdown.ticking.fadeInDuration, offset });
    }

    function playTickEffect(offset) {
        countdown.tick.sound = sound.playSound_tick({ volume: 0.07, fadeInDuration: countdown.tick.fadeInDuration, offset });
    }

    /** Returns true if the current game is untimed (infinite clocks) */
    function isGameUntimed() {
        return untimed;
    }

    return Object.freeze({
        set,
        edit,
        stop,
        reset,
        update,
        push,
        getClockFromKey,
        isClockValueInfinite,
        printClocks,
        isGameUntimed,
    });

})();