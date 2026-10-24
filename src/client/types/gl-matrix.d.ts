// src/client/types/gl-matrix.d.ts

/*
 * Types the `gl-matrix/mat4` subpath, which gl-matrix ships untyped.
 * Importing the subpath rather than the bare package lets esbuild tree-shake it.
 *
 * `create()` is narrowed to the Float32Array it returns at runtime,
 * as we never change gl-matrix's default ARRAY_TYPE.
 */

/// <reference types="gl-matrix" />

declare module 'gl-matrix/mat4' {
	import { mat4 } from 'gl-matrix';
	export = mat4;
}

declare module 'gl-matrix' {
	namespace mat4 {
		export function create(): Float32Array;
	}
}
