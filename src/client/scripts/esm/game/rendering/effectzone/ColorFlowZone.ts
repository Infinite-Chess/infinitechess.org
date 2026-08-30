// src/client/scripts/esm/game/rendering/effectzone/ColorFlowZone.ts

/**
 * The base for every zone drawing the shader's ColorFlow effect — a gradient sheen
 * drifting across the board, light and dark tiles shifted apart in hue.
 *
 * Subclasses supply only their colors, their numbers, and their ambience. The uniforms
 * are named `u<effectType>_*`, matching the branch that reads them in
 * board_uber_shader/fragment.glsl.
 */

import type { UniformValue } from '../../../webgl/Renderable';

import deltatime from '../../../board/deltatime.js';
import { BaseZone } from './BaseZone';

// Types -----------------------------------------------------------------------

type RGB = [number, number, number];

/** Exactly six gradient color stops, one per `u<effectType>_color1..6` uniform. */
export type ColorStops = [RGB, RGB, RGB, RGB, RGB, RGB];

/** How one ColorFlow zone differs from its siblings. */
export interface ColorFlowConfig {
	/** The unique integer id this effect zone gets, and the prefix of its uniform names. */
	effectType: number;
	/** The RGB colors defining the gradient. */
	colors: ColorStops;
	/** How strongly the gradient colors blend with the original board tile colors. */
	strength: number;
	/** The phase shift applied to the light tiles' gradient, as a fraction of the gradient's length. */
	maskOffset: number;
	/** The base speed at which the gradient scrolls across the screen. */
	flowSpeed?: number;
	/** The speed at which the flow direction rotates, in radians per second. */
	flowRotationSpeed?: number;
	/** How many times the full gradient repeats across the screen along the direction of flow. */
	gradientRepeat?: number;
}

// Constants -------------------------------------------------------------------

/** Applied to any zone that doesn't state its own. */
const DEFAULTS = {
	flowSpeed: 0.07,
	flowRotationSpeed: 0.0025,
	gradientRepeat: 0.7,
};

// Class -----------------------------------------------------------------------

export abstract class ColorFlowZone extends BaseZone {
	readonly effectType: number;

	private readonly config: Required<ColorFlowConfig>;

	/** Uniform names, built once — {@link getUniforms} runs every frame. */
	private readonly keys: Record<
		'flowDistance' | 'flowDirectionVec' | 'gradientRepeat' | 'maskOffset' | 'strength',
		string
	>;
	private readonly colorKeys: readonly string[];

	/** The current direction of the flow, in radians. */
	private flowDirection: number = Math.random() * Math.PI * 2;

	constructor(config: ColorFlowConfig) {
		super();
		this.config = { ...DEFAULTS, ...config };
		this.effectType = config.effectType;

		const prefix = `u${config.effectType}_`;
		this.keys = {
			flowDistance: prefix + 'flowDistance',
			flowDirectionVec: prefix + 'flowDirectionVec',
			gradientRepeat: prefix + 'gradientRepeat',
			maskOffset: prefix + 'maskOffset',
			strength: prefix + 'strength',
		};
		this.colorKeys = config.colors.map((_color, i) => `${prefix}color${i + 1}`);
	}

	public update(): void {
		const deltaTime = deltatime.get(); // In seconds

		// Rotate the flow direction over time.
		this.flowDirection += this.config.flowRotationSpeed * deltaTime;
		if (this.flowDirection > Math.PI * 2) this.flowDirection -= Math.PI * 2;
		else if (this.flowDirection < 0) this.flowDirection += Math.PI * 2;
	}

	public getUniforms(): Record<string, UniformValue> {
		const { colors, strength, maskOffset, gradientRepeat, flowSpeed } = this.config;

		const uniforms: Record<string, UniformValue> = {
			[this.keys.flowDistance]: (performance.now() / 1000) * flowSpeed,
			[this.keys.flowDirectionVec]: [
				Math.cos(this.flowDirection),
				Math.sin(this.flowDirection),
			],
			[this.keys.gradientRepeat]: gradientRepeat,
			[this.keys.maskOffset]: maskOffset,
			[this.keys.strength]: strength,
		};

		for (let i = 0; i < colors.length; i++) uniforms[this.colorKeys[i]!] = colors[i]!;

		return uniforms;
	}
}
