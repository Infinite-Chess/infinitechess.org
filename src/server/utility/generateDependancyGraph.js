
/*
 * This script generates the dependancy tree graph of the project.
 * To use it, enter the command:
 * 
 * node src/server/utility/generateDependancyGraph.js
 */

import madge from 'madge';

// const pathOfFileToGenerateDependancyGraphFor = 'src/server/server.js'; // Enable for the server-side code
const pathOfFileToGenerateDependancyGraphFor = 'src/client/scripts/esm/game/main.js'; // Enable for the client-side code
const nameToGiveDependancyGraph = 'dependancyGraph.svg';

madge(pathOfFileToGenerateDependancyGraphFor)
	.then((res) => res.image(nameToGiveDependancyGraph))
	.then((writtenImagePath) => {
		console.log('Dependancy graph image written to ' + writtenImagePath);
	});