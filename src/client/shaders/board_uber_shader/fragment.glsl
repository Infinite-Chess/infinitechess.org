#version 300 es
precision highp float;

// src/client/shaders/board_uber_shader/fragment.glsl


// The master blend factor between the 'A' and 'B' effect slots.
uniform float u_transitionProgress;

// GLOBAL UNIFORMS (May be needed by multiple effects)
uniform sampler2D u_colorTexture;
uniform sampler2D u_maskTexture;
uniform sampler2D u_perlinNoiseTexture;
uniform sampler2D u_whiteNoiseTexture;
uniform float u_time;
uniform vec2 u_resolution; // Canvas dimensions
uniform float u_pixelDensity; // How many device pixels per virtual pixel

uniform float u_effectTypeA; // e.g., 0.0 for None, 1.0 for Dusty Wastes
uniform float u_effectTypeB;

// Dusty Wastes Uniforms (Effect Type 2)
uniform float u2_strength; // The opacity of the scrolling noise texture
uniform float u2_noiseTiling; // How many times the noise texture repeats across the screen
uniform vec2 u2_uvOffset1; // The texture offset for noise layer 1 (calculated cpu side for more control)
uniform vec2 u2_uvOffset2; // The texture offset for noise layer 2 (calculated cpu side for more control)

// Static Zone Uniforms (Effect Type 3)
uniform float u3_strength; // The opacity of the white noise pixels
uniform vec2 u3_uvOffset; // The texture offset for the white noise (calculated cpu side for more control)
uniform float u3_pixelWidth; // How many pixels wide the white noise texture is
uniform float u3_pixelSize; // How many virtual pixels wide each static pixel should be

// Spectral Edge Uniforms (Effect Type 8)
uniform float u8_flowDistance;
uniform vec2 u8_flowDirectionVec;
uniform float u8_gradientRepeat;
uniform float u8_maskOffset;
uniform float u8_strength;
uniform vec3 u8_color1;
uniform vec3 u8_color2;
uniform vec3 u8_color3;
uniform vec3 u8_color4;
uniform vec3 u8_color5;
uniform vec3 u8_color6;

// Iridescence Uniforms (Effect Type 9)
uniform float u9_numColors;
uniform float u9_flowDistance;
uniform vec2 u9_flowDirectionVec;
uniform float u9_gradientRepeat;
uniform float u9_maskOffset;
uniform float u9_strength;
uniform vec3 u9_color1;
uniform vec3 u9_color2;
uniform vec3 u9_color3;
uniform vec3 u9_color4;
uniform vec3 u9_color5;
uniform vec3 u9_color6;

// INPUTS
in vec2 v_uv;           // The model's original UVs for color/mask
in vec4 v_screenCoord;  // The screen-space coordinate for the noise
in vec4 v_color;

out vec4 out_color;

// Helper function to get a color from a procedural gradient.
vec3 getColorFromRamp(float coord, vec3 color1, vec3 color2, vec3 color3, vec3 color4, vec3 color5, vec3 color6) {
    vec3 color = u9_color1; // Default to the first color

    // Scale coord by the number of colors to create N segments,
    // allowing the last segment to wrap back to the first.
	float NUM_COLORS = 6.0;
    float scaledCoord = coord * NUM_COLORS;
    int index = int(floor(scaledCoord));
    float blendFactor = fract(scaledCoord);

    // This chain of if-statements acts as an array lookup.
    if (index == 0) color = mix(color1, color2, blendFactor);
    else if (index == 1) color = mix(color2, color3, blendFactor);
    else if (index == 2) color = mix(color3, color4, blendFactor);
    else if (index == 3) color = mix(color4, color5, blendFactor);
    else if (index == 4) color = mix(color5, color6, blendFactor);
    else if (index >= 5) color = mix(color6, color1, blendFactor); // Wrap back to the first

    return color;
}

// Applies a color gradient flow procedural gradient effect.
vec3 ColorFlow(
    // --- Input values ---
    vec3 baseColor,
    vec2 screenUV,
	float maskValue,

    // --- Effect parameters ---
    float flowDistance,
    vec2 flowDirectionVec,
    float gradientRepeat,
    float maskOffset,
    float strength,
	// --- Color stops ---
	vec3 color1,
	vec3 color2,
	vec3 color3,
	vec3 color4,
	vec3 color5,
	vec3 color6
) {
	// Project the screen UV onto the flow direction vector to get a 1D coordinate.
	float projectedUv = dot(screenUV, flowDirectionVec);

	// Add the scrolled distance, apply the repeat factor, and apply the mask offset.
	float phase = (projectedUv * gradientRepeat) + flowDistance + (maskValue * maskOffset);

	// Get the final wrapped coordinate for the color lookup.
	float gradientCoord = fract(phase);

	// Get the procedural color from our ramp.
	vec3 gradientColor = getColorFromRamp(gradientCoord, color1, color2, color3, color4, color5, color6);

	// Blend the gradient color with the base tile color.
	return mix(baseColor, gradientColor, strength);
}


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

// Applies the "Static" pixelated noise effect.
vec3 Static(
    vec3 baseColor,
    vec2 screenUV,
    sampler2D noiseSampler,
	float effectStrength,
    vec2 uvOffset,
	float pixelWidth,
    float pixelSize,
	vec2 resolution,
	float pixelDensity
) {
	// vec2 snappedUV = floor((screenUV * resolution) / pixelSize) * pixelSize / resolution + uvOffset;
    vec2 snappedUV = screenUV * resolution[1] / pixelWidth / pixelSize / pixelDensity + uvOffset;
    float noise = texture(noiseSampler, snappedUV).r;
    float signedNoise = (noise * 2.0) - 1.0;
    return baseColor + (signedNoise * effectStrength); // Apply a brightness/darkness effect
}

// Switchboard. Takes an effect type and returns the result at full strength.
vec3 calculateEffectColor(
	float effectType,
	vec3 baseColor,
	vec2 screenUV,
    float maskValue
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
			u_resolution,
			u_pixelDensity
        );
    } else if (effectType == 8.0) {
		return ColorFlow(
			baseColor,
			screenUV,
			maskValue,
			// Pass effect-specific uniforms
			u8_flowDistance,
			u8_flowDirectionVec,
			u8_gradientRepeat,
			u8_maskOffset,
			u8_strength,
			// Color stops
			u8_color1,
			u8_color2,
			u8_color3,
			u8_color4,
			u8_color5,
			u8_color6
		);
	} else if (effectType == 9.0) {
		return ColorFlow(
			baseColor,
			screenUV,
			maskValue,
            // Pass effect-specific uniforms
            u9_flowDistance,
            u9_flowDirectionVec,
            u9_gradientRepeat,
            u9_maskOffset,
            u9_strength,
			// Color stops
			u9_color1,
			u9_color2,
			u9_color3,
			u9_color4,
			u9_color5,
			u9_color6
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
	vec3 modulatedColorA = calculateEffectColor(u_effectTypeA, baseColor.rgb, screenUV, maskValue);

	// 2. Calculate the result for Slot B at full strength.
	vec3 modulatedColorB = calculateEffectColor(u_effectTypeB, baseColor.rgb, screenUV, maskValue);

	// 3. Smoothly blend between the full results of the two slots.
	vec3 blendedModulatedColor = mix(modulatedColorA, modulatedColorB, u_transitionProgress);

	// 4. The final blended color is now applied directly to the whole tile.
	// The mask is only used internally by effects that need it (like color flow).
	out_color = vec4(clamp(blendedModulatedColor, 0.0, 1.0), baseColor.a);
}