
// src/client/scripts/esm/game/rendering/effect_zone/EffectZoneManager.ts
import ImageLoader from "../../../util/ImageLoader";
import TextureLoader from "../../../webgl/TextureLoader";
import boardtiles from "../boardtiles";
import frametracker from "../frametracker";
import { PassThroughZone } from "./zones/PassThroughZone";
import { ProgramManager } from "../../../webgl/ProgramManager";
import { DustyDunesZone } from "./zones/DustyDunesZone";
import { PostProcessPass } from "../../../webgl/post_processing/PostProcessingPipeline";


/**
 * Defines a zone in space that applies a specific visual effect to the board.
 */
export interface EffectZone {
	/** A unique name for the zone, for debugging. */
	readonly name: string;
	/** The closest tile that this zone effect starts at. */
	readonly start: bigint;
	// eslint-disable-next-line no-unused-vars
	readonly constructor: new (programManager: ProgramManager) => Zone;
}

/**
 * A constructed Zone, with methods for updating, obtaining
 * relevant uniforms, and obtaining post-process passes.
 */
export interface Zone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number;
	/** Dynamically updates the zone effect. */
	readonly update: () => void;
	/** Returns the uniforms needed to send to the gpu. */
	readonly getUniforms: () => Record<string, any>;
	/** Returns the current post processing pass effects for this zone. */
	readonly getPasses: () => PostProcessPass[];
}

/**
 * Manages which visual effect is applied to the board based on distance from the origin,
 * and handles smooth, timed transitions between effect zones.
 */
export class EffectZoneManager {
	static readonly ZONES: EffectZone[] = [
		// Define zones in ascending order of their start distance.
		{
			name: 'Origin',
			start: 0n,
			constructor: PassThroughZone
		},
		{
			name: 'Dusty Wastes',
			start: 10n ** 9n,
			constructor: DustyDunesZone
		},
	];

	/** A reference to the WebGL rendering context. */
	private gl: WebGL2RenderingContext;

	/** The constructed Zones. */
	private zones: Record<string, Zone>;

	/** The noise texture used for zone effects. */
	private noiseTexture: WebGLTexture | undefined;


	// --- Transition State ---

	/** How long a transition between zones should take, in milliseconds. */
	private transitionDuration: number = 1500;
	/** The timestamp when the current transition started, or null if no transition is happening. */
	private transitionStartTime: number | null = null;
	
	/** The current zone we are in, or transitioning out of. */
	private currentZone: Zone;
	/** The zone we are transitioning into, or null if no transition is happening. */
	private transitionTargetZone: Zone | null = null;

	/** 0.0 = fully currentZone, 1.0 = fully targetZone */
	private transitionProgress: number = 0.0;


	constructor(gl: WebGL2RenderingContext, programManager: ProgramManager) {
		this.gl = gl;

		this.zones = {};
		// Construct each zone
		for (const zone of EffectZoneManager.ZONES) {
			this.zones[zone.name] = new zone.constructor(programManager);
		}

		this.currentZone = this.zones['Origin']!;

		// Load noise textures
		ImageLoader.loadImage('img/noise_texture/heat_haze.webp').then(image => {
			this.noiseTexture = TextureLoader.loadTexture(gl, image);
		});
	}


	/**
	 * Finds the active zone for a given distance from the origin.
	 */
	private findZoneForDistance(distance: bigint): Zone {
		let furthestZone: Zone | undefined;
		// Iterate through all proceeding zones in reverse to find
		// the furthest one that starts before our current distance.
		for (let i = EffectZoneManager.ZONES.length - 1; i >= 0; i--) {
			const zone = EffectZoneManager.ZONES[i]!;
			if (distance >= zone.start) {
				furthestZone = this.zones[zone.name];
				break;
			}
		}
		if (!furthestZone) throw new Error("No effect zones for distance " + distance);
		return furthestZone;
	}

	/**
	 * Detects if we should transition to a new zone,
	 * updates transitionProgress, and updates zone states.
	 */
	public update(distanceFromOrigin: bigint): void {
		// --- 1. UPDATE TRANSITION STATE ---
		if (this.transitionStartTime !== null && this.transitionTargetZone) {
			const elapsedTime = Date.now() - this.transitionStartTime;
			if (elapsedTime >= this.transitionDuration) {
				this.currentZone = this.transitionTargetZone;
				this.transitionTargetZone = null;
				this.transitionStartTime = null;
			}
		}

		// --- 2. DETECT NEW ZONE CROSSINGS ---
		const targetZoneForDistance = this.findZoneForDistance(distanceFromOrigin);

		if (
			this.transitionStartTime === null && // Only start a NEW transition if one isn't already active
			targetZoneForDistance !== this.currentZone
		) {
			// A new transition needs to start.
			// console.log(`Starting transition from ${this.currentZone.name} to ${targetZoneForDistance.name}`);
			this.transitionTargetZone = targetZoneForDistance;
			this.transitionStartTime = Date.now();
		} else if (
			this.transitionTargetZone && // A transition is active
			targetZoneForDistance === this.currentZone && // And we've moved back into the 'from' zone's area
			this.transitionTargetZone !== this.currentZone // And we're not already reversing
		) {
			// The user has changed their mind and is moving back. We need to reverse the transition.
			// console.log(`Reversing transition. Now going from ${this.transitionTargetZone.name} to ${this.currentZone.name}`);

			// 1. The 'from' and 'to' zones are swapped.
			const oldTarget = this.transitionTargetZone;
			this.transitionTargetZone = this.currentZone;
			this.currentZone = oldTarget;

			// 2. The timer is reversed.
			const elapsedTime = Date.now() - this.transitionStartTime!;
			const remainingTime = this.transitionDuration - elapsedTime;
			this.transitionStartTime = Date.now() - remainingTime;
		}

		// --- 3. UPDATE TRANSITION PROGRESS OF ACTIVE EFFECTS ---
		// Recalculate alpha for this frame's render pass.
		this.transitionProgress = (this.transitionStartTime && this.transitionTargetZone) 
			? Math.min((Date.now() - this.transitionStartTime) / this.transitionDuration, 1.0)
			: 0.0;

		// Debugging
		// console.log(
		// 	`Current: ${fromZone.name}, `,
		// 	`Target: ${toZone.name}, `,
		// 	`Alpha: ${transitionAlpha.toFixed(2)}`
		// );

		// Update individual zone states
		this.currentZone.update();
		if (this.transitionTargetZone) this.transitionTargetZone.update();

		// Only all for an animation frame if the current zone isn't the origin, or if we're mid-transition.
		// This ensures cpu usage isn't spiked from Zone Effects when near origin.
		if (this.currentZone !== this.zones['Origin'] || this.transitionTargetZone) frametracker.onVisualChange();
	}

	/**
	 * Renders the board tiles with all active Zones effects applied.
	 */
	public renderBoard(): void {
		const fromZone = this.currentZone;
		const toZone = this.transitionTargetZone || this.currentZone;

		// Construct the uniform object for the Uber-Shader

		const uniforms: Record<string, any> = {
			// Global uniforms
			// u_time: performance.now() / 1000, // <-- REENABLE ONCE WE HAVE OTHER ZONES THAT NEED IT!!!!!!!!!!!!!!
			u_transitionProgress: this.transitionProgress,
			u_resolution: [this.gl.canvas.width, this.gl.canvas.height],
			// Zone uniforms
			u_effectTypeA: fromZone.effectType,
			u_effectTypeB: toZone.effectType,
			...fromZone.getUniforms(),
			...toZone.getUniforms(),
		};

		// Render board tiles
		boardtiles.render({ noise: this.noiseTexture }, uniforms);
	}

	/**
	 * Returns an array of all post-process effects that should be active
	 * this frame, according to the distance we are from the origin,
	 * with their masterStrength properties set appropriately.
	 */
	public getActivePostProcessPasses(): PostProcessPass[] {
		const activePasses: PostProcessPass[] = [];

		const fromZonePasses = this.currentZone.getPasses();
		fromZonePasses.forEach(pass => pass.masterStrength = 1.0 - this.transitionProgress);
		activePasses.push(...fromZonePasses);
		
		if (this.transitionTargetZone) {
			const toZonePasses = this.transitionTargetZone.getPasses();
			toZonePasses.forEach(pass => pass.masterStrength = this.transitionProgress);
			activePasses.push(...toZonePasses);
		}

		return activePasses;
	}
}