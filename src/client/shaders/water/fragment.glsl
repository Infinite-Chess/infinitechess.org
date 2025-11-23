#version 300 es
precision highp float;

// src/client/shaders/water/fragment.glsl

// --- Input from Vertex Shader ---
in vec2 v_uv;
out vec4 out_color;

// The maximum number of sources, must match the JS constant.
const int MAX_SOURCES = 10;


// --- Uniforms ---
uniform float u_masterStrength; // 0.0 = no effect, 1.0 = full effect
uniform sampler2D u_sceneTexture; // The original scene texture
uniform int u_sourceCount;        // How many active ripple sources we have
uniform vec2 u_centers[MAX_SOURCES];       // The centers of the ripple sources (in UV space)
uniform float u_time;             // Current time for animation
uniform vec2 u_resolution;        // The dimensions of the canvas (width, height)

uniform float u_strength;         // The magnitude of the distortion
uniform float u_oscillationSpeed; // How fast the waves oscillate
uniform float u_frequency;        // The density of the waves (waves per UV unit)


void main() {
	// Store the original, unaffected color
	vec4 originalColor = texture(u_sceneTexture, v_uv);

	// This will store the combined X and Y offsets from all sources.
	vec2 totalDistortionVector = vec2(0.0);

	for (int i = 0; i < MAX_SOURCES; i++) {
		if (i >= u_sourceCount) break; // Stop if we've processed all active sources

		vec2 center = u_centers[i];

		// Calculate the difference vector and apply aspect correction to it.
		vec2 diff = v_uv - center;
		diff.x *= u_resolution.x / u_resolution.y;
		float dist = length(diff);

		// Calculate the sine wave. This creates the ripple pattern.
		// The wave is based on distance from the center, frequency, and time.
		float wave = sin(dist * u_frequency - u_time * u_oscillationSpeed);

		// Calculate the distortion vector for this specific ripple source and add it to our accumulator.
		// `normalize(diff)` gives the direction away from this source's center.
		if (dist > 0.0) { // Avoid division by zero at the exact center
			vec2 sourceDistortion = normalize(diff) * wave;
			totalDistortionVector += sourceDistortion;
		}
	}

	// De-correct the aspect ratio of the final distortion vector
	// before applying it to the non-corrected UV coordinates.
	totalDistortionVector.x /= (u_resolution.x / u_resolution.y);
	
	// Apply the calculated distortion to the texture coordinates.
	vec2 distortedTexCoord = v_uv + totalDistortionVector * u_strength;

	// Sample the original scene with the new, distorted coordinates.
	vec4 distortedColor = texture(u_sceneTexture, distortedTexCoord);

	// Blend between original and distorted color using master strength
	out_color = mix(originalColor, distortedColor, u_masterStrength);
}