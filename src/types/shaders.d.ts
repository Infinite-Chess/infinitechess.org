// src/types/shaders.d.ts

/*
 * This tells TypeScript all .glsl imports are strings.
 *
 * This can't be put inside globals.d.ts because TypeScript
 * has a weird rule that global declarations must
 * be in a separate file from module declarations.
 */

declare module '*.glsl' {
	const content: string;
	export default content;
}
