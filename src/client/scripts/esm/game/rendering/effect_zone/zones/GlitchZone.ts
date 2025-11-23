// src/client/scripts/esm/game/rendering/effect_zone/zones/GlitchZone.ts

import { ProgramManager } from "../../../../webgl/ProgramManager";
import { GlitchPass } from "../../../../webgl/post_processing/passes/GlitchPass";
import { Zone } from "../EffectZoneManager";
import { SoundscapePlayer } from "../../../../audio/SoundscapePlayer";
import AudioManager from "../../../../audio/AudioManager";
// @ts-ignore
import loadbalancer from "../../../misc/loadbalancer";

export class GlitchZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 12;

	/** Post Processing Glitch Effect. */
	private glitchPass: GlitchPass;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;

	/** A multiplier for the chromatic aberration strength. */
	private aberrationStrengthMultiplier: number = 1.3;

	/** Minimum amount of trauma to add per glitch burst. */
	private minTraumaToAdd: number = 0.5;
	/** Maximum amount of trauma to add per glitch burst. */
	private maxTraumaToAdd: number = 1.75;

	// --- Constants for controlling the effect ---
	/** Intensity decreases by this amount per second. */
	private decayRate: number = 2.0;
	/** Minimum seconds between glitch bursts. */
	private minInterval: number = 0.2;
	/** Maximum seconds between glitch bursts. */
	private MAX_INTERVAL: number = 2.0;

	// --- Glitch "Trauma" Animation State ---
	/** Current "trauma" level, from 0.0 to 1.0+. */
	private glitchIntensity: number = 0.5;
	/** Countdown timer in seconds until the next glitch burst. */
	private timeUntilNextGlitch: number = 1.5;

	constructor(programManager: ProgramManager) {
		this.glitchPass = new GlitchPass(programManager);
		this.ambience = new SoundscapePlayer({ masterVolume: 0.0, layers: [] }); // Dummy soundscape
		this.randomizeNextGlitchTimer();
	}

	private randomizeNextGlitchTimer(): void {
		this.timeUntilNextGlitch = this.minInterval + Math.random() * (this.MAX_INTERVAL - this.minInterval);
	}

	public update(): void {
		const deltaTime = loadbalancer.getDeltaTime();

		// 1. Always decay the current glitch intensity
		this.glitchIntensity = Math.max(0, this.glitchIntensity - this.decayRate * deltaTime);

		// 2. Check if it's time to trigger a new glitch burst
		this.timeUntilNextGlitch -= deltaTime;
		if (this.timeUntilNextGlitch <= 0) {
			// Add a random amount of "trauma"
			const traumaToAdd = this.minTraumaToAdd + Math.random() * (this.maxTraumaToAdd - this.minTraumaToAdd);
			this.glitchIntensity += traumaToAdd;

			this.randomizeNextGlitchTimer(); // Reset the timer for the next burst
		}

		// 3. Apply the current intensity to the shader pass properties
		// Use powers to make the visual effect more "bursty" and less linear
		const intensity = this.glitchIntensity * this.glitchIntensity;
		this.glitchPass.tearStrength = intensity;
		this.glitchPass.aberrationStrength = this.glitchIntensity * this.aberrationStrengthMultiplier;

		// 4. Keep the shader's internal time moving for tear pattern animation
		this.glitchPass.time += deltaTime;
	}

	public getUniforms(): Record<string, any> {
		return {}; // This zone uses post-processing only
	}

	public getPasses(): GlitchPass[] {
		return [this.glitchPass];
	}

	public fadeInAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeIn(transitionDurationMillis);
		AudioManager.fadeInDownsampler(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
		AudioManager.fadeOutDownsampler(transitionDurationMillis);
	}
}
