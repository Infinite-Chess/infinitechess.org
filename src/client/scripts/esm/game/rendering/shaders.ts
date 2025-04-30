// @ts-ignore
import { gl } from './webgl.js';


// Type definitions -------------------------------------------------------------------------------------------------------


interface ShaderProgram {
	/** The actual program that our webgl context can switch to with gl.useProgram() before rendering. */
	program: WebGLProgram,
	/** An object containing the attribute locations on the gpu. This info is needed before rendering with this program. */
	attribLocations: { [attribName: string]: number },
	/** An object containing the uniform locations on the gpu. This info is needed before rendering with this program. */
	uniformLocations: { [uniform: string]: WebGLUniformLocation },
}


// Variables -------------------------------------------------------------------------------------------------------


/** This script handles the creation of, and stores our shaders. */

/** The size of GL_POINTS in **physical** pixels, not virtual.
 * Naviary's system's max is 8191. Perhaps multiply by {@link window.devicePixelRatio}
 * to make it look the same size on retina displays as non-retina? */
const pointSize = 1;

/**
 * The shader programs at our disposal.
 * 
 * Each of these has a transformMatrix uniform that needs to be specified in every render call,
 * or the value from the previous render will bleed over.
 * 
 * These are initialized as soon as we have our webgl rendering context
 */
const programs: ShaderProgram[] = [];


// Functions -------------------------------------------------------------------------------------------------------


/**
 * Initiates the shader programs we will be using.
 * Call this after initiating the webgl context.
 * */
function initPrograms() {
	programs.push(
		createColorProgram(),
		createColorProgram_Instanced(),
		createColorProgram_Instanced_Plus(),
        createSizedColorProgram_Instanced(),
		createTextureProgram(),
		createColoredTextureProgram(),
		createTextureProgram_Instanced(),
		createTintedInstancedTextureProgram(),
		createColoredTextureProgram_Instanced(),
		createTintedTextureProgram()
	);
}

/**
 * Creates and return a shader program that is
 * capable of rendering meshes with colored vertices.
 * 
 * Each point in the vertex data array must have positional data (2 or 3 numbers)
 * followed by the color data (4 numbers).
 */
function createColorProgram(): ShaderProgram {
	const specifyPointSize = false; // Can toggle true if we start rendering with gl.POINTS somewhere in the project
	const pointSizeLine = specifyPointSize ? `gl_PointSize = ${(pointSize * window.devicePixelRatio).toFixed(1)};` : ''; // Default: 7.0
	const vsSource = `#version 300 es
		in vec4 aVertexPosition;
		in vec4 aVertexColor;

		uniform mat4 uTransformMatrix;

		out vec4 vColor;

		void main() {
			gl_Position = uTransformMatrix * aVertexPosition;
			vColor = aVertexColor;
			${pointSizeLine}
		}
	`;
	const fsSource = `#version 300 es
		precision lowp float;

		in vec4 vColor;

		out vec4 fragColor;

		void main() {
			fragColor = vColor;
		}
	`;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			color: gl.getAttribLocation(program, 'aVertexColor')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!
		},
	};
}

/**
 * Creates and return a shader program that uses INSTANCED RENDERING
 * to render an instance that has positional data (2 or 3 numbers)
 * followed by color data (4 numbers),
 * with the instance-specific data array having position offsets (2 or 3 numbers).
 */
function createColorProgram_Instanced(): ShaderProgram {
	const vsSource = `#version 300 es
        in vec4 aVertexPosition;
        in vec4 aVertexColor;
		in vec4 aInstancePosition; // Per-instance position offset attribute

        uniform mat4 uTransformMatrix;

        out vec4 vColor;

        void main() {
			// Add the instance offset to the vertex position
			vec4 transformedVertexPosition = vec4(aVertexPosition.xyz + aInstancePosition.xyz, 1.0);

            gl_Position = uTransformMatrix * transformedVertexPosition;
            vColor = aVertexColor;
        }
    `;
	const fsSource = `#version 300 es
        precision lowp float;

        in vec4 vColor;

        out vec4 fragColor;

        void main() {
            fragColor = vColor;
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			color: gl.getAttribLocation(program, 'aVertexColor'),
			instanceposition: gl.getAttribLocation(program, 'aInstancePosition')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!
		},
	};
}

/**
 * Creates and return a shader program that uses INSTANCED RENDERING
 * to render an instance that has positional data (2 or 3 numbers),
 * with the instance-specific data array having:
 * * position offsets (2 or 3 numbers),
 * * color (4 numbers),
 * * rotation offset (1 number)
 */
function createColorProgram_Instanced_Plus(): ShaderProgram {
	const vsSource = `#version 300 es
        in vec4 aVertexPosition;
        in vec3 aInstancePosition; // Instance position offset (vec3: xyz)
        in vec4 aInstanceColor;    // Instance color (vec4: rgba)
        in float aInstanceRotation; // Instance rotation (float: radians)

        uniform mat4 uTransformMatrix;

        out vec4 vColor;

        void main() {
            // Create rotation matrix
            float cosA = cos(aInstanceRotation);
            float sinA = sin(aInstanceRotation);
            mat2 rotMat = mat2(cosA, sinA, -sinA, cosA);
            
            // Rotate vertex position
            vec2 rotated = rotMat * aVertexPosition.xy;
            vec3 rotatedPosition = vec3(rotated, aVertexPosition.z);
            
            // Add instance position offset
            vec3 finalPosition = rotatedPosition + aInstancePosition;
            
            gl_Position = uTransformMatrix * vec4(finalPosition, 1.0);
            vColor = aInstanceColor;
        }
    `;

	const fsSource = `#version 300 es
        precision lowp float;
        in vec4 vColor;
        out vec4 fragColor;
        void main() {
            fragColor = vColor;
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			instanceposition: gl.getAttribLocation(program, 'aInstancePosition'),
			instancecolor: gl.getAttribLocation(program, 'aInstanceColor'),
			instancerotation: gl.getAttribLocation(program, 'aInstanceRotation')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!
		},
	};
}

/**
 * Creates and returns a shader program that uses INSTANCED RENDERING
 * to render colored squares.
 * Instance-specific data includes position offsets.
 * A uniform 'uSize' controls the size of all rendered squares.
 *
 * Base vertex data should define ONE square (e.g., centered at origin)
 * with position (vec4) and color (vec4) attributes.
 * Instance data buffer should contain position offsets (vec3).
 */
function createSizedColorProgram_Instanced(): ShaderProgram {
    const vsSource = `#version 300 es
        in vec4 aVertexPosition;     // Base square vertex position (e.g., from -0.5 to 0.5)
        in vec4 aVertexColor;        // Base square vertex color
        in vec3 aInstancePosition;   // Per-instance position offset (center of the square)

        uniform mat4 uTransformMatrix; // Combined model-view-projection matrix
        uniform float uSize;    // Desired width of the square (scales aVertexPosition)

        out vec4 vColor;             // Pass color to fragment shader

        void main() {
            // Scale the base vertex position's X and Y by the square width.
            // Assumes Z is 0 or handled appropriately, W is 1 for position.
            vec3 scaledLocalPosition = vec3(aVertexPosition.xy * uSize, aVertexPosition.z);

            // Add the instance-specific position offset to the scaled local position.
            vec3 finalPosition = scaledLocalPosition + aInstancePosition;

            // Transform the final position.
            gl_Position = uTransformMatrix * vec4(finalPosition, 1.0);

            // Pass the vertex color through.
            vColor = aVertexColor;
        }
    `;

    const fsSource = `#version 300 es
        precision lowp float;

        in vec4 vColor;        // Interpolated color from vertex shader

        out vec4 fragColor;    // Output fragment color

        void main() {
            fragColor = vColor; // Simply output the interpolated vertex color.
        }
    `;

    const program = createShaderProgram(vsSource, fsSource);

    return {
        program,
        attribLocations: {
            position: gl.getAttribLocation(program, 'aVertexPosition'),
            color: gl.getAttribLocation(program, 'aVertexColor'),
            instanceposition: gl.getAttribLocation(program, 'aInstancePosition')
        },
        uniformLocations: {
            transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!,
            size: gl.getUniformLocation(program, 'uSize')!
        },
    };
}

/**
 * Creates and returns a shader program that is capable of rendering meshes with a bound texture.
 * 
 * Also applies a bias to the LOD (mipmap level) to sharpen the textures a bit,
 * as mipmaps by themselves will automatically pick a level that is slightly blurry.
 * 
 * Each point in the vertex data must contain positional data (2 or 3 numbers)
 * followed by the texture data (2 numbers).
 */
function createTextureProgram(): ShaderProgram  {
	const vsSource = `#version 300 es
        in vec4 aVertexPosition;
        in vec2 aTextureCoord;

        uniform mat4 uTransformMatrix;

        out vec2 vTextureCoord;

        void main(void) {
            gl_Position = uTransformMatrix * aVertexPosition;
            vTextureCoord = aTextureCoord;
        }
    `;
	const fsSource = `#version 300 es
        precision lowp float;

        in vec2 vTextureCoord;
        uniform sampler2D uSampler;

        out vec4 fragColor;

        void main(void) {
            fragColor = texture(uSampler, vTextureCoord, -0.5); // Apply a mipmap LOD bias so as to make the textures sharper.
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			texcoord: gl.getAttribLocation(program, 'aTextureCoord'),
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!,
			uSampler: gl.getUniformLocation(program, 'uSampler')!
		},
	};
}

/**
 * Creates and return a shader program that is capable of
 * rendering meshes with a bound texture AND colored vertices,
 * tinting each point a specified color.
 * 
 * Also applies a bias to the LOD (mipmap level) to sharpen the textures a bit,
 * as mipmaps by themselves will automatically pick a level that is slightly blurry.
 * 
 * Each point in the vertex data must contain positional data (2 or 3 numbers),
 * followed by the texture data (2 numbers),
 * and lastly followed by the color data (4 numbers).
 * 
 * The meshes obviously use more memory than the other shader programs.
 */
function createColoredTextureProgram(): ShaderProgram  {
	const vsSource = `#version 300 es
		in vec4 aVertexPosition;
		in vec2 aTextureCoord;
		in vec4 aVertexColor;

		uniform mat4 uTransformMatrix;

		out vec2 vTextureCoord;
		out vec4 vColor;

		void main(void) {
			gl_Position = uTransformMatrix * aVertexPosition;
			vTextureCoord = aTextureCoord;
			vColor = aVertexColor;
		}
    `;
	const fsSource = `#version 300 es
		precision lowp float;

		in vec2 vTextureCoord;
		in vec4 vColor;

		uniform sampler2D uSampler;

		out vec4 fragColor;

		void main(void) {
			fragColor = texture(uSampler, vTextureCoord, -0.5) * vColor; // Apply a mipmap LOD bias so as to make the textures sharper.
		}
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			texcoord: gl.getAttribLocation(program, 'aTextureCoord'),
			color: gl.getAttribLocation(program, 'aVertexColor')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!,
			uSampler: gl.getUniformLocation(program, 'uSampler')!
		},
	};
}

/**
 * Creates and returns a shader program that uses INSTANCED RENDERING
 * to render instances with positional data and texture coordinates,
 * using instance-specific position offsets only.
 */
function createTextureProgram_Instanced(): ShaderProgram {
	const vsSource = `#version 300 es
        in vec4 aVertexPosition;        // Per-vertex position (vec4 for homogeneous coordinates)
        in vec2 aTextureCoord;          // Per-vertex texture coordinates
        in vec3 aInstancePosition;      // Per-instance position offset (vec3: xyz)

        uniform mat4 uTransformMatrix;  // Transformation matrix

        out vec2 vTextureCoord;         // To fragment shader

        void main() {
            // Apply instance position offset
            vec4 offsetPosition = aVertexPosition + vec4(aInstancePosition, 0.0);
            
            // Transform position and pass through texture coords
            gl_Position = uTransformMatrix * offsetPosition;
            
            // Pass texture coordinates directly to fragment shader
            vTextureCoord = aTextureCoord;
        }
    `;

	const fsSource = `#version 300 es
        precision lowp float;

        in vec2 vTextureCoord;          // From vertex shader
        uniform sampler2D uSampler;     // Texture sampler

        out vec4 fragColor;             // Output color

        void main() {
            // Sample texture with LOD bias for sharpness
            vec4 texColor = texture(uSampler, vTextureCoord, -0.5);
            fragColor = texColor;
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			texcoord: gl.getAttribLocation(program, 'aTextureCoord'),
			instanceposition: gl.getAttribLocation(program, 'aInstancePosition')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!,
			uSampler: gl.getUniformLocation(program, 'uSampler')!
		},
	};
}

/**
 * Creates and returns a shader program that uses INSTANCED RENDERING
 * with a universal tint color applied to all instances.
 */
function createTintedInstancedTextureProgram(): ShaderProgram {
	const vsSource = `#version 300 es
        in vec4 aVertexPosition;        // Per-vertex position
        in vec2 aTextureCoord;          // Per-vertex texture coordinates
        in vec3 aInstancePosition;      // Per-instance position offset

        uniform mat4 uTransformMatrix;  // Transformation matrix

        out vec2 vTextureCoord;         // To fragment shader

        void main() {
            // Apply instance position offset
            vec4 offsetPosition = aVertexPosition + vec4(aInstancePosition, 0.0);
            
            // Transform position and pass through texture coords
            gl_Position = uTransformMatrix * offsetPosition;
            
            // Pass texture coordinates to fragment shader
            vTextureCoord = aTextureCoord;
        }
    `;

	const fsSource = `#version 300 es
        precision lowp float;

        in vec2 vTextureCoord;          // From vertex shader
        uniform sampler2D uSampler;     // Texture sampler
        uniform vec4 uTintColor;        // Universal tint color

        out vec4 fragColor;             // Output color

        void main() {
            // Sample texture with LOD bias and apply universal tint
            vec4 texColor = texture(uSampler, vTextureCoord, -0.5);
            fragColor = texColor * uTintColor;
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			texcoord: gl.getAttribLocation(program, 'aTextureCoord'),
			instanceposition: gl.getAttribLocation(program, 'aInstancePosition')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!,
			tintColor: gl.getUniformLocation(program, 'uTintColor')!,
			uSampler: gl.getUniformLocation(program, 'uSampler')!
		},
	};
}

/**
 * Creates and returns a shader program that uses INSTANCED RENDERING
 * to render instances with positional data, texture coordinates, and instance-specific
 * position offsets, texture coordinate offsets, and color tinting.
 */
function createColoredTextureProgram_Instanced(): ShaderProgram {
	const vsSource = `#version 300 es
        in vec4 aVertexPosition;        // Per-vertex position (vec4 for homogeneous coordinates)
        in vec2 aTextureCoord;          // Per-vertex texture coordinates
        in vec3 aInstancePosition;      // Per-instance position offset (vec3: xyz)
        in vec2 aInstanceTexCoord;      // Per-instance texture coordinate offset (vec2)
        in vec4 aInstanceColor;         // Per-instance color (RGBA)

        uniform mat4 uTransformMatrix;  // Transformation matrix

        out vec2 vTextureCoord;         // To fragment shader
        out vec4 vInstanceColor;        // To fragment shader

        void main() {
            // Apply instance position offset
            vec4 offsetPosition = aVertexPosition + vec4(aInstancePosition, 0.0);
            
            // Transform position and pass through texture coords
            gl_Position = uTransformMatrix * offsetPosition;
            
            // Apply texture coordinate offset and pass to fragment shader
            vTextureCoord = aTextureCoord + aInstanceTexCoord;
            
            // Pass instance color to fragment shader
            vInstanceColor = aInstanceColor;
        }
    `;

	const fsSource = `#version 300 es
        precision lowp float;

        in vec2 vTextureCoord;          // From vertex shader
        in vec4 vInstanceColor;         // From vertex shader

        uniform sampler2D uSampler;     // Texture sampler

        out vec4 fragColor;             // Output color

        void main() {
            // Sample texture with LOD bias for sharpness
            vec4 texColor = texture(uSampler, vTextureCoord, -0.5);
            fragColor = texColor * vInstanceColor;
        }
    `;

	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			texcoord: gl.getAttribLocation(program, 'aTextureCoord'),
			instanceposition: gl.getAttribLocation(program, 'aInstancePosition'),
			instancetexcoord: gl.getAttribLocation(program, 'aInstanceTexCoord'),
			instancecolor: gl.getAttribLocation(program, 'aInstanceColor')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!,
			uSampler: gl.getUniformLocation(program, 'uSampler')!
		},
	};
}

/**
 * Creates and return a shader program that is capable of rendering meshes
 * with a bound texture, and a universally-applied tint to every point
 * (not specific per vertex).
 * 
 * Each point in the vertex data must contain positional data (2 or 3 numbers),
 * followed by the texture data (2 numbers).
 * 
 * Set the tint during the render call by passing the `tintColor` uniform as an argument.
 * 
 * This is more memory efficient than the coloredTextureProgram,
 * if you don't require a unique tint value on each point.
 */
function createTintedTextureProgram(): ShaderProgram  {
	const vsSource = `#version 300 es
		in vec4 aVertexPosition;
		in vec2 aTextureCoord;

		uniform mat4 uTransformMatrix;

		out vec2 vTextureCoord;

		void main(void) {
			gl_Position = uTransformMatrix * aVertexPosition;
			vTextureCoord = aTextureCoord;
		}
	`;
	const fsSource = `#version 300 es
		precision lowp float;

		in vec2 vTextureCoord;

		uniform vec4 uTintColor;
		uniform sampler2D uSampler;

		out vec4 fragColor;

		void main(void) {
			fragColor = texture(uSampler, vTextureCoord, -0.5) * uTintColor; // Apply a mipmap LOD bias so as to make the textures sharper.
		}
	`;


	const program = createShaderProgram(vsSource, fsSource);

	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'aVertexPosition'),
			texcoord: gl.getAttribLocation(program, 'aTextureCoord'),
		},
		uniformLocations: {
			tintColor: gl.getUniformLocation(program, 'uTintColor')!,
			transformMatrix: gl.getUniformLocation(program, 'uTransformMatrix')!,
			uSampler: gl.getUniformLocation(program, 'uSampler')!
		},
	};
}

/**
 * Creates an actual program from the provided vertex shader and fragment shader source codes
 * in which our webgl context can switch to via gl.useProgram() before rendering.
 * @param vsSourceText - The vertex shader source code, in GLSL version 1.00
 * @param fsSourceText - The fragment shader source code, in GLSL version 1.00
 */
function createShaderProgram(vsSourceText: string, fsSourceText: string): WebGLProgram { // source texts: vertex shader, fragment shader

	const vertexShader = createShader(gl.VERTEX_SHADER, vsSourceText);
	const fragmentShader = createShader(gl.FRAGMENT_SHADER, fsSourceText);

	// Create the shader program
	const shaderProgram = gl.createProgram()!;
	gl.attachShader(shaderProgram, vertexShader);
	gl.attachShader(shaderProgram, fragmentShader);
	gl.linkProgram(shaderProgram);

	// If creating the shader program failed, alert
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		const error = `${translations['shaders_failed']} ${gl.getProgramInfoLog(shaderProgram)}`;
		alert(error);
		throw Error(error);
	}

	return shaderProgram;
}

/**
 * Creates a shader of the given type, from the specified source code.
 * @param type - `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`
 * @param sourceText - The shader source code, in GLSL version 1.00
 */
function createShader(type: number, sourceText: string): WebGLShader { // type: gl.VERTEX_SHADER / gl.FRAGMENT_SHADER
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, sourceText); // Send the source to the shader object
	gl.compileShader(shader); // Compile the shader program

	// Check if it compiled successfully
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const error = `${translations['failed_compiling_shaders']} ${gl.getShaderInfoLog(shader)}`;
		alert(error);
		gl.deleteShader(shader);
		throw Error(error);
	}
    
	return shader;
}

/**
 * Picks a compatible shader that will work with all the provided attributes and uniforms.
 * 
 * Uniforms you NEVER have to provide are [transformMatrix, uSampler],
 * because those are either present in every shader already, OR the uSampler uniform
 * is assumed if you're using the 'texcoord' attribute.
 * 
 * An example of a uniform you WOULD specify is 'tintColor'.
 * 
 * @param attributes - A list of all attributes we need to use. (e.g. `['position','color']` for vertex data that doesn't use a texture)
 * @param [uniforms] Optional. Only provide if you need to use a uniform that is not one of the assumed [transformMatrix, uSampler]
 */
function shaderPicker(attributes: string[], uniforms: string[] = []): ShaderProgram {

	// Assume all are compatible to start, we'll eliminate the ones that aren't.
	let compatibleShaders = Object.values(programs);

	// Iterate through all existing shaders, check to see if they support each of our attributes and uniforms.
	attributes.forEach((attrib) => {
		compatibleShaders = compatibleShaders.filter((program) => program.attribLocations[attrib] !== undefined);
	});
	uniforms.forEach((uniform) => {
		compatibleShaders = compatibleShaders.filter((program) => program.uniformLocations[uniform] !== undefined);
	});

	if (compatibleShaders.length === 0) throw Error(`Cannot find a shader compatible with the requested attributes and uniforms: ${JSON.stringify(attributes)}, ${JSON.stringify(uniforms)}`);

	// What if there are multiple shaders compatible?
	// Use the least complex one (lowest number of attributes and uniforms)

	const leastComplexShader = compatibleShaders.reduce((leastComplex, current) => {
		const leastComplexComplexity = getShaderComplexity(leastComplex);
		const currentComplexity = getShaderComplexity(current);
		if (leastComplexComplexity === currentComplexity) throw Error(`Shaders have the same level of complexity, can't pick which one to use! Requested attributes and uniforms: ${JSON.stringify(attributes)}, ${JSON.stringify(uniforms)}`);
		// Return the shader with the least complexity
		return currentComplexity < leastComplexComplexity ? current : leastComplex;
	});

	// Debug
	// console.log(`Chose the below shader for requested attributes and uniforms ${JSON.stringify(attributes)}, ${JSON.stringify(uniforms)}:`);
	// console.log(leastComplexShader);
	
	return leastComplexShader;
}

/** The total number of attributes + uniforms in a given shader program. */
function getShaderComplexity(program: ShaderProgram): number {
	return Object.keys(program.attribLocations).length + Object.keys(program.uniformLocations).length;
}



export default {
	initPrograms,
	programs,
	shaderPicker,
};

// Type definitions
export { ShaderProgram };