#version 300 es

in vec4 aVertexPosition;        // Per-vertex position
in vec2 aTextureCoord;          // Per-vertex texture coordinate
in vec4 aVertexColor;           // Per-vertex color
in vec3 aInstancePosition;      // Per-instance position offset

uniform mat4 uTransformMatrix;  // Transformation matrix
uniform float uSize;    // Desired size multiplier of the shape (scales aVertexPosition)

out vec2 vTextureCoord;         // Pass texture coord to fragment shader
out vec4 vColor;                // Pass vertex color to fragment shader

void main() {
    // Scale the base vertex position's X and Y by the shape width.
    // Assumes Z is 0 or handled appropriately, W is 1 for position.
    vec3 scaledLocalPosition = vec3(aVertexPosition.xy * uSize, aVertexPosition.z);

    // Apply instance position offset to the base vertex position
    vec3 finalPosition = scaledLocalPosition + aInstancePosition;

    // Transform the final position
    gl_Position = uTransformMatrix * vec4(finalPosition, 1.0);

    // Pass texture coordinates and vertex color to the fragment shader
    vTextureCoord = aTextureCoord;
    vColor = aVertexColor;
}