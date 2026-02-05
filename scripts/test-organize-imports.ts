#!/usr/bin/env tsx

/**
 * Test script for organize-imports.ts
 * Runs the organize-imports script on all problem files and compares with solution files
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const problemDir = path.join(__dirname, '../dev-utils/organize-imports/problem');
const solutionDir = path.join(__dirname, '../dev-utils/organize-imports/solution');
const tempDir = path.join(__dirname, '../dev-utils/organize-imports/temp');

// Create temp directory if it doesn't exist
if (!fs.existsSync(tempDir)) {
	fs.mkdirSync(tempDir, { recursive: true });
}

// Get all test files
const problemFiles = fs.readdirSync(problemDir).filter((f) => f.endsWith('.ts'));

console.log('Testing organize-imports.ts script...\n');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;
const failures: Array<{ file: string; reason: string }> = [];

for (const file of problemFiles) {
	const problemPath = path.join(problemDir, file);
	const solutionPath = path.join(solutionDir, file);
	const tempPath = path.join(tempDir, file);

	// Check if solution file exists
	if (!fs.existsSync(solutionPath)) {
		console.log(`⚠️  SKIP: ${file} (no solution file)`);
		continue;
	}

	// Copy problem file to temp
	fs.copyFileSync(problemPath, tempPath);

	// Run organize-imports on temp file
	try {
		execSync(`npx tsx scripts/organize-imports.ts ${tempPath}`, {
			cwd: path.join(__dirname, '..'),
			stdio: 'pipe',
		});
	} catch (error) {
		console.log(`❌ FAIL: ${file} (script error)`);
		failures.push({ file, reason: 'Script execution error' });
		failed++;
		continue;
	}

	// Compare temp with solution
	const tempContent = fs.readFileSync(tempPath, 'utf-8');
	const solutionContent = fs.readFileSync(solutionPath, 'utf-8');

	if (tempContent === solutionContent) {
		console.log(`✅ PASS: ${file}`);
		passed++;
	} else {
		console.log(`❌ FAIL: ${file} (output mismatch)`);
		console.log('Expected:');
		console.log(solutionContent);
		console.log('\nGot:');
		console.log(tempContent);
		console.log('');
		failures.push({ file, reason: 'Output mismatch' });
		failed++;
	}
}

console.log('='.repeat(80));
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

if (failures.length > 0) {
	console.log('\nFailed tests:');
	for (const failure of failures) {
		console.log(`  - ${failure.file}: ${failure.reason}`);
	}
}

// Clean up temp directory
fs.rmSync(tempDir, { recursive: true, force: true });

process.exit(failed > 0 ? 1 : 0);
