#version 300 es
precision highp float;

uniform sampler2D u_sceneTexture;

// --- Vignette Controls ---
uniform float u_masterStrength; // 0.0 = no effect, 1.0 = full effect
uniform float u_radius;   // How far the vignette reaches. 0.5 is the screen edge.
uniform float u_softness; // How gradual the falloff is.
uniform float u_intensity; // How dark the vignette is. 1.0 is pure black.

in vec2 v_uv;
out vec4 out_color;

void main() {
    // Store the original, unaffected color
	vec4 originalColor = texture(u_sceneTexture, v_uv);

	// Calculate the applied vignette color

    // Calculate the distance of the pixel from the center (0.5, 0.5)
    float dist = length(v_uv - vec2(0.5));

    // Calculate the vignette factor using smoothstep for a nice falloff.
    float vignetteFactor = smoothstep(u_radius, u_radius + u_softness, dist);

    // Calculate the color with the applied vignette.
    // The 'mix' function blends between the original color and black.
    vec3 vignettedColor = mix(originalColor.rgb, vec3(0.0), vignetteFactor * u_intensity);

    // Blend between original and vignetted color using master strength
    vec3 finalRgb = mix(originalColor.rgb, vignettedColor, u_masterStrength);

    // Set the final output, preserving the original alpha
    out_color = vec4(finalRgb, originalColor.a);
}