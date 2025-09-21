#version 300 es
precision mediump float;

uniform sampler2D u_sceneTexture;

// --- Distortion Controls ---
uniform vec2 u_amplitude;
uniform vec2 u_frequency;
uniform float u_angle; // The new angle in radians
uniform float u_time;

in vec2 v_uv;
out vec4 out_color;

const float PI = 3.1415926535;

void main() {
    // --- Setup the rotated coordinate system ---
    // The main direction of the first wave
    vec2 dir1 = vec2(cos(u_angle), sin(u_angle));
    // The perpendicular direction for the second wave
    vec2 dir2 = vec2(-dir1.y, dir1.x); // (-sin(angle), cos(angle))

    // Center the UV coordinates so the rotation is around the middle of the screen
    vec2 centeredUV = v_uv - 0.5;

    // --- Calculate offsets based on the new directions ---
    // Project the UV coordinate onto the perpendicular axes to get the input for sin()
    float dist1 = dot(centeredUV, dir2);
    float dist2 = dot(centeredUV, dir1);

    // Calculate the sine wave offsets
    float offset1 = sin(dist1 * u_frequency.y * 2.0 * PI + u_time) * u_amplitude.x;
    float offset2 = sin(dist2 * u_frequency.x * 2.0 * PI + u_time) * u_amplitude.y;

    // --- Apply the offsets ---
    // The final offset is a combination of both waves moving along their respective directions
    vec2 totalOffset = (dir1 * offset1) + (dir2 * offset2);

    vec2 distortedUV = v_uv + totalOffset;

    // Sample the texture using the new, distorted coordinates.
    // Our FBO texture is set to CLAMP_TO_EDGE, which will handle cases where the
    // distortedUV goes outside the 0.0-1.0 range by smearing the edge pixels.
	out_color = texture(u_sceneTexture, distortedUV);
}