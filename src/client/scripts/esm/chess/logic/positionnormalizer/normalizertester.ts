
/**
 * ONLY FOR TESTING COMPRESSING POSITIONS
 */


// ================================ Testing Usage ================================

import icnconverter, { _Move_Compact } from "../icn/icnconverter";
import moveexpander from "./moveexpander";
import positioncompressor from "./positioncompressor";

const example_position = 'k5,5|R35,10';
// const example_position = 'k0,0|Q0,0|N2000,4000';
// const example_position = 'k0,0|Q0,0|N40,120';
// const example_position = 'K0,0|Q5000,10000|Q5000,7000';

const parsedPosition = icnconverter.ShortToLong_Format(example_position);
// console.log("parsedPosition:", JSON.stringify(parsedPosition.position, jsutil.stringifyReplacer));

const compressedPosition = positioncompressor.compressPosition(parsedPosition.position!);

console.log("\nBefore:");
console.log(example_position);

const newICN = icnconverter.getShortFormPosition(compressedPosition.position, parsedPosition.state_global.specialRights!);
console.log("\nAfter:");
console.log(newICN);
console.log("\n");

const chosenMove: _Move_Compact = {
	startCoords: [20n, 5n],
	endCoords: [0n, 1n],
};

const expandedMove = moveexpander.expandMove(compressedPosition.axisOrders, compressedPosition.pieceTransformations, chosenMove);

console.log(`\nChosen move:   Start: (${String(chosenMove.startCoords)})   End: (${String(chosenMove.endCoords)})`);
console.log(`Expanded move:   Start: (${String(expandedMove.startCoords)})   End: (${String(expandedMove.endCoords)})\n`);