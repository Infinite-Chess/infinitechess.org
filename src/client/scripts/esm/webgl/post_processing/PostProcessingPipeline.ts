
// src/client/scripts/esm/webgl/post_processing/PostProcessingPipeline.ts

import { ProgramManager } from "../ProgramManager";
import { ShaderProgram } from "../ShaderProgram";
import { PassThroughPass } from "./passes/PassThroughPass";


/** A Post Processing Effect. */
export interface PostProcessPass {
	/** The shader program this pass uses. */
	readonly program: ShaderProgram<string, string>;

	/** 
	 * Executes the render pass.
	 * This method is responsible for activating the shader and setting its uniforms.
	 * @param gl The WebGL2 rendering context.
	 * @param inputTexture The texture to read from (the result of the previous pass).
	 */
	// eslint-disable-next-line no-unused-vars
	render(gl: WebGL2RenderingContext, inputTexture: WebGLTexture): void;
}


/**
 * Manages the post-processing pipeline for a raw WebGL2 application.
 * This class handles FBO creation, resizing, and the "ping-pong" technique
 * for chaining multiple effects.
 */
export class PostProcessingPipeline {
	private gl: WebGL2RenderingContext;
	private passes: PostProcessPass[] = [];

	// --- Ping-Pong Framebuffers ---
	// We use two FBOs to read from one while writing to the other.
	private readFBO: WebGLFramebuffer;
	private writeFBO: WebGLFramebuffer;
	private readTexture: WebGLTexture;
	private writeTexture: WebGLTexture;

	// --- Depth/Stencil Buffer ---
	// This is only needed for the initial 3D scene render.
	private sceneDepthStencilBuffer: WebGLRenderbuffer;

	// This will hold the default shader for the "zero effects" case.
	private passThroughPass: PassThroughPass;


	constructor(gl: WebGL2RenderingContext, programManager: ProgramManager) {
		this.gl = gl;
		
		// Get the pass-through shader from your manager.
		this.passThroughPass = new PassThroughPass(programManager);

		const initialWidth = gl.canvas.width;
		const initialHeight = gl.canvas.height;

		// --- Create Framebuffers and Textures ---
		const { fbo: fboA, texture: textureA } = this.createFBO(initialWidth, initialHeight);
		const { fbo: fboB, texture: textureB } = this.createFBO(initialWidth, initialHeight);
		this.readFBO = fboA;
		this.readTexture = textureA;
		this.writeFBO = fboB;
		this.writeTexture = textureB;

		// --- Create Depth/Stencil Renderbuffer ---
		this.sceneDepthStencilBuffer = gl.createRenderbuffer()!;
		
		// --- Initial sizing ---
		this.resize(gl.canvas.width, gl.canvas.height);
	}

	/**
	 * Creates a single Framebuffer Object and its corresponding color texture.
	 */
	private createFBO(width: number, height: number): { fbo: WebGLFramebuffer, texture: WebGLTexture } {
		const gl = this.gl;

		const texture = gl.createTexture();
		if (!texture) throw new Error("Could not create texture");
		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Allocate storage for the texture IMMEDIATELY upon creation.
		// Use RGBA8 for standard dynamic range. You could use RGBA16F for HDR.
		// FIXES MOBILE BUG. Previousy we were attaching sizeless (0x0) textures
		// to framebuffers; strict mobile drivers permanently mark these as invalid,
		// while lenient desktop drivers allow it. This line allocates the texture's
		// storage with the correct dimensions before attaching it, ensuring the
		// framebuffer is valid from the start on all platforms.
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		const fbo = gl.createFramebuffer();
		if (!fbo) throw new Error("Could not create framebuffer");
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

		// Unbind to be clean
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		return { fbo, texture };
	}
	
	/**
	 * Updates the entire list of post processing effect passes.
	 */
	public setPasses(passes: PostProcessPass[]): void {
		this.passes = passes;
	}

	/**
	 * Call this BEFORE rendering your main 3D scene.
	 * It binds the FBO, redirecting all subsequent draw calls to an off-screen texture.
	 */
	public begin(): void {
		const gl = this.gl;

		// Bind the FBO we will write the 3D scene into.
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFBO);

		// **IMPORTANT**: Attach the depth/stencil buffer for the scene render.
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.sceneDepthStencilBuffer);

		// Check if the framebuffer is complete.
		const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		if (status !== gl.FRAMEBUFFER_COMPLETE) {
			console.error(`FBO is not complete: ${status}`);
		}

		// Set the viewport to the FBO size and clear it.
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
		
		// Enable blending if your main scene needs it.
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.DEPTH_TEST);
	}

	/**
	 * Call this AFTER your main 3D scene has been rendered.
	 * It executes the post-processing passes and draws the final result to the canvas.
	 */
	public end(): void {
		const gl = this.gl;

		// **IMPORTANT**: Detach the depth/stencil buffer.
		// Subsequent 2D quad passes do not need it and it can cause FBO-incomplete errors.
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, null);
		// We don't need depth testing or complex blending for drawing full-screen quads.
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);

		// Swap so the scene we just rendered is now in the 'read' FBO.
		this.swapFBOs();

		// If we have no added no passes, we'll use our pass-through shader.
		// This creates a unified code path for all scenarios.
		const activePasses: PostProcessPass[] = this.passes.length > 0 ? this.passes : [this.passThroughPass];
		
		// 1. PING-PONG PASSES: Loop through all but the very last pass.
		// These passes all render to the next FBO.
		for (let i = 0; i < activePasses.length - 1; i++) {
			const pass = activePasses[i]!;
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFBO); // Target the off-screen buffer

			pass.render(gl, this.readTexture);

			gl.drawArrays(gl.TRIANGLES, 0, 6); // 6 vertices (2 triangles)

			this.swapFBOs(); // The FBO we just wrote to becomes the read FBO for the next pass
		}
		
		// 2. FINAL PASS: Render the last effect directly to the screen.
		const lastPass = activePasses[activePasses.length - 1]!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Target the canvas
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.clear(gl.COLOR_BUFFER_BIT); // Clear canvas before drawing final result

		lastPass.render(gl, this.readTexture);

		gl.drawArrays(gl.TRIANGLES, 0, 6); // 6 vertices (2 triangles)
	}

	/**
	 * Swaps the read and write FBOs for the ping-pong technique.
	 */
	private swapFBOs(): void {
		const tempFBO = this.readFBO;
		this.readFBO = this.writeFBO;
		this.writeFBO = tempFBO;

		const tempTexture = this.readTexture;
		this.readTexture = this.writeTexture;
		this.writeTexture = tempTexture;
	}
	
	/**
	 * Must be called whenever the canvas is resized to update the FBO textures
	 * and the depth/stencil buffer.
	 * @param width The new width of the canvas.
	 * @param height The new height of the canvas.
	 */
	public resize(width: number, height: number): void {
		const gl = this.gl;
		
		// Resize the color textures
		const textures = [this.readTexture, this.writeTexture];
		for (const texture of textures) {
			gl.bindTexture(gl.TEXTURE_2D, texture);
			// Use RGBA8 for standard dynamic range. You could use RGBA16F for HDR.
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		}
		
		// Resize the depth/stencil renderbuffer
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.sceneDepthStencilBuffer);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
		
		// Unbind to be clean
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindRenderbuffer(gl.RENDERBUFFER, null);
	}
}