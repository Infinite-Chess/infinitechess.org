#version 300 es
precision highp float;

// The texture containing the scene to be posterized
uniform sampler2D u_sceneTexture;

// The number of color levels per channel
uniform float u_levels;

// The texture coordinates passed from the vertex shader
in vec2 v_uv;

// The final output color
out vec4 out_color;

void main() {
    // Sample the original color from the input texture
    vec4 originalColor = texture(u_sceneTexture, v_uv);

    // If levels are 1.0 or less, disable the effect and return the original color.
    // This prevents division by zero and provides an easy way to toggle the effect.
    if (u_levels <= 1.0) {
        out_color = originalColor;
        return;
    }

    // Apply the posterization formula
    // 1. Multiply by levels to scale the color range
    // 2. Use floor() to snap to the nearest lower integer
    // 3. Divide by (levels - 1.0) to map the color back to the [0, 1] range
    float numLevels = u_levels - 1.0;
    vec3 posterizedColor = floor(originalColor.rgb * numLevels) / numLevels;

    // Output the final color, keeping the original alpha
    out_color = vec4(posterizedColor, originalColor.a);
}