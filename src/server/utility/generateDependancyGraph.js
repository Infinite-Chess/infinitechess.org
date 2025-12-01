/*
 * This script generates the dependency tree graph of the project.
 * To use it, enter the command:
 *
 * npm run generate-dependency-graph
 */

import madge from 'madge';

const pathOfFileToGenerateDependencyGraphFor = 'dist/server/server.js'; // Enable for the server-side code
// const pathOfFileToGenerateDependencyGraphFor = 'dist/client/scripts/esm/game/main.js'; // Enable for the client-side code
const nameToGiveDependencyGraph = 'dependencyGraph.svg';

madge(pathOfFileToGenerateDependencyGraphFor)
	.then((res) => res.image(nameToGiveDependencyGraph))
	.then((writtenImagePath) => {
		console.log('Dependency graph image written to ' + writtenImagePath);
	});
