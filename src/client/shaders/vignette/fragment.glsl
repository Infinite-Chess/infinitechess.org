#version 300 es
precision highp float;

uniform sampler2D u_sceneTexture;

// --- Vignette Controls ---
uniform float u_radius;   // How far the vignette reaches. 0.5 is the screen edge.
uniform float u_softness; // How gradual the falloff is.
uniform float u_intensity; // How dark the vignette is. 1.0 is pure black.

in vec2 v_uv;
out vec4 out_color;

void main() {
    // Start with the original color from the previous pass
	out_color = texture(u_sceneTexture, v_uv);

    // Calculate the distance of the pixel from the center (0.5, 0.5)
    // We use a length of a vec2 from the center to the current uv coordinate.
    float dist = length(v_uv - vec2(0.5));

    // Calculate the vignette factor using smoothstep for a nice falloff.
    // smoothstep creates a smooth transition from 0.0 to 1.0
    // as 'dist' moves from 'u_radius' to 'u_radius + u_softness'.
    float vignette = smoothstep(u_radius, u_radius + u_softness, dist);

    // Darken the color by the vignette factor multiplied by the desired intensity.
    // The 'mix' function blends between the original color and black.
    out_color.rgb = mix(out_color.rgb, vec3(0.0), vignette * u_intensity);
}