
/**
 * ONLY FOR TESTING COMPRESSING POSITIONS
 */


// ================================ Testing Usage ================================

import icnconverter, { _Move_Compact } from "../icn/icnconverter";
import moveexpander from "./moveexpander";
import positioncompressor from "./positioncompressor";

const example_position = 'k0,0|R1200,800|R-1500,-600|R900,-1300|R-700,1100|R300,-1300|R2000,0|R900,2100|R0,2300|R-2200,-2200|R2000,-600|R8000,12000|R-15000,4000|R18000,-6000|R-13000,-16000|R10000,9000|R-9500,14500|R12000,-18000|R-8000,-12000|R19000,2100|R-20000,-600|R905,-1295|R1204,804|R-1504,-596|R295,-1304|R-705,1097'; // Orthogonal test
// const example_position = 'k0,0|Q10000,5000|R20000,1000|R20000,2000|R20000,3000|R20000,4000'; // Diagonal test
// const example_position = 'k0,0|Q3000,4000';
// const example_position = 'k0,0|Q40,1000';

const parsedPosition = icnconverter.ShortToLong_Format(example_position);
// console.log("parsedPosition:", JSON.stringify(parsedPosition.position, jsutil.stringifyReplacer));

const compressedPosition = positioncompressor.compressPosition(parsedPosition.position!, 'diagonals');

console.log("\nBefore:");
console.log(example_position);

const newICN = icnconverter.getShortFormPosition(compressedPosition.position, parsedPosition.state_global.specialRights!);
console.log("\nAfter:");
console.log(newICN);
console.log("\n");

// const chosenMove: _Move_Compact = {
// 	startCoords: [20n, 5n],
// 	endCoords: [0n, 1n],
// };

// const expandedMove = moveexpander.expandMove(compressedPosition.axisOrders, compressedPosition.pieceTransformations, chosenMove);

// console.log(`\nChosen move:   Start: (${String(chosenMove.startCoords)})   End: (${String(chosenMove.endCoords)})`);
// console.log(`Expanded move:   Start: (${String(expandedMove.startCoords)})   End: (${String(expandedMove.endCoords)})\n`);