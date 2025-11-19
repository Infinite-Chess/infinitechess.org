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

	// Calculate the aspect ratio to correct for non-square screens.
	// This ensures our distance calculations produce circles, not ellipses.
	vec2 aspectCorrectedCoord = v_uv * vec2(u_resolution.x / u_resolution.y, 1.0);

    // WATER RIPPLE PASSES WAY OF ASPECT CORRECTION:
    // Calculate aspect-corrected distance from the droplet's center.
    // This makes ripples circular on non-square screens.
    // vec2 diff = v_uv - center;
    // diff.x *= u_resolution.x / u_resolution.y;
    // float dist = length(diff);
	
	float totalDistortion = 0.0;
	
	for (int i = 0; i < MAX_SOURCES; i++) {
		if (i >= u_sourceCount) break; // Stop if we've processed all active sources

		vec2 center = u_centers[i];
		vec2 aspectCorrectedCenter = center * vec2(u_resolution.x / u_resolution.y, 1.0);

		// Calculate the distance from the current pixel to the source's center.
		float dist = distance(aspectCorrectedCoord, aspectCorrectedCenter);

		// Calculate the sine wave. This creates the ripple pattern.
		// The wave is based on distance from the center, frequency, and time.
		float wave = sin(dist * u_frequency - u_time * u_oscillationSpeed);

		// Add this source's contribution to the total distortion.
		totalDistortion += wave;
	}

	// Create a 2D vector to offset the texture coordinates.
	// We use the normalized coordinates to the center as the direction of distortion.
	// This makes the distortion push pixels "away from" and "towards" the center.
	vec2 distortionVector = normalize(v_uv - u_centers[0]); // Using first source as a rough direction
	
	// Apply the calculated distortion to the texture coordinates.
	// The final distortion is modulated by the total sine wave value and the master strength.
	vec2 distortedTexCoord = v_uv + distortionVector * totalDistortion * u_strength;

	// Sample the original scene with the new, distorted coordinates.
	vec4 distortedColor = texture(u_sceneTexture, distortedTexCoord);

	// Blend between original and distorted color using master strength
	out_color = mix(originalColor, distortedColor, u_masterStrength);
}