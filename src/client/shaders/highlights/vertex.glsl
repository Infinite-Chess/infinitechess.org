#version 300 es

in vec4 a_position;     // Base shape vertex position (e.g., from -0.5 to 0.5)
in vec4 a_color;        // Base shape vertex color
in vec3 a_instanceposition;   // Per-instance position offset (center of the shape)

uniform mat4 u_transformmatrix; // Combined model-view-projection matrix
uniform float u_size;    // Desired size multiplier of the shape (scales a_position)

out vec4 vColor;             // Pass color to fragment shader

void main() {
    // Scale the base vertex position's X and Y by the shape width.
    // Assumes Z is 0 or handled appropriately, W is 1 for position.
    vec3 scaledLocalPosition = vec3(a_position.xy * u_size, a_position.z);

    // Add the instance-specific position offset to the scaled local position.
    vec3 finalPosition = scaledLocalPosition + a_instanceposition;

    // Transform the final position.
    gl_Position = u_transformmatrix * vec4(finalPosition, 1.0);

    // Pass the vertex color through.
    vColor = a_color;
}