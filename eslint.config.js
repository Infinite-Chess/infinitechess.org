const globals = require("globals");
const pluginJs = require("@eslint/js");

module.exports = [
  pluginJs.configs.recommended, // Overwrites "rules" below
  {
    rules: { // Overrides the preset defined by "pluginJs.configs.recommended" above
      'no-undef': 'error', // Undefined variables
      'no-unused-vars': 'warn', // Unused variables
    },
    languageOptions: {
      sourceType: "module", // Can also be "commonjs", but "import" and "export" statements will give an eslint error
      globals: {
        ...globals.node, // Defines "require" and "exports"
        ...globals.browser, // Defines all browser environment variables for the game code
        // ...globals.commonjs, // Not needed because "sourceType" is defined above
        // Game code scripts are considered public variables
        backcompatible: "readonly",
        checkdetection: "readonly",
        checkmate: "readonly",
        copypastegame: "readonly",
        formatconverter: "readonly",
        game: "readonly",
        gamefile: "readonly",
        gamefileutility: "readonly",
        insufficientmaterial: "readonly",
        legalmoves: "readonly",
        movepiece: "readonly",
        movesets: "readonly",
        movesscript: "readonly",
        organizedlines: "readonly",
        selection: "readonly",
        specialdetect: "readonly",
        specialmove: "readonly",
        specialundo: "readonly",
        variant: "readonly",
        variantomega: "readonly",
        wincondition: "readonly",
        gui: "readonly",
        guigameinfo: "readonly",
        guiguide: "readonly",
        guiloading: "readonly",
        guinavigation: "readonly",
        guipause: "readonly",
        guiplay: "readonly",
        guipromotion: "readonly",
        guititle: "readonly",
        guidrawoffer: "readonly",
        stats: "readonly",
        statustext: "readonly",
        style: "readonly",
        browsersupport: "readonly",
        clock: "readonly",
        invites: "readonly",
        loadbalancer: "readonly",
        localstorage: "readonly",
        math: "readonly",
        onlinegame: "readonly",
        sound: "readonly",
        animation: "readonly",
        area: "readonly",
        arrows: "readonly",
        board: "readonly",
        bufferdata: "readonly",
        buffermodel: "readonly",
        camera: "readonly",
        checkhighlight: "readonly",
        coin: "readonly",
        mat4: "readonly",
        highlightline: "readonly",
        highlights: "readonly",
        miniimage: "readonly",
        movement: "readonly",
        options: "readonly",
        perspective: "readonly",
        pieces: "readonly",
        piecesmodel: "readonly",
        promotionlines: "readonly",
        shaders: "readonly",
        texture: "readonly",
        transition: "readonly",
        voids: "readonly",
        webgl: "readonly",
        gl: "readonly",
        htmlscript: "readonly",
        input: "readonly",
        main: "readonly",
        websocket: "readonly",
        memberHeader: "readonly",
        drawoffers: "readonly",
        enginegame: "readonly",
        translations: "readonly", // Injected into the html through ejs
      }
    }
  }
];