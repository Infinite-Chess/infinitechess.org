
/**
 * This script controls the Post Processing Pass Effects on the
 * board when you are extremely far away from the origin.
 */

import type { ProgramManager } from "../../webgl/ProgramManager.js";
import type { PostProcessingPipeline, PostProcessPass } from "../../webgl/post_processing/PostProcessingPipeline.js";

// @ts-ignore
import loadbalancer from "../misc/loadbalancer.js";
import frametracker from "./frametracker.js";
import camera from "./camera.js";
import ImageLoader from "../../util/ImageLoader.js";
import TextureLoader from "../../webgl/TextureLoader.js";
import { ColorGradePass } from "../../webgl/post_processing/passes/ColorGradePass.js";
import { SineWavePass } from "../../webgl/post_processing/passes/SineWavePass.js";
import { VignettePass } from "../../webgl/post_processing/passes/VignettePass.js";
import { listener_overlay } from "../chess/game.js";
import { Mouse } from "../input.js";
import { DropletState, WaterRipplePass } from "../../webgl/post_processing/passes/WaterRipplePass.js";
import { HeatWavePass } from "../../webgl/post_processing/passes/HeatWavePass.js";




let pipeline: PostProcessingPipeline;

let sineWavePass: SineWavePass;
const sineWaveSpeed = 1;

let waterRipplePass: WaterRipplePass;
// let activeDroplets: DropletState[] = [];
// /** How long each ripple lasts before being removed, in seconds. */
// const RIPPLE_LIFETIME = 10;

let heatWavePass: HeatWavePass | undefined;



/** Our color grade post processing effect. */
let colorGradePass: ColorGradePass;

let vignettePass: VignettePass;





function init(gl: WebGL2RenderingContext, programManager: ProgramManager, the_pipeline: PostProcessingPipeline): void {
	pipeline = the_pipeline;

	sineWavePass = new SineWavePass(programManager);
	// Decrease the intensity
	sineWavePass.amplitude = [0.003, 0.003]; // Default: 0.0035
	sineWavePass.frequency = [2.0, 2.0];
	sineWavePass.angle = 0;

	waterRipplePass = new WaterRipplePass(programManager, camera.canvas.width, camera.canvas.height);
	// waterRipplePass.propagationSpeed = 0.2;
	// waterRipplePass.oscillationSpeed = 4;

	// Fetch the heat haze texture from the server
	ImageLoader.loadImage('img/noise_texture/heat_haze.webp').then(img => {
		const noiseTexture = TextureLoader.loadTexture(gl, img);
		heatWavePass = new HeatWavePass(programManager, noiseTexture);
	}).catch(err => {
		console.error("Failed to load heat haze texture:", err);
	});
	

	colorGradePass = new ColorGradePass(programManager);
	// applyDullPreset(colorGradePass);
	// applyHellishPreset(colorGradePass);
	// applyWashedOutPreset(colorGradePass);

	vignettePass = new VignettePass(programManager);
	vignettePass.intensity = 0.5;
}



// --- TSETING: Color Grade Presets for Different Moods ---

function applyDullPreset(pass: ColorGradePass): void {
	pass.brightness = 0.05;
	pass.contrast = 0.9;
	pass.gamma = 1.0;
	pass.saturation = 0.4;
	pass.tint = [1.0, 1.0, 1.0]; // No tint
}

function applyHellishPreset(pass: ColorGradePass): void {
	pass.brightness = -0.1;
	pass.contrast = 1.6;
	pass.gamma = 1.0;
	pass.saturation = 1.2;
	pass.tint = [1.0, 0.4, 0.1]; // Reddish-orange tint
	pass.hueOffset = 0.0;
}

function applyWashedOutPreset(pass: ColorGradePass): void {
	pass.brightness = 0.2;
	pass.contrast = 0.7;
	pass.gamma = 1.0;
	pass.saturation = 0.3;
	pass.tint = [0.8, 0.8, 1.0]; // Slight cool tint
	pass.hueOffset = 0.0;
}



function update(): void {
	// FOR TESTING: Render every single frame.
	// frametracker.onVisualChange();

	// Choose what effects are active this frame.
	const activePasses: PostProcessPass[] = [];

	// activePasses.push(sineWavePass);
	// activePasses.push(waterRipplePass);
	// if (heatWavePass) activePasses.push(heatWavePass); // Only push if it's loaded
	// activePasses.push(colorGradePass);

	pipeline.setPasses(activePasses);


	const deltaTime = loadbalancer.getDeltaTime(); // Seconds
	
	sineWavePass.time += deltaTime * sineWaveSpeed;
	sineWavePass.angle += deltaTime * 3; // Rotate 3 degrees per second



	// ============ Water Ripples ============
	
	// // Update droplet timers
	// for (const droplet of activeDroplets) {
	// 	droplet.time += deltaTime;
	// }
	// // Filter out old droplets
	// activeDroplets = activeDroplets.filter(
	// 	droplet => droplet.time < RIPPLE_LIFETIME
	// );
	// // Add a new droplet on mouse click
	// if (listener_overlay.isMouseClicked(Mouse.LEFT)) {
	// 	const mousePos = listener_overlay.getMousePosition(Mouse.LEFT)!;

	// 	// Convert world space to uv space
	// 	const rect = camera.canvas.getBoundingClientRect();

	// 	// Convert pixel coordinates to UV coordinates [0-1]
	// 	const u = mousePos[0] / rect.width;
	// 	const v = 1.0 - mousePos[1] / rect.height; // Y is inverted in WebGL

	// 	// Create a new droplet with an elapsed time of 0
	// 	activeDroplets.push({ center: [u, v], time: 0 });
	// }
	// // 3. FEED the active list to the pass
	// waterRipplePass.updateDroplets(activeDroplets);



	// Update the time uniform to make the heat rise
	if (heatWavePass) heatWavePass.time = performance.now() / 500; // Default: 500 (strength 0.04)




	// Constantly change the saturation according to time, for testing
	// colorGradePass.saturation = getSineWaveVariation(0.3, 2);
	

}

function getSineWaveVariation(min: number, max: number): number {
	const time = performance.now() / 1000; // Seconds
	return min + (Math.sin(time) * 0.5 + 0.5) * (max - min);
}

function onScreenResize(): void {
	const rect = camera.canvas.getBoundingClientRect();
	waterRipplePass.setResolution(rect.width, rect.height);
}







export default {
	init,
	update,
	onScreenResize,
};