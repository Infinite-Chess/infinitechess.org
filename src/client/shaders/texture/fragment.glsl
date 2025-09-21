#version 300 es

precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D u_sampler;

out vec4 fragColor;

void main() {
    // Apply a mipmap LOD bias to make textures sharper.
    fragColor = texture(u_sampler, vTextureCoord, -0.5);
}