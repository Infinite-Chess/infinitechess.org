#version 300 es

in vec4 aVertexPosition;
in vec4 aVertexColor;
in vec4 aInstancePosition; // Per-instance position offset attribute

uniform mat4 uTransformMatrix;

out vec4 vColor;

void main() {
    // Add the instance offset to the vertex position
    vec4 transformedVertexPosition = vec4(aVertexPosition.xyz + aInstancePosition.xyz, 1.0);

    gl_Position = uTransformMatrix * transformedVertexPosition;
    vColor = aVertexColor;
}