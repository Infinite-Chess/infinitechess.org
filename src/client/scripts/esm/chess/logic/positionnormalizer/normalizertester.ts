
/**
 * ONLY FOR TESTING COMPRESSING POSITIONS
 */


// ================================ Testing Usage ================================

import icnconverter, { _Move_Compact } from "../icn/icnconverter";
import moveexpander from "./moveexpander";
import positioncompressor from "./positioncompressor";

// TEST CHATGPTS last 2 20 position pieces they gave me!!!!
const example_position = 'Q-1214,8032|R4939,1877|N6323,-2171|n-3601,-7208|B4522,209|q2312,-1722|r-6410,9360';
// const example_position = 'B-2227,-3463|b-6610,553|q-8440,1848|n-3601,-7208'; // BROKEN WHEN USING >= instead of > !!! When we skip pushing groups if net error gain is zero
// const example_position = 'B-2227,-3463|b-6210,553|q-8440,1848|n-3601,-7208'; // TEST THIS TOO
// const example_position = 'Q-9032,1442|B3841,-6672|R-7210,5142|q912,8475|B-6112,2033|R-1278,-9880|Q-4468,755'; // Infinity repetition triangle FORCED TO calculate group's error against all other pieces!
// const example_position = 'k0,0|R1200,800|R-1500,-600|R900,-1300|R-700,1100|R300,-1300|R2000,0|R900,2100|R0,2300|R-2200,-2200|R2000,-600|R8000,12000|R-15000,4000|R18000,-6000|R-13000,-16000|R10000,9000|R-9500,14500|R12000,-18000|R-8000,-12000|R19000,2100|R-20000,-600|R905,-1295|R1204,804|R-1504,-596|R295,-1304|R-705,1097'; // Orthogonal test
// const example_position = 'k0,0|Q10000,5000|R20000,1000|R20000,2000|R20000,3000|R20000,4000'; // Diagonal test
// const example_position = 'k0,0|Q-10000,5000|R-20000,1000|R-20000,2000|R-20000,3000|R-20000,4000'; // Diagonal test FLIPPED
// const example_position = 'K0,0|q834,1191|R-2240,6303|n4201,-889|b-1719,-8260|Q9329,-214'; // 5 random pieces
// const example_position = 'K0,0|q-120,125|R-30,60|r-30,90'; // INFINITE LOOP for the V relationship checks PATCHED
// const example_position = 'K0,0|q-120,120|R-30,60|r-30,90'; // Simpler version of above
// const example_position = 'K0,30|q30,0';

const parsedPosition = icnconverter.ShortToLong_Format(example_position);
// console.log("parsedPosition:", JSON.stringify(parsedPosition.position, jsutil.stringifyReplacer));

// const compressedPosition = positioncompressor.compressPosition(parsedPosition.position!, 'orthogonals');
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