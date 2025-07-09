// src/client/scripts/esm/util/bigdecimal/bigdecimal-benchmark.ts

import { performance } from 'perf_hooks';
import Decimal from 'decimal.js';
import BigNumber from 'bignumber.js';

// Import your library's functions and types
// Adjust the path './bigdecimal' if your file structure is different.
import bigdecimal from './bigdecimal.js';

// --- Configuration ---
const config = {
	loopCount: 1_000_000, // 1 million iterations
	num1Str: "123456789.12345678901234567890",
	num2Str: "987.65432109876543210",
	DECIMAL_PRECISION: 50 // The target precision in decimal digits
};

// --- Benchmark Runner ---
function benchmark(name: string, fn: () => void): number {
	const start = performance.now();
	for (let i = 0; i < config.loopCount; i++) {
		fn();
	}
	const end = performance.now();
	const duration = parseFloat((end - start).toFixed(2));
	console.log(`Finished: ${name} in ${duration}ms`);
	return duration;
}

// --- Main Benchmark Function ---
async function runAllBenchmarks() {
	console.log(`--- Running Benchmarks ---`);
	console.log(`Target Decimal Precision: ${config.DECIMAL_PRECISION} digits`);
	console.log(`Loop count for each operation: ${config.loopCount.toLocaleString()}\n`);

	// --- FAIR PRECISION SETUP ---

	// 1. Calculate the equivalent binary divex for your library
	const equivalentDivex = bigdecimal.howManyBitsForDigitsOfPrecision(config.DECIMAL_PRECISION);
	console.log(`Equivalent Binary Precision (divex): ${equivalentDivex} bits\n`);

	// --- Initialization (Done once, outside the timed loops) ---

	// Your Library - Normalized to the equivalent precision
	const myBD1_raw = bigdecimal.NewBigDecimal_FromString(config.num1Str);
	const myBD2_raw = bigdecimal.NewBigDecimal_FromString(config.num2Str);
	bigdecimal.setExponent(myBD1_raw, equivalentDivex);
	bigdecimal.setExponent(myBD2_raw, equivalentDivex);
	const myBD1 = myBD1_raw; // Use the normalized versions
	const myBD2 = myBD2_raw;

	// decimal.js - Set to the target decimal precision
	Decimal.set({ precision: config.DECIMAL_PRECISION });
	const decimal1 = new Decimal(config.num1Str);
	const decimal2 = new Decimal(config.num2Str);

	// bignumber.js - Set to the target decimal precision
	BigNumber.config({ DECIMAL_PLACES: config.DECIMAL_PRECISION });
	const bignumber1 = new BigNumber(config.num1Str);
	const bignumber2 = new BigNumber(config.num2Str);

	// --- Running the tests ---
	const results: any[] = [];

	// ADDITION
	results.push({
		operation: 'add',
		'BigDecimal (ms)': benchmark('BigDecimal Add', () => bigdecimal.add(myBD1, myBD2)),
		'decimal.js (ms)': benchmark('Decimal.js Add', () => decimal1.plus(decimal2)),
		'bignumber.js (ms)': benchmark('BigNumber.js Add', () => bignumber1.plus(bignumber2)),
	});

	// SUBTRACTION
	// results.push({
	// 	operation: 'subtract',
	// 	'BigDecimal (ms)': benchmark('BigDecimal Subtract', () => bigdecimal.subtract(myBD1, myBD2)),
	// 	'decimal.js (ms)': benchmark('Decimal.js Subtract', () => decimal1.minus(decimal2)),
	// 	'bignumber.js (ms)': benchmark('BigNumber.js Subtract', () => bignumber1.minus(bignumber2)),
	// });

	// MULTIPLICATION
	results.push({
		operation: 'multiply',
		'BigDecimal (ms)': benchmark('BigDecimal Multiply', () => bigdecimal.multiply(myBD1, myBD2)),
		'decimal.js (ms)': benchmark('Decimal.js Multiply', () => decimal1.times(decimal2)),
		'bignumber.js (ms)': benchmark('BigNumber.js Multiply', () => bignumber1.times(bignumber2)),
	});

	// DIVISION
	results.push({
		operation: 'divide',
		'BigDecimal (ms)': benchmark('BigDecimal Divide', () => bigdecimal.divide(myBD1, myBD2, equivalentDivex)),
		'decimal.js (ms)': benchmark('Decimal.js Divide', () => decimal1.div(decimal2)),
		'bignumber.js (ms)': benchmark('BigNumber.js Divide', () => bignumber1.div(bignumber2)),
	});
    
	// toString()
	results.push({
		operation: 'toString',
		'BigDecimal (ms)': benchmark('BigDecimal toString', () => bigdecimal.toString(myBD1)),
		'decimal.js (ms)': benchmark('Decimal.js toString', () => decimal1.toString()),
		'bignumber.js (ms)': benchmark('BigNumber.js toString', () => bignumber1.toString()),
	});

	// --- Display Results ---
	console.log("\n--- Benchmark Results ---");
	console.table(results);
}

// Run the benchmarks
runAllBenchmarks();

// npm install decimal.js bignumber.js

// To run:
// npx tsx src/client/scripts/esm/util/bigdecimal/bigdecimal-benchmark.ts