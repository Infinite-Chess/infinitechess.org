#version 300 es
precision highp float;

// The texture containing the scene to be posterized
uniform sampler2D u_sceneTexture;

uniform float u_masterStrength; // 0.0 = no effect, 1.0 = full effect
uniform float u_levels; // The number of color levels per channel

// The texture coordinates passed from the vertex shader
in vec2 v_uv;

// The final output color
out vec4 out_color;

void main() {
    // Sample the original color from the input texture
    vec4 originalColor = texture(u_sceneTexture, v_uv);

    // Calculate the fully posterized color
    vec3 posterizedColor;

    // If levels are 1.0 or less, the "posterized" color is just the original color.
    // This prevents division by zero and provides an easy way to toggle the effect.
    if (u_levels <= 1.0) {
        posterizedColor = originalColor.rgb;
    } else {
        // Apply the posterization formula
        float numLevels = u_levels - 1.0;
        posterizedColor = floor(originalColor.rgb * numLevels) / numLevels;
    }

    // Blend between the original and the posterized color using master strength.
    vec3 finalRgb = mix(originalColor.rgb, posterizedColor, u_masterStrength);

    // Output the final color, preserving the original alpha
    out_color = vec4(finalRgb, originalColor.a);
}