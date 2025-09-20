#version 300 es

in vec4 a_position;
in vec4 a_color;
in vec4 a_instanceposition; // Per-instance position offset attribute

uniform mat4 u_transformmatrix;

out vec4 vColor;

void main() {
    // Add the instance offset to the vertex position
    vec4 transformedVertexPosition = vec4(a_position.xyz + a_instanceposition.xyz, 1.0);

    gl_Position = u_transformmatrix * transformedVertexPosition;
    vColor = a_color;
}