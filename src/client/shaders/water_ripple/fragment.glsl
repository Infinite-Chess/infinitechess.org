#version 300 es
precision highp float;

// The maximum number of concurrent droplets supported by this shader.
// This value MUST match the corresponding constant in the WaterRipplePass class.
const int MAX_DROPLETS = 20;

// Input Texture
uniform sampler2D u_sceneTexture; // The result of the previous rendering pass.

// Droplet Data (Received every frame)
uniform vec2 u_centers[MAX_DROPLETS];    // The center UV coordinate for each droplet.
uniform float u_times[MAX_DROPLETS];     // The elapsed time (in seconds) for each droplet.
uniform int u_dropletCount;              // The number of active droplets to process in the arrays.

// Global Effect Controls (Configurable)
uniform float u_strength;                // Overall strength of the distortion effect.
uniform float u_propagationSpeed;        // How fast the ripple's leading edge expands (UV units/sec).
uniform float u_oscillationSpeed;        // How fast the internal waves oscillate (phase shift/sec).
uniform float u_frequency;               // The density of the rings in the ripple (waves per UV unit).
uniform float u_falloff;                 // How quickly the trailing waves decay. Higher is faster.
uniform float u_glintIntensity;          // Controls the brightness of the glint.
uniform float u_glintExponent;           // Controls the sharpness/tightness of the glint. Higher is thinner.

// Canvas Properties
uniform vec2 u_resolution;               // The width and height of the canvas for aspect correction.

in vec2 v_uv;
out vec4 out_color;

void main() {
    // This vector will accumulate the distortion offset from all active droplets.
	vec2 totalOffset = vec2(0.0);
    float totalGlint = 0.0;

    // Loop through only the active droplets for this frame.
	for (int i = 0; i < u_dropletCount; i++) {
		vec2 center = u_centers[i];
		float time = u_times[i];

        // Calculate aspect-corrected distance from the droplet's center.
		// Patches ripples not being circular when canvas is not square.
		vec2 diff = v_uv - center;
		diff.x *= u_resolution.x / u_resolution.y;
		float dist = length(diff);

        // Create a soft mask for the ripple's leading edge that is 1.0 inside and fades to 0.0 outside.
        // This prevents the ripple from appearing before it should.
		float maxRadius = time * u_propagationSpeed;
        float waveMask = 1.0 - smoothstep(maxRadius - 0.1, maxRadius, dist);

        // Generate the animating sine wave.
        float wave = sin((dist * u_frequency) - (time * u_oscillationSpeed));

        // Calculate the inverse square decay for the trailing waves.
        // Determine how far this pixel is "behind" the leading edge.
        float distanceBehind = max(0.0, maxRadius - dist);
		float trailingFade = 1.0 / (1.0 + u_falloff * distanceBehind * distanceBehind);

        // Combine factors and accumulate the final offset.
		float rippleMagnitude = wave * waveMask * trailingFade;
		vec2 direction = normalize(v_uv - center);
		totalOffset += direction * rippleMagnitude * u_strength;

		// Calculate the glint for this droplet
        // Isolate the crest of the wave (the positive part).
        float crest = max(0.0, wave);
        // Raise it to a high power to create a tight hotspot and add it to the total.
        totalGlint += pow(crest, u_glintExponent) * waveMask * trailingFade;
	}

    // Apply the final, combined offset to the original texture coordinates.
	vec2 distortedUV = v_uv + totalOffset;
	vec4 color = texture(u_sceneTexture, distortedUV);
    // Add the final accumulated glint
    color.rgb += totalGlint * u_glintIntensity; // Glint intensity

	out_color = color;
}