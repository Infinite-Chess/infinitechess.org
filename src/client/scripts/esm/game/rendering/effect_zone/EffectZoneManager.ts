
// src/client/scripts/esm/game/rendering/effect_zone/EffectZoneManager.ts

import ImageLoader from "../../../util/ImageLoader";
import TextureLoader from "../../../webgl/TextureLoader";
import boardtiles from "../boardtiles";
import frametracker from "../frametracker";
import preferences from "../../../components/header/preferences";
import { ProgramManager } from "../../../webgl/ProgramManager";
import { TheBeginningZone } from "./zones/TheBeginningZone";
import { UndercurrentZone } from "./zones/UndercurrentZone";
import { DustyWastesZone } from "./zones/DustyWastesZone";
import { SearingDunesZone } from "./zones/SearingDunesZone";
import { ContortionFieldZone } from "./zones/ContortionFieldZone";
import { EchoRiftZone } from "./zones/EchoRiftZone";
import { StaticZone } from "./zones/StaticZone";
import { PostProcessPass } from "../../../webgl/post_processing/PostProcessingPipeline";


/**
 * Defines a zone in space that applies a specific visual effect to the board.
 */
export interface EffectZone {
	/** A unique name for the zone, for debugging. */
	readonly name: string;
	/** The closest tile that this zone effect starts at. */
	readonly start: bigint;
	/**
	 * Whether this zone uses advanced visual effects. If true, then
	 * the Advanced Effects settings toggle may disable the zone.
	 */
	readonly advancedEffect?: boolean;
}

/** Union of all Zone names. */
type ZoneName = typeof EffectZoneManager.ZONES[number]['name'];

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
    /** Fades in the ambience. */
	// eslint-disable-next-line no-unused-vars
	readonly fadeInAmbience: (transitionDurationMillis: number) => void;
    /** Fades out the ambience, then stops the track playing. */
	// eslint-disable-next-line no-unused-vars
	readonly fadeOutAmbience: (transitionDurationMillis: number) => void;
}

/**
 * Manages which visual effect is applied to the board based on distance from the origin,
 * and handles smooth, timed transitions between effect zones.
 */
export class EffectZoneManager {
	static readonly ZONES = [
		// Define zones in ascending order of their start distance.
		{ name: 'The Beginning', start: 0n, advancedEffect: false },
		// [PRODUCTION] Default distances:
		// { name: 'Undercurrent',     start: 10n ** 3n, advancedEffect: false },
		// { name: 'Searing Dunes',   start: 40n ** 36n, advancedEffect: true },
		// { name: 'Contortion Field', start: 60n ** 81n, advancedEffect: true },
		// { name: 'Dusty Wastes',     start: 80n ** 300n, advancedEffect: true },
		// { name: 'Static',           start: 100n ** 500n, advancedEffect: true },
		// { name: 'Echo Rift',        start: 120n ** 1000n, advancedEffect: true },
		// [TESTING] Much shorter distances:
		{ name: 'Undercurrent',     start: 20n, advancedEffect: false },
		{ name: 'Searing Dunes',   start: 40n, advancedEffect: true },
		{ name: 'Contortion Field', start: 60n, advancedEffect: true },
		{ name: 'Dusty Wastes',     start: 80n, advancedEffect: true },
		{ name: 'Static',           start: 100n, advancedEffect: true },
		{ name: 'Echo Rift',        start: 120n, advancedEffect: true },
	] as const satisfies Readonly<EffectZone>[];

	/** A reference to the WebGL rendering context. */
	private gl: WebGL2RenderingContext;

	/** The constructed Zones. */
	private zones: Record<ZoneName, Zone>;

	/** The perlin noise texture used for cloudy effects. */
	private perlinNoiseTexture: WebGLTexture | undefined;
	/** The white noise texture used for static effects. */
	private whiteNoiseTexture: WebGLTexture | undefined;


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
		
		// Load perlin noise texture
		const noiseTexture: Promise<WebGLTexture> = ImageLoader.loadImage('img/noise_texture/perlin_noise.webp').then(image => {
			const texture = TextureLoader.loadTexture(gl, image);
			this.perlinNoiseTexture = texture;
			return texture;
		});
		
		// Load white noise texture
		ImageLoader.loadImage('img/noise_texture/white_noise.webp').then(image => {
			// Ensure texture filtering is set to NEAREST for a sharp, pixelated look
			const texture = TextureLoader.loadTexture(gl, image, { mipmaps: false });
			this.whiteNoiseTexture = texture;
		});

		// Construct Zones
		this.zones = {
			'The Beginning': new TheBeginningZone(),
			'Undercurrent': new UndercurrentZone(),
			'Dusty Wastes': new DustyWastesZone(programManager),
			'Searing Dunes': new SearingDunesZone(programManager, noiseTexture),
			'Contortion Field': new ContortionFieldZone(programManager),
			'Echo Rift': new EchoRiftZone(programManager),
			'Static': new StaticZone(programManager),
		};

		this.currentZone = this.zones['The Beginning'];

		// Set up a listener for the ambience-enabled preference changing.
		document.addEventListener('ambience-toggle', (event: CustomEvent) => {
			// Turn on/off the ambience of the current zone (and transition target zone, if applicable).
			const enabled = event.detail;
			if (!enabled) {
				// Fade out any currently playing ambience.
				this.currentZone.fadeOutAmbience(this.transitionDuration);
				this.transitionTargetZone?.fadeOutAmbience(this.transitionDuration);
			} else {
				// If we're mid-transition, fade in the target zone's ambience.
				if (this.transitionTargetZone) this.transitionTargetZone.fadeInAmbience(this.transitionDuration);
				// Otherwise, fade in the current zone's ambience.
				else this.currentZone.fadeInAmbience(this.transitionDuration);
			}
		});
	}

	/**
	 * Finds the active zone for a given distance from the origin.
	 */
	private findZoneForDistance(distance: bigint): Zone {
		const advancedEnabled = preferences.getAdvancedEffectsMode();

		let furthestZone: Zone | undefined;
		// Iterate through all proceeding zones in reverse to find
		// the furthest one that starts before our current distance.
		for (let i = EffectZoneManager.ZONES.length - 1; i >= 0; i--) {
			const zone = EffectZoneManager.ZONES[i]!;
			if (!advancedEnabled && zone.advancedEffect) continue; // Skip zones requiring advanced effects if they're disabled
			if (distance >= zone.start) {
				furthestZone = this.zones[zone.name];
				break;
			}
		}
		if (!furthestZone) throw new Error(`No effect zones for distance ${distance}`);
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
			// console.log('Starting transition to new zone.');
			this.transitionTargetZone = targetZoneForDistance;
			this.transitionStartTime = Date.now();
			// Fade out the current zone's ambience and fade in the transitionTargetZone's
			if (preferences.getAmbienceEnabled()) {
				this.currentZone.fadeOutAmbience(this.transitionDuration);
				this.transitionTargetZone.fadeInAmbience(this.transitionDuration);
			}
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

			// Fade out the current zone's ambience and fade in the transitionTargetZone's
			if (preferences.getAmbienceEnabled()) {
				this.currentZone.fadeOutAmbience(elapsedTime);
				this.transitionTargetZone.fadeInAmbience(elapsedTime);
			}
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
		if (this.currentZone !== this.zones['The Beginning'] && this.currentZone !== this.zones['Undercurrent'] || this.transitionTargetZone) frametracker.onVisualChange();
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
			u_pixelDensity: window.devicePixelRatio,
			// Zone uniforms
			u_effectTypeA: fromZone.effectType,
			u_effectTypeB: toZone.effectType,
			...fromZone.getUniforms(),
			...toZone.getUniforms(),
		};

		// Render board tiles
		boardtiles.render({
			perlinNoise: this.perlinNoiseTexture,
			whiteNoise: this.whiteNoiseTexture
		}, uniforms);
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