// src/client/scripts/esm/game/rendering/effect_zone/zones/OceanZone.ts

// @ts-ignore
import loadbalancer from '../../../misc/loadbalancer';
import { SoundscapePlayer } from '../../../../audio/SoundscapePlayer';
import { ProgramManager } from '../../../../webgl/ProgramManager';
import { PostProcessPass } from '../../../../webgl/post_processing/PostProcessingPipeline';
import { RippleSource, WaterPass } from '../../../../webgl/post_processing/passes/WaterPass';
import camera from '../../camera';
import { Zone } from '../EffectZoneManager';
import { ColorGradePass } from '../../../../webgl/post_processing/passes/ColorGradePass';
import UndercurrentSoundscape from '../soundscapes/UndercurrentSoundscape';

export class OceanZone implements Zone {
	/** The unique integer id this effect zone gets. */
	readonly effectType: number = 10;

	private colorGradePass: ColorGradePass;

	/** The post-processing pass that renders the water ripple effect from continuous sources. */
	private waterPass: WaterPass;

	/** The soundscape player for this zone. */
	private ambience: SoundscapePlayer;

	/** The distance from the center of the screen (in world units) to place the ripples. */
	private readonly RIPPLE_DISTANCE: number = 100;

	/** The speed at which the circle of ripples rotates, in radians per second. */
	private readonly ROTATION_SPEED: number = 0.02;

	// State ---------------------------------------------------

	/** The state of the three persistent ripple sources. */
	private readonly sources: RippleSource[];

	/** The direction the circle rotates. Set randomly on initialization. */
	private readonly rotationDirection: 1 | -1;

	/** The current rotation of the entire ripple circle, in radians. */
	private circleRotationAngle: number = 0;

	constructor(programManager: ProgramManager) {
		this.colorGradePass = new ColorGradePass(programManager);
		this.colorGradePass.saturation = 0.6;
		this.colorGradePass.tint = [0.9, 0.95, 1.0]; // Slight blue

		// Initialize the WaterPass with the current canvas dimensions.
		this.waterPass = new WaterPass(programManager, camera.canvas.width, camera.canvas.height);

		// Initialize the three permanent ripple sources. Their location will be updated each frame.
		this.sources = [{ center: [0, 0] }, { center: [0, 0] }, { center: [0, 0] }];

		// Determine the rotation direction randomly.
		this.rotationDirection = Math.random() < 0.5 ? 1 : -1;

		this.ambience = new SoundscapePlayer(UndercurrentSoundscape.config);

		// Create event listener for screen resize to update water pass resolution.
		document.addEventListener('canvas_resize', (event) => {
			const { width, height } = event.detail;
			this.waterPass.setResolution(width, height);
		});
	}

	public update(): void {
		const deltaTime = loadbalancer.getDeltaTime(); // Time in seconds since last frame.

		// --- 1. Animate the rotation of the ripple circle ---
		this.circleRotationAngle += this.ROTATION_SPEED * this.rotationDirection * deltaTime;

		// --- 2. Define the base ripple locations on the circle ---
		// prettier-ignore
		const baseAngles = [
			0,                                      // 0 degrees
			40 * (Math.PI / 180),                   // 40 degrees in radians
			(40 + 80) * (Math.PI / 180),            // 120 degrees in radians
		];

		// Calculate the final world positions by applying the current circle rotation.
		const worldPositions = baseAngles.map((angle) => ({
			x: Math.cos(angle + this.circleRotationAngle) * this.RIPPLE_DISTANCE,
			y: Math.sin(angle + this.circleRotationAngle) * this.RIPPLE_DISTANCE,
		}));

		// --- 3. Convert world space coordinates to screen UVs [0-1] ---
		const screenBox = camera.getScreenBoundingBox(false);
		const screenWidthWorld = screenBox.right - screenBox.left;
		const screenHeightWorld = screenBox.top - screenBox.bottom;

		// Calculate the final UV for each ripple and update its source's center.
		for (let i = 0; i < worldPositions.length; i++) {
			const pos = worldPositions[i]!;
			const source = this.sources[i]!;

			const u = (pos.x - screenBox.left) / screenWidthWorld;
			const v = (pos.y - screenBox.bottom) / screenHeightWorld;

			source.center = [u, v];
		}

		// --- 4. Feed the updated ripple source locations to the pass ---
		this.waterPass.updateSources(this.sources);
		this.waterPass.time = performance.now();
	}

	public getUniforms(): Record<string, any> {
		// This zone's visual effect is purely from a post-processing pass,
		// so it does not need to send any uniforms to the main board shader.
		return {};
	}

	public getPasses(): PostProcessPass[] {
		// Return the water pass to be rendered by the pipeline.
		return [this.colorGradePass, this.waterPass];
	}

	public fadeInAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeIn(transitionDurationMillis);
	}

	public fadeOutAmbience(transitionDurationMillis: number): void {
		this.ambience.fadeOut(transitionDurationMillis);
	}
}
