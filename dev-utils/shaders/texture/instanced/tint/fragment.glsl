#version 300 es

precision highp float;

in vec2 vTextureCoord;          // From vertex shader
uniform sampler2D u_sampler;     // Texture sampler
uniform vec4 uTintColor;        // Universal tint color

out vec4 fragColor;             // Output color

void main() {
    // Sample texture with LOD bias and apply universal tint
    vec4 texColor = texture(u_sampler, vTextureCoord, -0.5);
    fragColor = texColor * uTintColor;
}