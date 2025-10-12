#version 300 es
precision highp float;


// The master blend factor between the 'A' and 'B' effect slots.
uniform float u_transitionProgress;

// GLOBAL UNIFORMS (May be needed by multiple effects)
uniform sampler2D u_colorTexture;
uniform sampler2D u_maskTexture;
uniform sampler2D u_perlinNoiseTexture;
uniform sampler2D u_whiteNoiseTexture;
uniform float u_time;
uniform vec2 u_resolution; // Canvas dimensions

uniform float u_effectTypeA; // e.g., 0.0 for None, 1.0 for Dusty Wastes
uniform float u_effectTypeB;

// Dusty Wastes Uniforms (Effect Type 2)
uniform float u2_strength; // The opacity of the scrolling noise texture
uniform float u2_noiseTiling; // How many times the noise texture repeats across the screen
uniform vec2 u2_uvOffset1; // The texture offset for noise layer 1 (calculated cpu side for more control)
uniform vec2 u2_uvOffset2; // The texture offset for noise layer 2 (calculated cpu side for more control)

// Searing Dunes Uniforms (Effect Type 4)
uniform float u4_strength; // The opacity of the Searing Dunes wind effect
uniform float u4_noiseTiling; // How many times the noise texture repeats across the screen
uniform vec2 u4_uvOffset1; // The texture offset for noise layer 1 (calculated cpu side for more control)
uniform vec2 u4_uvOffset2; // The texture offset for noise layer 2 (calculated cpu side for more control)
uniform vec3 u4_sandColor; // The sand color for Searing Dunes

// Static Zone Uniforms (Effect Type 3)
uniform float u3_strength; // The opacity of the white noise pixels
uniform vec2 u3_uvOffset; // The texture offset for the white noise (calculated cpu side for more control)
uniform float u3_pixelWidth; // How many pixels wide the white noise texture is
uniform float u3_pixelSize; // How many virtual pixels wide each static pixel should be

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
	float effectStrength,
	float noiseTiling,
	vec2 offset1,
	vec2 offset2
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

// Applies the "Searing Dunes" animated noise effect.
vec3 SearingDunes(
	vec3 baseColor,
	vec2 screenUV,
	sampler2D noiseSampler,
	float effectStrength,
	float noiseTiling,
	vec2 offset1,
	vec2 offset2,
	vec3 sandColor
) {
	const float NOISE_MULTIPLIER = 1.0;
	// Controls the sharpness of the sand wisps. Higher values = thinner, sharper wisps.
	const float SHARPNESS = 8.0;

	vec2 uv1 = screenUV * noiseTiling + offset1;
	vec2 uv2 = screenUV * noiseTiling + offset2;

	float noise1 = texture(noiseSampler, uv1).r;
	float noise2 = texture(noiseSampler, uv2).r;

	float finalNoise = noise1 * noise2 * NOISE_MULTIPLIER;
	float sharpenedNoise = pow(finalNoise, SHARPNESS);

	// This is now our blend factor. It represents "how much" we should mix in the sandColor.
	// We scale it by the overall effectStrength and clamp to ensure it's a valid [0,1] value for mix().
	float blendFactor = clamp(sharpenedNoise * effectStrength, 0.0, 1.0);

	// Linearly interpolate from the base color to the sand color based on the blend factor.
	// This will correctly darken the object if sandColor is dark, or lighten it if sandColor is light.
	return mix(baseColor, sandColor, blendFactor);
}

// Applies the "Static" pixelated noise effect.
vec3 Static(
    vec3 baseColor,
    vec2 screenUV,
    sampler2D noiseSampler,
	float effectStrength,
    vec2 uvOffset,
	float pixelWidth,
    float pixelSize,
	vec2 resolution	
) {
	// vec2 snappedUV = floor((screenUV * resolution) / pixelSize) * pixelSize / resolution + uvOffset;
    vec2 snappedUV = screenUV * resolution[1] / pixelWidth / pixelSize + uvOffset;
    float noise = texture(noiseSampler, snappedUV).r;
    float signedNoise = (noise * 2.0) - 1.0;
    return baseColor + (signedNoise * effectStrength); // Apply a brightness/darkness effect
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
			u_perlinNoiseTexture,
			// Pass effect-specific uniforms
			u2_strength,
			u2_noiseTiling,
			u2_uvOffset1,
			u2_uvOffset2
		);
	} else if (effectType == 3.0) {
        return Static(
            baseColor,
            screenUV,
            u_whiteNoiseTexture,
			u3_strength,
            u3_uvOffset,
			u3_pixelWidth,
            u3_pixelSize,
			u_resolution
        );
    }
	else if (effectType == 4.0) {
		return SearingDunes(
			baseColor,
			screenUV,
			u_perlinNoiseTexture,
			u4_strength,
			u4_noiseTiling,
			u4_uvOffset1,
			u4_uvOffset2,
			u4_sandColor
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