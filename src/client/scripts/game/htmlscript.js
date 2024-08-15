
/*
 * The server injects this script directly into the html document
 * before serving that.
 * This is so we can execute code that needs to be executed preferrably
 * before the document fully loads (for example, the loading screen,
 * or pre-loading the sound spritesheet)
 * 
 * This is also what calls our main() function when the page fully loads.
 */

'use strict';

const htmlscript = (function() {
    
    // Listen for the first user gesture...

    // *true* if the user has started interacting with the page,
    // usually after a single mouse click. Some browsers prevent
    // audio playing until a user gesture, this helps us to
    // predict if our audio will be prevented from playing.
    let atleastOneUserGesture = false;
    let audioContextDefined = false;

    // This stuff needs to be AFTER decoding audio buffer for our audio context
    // because the 'load' event listener needs to be 2nd in line, not first.
    document.addEventListener('mousedown', callback_OnUserGesture)
    document.addEventListener('click', callback_OnUserGesture)
    function callback_OnUserGesture() {
        atleastOneUserGesture = true;
        document.removeEventListener('mousedown', callback_OnUserGesture)
        document.removeEventListener('click', callback_OnUserGesture)
        if (audioContextDefined) sound.getAudioContext().resume();
        else window.addEventListener('load', () => { // resume() the Audio Context as soon as the page loads
            if (loadingErrorOcurred) return; // Page never finished loading, don't reference sound script.
            sound.getAudioContext()?.resume();
        });
    }

    // Start loading the sound players before the rest of the scripts are loaded,
    // because we don't know how long that'll take!
    // We have use a fetch to retrieve the sound instead of a <sound> tag,
    // because otherwise we can't grab the buffer to duplicate the audio!
    (async function decodeAudioBuffer() {
        const pathToAllSoundsFile = '/sounds/soundspritesheet.mp3';

        const audioContext = new AudioContext();
        let audioDecodedBuffer;

        await fetch(pathToAllSoundsFile)
        .then(response => response.arrayBuffer())
        .then(async arrayBuffer => {
            // Process the array buffer...
            // Decode the audio buffer data
            await audioContext.decodeAudioData(arrayBuffer, function(decodedBuffer) {
                audioDecodedBuffer = decodedBuffer;
            });
        })
        .catch(error => {
            console.error(`An error ocurred during loading of sounds: ${error.message}`)
            callback_LoadingError();
        });

        // I don't want to miss calling this if the document is ready before this audio is finished loading
        if (document.readyState === 'complete') sendAudioContextToScript();
        else window.addEventListener('load', () => { // Send our audio context to our sound script.
            if (loadingErrorOcurred) return; // Page never finished loading, don't reference sound script.
            sound.initAudioContext(audioContext, audioDecodedBuffer)
            audioContextDefined = true;
        });
        function sendAudioContextToScript() {
            if (loadingErrorOcurred) return; // Page never finished loading, don't reference sound script.
            sound.initAudioContext(audioContext, audioDecodedBuffer)
            audioContextDefined = true;
        }
    })();
    
    function hasUserGesturedAtleastOnce() { return atleastOneUserGesture };

    // If there's an error in loading, stop the loading animation
    // ...

    let loadingErrorOcurred = false;
    let lostNetwork = false;

    function callback_LoadingError(event) {
        // const type = event.type; // Event type: "error"/"abort"
        // const target = event.target; // Element that triggered the event
        // const elementType = target?.tagName.toLowerCase();
        // const sourceURL = target?.src || target?.href; // URL of the resource that failed to load
        // console.error(`Event ${type} ocurred loading ${elementType} at ${sourceURL}.`);

        if (loadingErrorOcurred) return; // We only need to show the error text once
        loadingErrorOcurred = true;
        
        // Hide the "LOADING" text
        const element_loadingText = document.getElementById('loading-text');
        element_loadingText.classList.add('hidden'); // This applies a 'display: none' rule

        // Show the ERROR text
        const element_loadingError = document.getElementById('loading-error');
        const element_loadingErrorText = document.getElementById('loading-error-text');
        element_loadingError.classList.remove('hidden');
        element_loadingErrorText.textContent = lostNetwork ? translations["lost_network"] : translations["failed_to_load"];

        // Remove the glowing in the background animation
        const element_loadingGlow = document.getElementById('loading-glow');
        element_loadingGlow.classList.remove('loadingGlowAnimation');
        element_loadingGlow.classList.add('loading-glow-error');
    }

    // Removes the onerror event listener from the "this" object.
    function removeOnerror() {
        this.onerror = null;
    }

    // Add event listeners for when connection is dropped when loading

    (function initLoadingScreenListeners() {
        window.addEventListener('offline', callback_Offline);
        window.addEventListener('online', callback_Online);
    })();
    function closeLoadingScreenListeners() {
        window.removeEventListener('offline', callback_Offline);
        window.removeEventListener('online', callback_Online);
    }

    function callback_Offline() {
        console.log('Network connection lost');
        lostNetwork = true;
        callback_LoadingError();
    }
    function callback_Online() {
        console.log('Network connection regained');
        lostNetwork = false;
        if (loadingErrorOcurred) window.location.reload(); // Refresh the page
    }

    // When the document is loaded, start the game!

    window.addEventListener('load', function() {
        if (loadingErrorOcurred) return; // Page never finished loading, don't start the game.
        closeLoadingScreenListeners(); // Remove document event listeners for the loading screen
        main.start(); // Start the game!
    });

    return Object.freeze({
        callback_LoadingError,
        removeOnerror,
        hasUserGesturedAtleastOnce
    })

})();