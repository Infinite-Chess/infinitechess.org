#version 300 es

in vec4 aVertexPosition;     // Base shape vertex position (e.g., from -0.5 to 0.5)
in vec4 aVertexColor;        // Base shape vertex color
in vec3 aInstancePosition;   // Per-instance position offset (center of the shape)

uniform mat4 uTransformMatrix; // Combined model-view-projection matrix
uniform float uSize;    // Desired size multiplier of the shape (scales aVertexPosition)

out vec4 vColor;             // Pass color to fragment shader

void main() {
    // Scale the base vertex position's X and Y by the shape width.
    // Assumes Z is 0 or handled appropriately, W is 1 for position.
    vec3 scaledLocalPosition = vec3(aVertexPosition.xy * uSize, aVertexPosition.z);

    // Add the instance-specific position offset to the scaled local position.
    vec3 finalPosition = scaledLocalPosition + aInstancePosition;

    // Transform the final position.
    gl_Position = uTransformMatrix * vec4(finalPosition, 1.0);

    // Pass the vertex color through.
    vColor = aVertexColor;
}