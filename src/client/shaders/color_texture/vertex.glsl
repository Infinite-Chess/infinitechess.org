#version 300 es

in vec4 aVertexPosition;
in vec2 aTextureCoord;
in vec4 aVertexColor;

uniform mat4 uTransformMatrix;

out vec2 vTextureCoord;
out vec4 vColor;

void main(void) {
    gl_Position = uTransformMatrix * aVertexPosition;
    vTextureCoord = aTextureCoord;
    vColor = aVertexColor;
}