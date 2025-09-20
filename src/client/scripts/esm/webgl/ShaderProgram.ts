
// src/client/scripts/esm/webgl/ShaderProgram.ts


/**
 * A wrapper around a WebGLProgram that handles the boilerplate of
 * compiling, linking, and providing a clean interface for attributes and uniforms.
 * @template Attribute - A union of string literals representing the attribute names.
 * @template Uniform - A union of string literals representing the uniform names.
 */
export class ShaderProgram<Attribute extends string, Uniform extends string> {
	private readonly program: WebGLProgram;
	private readonly gl: WebGLRenderingContext;

	// Caches for attribute and uniform locations to avoid expensive lookups
	private attributeLocations: Map<string, number> = new Map();
	private uniformLocations: Map<string, WebGLUniformLocation> = new Map();


	/**
     * Creates, compiles, and links a WebGL program from vertex and fragment shader source.
     * This constructor will throw an error if the shaders fail to compile or link.
     * @param gl - The WebGL rendering context.
     * @param vertexSource - The GLSL source code for the vertex shader.
     * @param fragmentSource - The GLSL source code for the fragment shader.
     */
	constructor(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
		this.gl = gl;
		const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
		const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

		this.program = this.createProgram(vertexShader, fragmentShader);
	}


	/** Activates this shader program for use in rendering. */
	public use(): void {
		this.gl.useProgram(this.program);
	}

	/** Looks up and caches the location of a vertex attribute. */
	public getAttributeLocation(name: Attribute): number {
		if (this.attributeLocations.has(name)) return this.attributeLocations.get(name)!; // Pre-cached location
		// Manually fetch location (more expensive)
		const location = this.gl.getAttribLocation(this.program, name);
		// It's common for unused attributes to be optimized out, so this isn't
		// always an error. We'll warn but not throw.
		if (location === -1) console.warn(`Attribute "${name}" not found in shader program.`);
		this.attributeLocations.set(name, location); // Cache the location
		return location;
	}

	/** Looks up and caches the location of a uniform. */
	public getUniformLocation(name: Uniform): WebGLUniformLocation | null {
		if (this.uniformLocations.has(name)) return this.uniformLocations.get(name)!; // Pre-cached location
		// Manually fetch location (more expensive)
		const location = this.gl.getUniformLocation(this.program, name);
		// Unused uniforms are also common.
		if (location === null) console.warn(`Uniform "${name}" not found in shader program.`);
		this.uniformLocations.set(name, location!); // Cache the location
		return location;
	}


	// Private Helper Methods -----------------------------------------------------------


	/**
     * Creates an actual program from the provided vertex shader and fragment shader
     * in which our webgl context can switch to via gl.useProgram() before rendering.
     */
	private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
		// Create the shader program
		const program = this.gl.createProgram();
		if (!program) throw Error("Failed to create WebGL program.");

		this.gl.attachShader(program, vertexShader);
		this.gl.attachShader(program, fragmentShader);
		this.gl.linkProgram(program);

		// Check if it was created successfully
		if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
			const info = this.gl.getProgramInfoLog(program);
			throw Error(`Failed to link WebGL program: ${info}`);
		}
		return program;
	}
    

	/**
     * Creates a shader of the given type, from the specified source code.
     * @param type - `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`
     * @param sourceText - The shader source code, in GLSL version 1.00
     */
	private compileShader(type: number, source: string): WebGLShader {
		const shader = this.gl.createShader(type);
		if (!shader) throw Error(`Failed to create shader (type: ${type})`);

		this.gl.shaderSource(shader, source); // Send the source to the shader object
		this.gl.compileShader(shader); // Compile the shader program

		// Check if it compiled successfully
		if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
			const info = this.gl.getShaderInfoLog(shader);
			const typeName = type === this.gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
			this.gl.deleteShader(shader);
			throw Error(`Failed to compile ${typeName} shader: ${info}`);
		}
		return shader;
	}
}