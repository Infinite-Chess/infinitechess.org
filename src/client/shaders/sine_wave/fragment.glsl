#version 300 es
precision highp float;

uniform sampler2D u_sceneTexture;

// --- Distortion Controls ---
uniform float u_masterStrength; // 0.0 = no effect, 1.0 = full effect
uniform vec2 u_amplitude;
uniform vec2 u_frequency;
uniform float u_angle; // The new angle in radians
uniform float u_time;

in vec2 v_uv;
out vec4 out_color;

const float PI = 3.1415926535;

void main() {
    // Get the original, unaffected color
    vec4 originalColor = texture(u_sceneTexture, v_uv);

	// Calculate the distorted texture coordinates

    // Setup the rotated coordinate system of each wave
    vec2 dir1 = vec2(cos(u_angle), sin(u_angle));
    vec2 dir2 = vec2(-dir1.y, dir1.x);

    // Center the UV coordinates so the rotation is around the middle of the screen
    vec2 centeredUV = v_uv - 0.5;

    // Calculate distances along the rotated axes
    float dist1 = dot(centeredUV, dir2);
    float dist2 = dot(centeredUV, dir1);

    // Calculate the sine wave offsets
    float offset1 = sin(dist1 * u_frequency.y * 2.0 * PI + u_time) * u_amplitude.x;
    float offset2 = sin(dist2 * u_frequency.x * 2.0 * PI + u_time) * u_amplitude.y;

    // Combine offsets to get the final distortion vector
	// The final offset is a combination of both waves moving along their respective directions
    vec2 totalOffset = (dir1 * offset1) + (dir2 * offset2);
    vec2 distortedUV = v_uv + totalOffset;

    // Get the fully distorted color
    vec4 distortedColor = texture(u_sceneTexture, distortedUV);

	// Blend between original and distorted color using master strength
	out_color = mix(originalColor, distortedColor, u_masterStrength);
}