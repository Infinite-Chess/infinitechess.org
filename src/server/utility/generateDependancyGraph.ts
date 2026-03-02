// src/server/utility/generateDependancyGraph.ts

/*
 * This script generates the dependency tree graph of the project.
 * To use it, enter the command:
 *
 * npm run generate-dependency-graph
 */

import madge, { MadgeInstance } from 'madge';

const pathOfFileToGenerateDependencyGraphFor: string = 'dist/server/server.js'; // Enable for the server-side code
// const pathOfFileToGenerateDependencyGraphFor = 'dist/client/scripts/esm/game/main.js'; // Enable for the client-side code
const nameToGiveDependencyGraph: string = 'dependencyGraph.svg';

madge(pathOfFileToGenerateDependencyGraphFor)
	.then((res: MadgeInstance) => res.image(nameToGiveDependencyGraph))
	.then((writtenImagePath: string) => {
		console.log('Dependency graph image written to ' + writtenImagePath);
	});
