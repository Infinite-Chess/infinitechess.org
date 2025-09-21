#version 300 es
precision lowp float;

in vec4 vColor;
out vec4 fragColor;

void main() {
	fragColor = vColor;
}