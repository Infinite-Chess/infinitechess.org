#version 300 es

// A simple quad that covers the entire screen in Normalized Device Coordinates.
const vec2 positions[6] = vec2[](
	vec2(-1.0, -1.0),
	vec2( 1.0, -1.0),
	vec2(-1.0,  1.0),
	vec2(-1.0,  1.0),
	vec2( 1.0, -1.0),
	vec2( 1.0,  1.0)
);

// We need to pass the UV coordinates to the fragment shader.
// They are derived from the vertex positions.
out vec2 v_uv;

void main() {
	gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
	// Convert NDC position to UV coordinates (0.0 to 1.0)
	v_uv = gl_Position.xy * 0.5 + 0.5;
}