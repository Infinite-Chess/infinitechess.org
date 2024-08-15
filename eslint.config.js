/* eslint-disable indent */
const globals = require("globals");
const pluginJs = require("@eslint/js");

module.exports = [
  pluginJs.configs.recommended,
  {
    rules: { // Overrides the preset defined by "pluginJs.configs.recommended" above
      'no-undef': 'error', // Undefined variables not allowed
      'no-unused-vars': 'warn', // Unused variables give a warning
      'semi': ['error', 'always'], // Enforces semicolons be present at the end of every line.
      'semi-spacing': ['error', { // Enforces semicolons have a space after them if they are proceeded by other statements.
        before: false,
        after: true,
      }],
      'keyword-spacing': ['error', { // Requires a space be after if, else, for, and while's.
        before: true,
        after: true,
      }],
      "space-before-function-paren": ["error", "never"], // Enforces there be NO space between function DECLARATIONS and ()
      "space-before-blocks": ["error", "always"], // Enforces there be a space between function parameters and the {} block
      "arrow-spacing": ["error", { "before": true, "after": true }], // Requires a space before and after "=>" in arrow functions
      "func-call-spacing": ["error", "never"], // Enforces there be NO space between function CALLS and ()
      "space-infix-ops": ["error", { "int32Hint": false }], // Enforces a space around infix operators, like "=" in assignments
      "no-eval": "error", // Disallows use of `eval()`, as it can lead to security vulnerabilities and performance issues.
      'indent': ['error', 4, { // 4 spaces per indentation
        'SwitchCase': 1 // Enforce switch statements to have indentation (they don't by default)
      }],
      "prefer-const": "error", // "let" variables that are never redeclared must be declared as "const"
      "no-var": "error", // Disallows delcaring variables with "var", as they are function-scoped (not block), so hoisting is very confusing.
      "max-depth": ["warn", 4], // Maximum number of nested blocks allowed.
      "no-multi-spaces": "error", // Disallows multiple spaces that isn't indentation.
      "eqeqeq": ["error", "always"], // Disallows "!=" and "==" to remove type coercion bugs. Use "!==" and "===" instead.
      // "max-lines": ["warn", 500] // Can choose to enable to place a cap on how big files can be, in lines.
      // "complexity": ["warn", { "max": 10 }] // Can choose to enable to cap the complexity, or number of independant paths, which can lead to methods.
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
        translations: "readonly", // Injected into the html through ejs
      }
    }
  }
];