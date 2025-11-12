import clipboardy from 'clipboardy';

const MAX = Number.MAX_VALUE;

const END_GAP = MAX / 16;

const numbersPerGroup = 8;

const piece = "p";


const integersList: number[] = [];

const divisor = 1;
const gapHalfingCount = 14;

let currentNumber = Math.round(MAX / divisor);
let currentGap = Math.round(END_GAP / divisor);


function getKeyFromCoords(coord: [number, number]): string {
	return `${BigInt(coord[0])},${BigInt(coord[1])}`;
}



for (let i = 0; i < gapHalfingCount; i++) {
	for (let i = 0; i < numbersPerGroup; i++) {
		integersList.push(currentNumber);
		currentNumber -= currentGap;
	}
	currentGap /= 2;
}

const x_coordinates: number[] = [];

for (let i = 0; i < integersList.length; i++) {
	x_coordinates.push(integersList[i]);
	x_coordinates.push(-integersList[i]);
}

const coordinates: [number, number][] = [];

for (let i = 0; i < x_coordinates.length; i++) {
	for (let j = 0; j < x_coordinates.length; j++) {
		coordinates.push([x_coordinates[i], x_coordinates[j]]);
	}
}


const pawns: string[] = coordinates.map((coord => piece + getKeyFromCoords(coord)));
console.log(`\nTotal pieces: ${pawns.length}`);

const positionString = 'K0,0|' + pawns.join("|");

clipboardy.writeSync(positionString);
console.log("Position string copied to clipboard.\n");