#version 300 es

in vec4 a_position;
in vec2 a_texturecoord;

uniform mat4 u_transformmatrix;

out vec2 vTextureCoord;

void main(void) {
    gl_Position = u_transformmatrix * a_position;
    vTextureCoord = a_texturecoord;
}