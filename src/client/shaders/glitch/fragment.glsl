#version 300 es
precision highp float;

uniform sampler2D u_sceneTexture;

// --- Master Strength ---
uniform float u_masterStrength; // 0.0 = no effect, 1.0 = full effect

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

    // Use a quantized time for a less fluid, more 'jerky' animation
    float quantizedTime = floor(u_time * 20.0) / 20.0; // Adjust 20.0 for desired 'steps' per second

    // Generate a pseudo-random value for displacement per line, varying with quantized time
    // This replaces drawing from a noise texture
    float randomOffset = fract(sin(lineIndex * 123.456 + quantizedTime * 789.0) * 4567.89); // Example magic numbers

    // Map randomOffset (0-1) to desired displacement range (-tearMaxDisplacementUV to +tearMaxDisplacementUV)
    float tearOffset = (randomOffset * 2.0 - 1.0) * tearMaxDisplacementUV;

    // Determine direction based on lineIndex: every other line shifts opposite
    float direction = mix(1.0, -1.0, mod(lineIndex, 2.0)); 

    // Apply the tear offset, scaled by tearStrength and direction
    texCoord.x += tearOffset * direction * u_tearStrength;

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