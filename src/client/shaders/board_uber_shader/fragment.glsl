#version 300 es
precision highp float;

// src/client/shaders/board_uber_shader/fragment.glsl

// GLOBAL UNIFORMS (May be used by several effects)
uniform sampler2D u_colorTexture;
uniform sampler2D u_maskTexture; // This texture has white pixels where light tiles are and black pixels where dark tiles are.
uniform sampler2D u_perlinNoiseTexture;
uniform sampler2D u_whiteNoiseTexture;
uniform vec2 u_resolution; // Canvas dimensions, used for aspect correction
uniform float u_pixelDensity; // How many device pixels per virtual pixel

// The integers representing the unique id of effect types A & B this frame.
uniform float u_effectTypeA;
uniform float u_effectTypeB;

// The master blend factor between the 'A' and 'B' effect slots.
uniform float u_transitionProgress;


// Spectral Edge Uniforms (Effect Type 4)
uniform float u4_flowDistance;
uniform vec2 u4_flowDirectionVec;
uniform float u4_gradientRepeat;
uniform float u4_maskOffset;
uniform float u4_strength;
uniform vec3 u4_color1;
uniform vec3 u4_color2;
uniform vec3 u4_color3;
uniform vec3 u4_color4;
uniform vec3 u4_color5;
uniform vec3 u4_color6;

// Iridescence Uniforms (Effect Type 5)
uniform float u5_flowDistance;
uniform vec2 u5_flowDirectionVec;
uniform float u5_gradientRepeat;
uniform float u5_maskOffset;
uniform float u5_strength;
uniform vec3 u5_color1;
uniform vec3 u5_color2;
uniform vec3 u5_color3;
uniform vec3 u5_color4;
uniform vec3 u5_color5;
uniform vec3 u5_color6;

// Dusty Wastes Uniforms (Effect Type 6)
uniform float u6_strength; // The opacity of the scrolling noise texture
uniform float u6_noiseTiling; // How many times the noise texture repeats across the screen
uniform vec2 u6_uvOffset1; // The texture offset for noise layer 1 (calculated cpu side for more control)
uniform vec2 u6_uvOffset2; // The texture offset for noise layer 2 (calculated cpu side for more control)

// Static Zone Uniforms (Effect Type 7)
uniform float u7_strength; // The opacity of the white noise pixels
uniform vec2 u7_uvOffset; // The texture offset for the white noise (calculated cpu side for more control)
uniform float u7_pixelWidth; // How many pixels wide the white noise texture is
uniform float u7_pixelSize; // How many virtual pixels wide each static pixel should be


// INPUTS
in vec2 v_uv;           // The model's original UVs for color/mask
in vec4 v_screenCoord;  // The screen-space coordinate for the noise
in vec4 v_color;

out vec4 out_color;


// Helper function to get a color from a procedural gradient.
vec3 getColorFromRamp(float coord, vec3 color1, vec3 color2, vec3 color3, vec3 color4, vec3 color5, vec3 color6) {
    vec3 color = u5_color1;

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
    else if (index == 5) color = mix(color6, color1, blendFactor); // Wrap back to the first

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
	vec2 screenUV
) {
	const float NOISE_MULTIPLIER = 1.0; // Default: 1.13   Affects average final brightness to more closely match the original texture color

    // Apply the pre-calculated offsets.
	vec2 uv1 = screenUV * u6_noiseTiling + u6_uvOffset1;
	vec2 uv2 = screenUV * u6_noiseTiling + u6_uvOffset2;

	float noise1 = texture(u_perlinNoiseTexture, uv1).r;
	float noise2 = texture(u_perlinNoiseTexture, uv2).r;

	float finalNoise = noise1 * noise2 * NOISE_MULTIPLIER;
	float signedNoise = (finalNoise * 2.0) - 1.0;
	
	return baseColor + (signedNoise * u6_strength);
}

// Applies the "Static" pixelated noise effect.
vec3 Static(
    vec3 baseColor,
    vec2 screenUV
) {
	// vec2 snappedUV = floor((screenUV * u_resolution) / u7_pixelSize) * u7_pixelSize / u_resolution + u7_uvOffset;
    vec2 snappedUV = screenUV * u_resolution[1] / u7_pixelWidth / u7_pixelSize / u_pixelDensity + u7_uvOffset;
    float noise = texture(u_whiteNoiseTexture, snappedUV).r;
    float signedNoise = (noise * 2.0) - 1.0;
    return baseColor + (signedNoise * u7_strength); // Apply a brightness/darkness effect
}

// Switchboard. Takes an effect type and returns the result at full strength.
vec3 calculateEffectColor(
	float effectType,
	vec3 baseColor,
	vec2 screenUV,
    float maskValue
) {
	if (effectType == 4.0) {
		return ColorFlow(
			baseColor,
			screenUV,
			maskValue,
			// Pass effect-specific uniforms
			u4_flowDistance,
			u4_flowDirectionVec,
			u4_gradientRepeat,
			u4_maskOffset,
			u4_strength,
			// Color stops
			u4_color1,
			u4_color2,
			u4_color3,
			u4_color4,
			u4_color5,
			u4_color6
		);
	} else if (effectType == 5.0) {
		return ColorFlow(
			baseColor,
			screenUV,
			maskValue,
            // Pass effect-specific uniforms
            u5_flowDistance,
            u5_flowDirectionVec,
            u5_gradientRepeat,
            u5_maskOffset,
            u5_strength,
			// Color stops
			u5_color1,
			u5_color2,
			u5_color3,
			u5_color4,
			u5_color5,
			u5_color6
		);
	} else if (effectType == 6.0) {
		return DustyWastes(
			baseColor,
			screenUV
		);
	} else if (effectType == 7.0) {
        return Static(
            baseColor,
            screenUV
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