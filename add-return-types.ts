
// add-return-types.ts
// @ts-nocheck

import { Project, Node, SyntaxKind, FunctionLikeDeclaration } from 'ts-morph';

// [IMPROVEMENT] Use a library for command-line arguments for flexibility
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv)).options({
	tsconfig: { type: 'string', default: 'tsconfig.json', describe: 'Path to tsconfig.json' },
	glob: { type: 'string', default: 'src/**/*.ts?(x)', describe: 'Glob pattern for source files' },
	dryRun: { type: 'boolean', default: false, describe: 'Run without saving changes' },
	allowVoid: { type: 'boolean', default: true, describe: 'Allow adding ": void" as a return type' },
}).argv;

async function main() {
	console.log(`Starting codemod...`);
	if (argv.dryRun) {
		console.log('*** DRY RUN MODE: No files will be changed. ***');
	}

	const project = new Project({
		// [IMPROVEMENT] Use path from CLI arguments
		tsConfigFilePath: argv.tsconfig,
	});

	// [IMPROVEMENT] Use glob from CLI arguments
	const sourceFiles = project.getSourceFiles(argv.glob);
	console.log(`Found ${sourceFiles.length} files to process...`);

	// [THE FINAL FIX] This loop structure is robust against modification errors.
	// It finds and fixes ONE function at a time, then rescans the file.
	for (const sourceFile of sourceFiles) {
		console.log(`Processing: ${sourceFile.getFilePath()}`);
		let madeChangesInFile = false;

		// Keep looping over the file as long as we are making changes
		while (true) {
			let changedInThisPass = false;
			
			// Get a FRESH list of all function-like declarations
			const functions = sourceFile.getDescendants().filter(
				(node): node is FunctionLikeDeclaration =>
					Node.isFunctionDeclaration(node) ||
					Node.isArrowFunction(node) ||
					Node.isFunctionExpression(node) ||
					Node.isMethodDeclaration(node) ||
					Node.isGetAccessorDeclaration(node)
			);

			for (const func of functions) {
				// Skip if it already has a return type or is a constructor
				if (func.getReturnTypeNode() || Node.isConstructorDeclaration(func)) {
					continue;
				}

				// --- ALL THE LOGIC FROM BEFORE GOES HERE ---
				const inferredReturnType = func.getReturnType().getText(func);

				if (/\bany\b|\bunknown\b/.test(inferredReturnType)) {
					console.warn(
						`  -> Skipping function at line ${func.getStartLineNumber()}: Inferred return type "${inferredReturnType}" contains 'any' or 'unknown'. Please fix manually.`
					);
					continue;
				}

				if (!argv.allowVoid && inferredReturnType === 'void') {
					console.log(
						`  -> Skipping function at line ${func.getStartLineNumber()}: Inferred return type is 'void' (use --allowVoid to add).`
					);
					continue;
				}

				const funcText = func.getText();
				if (Node.isArrowFunction(func) && func.getParameters().length === 1 && !funcText.trim().startsWith('(')) {
					console.log(`  -> Rebuilding arrow function at line ${func.getStartLineNumber()} with return type '${inferredReturnType}'`);
					const paramText = func.getParameters()[0].getText();
					const bodyText = func.getBody().getText();
					const newFuncText = `(${paramText}): ${inferredReturnType} => ${bodyText}`;
					func.replaceWithText(newFuncText);
				} else {
					console.log(
						`  -> Adding return type '${inferredReturnType}' to function at line ${func.getStartLineNumber()}`
					);
					func.setReturnType(inferredReturnType);
				}
				// --- END OF LOGIC BLOCK ---

				// If we made it here, we changed something.
				changedInThisPass = true;
				madeChangesInFile = true;
				break; // Exit the for-loop to start a new pass
			}

			// If we went through a whole pass without making changes, we're done with this file.
			if (!changedInThisPass) {
				break; // Exit the while-loop
			}
		}

		// Save the file only if changes were made
		if (madeChangesInFile && !argv.dryRun) {
			await sourceFile.save();
			console.log(`  -> Saved changes to ${sourceFile.getFilePath()}`);
		}
	}

	console.log('Codemod finished!');
}

main().catch(error => {
	console.error('An unexpected error occurred:');
	// This prints only the useful message, not the huge file dump.
	console.error(error.message);
	process.exit(1);
});