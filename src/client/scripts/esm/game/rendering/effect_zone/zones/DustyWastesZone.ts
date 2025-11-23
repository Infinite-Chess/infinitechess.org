
// src/client/scripts/esm/game/rendering/effect_zone/zones/DustyWastesZone.ts

// @ts-ignore
import loadbalancer from "../../../misc/loadbalancer";
import { ColorGradePass } from "../../../../webgl/post_processing/passes/ColorGradePass";
import { GlitchPass } from "../../../../webgl/post_processing/passes/GlitchPass";
import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { ProgramManager } from "../../../../webgl/ProgramManager";
import { Zone } from "../EffectZoneManager";
import { SoundscapeConfig, SoundscapePlayer } from "../../../../audio/SoundscapePlayer";


export class DustyWastesZone implements Zone {

	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 6;

	private colorGradePass: ColorGradePass;
	private glitchPass: GlitchPass;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;


	// --- Wind Effect Properties ---
	/** The opacity of the wind effect. */
	private windOpacity: number = 0.4; // Default: 0.35

	/** How many times the noise texture should tile the screen. */
	private noiseTiling: number = 1.25;

	/** The average wind speed. */
	private windSpeed: number = 0.7;

	/** How much faster one scroll speed is greater than the other. */
	private windSpeedsOffset: number = 1.2;

	/** The vector offset in radians each scroll vector is from each other. */
	private windDirectionsOffset: number = 0.6;

	/** The direction the wind is rotating. Clockwise or counter-clockwise. */
	private windRotationParity: -1 | 1 = Math.random() < 0.5 ? -1 : 1;

	/** The speed at which the wind direction rotates, in radians per second. */
	private windRotationSpeed: number = 0.0025;


	// --- Glitch Effect Properties ---
	/** A multiplier for the chromatic aberration strength. */
	private aberrationStrengthMultiplier: number = 1.3;
	/** Minimum amount of trauma to add per glitch burst. */
	private minTraumaToAdd: number = 0.5;
	/** Maximum amount of trauma to add per glitch burst. */
	private maxTraumaToAdd: number = 1.5;
	/** Intensity decreases by this amount per second. */
	private decayRate: number = 2.0;
	/** Minimum seconds between glitch bursts. */
	private minInterval: number = 1.0;
	/** Maximum seconds between glitch bursts. */
	private maxInterval: number = 7.0;
	/** Maximum allowed glitch intensity ("trauma") before clamping. */
	private maxTrauma: number = 2.0;


	// ============ State ============

	// --- Wind Animation State ---
	/** The wind direction in radians. 0 is to the right. */
	private windDirection: number = Math.random() * Math.PI * 2;

	/** The accumulated UV offset for the first noise layer. Wrapped to [0,1]. */
	private uvOffset1: [number, number] = [0, 0];

	/** The accumulated UV offset for the second noise layer. Wrapped to [0,1]. */
	private uvOffset2: [number, number] = [0, 0];

	// --- Glitch "Trauma" Animation State ---
	/** Current "trauma" level, from 0.0 to 1.0+. */
	private glitchIntensity: number = 0.0;
	/** Countdown timer in seconds until the next glitch burst. */
	private timeUntilNextGlitch: number = 0.0;


	constructor(programManager: ProgramManager) {
		this.colorGradePass = new ColorGradePass(programManager);
		this.colorGradePass.brightness = -0.2; // Default: 0.7
		this.colorGradePass.tint = [1.0, 0.75, 0.7]; // Slight red tint

		this.glitchPass = new GlitchPass(programManager);
		
		// Load the ambience...

		const noiseConfig: SoundscapeConfig = {
			masterVolume: 0.14,
			layers: [
				{
					volume: {
						base: 1,
						lfo: {
							wave: "perlin",
							rate: 0.76,
							depth: 0.12
						}
					},
					source: {
						type: "noise"
					},
					filters: [
						{
							type: "lowpass",
							frequency: {
								base: 271
							},
							Q: {
								base: 1.0001
							},
							gain: {
								base: 0
							}
						}
					]
				},
				{
					volume: {
						base: 0.5
					},
					source: {
						type: "noise"
					},
					filters: [
						{
							type: "bandpass",
							frequency: {
								base: 909,
								lfo: {
									wave: "perlin",
									rate: 0.47,
									depth: 203
								}
							},
							Q: {
								base: 29.9901
							},
							gain: {
								base: 0
							}
						},
						{
							type: "bandpass",
							frequency: {
								base: 909,
								lfo: {
									wave: "perlin",
									rate: 0.35,
									depth: 201
								}
							},
							Q: {
								base: 10.7801
							},
							gain: {
								base: 0
							}
						}
					]
				}
			]
		};

		// Initialize the player with the config.
		this.ambience = new SoundscapePlayer(noiseConfig);
	}


	/** Responsible for calculating the exact UV offsets of the noise texture layers each frame. */
	public update(): void {
		const deltaTime = loadbalancer.getDeltaTime();

		// --- Wind update logic ---

		// Optional animation of other properties
		
		// this.windSpeed = math.getSineWaveVariation(Date.now() / 1000, 0, 0.9);
		// this.windDirectionsOffset = math.getSineWaveVariation(Date.now() / 1000, 0, 2.5);
		// this.windSpeedsOffset = math.getSineWaveVariation(Date.now() / 1000, 1, 2.0);

		// Animate the wind direction.
	
		this.windDirection += this.windRotationSpeed * this.windRotationParity * deltaTime;
		if (this.windDirection > Math.PI * 2) this.windDirection -= Math.PI * 2;
		else if (this.windDirection < 0) this.windDirection += Math.PI * 2;

		// Calculate the instantaneous velocity vectors for this frame.
		const angle1 = this.windDirection - (this.windDirectionsOffset / 2);
		const angle2 = this.windDirection + (this.windDirectionsOffset / 2);

		const velocity1 = [
			Math.cos(angle1) * this.windSpeed,
			Math.sin(angle1) * this.windSpeed
		];
		const velocity2 = [
			Math.cos(angle2) * this.windSpeed * this.windSpeedsOffset,
			Math.sin(angle2) * this.windSpeed * this.windSpeedsOffset
		];

		// 3. Integrate: Add the displacement for this frame (velocity * deltaTime) to the total offset.
		this.uvOffset1[0] += (velocity1[0]! * deltaTime) % 1;
		this.uvOffset1[1] += (velocity1[1]! * deltaTime) % 1;
		this.uvOffset2[0] += (velocity2[0]! * deltaTime) % 1;
		this.uvOffset2[1] += (velocity2[1]! * deltaTime) % 1;


		// --- Glitch update logic ---

		// 1. Always decay the current glitch intensity
		this.glitchIntensity = Math.max(0, this.glitchIntensity - this.decayRate * deltaTime);

		// 2. Check if it's time to trigger a new glitch burst
		this.timeUntilNextGlitch -= deltaTime;
		if (this.timeUntilNextGlitch <= 0) {
			// Add a random amount of "trauma"
			const traumaToAdd = this.minTraumaToAdd + Math.random() * (this.maxTraumaToAdd - this.minTraumaToAdd);
			this.glitchIntensity = Math.min(this.glitchIntensity + traumaToAdd, this.maxTrauma); // Clamp at maxTrauma

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

	// Copied from GlitchZone for combined effect
	private randomizeNextGlitchTimer(): void {
		this.timeUntilNextGlitch = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
	}

	public getUniforms(): Record<string, any> {
		// Pass the final accumulated offsets directly to the shader.
		return {
			u6_strength: this.windOpacity,
			u6_noiseTiling: this.noiseTiling,
			u6_uvOffset1: this.uvOffset1,
			u6_uvOffset2: this.uvOffset2,
		};
	}

	public getPasses(): PostProcessPass[] {
		return [this.colorGradePass, this.glitchPass];
	}
    
	public fadeInAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeIn(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}