#version 300 es
precision lowp float;
uniform sampler2D u_sceneTexture;

// --- Distortion Controls ---
uniform vec2 u_amplitude; // The strength of the wave on each axis (how far pixels are displaced)
uniform vec2 u_frequency; // The number of waves across the screen on each axis
uniform float u_time; // Animate the waves over time

in vec2 v_uv;
out vec4 out_color;

const float PI = 3.1415926535;

void main() {
    // Start with the original texture coordinates
    vec2 distortedUV = v_uv;

    // Calculate the X-axis offset
    // The wave moves horizontally, and its position is determined by the vertical (v_uv.y) coordinate.
    float offsetX = sin(v_uv.y * u_frequency.y * 2.0 * PI + u_time) * u_amplitude.x;

    // Calculate the Y-axis offset
    // The wave moves vertically, and its position is determined by the horizontal (v_uv.x) coordinate.
    float offsetY = sin(v_uv.x * u_frequency.x * 2.0 * PI + u_time) * u_amplitude.y;

    // Apply the offsets to the texture coordinates
    distortedUV.x += offsetX;
    distortedUV.y += offsetY;

    // Sample the texture using the new, distorted coordinates.
    // Our FBO texture is set to CLAMP_TO_EDGE, which will handle cases where the
    // distortedUV goes outside the 0.0-1.0 range by smearing the edge pixels.
    out_color = texture(u_sceneTexture, distortedUV);
}