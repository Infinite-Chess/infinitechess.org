#version 300 es
precision highp float;

uniform sampler2D u_sceneTexture;

// --- Distortion Controls ---
uniform float u_amplitude; // The strength of the wave
uniform float u_frequency; // The number of waves across the screen
uniform float u_angle;     // The angle of the waves in radians
uniform float u_time;      // Animate the waves over time

in vec2 v_uv;
out vec4 out_color;

const float PI = 3.1415926535;

void main() {
    // Center the coordinates before rotation
    vec2 centeredUV = v_uv - 0.5;

    // Define the direction the pixels will be displaced.
    // This is perpendicular to the wave crests.
    vec2 displaceDir = vec2(cos(u_angle), sin(u_angle));

    // Define the axis along which the wave's crests lie.
    // This is perpendicular to the displacement direction.
    vec2 waveAxis = vec2(-displaceDir.y, displaceDir.x);

    // Calculate the input for the sine function.
    // We project the UV coordinate onto the wave's axis. This tells us "how far along"
    // the wave we are for any given pixel, creating straight, parallel wave crests.
    float waveInput = dot(centeredUV, waveAxis);


    // --- NEW: Get the SIGNED distance from the center. ---
    // This value will be negative on one side of the center and positive on the other.
    float signedDist = dot(centeredUV, displaceDir);

    // --- NEW: Create a linear multiplier from the signed distance. ---
    // The distance is roughly -0.5 to 0.5, so multiplying by 2.0 scales it to a nice -1.0 to 1.0 range.
    float amplitudeMultiplier = signedDist * 2.0;

    // // Calculate the amplitude multiplier based on distance from center.
    // // Get the distance from the center along the wave's travel direction.
    // float distFromCenter = abs(dot(centeredUV, displaceDir));
    // // Create a smooth multiplier that goes from 0.0 (at center) to 1.0 (at screen edge, ~0.5 distance).
    // // smoothstep gives a nice ease-in/out effect.
    // float amplitudeMultiplier = smoothstep(0.0, 0.5, distFromCenter);

    // Calculate the offset amount using the sine function, and apply the multiplier to it.
    float offset = sin(waveInput * u_frequency * 2.0 * PI + u_time) * u_amplitude * amplitudeMultiplier;

    // Apply the offset to the UVs in the displacement direction.
    vec2 distortedUV = v_uv + displaceDir * offset;

	out_color = texture(u_sceneTexture, distortedUV);
}