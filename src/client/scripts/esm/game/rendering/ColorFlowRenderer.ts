// src/client/scripts/esm/renderers/ColorFlowRenderer.ts

/**
 * A modular renderer that paints a color flow effect across the
 * entire screen on demand, similar to the Iridescene Zone effect.
 * Intended for use as a background effect inside void for video footage.
 *
 * It is entirely self-contained, using its own shaders and buffers.
 * The shader written specifically for this script is: src/client/shaders/fullscreen_colorflow/fragment.glsl
 *
 * Usage:
 *   1. Instantiate with a WebGL2RenderingContext.
 *   2. Call render(deltaTime) each frame to draw the effect.
 */
export class ColorFlowRenderer {
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram | null = null;

	// --- Buffers & VAO ---
	private quadBuffer: WebGLBuffer | null = null;
	private vao: WebGLVertexArrayObject | null = null;

	// --- Configuration (Matching IridescenceZone defaults) ---
	public flowSpeed: number = 0.07;
	public flowRotationSpeed: number = 0.0025;
	public gradientRepeat: number = 0.7;
	public alpha: number = 1.0;

	// Abyssal Ocean color palette
	// Deep, calming, mysterious blues and greens
	public colors: [number, number, number][] = [
		[0.0, 0.1, 0.3], // Midnight Blue
		[0.0, 0.3, 0.5], // Deep Teal
		[0.0, 0.6, 0.7], // Ocean Blue
		[0.0, 0.8, 0.6], // Seafoam Green
		[0.0, 0.4, 0.8], // Azure
		[0.1, 0.1, 0.4], // Dark Indigo
	];

	// --- State ---
	private flowDirection: number = Math.random() * Math.PI * 2;
	private flowDistance: number = 0;

	// --- Shader Source (Inlined for modularity) ---
	private readonly vsSource = `#version 300 es
        in vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

	private readonly fsSource = `#version 300 es
        precision highp float;
        uniform vec2 u_resolution;
        uniform float u_flowDistance;
        uniform vec2 u_flowDirectionVec;
        uniform float u_gradientRepeat;
        uniform float u_alpha;
        uniform vec3 u_colors[6];
        out vec4 fragColor;

        vec3 getColorFromRamp(float t) {
            float scaledT = t * 6.0;
            int index = int(floor(scaledT));
            float blend = fract(scaledT);
            int nextIndex = (index + 1) % 6;
            if (index >= 6) index = 0;
            return mix(u_colors[index], u_colors[nextIndex], blend);
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            float aspect = u_resolution.x / u_resolution.y;
            uv.x *= aspect;
            float projectedUv = dot(uv, u_flowDirectionVec);
            float phase = (projectedUv * u_gradientRepeat) + u_flowDistance;
            vec3 finalColor = getColorFromRamp(fract(phase));
            fragColor = vec4(finalColor, u_alpha);
        }
    `;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.init();
	}

	private init(): void {
		// 1. Compile Shaders
		const vertexShader = this.createShader(this.gl.VERTEX_SHADER, this.vsSource);
		const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, this.fsSource);

		if (!vertexShader || !fragmentShader)
			throw new Error('ColorFlowRenderer: Failed to create shaders');

		// 2. Create Program
		this.program = this.gl.createProgram();
		if (!this.program) throw new Error('ColorFlowRenderer: Failed to create program');

		this.gl.attachShader(this.program, vertexShader);
		this.gl.attachShader(this.program, fragmentShader);
		this.gl.linkProgram(this.program);

		if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
			console.error(this.gl.getProgramInfoLog(this.program));
			throw new Error('ColorFlowRenderer: Failed to link program');
		}

		// 3. Create Full-Screen Quad & VAO
		this.vao = this.gl.createVertexArray();
		this.gl.bindVertexArray(this.vao);

		// prettier-ignore
		const vertices = new Float32Array([
            -1, -1,  1, -1,
            -1,  1, -1,  1,
             1, -1,  1,  1,
        ]);

		this.quadBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

		// Configure attributes INSIDE the VAO
		const positionLoc = this.gl.getAttribLocation(this.program, 'a_position');
		this.gl.enableVertexAttribArray(positionLoc);
		this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);

		// Clean up: Unbind everything
		this.gl.bindVertexArray(null);
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
	}

	private createShader(type: number, source: string): WebGLShader | null {
		const shader = this.gl.createShader(type);
		if (!shader) return null;
		this.gl.shaderSource(shader, source);
		this.gl.compileShader(shader);
		if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
			console.error(this.gl.getShaderInfoLog(shader));
			this.gl.deleteShader(shader);
			return null;
		}
		return shader;
	}

	/**
	 * Updates internal animation state and draws the effect to the current framebuffer.
	 * @param deltaTime Time in seconds since the last frame
	 */
	public render(deltaTime: number): void {
		if (!this.program || !this.vao) return;

		// --- 1. Update Animation State ---
		this.flowDirection += this.flowRotationSpeed * deltaTime;
		if (this.flowDirection > Math.PI * 2) this.flowDirection -= Math.PI * 2;
		this.flowDistance += this.flowSpeed * deltaTime;
		const flowDirectionVec = [Math.cos(this.flowDirection), Math.sin(this.flowDirection)];

		// --- 2. SAVE PREVIOUS STATE ---
		const prevProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
		const prevVAO = this.gl.getParameter(this.gl.VERTEX_ARRAY_BINDING);
		const prevArrayBuffer = this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING);
		const prevBlend = this.gl.isEnabled(this.gl.BLEND);
		const prevDepthTest = this.gl.isEnabled(this.gl.DEPTH_TEST);
		const prevDepthMask = this.gl.getParameter(this.gl.DEPTH_WRITEMASK);
		// Save blend function parameters
		const prevSrcRGB = this.gl.getParameter(this.gl.BLEND_SRC_RGB);
		const prevDstRGB = this.gl.getParameter(this.gl.BLEND_DST_RGB);
		const prevSrcAlpha = this.gl.getParameter(this.gl.BLEND_SRC_ALPHA);
		const prevDstAlpha = this.gl.getParameter(this.gl.BLEND_DST_ALPHA);

		// --- 3. SETUP & DRAW ---
		this.gl.useProgram(this.program);
		this.gl.bindVertexArray(this.vao);

		// Ensure we draw over everything and don't write to depth buffer
		this.gl.disable(this.gl.DEPTH_TEST);
		this.gl.depthMask(false);

		// Set Uniforms
		const uResolution = this.gl.getUniformLocation(this.program, 'u_resolution');
		const uFlowDistance = this.gl.getUniformLocation(this.program, 'u_flowDistance');
		const uFlowDirectionVec = this.gl.getUniformLocation(this.program, 'u_flowDirectionVec');
		const uGradientRepeat = this.gl.getUniformLocation(this.program, 'u_gradientRepeat');
		const uAlpha = this.gl.getUniformLocation(this.program, 'u_alpha');
		const uColors = this.gl.getUniformLocation(this.program, 'u_colors');

		this.gl.uniform2f(uResolution, this.gl.canvas.width, this.gl.canvas.height);
		this.gl.uniform1f(uFlowDistance, this.flowDistance);
		this.gl.uniform2fv(uFlowDirectionVec, flowDirectionVec);
		this.gl.uniform1f(uGradientRepeat, this.gradientRepeat);
		this.gl.uniform1f(uAlpha, this.alpha);

		const flatColors: number[] = [];
		for (let i = 0; i < 6; i++) {
			const col = this.colors[i] || [0, 0, 0];
			flatColors.push(...col);
		}
		this.gl.uniform3fv(uColors, new Float32Array(flatColors));

		// Handle Blending
		if (this.alpha < 1.0) {
			this.gl.enable(this.gl.BLEND);
			this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
		} else {
			this.gl.disable(this.gl.BLEND);
		}

		this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

		// --- 4. RESTORE STATE ---
		this.gl.depthMask(prevDepthMask);
		if (prevDepthTest) this.gl.enable(this.gl.DEPTH_TEST);
		else this.gl.disable(this.gl.DEPTH_TEST);

		if (prevBlend) {
			this.gl.enable(this.gl.BLEND);
			this.gl.blendFuncSeparate(prevSrcRGB, prevDstRGB, prevSrcAlpha, prevDstAlpha);
		} else {
			this.gl.disable(this.gl.BLEND);
		}

		this.gl.bindVertexArray(prevVAO);
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, prevArrayBuffer);
		this.gl.useProgram(prevProgram);
	}
}
