
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
	allowVoid: { type: 'boolean', default: false, describe: 'Allow adding ": void" as a return type' },
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

	for (const sourceFile of sourceFiles) {
		let madeChanges = false;
		console.log(`Processing: ${sourceFile.getFilePath()}`);

		// [FIX] Find ALL function-like declarations, including class methods and getters
		const functions: FunctionLikeDeclaration[] = sourceFile.getDescendants().filter(
			(node): node is FunctionLikeDeclaration =>
				Node.isFunctionDeclaration(node) ||
            Node.isArrowFunction(node) ||
            Node.isFunctionExpression(node) ||
            Node.isMethodDeclaration(node) ||
            Node.isGetAccessorDeclaration(node)
		);

		for (const func of functions) {
			// Check if it already has a return type
			if (func.getReturnTypeNode()) {
				continue;
			}
			// Constructors don't have a return type annotation
			if (Node.isConstructorDeclaration(func)) {
				continue;
			}

			const inferredReturnType = func.getReturnType().getText(func);

			// [FIX] More robust safety check for 'any' or 'unknown' within the type
			if (/\bany\b|\bunknown\b/.test(inferredReturnType)) {
				console.warn(
					`  -> Skipping function at line ${func.getStartLineNumber()}: Inferred return type "${inferredReturnType}" contains 'any' or 'unknown'. Please fix manually.`
				);
				continue;
			}

			// [IMPROVEMENT] Optional check to avoid adding ': void' if not desired
			if (!argv.allowVoid && inferredReturnType === 'void') {
				console.log(
					`  -> Skipping function at line ${func.getStartLineNumber()}: Inferred return type is 'void' (use --allowVoid to add).`
				);
				continue;
			}

			console.log(
				`  -> Adding return type '${inferredReturnType}' to function at line ${func.getStartLineNumber()}`
			);
			func.setReturnType(inferredReturnType);
			madeChanges = true;
		}

		if (madeChanges && !argv.dryRun) {
			await sourceFile.save();
			console.log(`  -> Saved changes to ${sourceFile.getFilePath()}`);
		}
	}

	console.log('Codemod finished!');
}

main().catch(error => {
	console.error('An unexpected error occurred:', error);
	process.exit(1);
});