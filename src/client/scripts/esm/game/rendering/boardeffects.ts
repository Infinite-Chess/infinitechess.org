
/**
 * This script controls the Post Processing Pass Effects on the
 * board when you are extremely far away from the origin.
 */

import type { ProgramManager } from "../../webgl/ProgramManager.js";
import type { PostProcessingPipeline } from "../../webgl/post_processing/PostProcessingPipeline.js";

import { ColorGradePass } from "../../webgl/post_processing/passes/ColorGradePass.js";
import { SineWavePass } from "../../webgl/post_processing/passes/SineWavePass.js";
import { VignettePass } from "../../webgl/post_processing/passes/VignettePass.js";
import frametracker from "./frametracker.js";
// @ts-ignore
import loadbalancer from "../misc/loadbalancer.js";




let pipeline: PostProcessingPipeline;

let sineWavePass: SineWavePass;
const sineWaveSpeed = 1;

/** Our color grade post processing effect. */
let colorGradePass: ColorGradePass;

let vignettePass: VignettePass;





function init(programManager: ProgramManager, the_pipeline: PostProcessingPipeline): void {
	pipeline = the_pipeline;

	sineWavePass = new SineWavePass(programManager);
	// Decrease the intensity
	sineWavePass.amplitude = [0.003, 0.003]; // Default: 0.0035
	sineWavePass.frequency = [2.0, 2.0];
	sineWavePass.angle = 0;

	colorGradePass = new ColorGradePass(programManager);
	// applyDullPreset(colorGradePass);
	// applyHellishPreset(colorGradePass);
	// applyWashedOutPreset(colorGradePass);

	vignettePass = new VignettePass(programManager);
	vignettePass.intensity = 0.6;
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
	frametracker.onVisualChange();

	// Choose what effects are active this frame.
	pipeline.setPasses([sineWavePass, colorGradePass]);
	// pipeline.setPasses([sineWavePass, colorGradePass, vignettePass]);


	const deltaTime = loadbalancer.getDeltaTime(); // Seconds
	// The logic lives here, in the conductor
	sineWavePass.time += deltaTime * sineWaveSpeed;
	sineWavePass.angle += deltaTime * 3; // Rotate 3 degrees per second

	// Constantly change the saturation according to time, for testing
	// colorGradePass.saturation = getSineWaveVariation(0.3, 2);
	

}

function getSineWaveVariation(min: number, max: number): number {
	const time = performance.now() / 400; // Seconds
	return min + (Math.sin(time) * 0.5 + 0.5) * (max - min);
}







export default {
	init,
	update,
};