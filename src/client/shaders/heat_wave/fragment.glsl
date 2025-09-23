#version 300 es
precision highp float;

uniform sampler2D u_sceneTexture;
uniform sampler2D u_noiseTexture;

uniform float u_time;
uniform float u_strength;

in vec2 v_uv;
out vec4 out_color;

void main() {
    // 1. Create two different scrolling UVs for the noise texture.
    // They scroll at different speeds and in different directions.
	vec2 noiseUV1 = vec2(v_uv.x - u_time * 0.05, v_uv.y - u_time * 0.2);
	vec2 noiseUV2 = vec2(v_uv.x + u_time * 0.03, v_uv.y + u_time * 0.13); // Different speed and direction

    // 2. Sample the noise texture at both locations.
    float noise1 = texture(u_noiseTexture, noiseUV1).r;
    float noise2 = texture(u_noiseTexture, noiseUV2).r;

    // 3. Calculate the distortion from the *difference* between the two samples.
    // This is the key: the difference has an average of 0, eliminating any static shift.
    // The result is already in a -1 to 1 range, so no remapping is needed.
    float distortion = (noise1 - noise2);

    // 4. Create the final distorted UVs for the scene texture.
	vec2 distortedUV = vec2(v_uv.x + distortion * u_strength, v_uv.y);

    // 5. Sample the scene using the distorted coordinates.
	out_color = texture(u_sceneTexture, distortedUV);
}