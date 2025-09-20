#version 300 es

precision lowp float;

in vec2 vTextureCoord;          // From vertex shader
uniform sampler2D uSampler;     // Texture sampler

out vec4 fragColor;             // Output color

void main() {
    // Sample texture with LOD bias for sharpness
    vec4 texColor = texture(uSampler, vTextureCoord, -0.5);
    fragColor = texColor;
}