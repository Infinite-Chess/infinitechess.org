#version 300 es
precision highp float;

uniform sampler2D u_sceneTexture;
uniform sampler2D u_noiseTexture;

uniform float u_masterStrength; // 0.0 = no effect, 1.0 = full effect
uniform float u_time;
uniform float u_strength;

in vec2 v_uv;
out vec4 out_color;

void main() {
	// Store the original, unaffected color
	vec4 originalColor = texture(u_sceneTexture, v_uv);

    // Create two different scrolling UVs for the noise texture.
    // They scroll at different speeds and in different directions.
	vec2 noiseUV1 = vec2(v_uv.x - u_time * 0.05, v_uv.y - u_time * 0.2);
	vec2 noiseUV2 = vec2(v_uv.x + u_time * 0.03, v_uv.y + u_time * 0.13); // Different speed and direction

    // Sample the noise texture at both locations.
    float noise1 = texture(u_noiseTexture, noiseUV1).r;
    float noise2 = texture(u_noiseTexture, noiseUV2).r;

    // Calculate the distortion from the *difference* between the two samples.
    float distortion = (noise1 - noise2);

    // Create the final distorted UVs for the scene texture.
	vec2 distortedUV = vec2(v_uv.x + distortion * u_strength, v_uv.y);

	// Sample the scene using the distorted coordinates.
	vec4 distortedColor = texture(u_sceneTexture, distortedUV);

	// Blend between original and distorted color using master strength
	out_color = mix(originalColor, distortedColor, u_masterStrength);
}