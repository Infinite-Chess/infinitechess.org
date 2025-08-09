
/**
 * ONLY FOR TESTING COMPRESSING POSITIONS
 */


// ================================ Testing Usage ================================

import icnconverter, { _Move_Compact } from "../icn/icnconverter";
import moveexpander from "./moveexpander";
import positioncompressor from "./positioncompressor";


// 1000n: UNEXPECTED CASE Can't make valid push to close V-violation
// 500n-200n: INFINITE LOOP
// const example_position = 'Q-1214,8032|n-594,9261|R4939,1877|B-2227,-3463|b-6210,553|q-8440,1848|N6323,-2171|r8431,671|n-3601,-7208|B4522,209|R-8722,-9556|Q-4978,-100|b1854,-9810|N5564,4021|q2312,-1722|r-6410,9360|n2938,-831|B-7724,-2190|Q9019,3540|R-1125,-6378';

// const example_position = 'Q-120,850|n-125,858|B4200,-7320|b4207,-7313|R-7821,5110|r-7815,5118|q9012,-442|N-311,-9980|n-318,-9989|B7345,1442|b7336,1436|R-2599,-6288'; // Heart

// const example_position = 'R-42,118|b133,-55|N-210,305|q87,192|n-166,-211|B249,-315|Q-321,88|r-140,-388|B422,-76|n355,301|b-291,-422|Q315,94|R-388,255|q298,-154|N4200,-3900|r-5600,3188|B7120,-2981|n-8441,1210|b9822,-4033|Q-9331,6120'; // Julia set was always working. BROKEN AT 10 DISTANCE!!!

// const example_position = 'Q-1214,8032|R4939,1877|N6323,-2171|n-3601,-7208|B4522,209|q2312,-1722|r-6410,9360';
// const example_position = 'B-2227,-3463|b-6610,553|q-8440,1848|n-3601,-7208'; // BROKEN WHEN USING >= instead of > !!! When we skip pushing groups if net error gain is zero
// const example_position = 'B-2227,-3463|b-6210,553|q-8440,1848|n-3601,-7208'; // TEST THIS TOO
// const example_position = 'Q-9032,1442|B3841,-6672|R-7210,5142|q912,8475|B-6112,2033|R-1278,-9880|Q-4468,755'; // Infinity repetition triangle FORCED TO calculate group's error against all other pieces!
// const example_position = 'k0,0|R1200,800|R-1500,-600|R900,-1300|R-700,1100|R300,-1300|R2000,0|R900,2100|R0,2300|R-2200,-2200|R2000,-600|R8000,12000|R-15000,4000|R18000,-6000|R-13000,-16000|R10000,9000|R-9500,14500|R12000,-18000|R-8000,-12000|R19000,2100|R-20000,-600|R905,-1295|R1204,804|R-1504,-596|R295,-1304|R-705,1097'; // Orthogonal test  BROKEN ON < 6 ARBITRARY DISTANCE!!!!! ALSO BROKEN ON 1000n!!!!! PATCHED since calculateScopedAxisError()
// const example_position = 'k0,0|R900,2100|R0,2300|R18000,-6000|R12000,-18000|R1204,804|R295,-1304|R-705,1097'; // MINIMAL of the above, used to never work NOW WORKS since calculateScopedAxisError()
// const example_position = 'k0,0|Q10000,5000|R20000,1000|R20000,2000|R20000,3000|R20000,4000'; // Diagonal test
// const example_position = 'k0,0|Q-10000,5000|R-20000,1000|R-20000,2000|R-20000,3000|R-20000,4000'; // Diagonal test FLIPPED
// const example_position = 'K0,0|q834,1191|R-2240,6303|n4201,-889|b-1719,-8260|Q9329,-214'; // 5 random pieces
// const example_position = 'K0,0|q-120,125|R-30,60|r-30,90'; // INFINITE LOOP for the V relationship checks PATCHED
const example_position = 'K0,0|q-125,120|R-30,60|r-30,90'; // INFINITE LOOP for the V relationship checks PATCHED
// const example_position = 'K0,0|q-120,120|R-30,60|r-30,90'; // Simpler version of above
// const example_position = 'K0,33|q30,0';
// const example_position = 'K0,30|q33,0';
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