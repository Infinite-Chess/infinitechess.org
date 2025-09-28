#version 300 es

// INPUTS
in vec3 a_position;
in vec2 a_texturecoord;
in vec4 a_color;

uniform mat4 u_transformmatrix;

// OUTPUTS
out vec2 v_uv;
out vec4 v_screenCoord; // Crucial for screen-space effects
out vec4 v_color; // Color is needed for transparency of bigger boards

void main() {
	gl_Position = u_transformmatrix * vec4(a_position, 1.0);
	v_uv = a_texturecoord;
	v_screenCoord = gl_Position;
	v_color = a_color;
}