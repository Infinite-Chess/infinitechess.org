// scripts/add-file-paths.unit.test.ts

/**
 * Unit tests for the add-file-paths script.
 * Tests the script's ability to add/update file path comments in TypeScript and JavaScript files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';

const TEST_DIR = join(process.cwd(), '.test-add-file-paths');
const SCRIPT_PATH = join(process.cwd(), 'scripts/add-file-paths.ts');

beforeEach(() => {
	// Create fresh test directory
	rmSync(TEST_DIR, { recursive: true, force: true });
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	// Clean up test directory
	rmSync(TEST_DIR, { recursive: true, force: true });
});

/**
 * Helper function to run the script on a file and return the result.
 */
function runScriptOnFile(filePath: string, content: string): string {
	writeFileSync(filePath, content, 'utf-8');
	execSync(`npx tsx "${SCRIPT_PATH}" "${filePath}"`, { stdio: 'ignore' });
	return readFileSync(filePath, 'utf-8');
}

/**
 * Helper function to get the expected relative path for a file.
 */
function getExpectedPath(filePath: string): string {
	const repoRoot = process.cwd();
	const absolutePath = resolve(filePath);
	const relativePath = relative(repoRoot, absolutePath);
	return relativePath.replace(/\\/g, '/');
}

describe('add-file-paths script', () => {
	it('adds path comment to file with no path', () => {
		const filePath = join(TEST_DIR, 'test.ts');
		const input = '/**\n * Test file\n */\n\nexport function test() {}';
		const result = runScriptOnFile(filePath, input);
		const expected = `// ${getExpectedPath(filePath)}\n\n/**\n * Test file\n */\n\nexport function test() {}`;
		expect(result).toBe(expected);
	});

	it('adds path comment and empty line to file starting with empty line', () => {
		const filePath = join(TEST_DIR, 'test.ts');
		const input = '\n/**\n * Test file\n */';
		const result = runScriptOnFile(filePath, input);
		const expected = `// ${getExpectedPath(filePath)}\n\n\n/**\n * Test file\n */`;
		expect(result).toBe(expected);
	});

	it('adds empty line after correct path comment', () => {
		const filePath = join(TEST_DIR, 'test.ts');
		const expectedPath = getExpectedPath(filePath);
		const input = `// ${expectedPath}\n/**\n * Test file\n */`;
		const result = runScriptOnFile(filePath, input);
		const expected = `// ${expectedPath}\n\n/**\n * Test file\n */`;
		expect(result).toBe(expected);
	});

	it('leaves correct path with empty line unchanged', () => {
		const filePath = join(TEST_DIR, 'test.ts');
		const expectedPath = getExpectedPath(filePath);
		const input = `// ${expectedPath}\n\n/**\n * Test file\n */`;
		const result = runScriptOnFile(filePath, input);
		const expected = `// ${expectedPath}\n\n/**\n * Test file\n */`;
		expect(result).toBe(expected);
	});

	it('updates incorrect path comment', () => {
		const filePath = join(TEST_DIR, 'test.ts');
		const input = '// wrong/path/file.ts\n\n/**\n * Test file\n */';
		const result = runScriptOnFile(filePath, input);
		const expected = `// ${getExpectedPath(filePath)}\n\n/**\n * Test file\n */`;
		expect(result).toBe(expected);
	});

	it('updates incorrect path comment and adds empty line', () => {
		const filePath = join(TEST_DIR, 'test.ts');
		const input = '// wrong/path/file.ts\n/**\n * Test file\n */';
		const result = runScriptOnFile(filePath, input);
		const expected = `// ${getExpectedPath(filePath)}\n\n/**\n * Test file\n */`;
		expect(result).toBe(expected);
	});

	it('fixes empty line followed by incorrect path comment', () => {
		const filePath = join(TEST_DIR, 'test.ts');
		const input = '\n// wrong/path/file.ts\n\n/**\n * Test file\n */';
		const result = runScriptOnFile(filePath, input);
		const expected = `// ${getExpectedPath(filePath)}\n\n/**\n * Test file\n */`;
		expect(result).toBe(expected);
	});

	it('works with JavaScript files', () => {
		const filePath = join(TEST_DIR, 'test.js');
		const input = 'function test() {}';
		const result = runScriptOnFile(filePath, input);
		const expected = `// ${getExpectedPath(filePath)}\n\nfunction test() {}`;
		expect(result).toBe(expected);
	});

	it('handles nested directory paths', () => {
		const nestedDir = join(TEST_DIR, 'nested', 'dir');
		mkdirSync(nestedDir, { recursive: true });
		const filePath = join(nestedDir, 'test.ts');
		const input = 'export const x = 1;';
		const result = runScriptOnFile(filePath, input);
		const expected = `// ${getExpectedPath(filePath)}\n\nexport const x = 1;`;
		expect(result).toBe(expected);
	});

	it('preserves file content when only adding path', () => {
		const filePath = join(TEST_DIR, 'test.ts');
		const content = 'import { x } from "./y";\n\nexport function z() {\n\treturn 42;\n}';
		const result = runScriptOnFile(filePath, content);
		const expected = `// ${getExpectedPath(filePath)}\n\n${content}`;
		expect(result).toBe(expected);
	});
});
