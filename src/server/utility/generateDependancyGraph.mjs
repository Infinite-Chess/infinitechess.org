
import madge from 'madge';

const pathOfFileToGenerateDependancyGraphFor = 'src/server/server.mjs';
const nameToGiveDependancyGraph = 'dependancyGraph.svg';

madge(pathOfFileToGenerateDependancyGraphFor)
    .then((res) => res.image(nameToGiveDependancyGraph))
    .then((writtenImagePath) => {
        console.log('Dependancy graph image written to ' + writtenImagePath);
    });