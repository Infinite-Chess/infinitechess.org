#version 300 es

precision lowp float;

in vec4 vColor;        // Interpolated color from vertex shader

out vec4 fragColor;    // Output fragment color

void main() {
    fragColor = vColor; // Simply output the interpolated vertex color.
}