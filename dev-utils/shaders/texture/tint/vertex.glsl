#version 300 es

// This shader is capable of tinting all textures
// a specific color via a uniform

in vec4 aVertexPosition;
in vec2 aTextureCoord;

uniform mat4 uTransformMatrix;

out vec2 vTextureCoord;

void main(void) {
    gl_Position = uTransformMatrix * aVertexPosition;
    vTextureCoord = aTextureCoord;
}