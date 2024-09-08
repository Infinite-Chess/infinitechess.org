
import game from "../chess/game.js";
import InputListener from "../input2.js";
import options from "../rendering/options.js";
import loadbalancer from "./loadbalancer.js";

const gamecontroller = (function() {

    /** @type {InputListener} */
    let overlayInputListener;
    /** @type {InputListener} */
    let documentInputListener;

    function create() {
        overlayInputListener = new InputListener(document.getElementById('overlay'), { defaultContextMenu: true });
        documentInputListener = new InputListener(document, { defaultTab: true });
    }

    function update() {
        if (gamecontroller.isKeyDown('Backquote')) options.toggleDeveloperMode();
        if (gamecontroller.isKeyDown('KeyM')) options.toggleFPS();
        if (game.getGamefile()?.mesh.locked && gamecontroller.isKeyDown('KeyZ')) loadbalancer.setForceCalc(true);
        
    }

    function onFrameEnd() {
        overlayInputListener.onNewFrame();
        documentInputListener.onNewFrame();
    }

    function isKeyDown(keyName) {
        return documentInputListener.keyDowns.includes(keyName);
    }

    return Object.freeze({
        create,
        update,
        onFrameEnd,
        isKeyDown,
    });

})();

export default gamecontroller;