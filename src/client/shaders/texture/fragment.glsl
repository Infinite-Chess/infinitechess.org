#version 300 es

precision lowp float;

in vec2 vTextureCoord;
uniform sampler2D u_sampler;

out vec4 fragColor;

void main(void) {
    fragColor = texture(u_sampler, vTextureCoord, -0.5); // Apply a mipmap LOD bias so as to make the textures sharper.
}