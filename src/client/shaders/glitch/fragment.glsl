#version 300 es
precision highp float;

uniform sampler2D u_sceneTexture;

// --- Chromatic Aberration Uniforms ---
uniform float u_aberrationStrength;
uniform vec2 u_aberrationOffset; // Direction and magnitude of the color channel separation

// --- Horizontal Tearing Uniforms ---
uniform float u_tearStrength;
uniform float u_tearResolution; // Height of tear lines in virtual CSS pixels (e.g., 5.0 for 5px high lines)
uniform float u_tearMaxDisplacement; // Max horizontal shift for a tear in virtual CSS pixels
uniform float u_time; // For animating tear patterns
uniform vec2 u_resolution; // Viewport resolution (width, height) in pixels

in vec2 v_uv;
out vec4 out_color;

void main() {
    vec4 originalColor = texture(u_sceneTexture, v_uv);
    vec2 texCoord = v_uv;

    // --- Horizontal Tearing ---
    // Calculate a unique tear offset for this scanline based on its Y coordinate and time
    // Convert u_tearResolution (pixels) to UV space height of a tear line
    // Convert u_tearMaxDisplacement (pixels) to UV space horizontal displacement
    float tearLineHeightUV = u_tearResolution / u_resolution.y;
    float tearMaxDisplacementUV = u_tearMaxDisplacement / u_resolution.x;

    // Determine which "tear line" this pixel belongs to
    float lineIndex = floor(v_uv.y / tearLineHeightUV);

    // Calculate a pseudo-random offset for this tear line
    // Using sine with lineIndex and time for a wavy or randomized offset pattern
    float tearOffset = sin(lineIndex * 123.456 + u_time * 10.0) * tearMaxDisplacementUV;
    
    // Mix the tear offset with a more randomized per-pixel noise
    // Using a texture sample to introduce some per-pixel variation within the tear line
    tearOffset += (texture(u_sceneTexture, v_uv * 5.0 + u_time * 0.1).r - 0.5) * tearMaxDisplacementUV * 0.5;

    // Apply the tear offset, scaled by tearStrength
    texCoord.x += tearOffset * u_tearStrength;

    // --- Chromatic Aberration ---
    // Sample the red, green, and blue channels with different offsets
    vec4 color;
    color.r = texture(u_sceneTexture, texCoord + u_aberrationOffset * u_aberrationStrength).r;
    color.g = texture(u_sceneTexture, texCoord).g;
    color.b = texture(u_sceneTexture, texCoord - u_aberrationOffset * u_aberrationStrength).b;
    color.a = texture(u_sceneTexture, texCoord).a; // Keep alpha as is

    // Get the fully distorted color
    vec4 distortedColor = color; // 'color' already contains the combined aberration and tear effects

	// Blend between original and distorted color using master strength
	out_color = mix(originalColor, distortedColor, u_masterStrength);
}