#version 300 es
precision highp float;


// The master blend factor between the 'A' and 'B' effect slots.
uniform float u_transitionProgress;

// GLOBAL UNIFORMS (Needed by all effects)
uniform sampler2D u_colorTexture;
uniform sampler2D u_maskTexture;
uniform sampler2D u_noiseTexture;
uniform float u_time;
uniform vec2 u_resolution; // Canvas dimensions

uniform float u_effectTypeA; // e.g., 0.0 for None, 1.0 for Dusty Wastes
uniform float u_effectTypeB;

// Dusty Wastes Uniforms
uniform float u2_strength; // The opacity of the scrolling noise texture
uniform float u2_noiseTiling; // How many times the noise texture repeats across the screen
uniform vec2 u2_uvOffset1; // The texture offset for noise layer 1 (calculated cpu side for more control)
uniform vec2 u2_uvOffset2; // The texture offset for noise layer 2 (calculated cpu side for more control)


// INPUTS
in vec2 v_uv;           // The model's original UVs for color/mask
in vec4 v_screenCoord;  // The screen-space coordinate for the noise
in vec4 v_color;

out vec4 out_color;


// Applies the "Dusty Wastes" animated noise effect.
vec3 DustyWastes(
	// --- Input values ---
	vec3 baseColor,
	vec2 screenUV,
	
	// --- Samplers ---
	sampler2D noiseSampler,
	
	// --- Effect parameters ---
	float noiseTiling,
	vec2 offset1,
	vec2 offset2,
	float effectStrength
) {
	const float NOISE_MULTIPLIER = 1.0; // Default: 1.13   Affects average final brightness to more closely match the original texture color

    // Apply the pre-calculated offsets.
	vec2 uv1 = screenUV * noiseTiling + offset1;
	vec2 uv2 = screenUV * noiseTiling + offset2;

	float noise1 = texture(noiseSampler, uv1).r;
	float noise2 = texture(noiseSampler, uv2).r;

	float finalNoise = noise1 * noise2 * NOISE_MULTIPLIER;
	float signedNoise = (finalNoise * 2.0) - 1.0;
	
	return baseColor + (signedNoise * effectStrength);
}


// Switchboard. Takes an effect type and returns the result at full strength.
vec3 calculateEffectColor(
	float effectType,
	vec3 baseColor,
	vec2 screenUV
) {
	if (effectType == 2.0) {
		return DustyWastes(
			baseColor,
			screenUV,
			// Pass global uniforms
			u_noiseTexture,
			// Pass effect-specific uniforms
			u2_noiseTiling,
			u2_uvOffset1,
			u2_uvOffset2,
			u2_strength
		);
	}

	// Default case: no effect
	return baseColor;
}


void main() {
	// INITIAL SETUP
	
	vec4 baseColor = texture(u_colorTexture, v_uv) * v_color;
	float maskValue = texture(u_maskTexture, v_uv).r;

    // Normalize coordinates and adjust for aspect ratio
    vec2 screenUV = gl_FragCoord.xy / u_resolution.xy;
    float aspect_ratio = u_resolution.x / u_resolution.y;
    screenUV.x *= aspect_ratio;

	// UBER-SHADER LOGIC

	// 1. Calculate the result for Slot A at full strength.
	vec3 modulatedColorA = calculateEffectColor(u_effectTypeA, baseColor.rgb, screenUV);

	// 2. Calculate the result for Slot B at full strength.
	vec3 modulatedColorB = calculateEffectColor(u_effectTypeB, baseColor.rgb, screenUV);

	// 3. Smoothly blend between the full results of the two slots.
	vec3 blendedModulatedColor = mix(modulatedColorA, modulatedColorB, u_transitionProgress);

	// 4. Apply the checkerboard mask to the final, blended effect.
	vec3 finalRGB = mix(baseColor.rgb, blendedModulatedColor, maskValue);
	
	out_color = vec4(clamp(finalRGB, 0.0, 1.0), baseColor.a);
}