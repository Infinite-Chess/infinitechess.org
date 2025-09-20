#version 300 es
precision highp float;

// The texture containing our rendered scene.
uniform sampler2D u_sceneTexture;

// The UV coordinates passed from the vertex shader.
in vec2 v_uv;

// The output color for this pixel.
out vec4 out_color;

void main() {
	// Simply sample the texture at the given UV coordinate and output the color.
	// This is a "pass-through" shader.
	out_color = texture(u_sceneTexture, v_uv);
}