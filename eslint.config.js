// eslint.config.js

import globals from 'globals';
import pluginJs from '@eslint/js';
import pluginTypescript from '@typescript-eslint/eslint-plugin';
import parserTypescript from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default [
	pluginJs.configs.recommended,
	{
		ignores: ['.worktrees/**', 'dev-utils/**', 'dist/**', 'src/client/pkg/**', 'sandbox/**'],
	},
	{
		files: ['**/*.js', '**/*.ts'], // Apply the following rule overrides to both js and ts files...
		// plugins: { "@typescript-eslint": pluginTypescript }, // Define plugins as an object.  SUPPOSEDLY THIS IS NOT NEEDED??
		rules: {
			// Overrides the preset defined by "pluginJs.configs.recommended" above.
			// Formatting rules don't belong here — "eslintConfigPrettier" below turns
			// every one of them back off. Prettier owns formatting; see .prettierrc.
			'no-undef': 'error', // Undefined variables not allowed
			// Unused variables give a warning
			'no-unused-vars': [
				'warn',
				{
					args: 'all', // Flag ALL unused params, not just those after the last used one
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'no-unused-expressions': 'error', // Statements that compute a value and throw it away are dead code
			'no-eval': 'error', // Disallows use of `eval()`, as it can lead to security vulnerabilities and performance issues.
			'prefer-const': 'error', // "let" variables that are never redeclared must be declared as "const"
			'no-var': 'error', // Disallows declaring variables with "var", as they are function-scoped (not block), so hoisting is very confusing.
			// "max-depth": ["warn", 4], // Maximum number of nested blocks allowed.
			eqeqeq: ['error', 'always'], // Disallows "!=" and "==" to remove type coercion bugs. Use "!==" and "===" instead.
			'dot-notation': 'error', // Forces dot notation `.` instead of bracket notation `[""]` wherever possible
			'no-empty': 'off', // Disable the no-empty rule so blocks aren't entirely red just as we create them
			'no-prototype-builtins': 'off', // Allows Object.hasOwnProperty() to be used
			// "max-lines": ["warn", 500] // Can choose to enable to place a cap on how big files can be, in lines.
			// "complexity": ["warn", { "max": 10 }] // Can choose to enable to cap the complexity, or number of independant paths, which can lead to methods.
		},
		languageOptions: {
			parser: parserTypescript, // Use the TypeScript parser
			sourceType: 'module', // Can also be "commonjs", but "import" and "export" statements will give an eslint error
			globals: {
				...globals.node, // Defines "require" and "exports"
				NodeJS: 'readonly', // Manually add NodeJS namespace, BECAUSE FOR SOME REASON ESLINT DOESN'T KNOW IT
				...globals.browser, // Defines all browser environment variables for the game code
				// Game code scripts are considered public variables
				// MOST OF THE GAME SCRIPTS are ESM scripts, importing their own definitions, so we don't need to list them below.
				translations: 'readonly', // Injected into the html by Nunjucks templates
				header: 'readonly',
				htmlscript: 'readonly',
				EventListener: 'readonly',
			},
		},
	},
	{
		// TYPESCRIPT SETTINGS THAT OVERWRITE THE ABOVE
		files: ['**/*.ts'],
		// Required for us to use the @typescript-eslint/explicit-function-return-type rule below
		plugins: { '@typescript-eslint': pluginTypescript },
		rules: {
			'no-unused-vars': 'off', // Default rule causes false positives on Enums
			// Typescript-specific unused variable rule
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					args: 'all', // Flag ALL unused params, not just those after the last used one
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'no-redeclare': 'off', // Default rule flags overload signatures and declaration merging
			// Typescript-aware redeclaration rule
			'@typescript-eslint/no-redeclare': 'error',
			// Disables dot-notation, as bracket notation is required by TS compiler if the keys of an object are STRINGS
			'dot-notation': 'off',
			'no-undef': 'off', // Prevent ESLint from flagging TypeScript types as undefined
			// Enforces all functions to declare their return type
			'@typescript-eslint/explicit-function-return-type': [
				'error',
				{
					allowExpressions: true, // Adds arrow functions as exceptions, as their return types are usually inferred
				},
			],
		},
	},
	eslintConfigPrettier,
];
