#version 300 es
precision highp float;

uniform sampler2D u_sceneTexture;

// --- Distortion Controls ---
uniform float u_strength; // Positive for barrel, negative for pincushion
uniform vec2 u_center;    // The center point of the distortion

in vec2 v_uv;
out vec4 out_color;

void main() {
    // Vector from the current UV coordinate to the distortion center
	vec2 to_center = v_uv - u_center;

    // Calculate the distance squared from the center.
    // Using dot product is often faster than length() -> sqrt().
    float dist_sq = dot(to_center, to_center);

    // Calculate the displacement factor.
    // This is the core of the effect.
    float displacement = 1.0 + u_strength * dist_sq;

    // Apply the displacement to the vector from the center
    vec2 displaced_uv = u_center + to_center * displacement;

    // Look up the color from the original texture at the new, distorted coordinate
	out_color = texture(u_sceneTexture, displaced_uv);
}