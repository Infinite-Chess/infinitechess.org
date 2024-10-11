import globals from "globals";
import pluginJs from "@eslint/js";

export default [
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
			'indent': ['error', 'tab', { // All indentation must use tabs
				'SwitchCase': 1, // Enforce switch statements to have indentation (they don't by default)
				"ignoredNodes": ["ConditionalExpression", "ArrayExpression"] // Ignore conditional expressions "?" & ":" over multiple lines, AND array contents over multiple lines!
			}],
			"prefer-const": "error", // "let" variables that are never redeclared must be declared as "const"
			"no-var": "error", // Disallows declaring variables with "var", as they are function-scoped (not block), so hoisting is very confusing.
			"max-depth": ["warn", 4], // Maximum number of nested blocks allowed.
			"eqeqeq": ["error", "always"], // Disallows "!=" and "==" to remove type coercion bugs. Use "!==" and "===" instead.
			'dot-notation': 'error', // Forces dot notation `.` instead of bracket notation `[""]` wherever possible
			'no-empty': 'off',	// Disable the no-empty rule so blocks aren't entirely red just as we create them
			'no-prototype-builtins': 'off', // Allows Object.hasOwnProperty() to be used
			// "no-multi-spaces": "error", // Disallows multiple spaces that isn't indentation.
			// "max-lines": ["warn", 500] // Can choose to enable to place a cap on how big files can be, in lines.
			// "complexity": ["warn", { "max": 10 }] // Can choose to enable to cap the complexity, or number of independant paths, which can lead to methods.
		},
		languageOptions: {
			sourceType: "module", // Can also be "commonjs", but "import" and "export" statements will give an eslint error
			globals: {
				...globals.node, // Defines "require" and "exports"
				...globals.browser, // Defines all browser environment variables for the game code
				// Game code scripts are considered public variables
				// MOST OF THE GAME SCRIPTS are ESM scripts, importing their own definitions, so we don't need to list them below.
				translations: "readonly", // Injected into the html through ejs
				memberHeader: "readonly",
				htmlscript: "readonly",
			}
		}
	}
];
