// src/client/scripts/esm/util/bigdecimal/bigdecimal-benchmark.ts

import { performance } from 'perf_hooks';
import Decimal from 'decimal.js';
import BigNumber from 'bignumber.js';

// Import your library's functions and types
// Adjust the path './bigdecimal' if your file structure is different.
import myBigDecimal from './bigdecimal.js';
import BigDecimal from './bigdecimal.js';

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
	const equivalentDivex = myBigDecimal.howManyBitsForDigitsOfPrecision(config.DECIMAL_PRECISION);
	console.log(`Equivalent Binary Precision (divex): ${equivalentDivex} bits\n`);

	// --- Initialization (Done once, outside the timed loops) ---

	// Your Library - Normalized to the equivalent precision
	console.log("Initializing My Library with setExponent()...");
	const myBD1_raw = myBigDecimal.NewBigDecimal_FromString(config.num1Str);
	const myBD2_raw = myBigDecimal.NewBigDecimal_FromString(config.num2Str);
	myBigDecimal.setExponent(myBD1_raw, equivalentDivex);
	myBigDecimal.setExponent(myBD2_raw, equivalentDivex);
	const myBD1 = myBD1_raw; // Use the normalized versions
	const myBD2 = myBD2_raw;

	// decimal.js - Set to the target decimal precision
	console.log("Initializing decimal.js...");
	Decimal.set({ precision: config.DECIMAL_PRECISION });
	const decimal1 = new Decimal(config.num1Str);
	const decimal2 = new Decimal(config.num2Str);

	// bignumber.js - Set to the target decimal precision
	console.log("Initializing bignumber.js...");
	BigNumber.config({ DECIMAL_PLACES: config.DECIMAL_PRECISION });
	const bignumber1 = new BigNumber(config.num1Str);
	const bignumber2 = new BigNumber(config.num2Str);

	console.log("\nInitialization complete. Starting tests...\n");

	// --- Running the tests ---
	const results: any[] = [];

	// ADDITION
	results.push({
		operation: 'add',
		'My Library (ms)': benchmark('MyLib Add', () => myBigDecimal.add(myBD1, myBD2)),
		'decimal.js (ms)': benchmark('Decimal.js Add', () => decimal1.plus(decimal2)),
		'bignumber.js (ms)': benchmark('BigNumber.js Add', () => bignumber1.plus(bignumber2)),
	});

	// MULTIPLICATION
	results.push({
		operation: 'multiply',
		'My Library (ms)': benchmark('MyLib Multiply', () => myBigDecimal.multiply(myBD1, myBD2)),
		'decimal.js (ms)': benchmark('Decimal.js Multiply', () => decimal1.times(decimal2)),
		'bignumber.js (ms)': benchmark('BigNumber.js Multiply', () => bignumber1.times(bignumber2)),
	});

	// DIVISION
	results.push({
		operation: 'divide',
		'My Library (ms)': benchmark('MyLib Divide', () => myBigDecimal.divide(myBD1, myBD2, equivalentDivex)),
		'decimal.js (ms)': benchmark('Decimal.js Divide', () => decimal1.div(decimal2)),
		'bignumber.js (ms)': benchmark('BigNumber.js Divide', () => bignumber1.div(bignumber2)),
	});
    
	// toString()
	results.push({
		operation: 'toString',
		'My Library (ms)': benchmark('MyLib toString', () => myBigDecimal.toString(myBD1)),
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
// npm install --save-dev @types/decimal.js @types/bignumber.js

// You will also need a way to run TypeScript files directly, like ts-node:
// Generated bash
// npm install -g ts-node

// Open your terminal in the project's root directory and run the script using ts-node:
// Generated bash
// ts-node benchmark.ts