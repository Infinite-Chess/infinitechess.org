#version 300 es

precision highp float;

in vec2 vTextureCoord;          // From vertex shader
in vec4 vInstanceColor;         // From vertex shader

uniform sampler2D u_sampler;     // Texture sampler

out vec4 fragColor;             // Output color

void main() {
    // Sample texture with LOD bias for sharpness
    vec4 texColor = texture(u_sampler, vTextureCoord, -0.5);
    fragColor = texColor * vInstanceColor;
}