#version 300 es

precision highp float;

in vec2 vTextureCoord;
in vec4 vColor;

uniform sampler2D u_sampler;

out vec4 fragColor;

void main(void) {
    fragColor = texture(u_sampler, vTextureCoord, -0.5) * vColor; // Apply a mipmap LOD bias so as to make the textures sharper.
}