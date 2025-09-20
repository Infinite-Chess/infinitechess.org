
// src/client/scripts/esm/game/rendering/shaders.ts

import { gl } from './webgl.js';


// Generic Shaders
import vsSource_color from '../../../shaders/color/vertex.glsl';
import fsSource_color from '../../../shaders/color/fragment.glsl';
import vsSource_colorInstanced from '../../../shaders/color/instanced/vertex.glsl';
import fsSource_colorInstanced from '../../../shaders/color/instanced/fragment.glsl';
import vsSource_texture from '../../../shaders/texture/vertex.glsl';
import fsSource_texture from '../../../shaders/texture/fragment.glsl';
import vsSource_textureInstanced from '../../../shaders/texture/instanced/vertex.glsl';
import fsSource_textureInstanced from '../../../shaders/texture/instanced/fragment.glsl';
import vsSource_colorTexture from '../../../shaders/color_texture/vertex.glsl';
import fsSource_colorTexture from '../../../shaders/color_texture/fragment.glsl';
// Specialized Shaders
import vsSource_miniImages from '../../../shaders/mini_images/vertex.glsl';
import fsSource_miniImages from '../../../shaders/mini_images/fragment.glsl';
import vsSource_highlights from '../../../shaders/highlights/vertex.glsl';
import fsSource_highlights from '../../../shaders/highlights/fragment.glsl';
import vsSource_arrows from '../../../shaders/arrows/vertex.glsl';
import fsSource_arrows from '../../../shaders/arrows/fragment.glsl';
import vsSource_arrowImages from '../../../shaders/arrow_images/vertex.glsl';
import fsSource_arrowImages from '../../../shaders/arrow_images/fragment.glsl';
import vsSource_starfield from '../../../shaders/starfield/vertex.glsl';
import fsSource_starfield from '../../../shaders/starfield/fragment.glsl';


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
function initPrograms(): void {
	programs.push(
		createProgram_Color(),
		createProgram_Color_Instanced(),
		createProgram_Texture(),
		createProgram_Texture_Instanced(),
		createProgram_ColorTexture(),
		
		createProgram_MiniImages(),
		createProgram_Highlights(),
		createProgram_Arrows(),
		createProgram_ArrowImages(),
		createProgram_Starfield(),
	);
}

/**
 * Creates and return a shader program that is
 * capable of rendering meshes with colored vertices.
 * 
 * Each point in the vertex data array must have positional data (2 or 3 numbers)
 * followed by the color data (4 numbers).
 */
function createProgram_Color(): ShaderProgram {
	const program = createShaderProgram(vsSource_color, fsSource_color);
	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'a_position'),
			color: gl.getAttribLocation(program, 'a_color')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'u_transformmatrix')!
		},
	};
}

/**
 * Creates and return a shader program that uses INSTANCED RENDERING
 * to render an instance that has positional data (2 or 3 numbers)
 * followed by color data (4 numbers),
 * with the instance-specific data array having position offsets (2 or 3 numbers).
 */
function createProgram_Color_Instanced(): ShaderProgram {
	const program = createShaderProgram(vsSource_colorInstanced, fsSource_colorInstanced);
	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'a_position'),
			color: gl.getAttribLocation(program, 'a_color'),
			instanceposition: gl.getAttribLocation(program, 'a_instanceposition')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'u_transformmatrix')!
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
function createProgram_Arrows(): ShaderProgram {
	const program = createShaderProgram(vsSource_arrows, fsSource_arrows);
	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'a_position'),
			instanceposition: gl.getAttribLocation(program, 'a_instanceposition'),
			instancecolor: gl.getAttribLocation(program, 'a_instancecolor'),
			instancerotation: gl.getAttribLocation(program, 'aInstanceRotation')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'u_transformmatrix')!
		},
	};
}

/**
 * Creates and returns a shader program that uses INSTANCED RENDERING
 * to render colored shapes.
 * Instance-specific data includes position offsets.
 * A uniform 'u_size' controls the size multiplier of all rendered shapes.
 *
 * Base vertex data should define ONE shape (e.g., centered at origin)
 * with position (vec4) and color (vec4) attributes.
 * Instance data buffer should contain position offsets (vec3).
 */
function createProgram_Highlights(): ShaderProgram {
	const program = createShaderProgram(vsSource_highlights, fsSource_highlights);
	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'a_position'),
			color: gl.getAttribLocation(program, 'a_color'),
			instanceposition: gl.getAttribLocation(program, 'a_instanceposition')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'u_transformmatrix')!,
			size: gl.getUniformLocation(program, 'u_size')!
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
function createProgram_Texture(): ShaderProgram  {
	const program = createShaderProgram(vsSource_texture, fsSource_texture);
	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'a_position'),
			texcoord: gl.getAttribLocation(program, 'a_texturecoord'),
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'u_transformmatrix')!,
			u_sampler: gl.getUniformLocation(program, 'u_sampler')!
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
function createProgram_ColorTexture(): ShaderProgram  {
	const program = createShaderProgram(vsSource_colorTexture, fsSource_colorTexture);
	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'a_position'),
			texcoord: gl.getAttribLocation(program, 'a_texturecoord'),
			color: gl.getAttribLocation(program, 'a_color')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'u_transformmatrix')!,
			u_sampler: gl.getUniformLocation(program, 'u_sampler')!
		},
	};
}

/**
 * Creates and returns a shader program that uses INSTANCED RENDERING
 * to render instances with positional data and texture coordinates,
 * using instance-specific position offsets only.
 */
function createProgram_Texture_Instanced(): ShaderProgram {
	const program = createShaderProgram(vsSource_textureInstanced, fsSource_textureInstanced);
	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'a_position'),
			texcoord: gl.getAttribLocation(program, 'a_texturecoord'),
			instanceposition: gl.getAttribLocation(program, 'a_instanceposition')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'u_transformmatrix')!,
			u_sampler: gl.getUniformLocation(program, 'u_sampler')!
		},
	};
}

/**
 * Creates and returns a shader program that uses INSTANCED RENDERING
 * to render instances with positional data, texture coordinates, and instance-specific
 * position offsets, texture coordinate offsets, and color tinting.
 */
function createProgram_ArrowImages(): ShaderProgram {
	const program = createShaderProgram(vsSource_arrowImages, fsSource_arrowImages);
	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'a_position'),
			texcoord: gl.getAttribLocation(program, 'a_texturecoord'),
			instanceposition: gl.getAttribLocation(program, 'a_instanceposition'),
			instancetexcoord: gl.getAttribLocation(program, 'a_instancetexcoord'),
			instancecolor: gl.getAttribLocation(program, 'a_instancecolor')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'u_transformmatrix')!,
			u_sampler: gl.getUniformLocation(program, 'u_sampler')!
		},
	};
}

/**
 * Creates and returns a shader program that uses INSTANCED RENDERING
 * to render instances based on vertex data containing position, texture coordinates,
 * and vertex colors. Instance-specific data includes only position offsets.
 * The final color is the texture color multiplied by the vertex color.
 */
function createProgram_MiniImages(): ShaderProgram {
	const program = createShaderProgram(vsSource_miniImages, fsSource_miniImages);
	return {
		program,
		attribLocations: {
			position: gl.getAttribLocation(program, 'a_position'),
			texcoord: gl.getAttribLocation(program, 'a_texturecoord'),
			color: gl.getAttribLocation(program, 'a_color'),
			instanceposition: gl.getAttribLocation(program, 'a_instanceposition')
		},
		uniformLocations: {
			transformMatrix: gl.getUniformLocation(program, 'u_transformmatrix')!,
			size: gl.getUniformLocation(program, 'u_size')!,
			u_sampler: gl.getUniformLocation(program, 'u_sampler')! // Added u_sampler uniform location
		},
	};
}

/**
 * Creates and returns a shader program specifically for the starfield effect.
 * It uses INSTANCED RENDERING where each instance has a unique position, color, and size.
 * - Base vertex data defines a simple quad (the shape of one star).
 * - Instance data provides position (vec2), color (vec4), and size (float) for each star.
 */
function createProgram_Starfield(): ShaderProgram {
	const program = createShaderProgram(vsSource_starfield, fsSource_starfield);
	return {
		program,
		attribLocations: {
			position:         gl.getAttribLocation(program, 'a_position'),
			instanceposition: gl.getAttribLocation(program, 'a_instanceposition'),
			instancecolor:    gl.getAttribLocation(program, 'a_instancecolor'),
			instancesize:     gl.getAttribLocation(program, 'a_instancesize'),
		},
		uniformLocations: {
			transformMatrix:  gl.getUniformLocation(program, 'u_transformmatrix')!,
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
 * Uniforms you NEVER have to provide are [transformMatrix, u_sampler],
 * because those are either present in every shader already, OR the u_sampler uniform
 * is assumed if you're using the 'texcoord' attribute.
 * 
 * An example of a uniform you WOULD specify is 'tintColor'.
 * 
 * @param attributes - A list of all attributes we need to use. (e.g. `['position','color']` for vertex data that doesn't use a texture)
 * @param [uniforms] Optional. Only provide if you need to use a uniform that is not one of the assumed [transformMatrix, u_sampler]
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