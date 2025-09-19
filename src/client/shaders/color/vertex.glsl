#version 300 es

in vec4 aVertexPosition;
in vec4 aVertexColor;

uniform mat4 uTransformMatrix;

out vec4 vColor;

void main() {
	gl_Position = uTransformMatrix * aVertexPosition;
	vColor = aVertexColor;
}