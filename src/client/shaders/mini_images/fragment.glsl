#version 300 es

precision lowp float;

in vec2 vTextureCoord;          // Interpolated texture coordinate from vertex shader
in vec4 vColor;                 // Interpolated vertex color from vertex shader

uniform sampler2D u_sampler;     // Texture sampler

out vec4 fragColor;             // Output fragment color

void main() {
    // Sample the texture with LOD bias for sharpness
    vec4 texColor = texture(u_sampler, vTextureCoord, -0.5);

    // Multiply the texture color by the vertex color
    fragColor = texColor * vColor;
}