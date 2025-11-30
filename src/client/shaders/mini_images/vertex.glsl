#version 300 es

in vec4 a_position;        // Per-vertex position
in vec2 a_texturecoord;          // Per-vertex texture coordinate
in vec4 a_color;           // Per-vertex color
in vec3 a_instanceposition;      // Per-instance position offset

uniform mat4 u_transformmatrix;  // Transformation matrix
uniform float u_size;    // Desired size multiplier of the shape (scales a_position)

out vec2 vTextureCoord;         // Pass texture coord to fragment shader
out vec4 vColor;                // Pass vertex color to fragment shader

void main() {
    // Scale the base vertex position's X and Y by the shape width.
    // Assumes Z is 0 or handled appropriately, W is 1 for position.
    vec3 scaledLocalPosition = vec3(a_position.xy * u_size, a_position.z);

    // Apply instance position offset to the base vertex position
    vec3 finalPosition = scaledLocalPosition + a_instanceposition;

    // Transform the final position
    gl_Position = u_transformmatrix * vec4(finalPosition, 1.0);

    // Pass texture coordinates and vertex color to the fragment shader
    vTextureCoord = a_texturecoord;
    vColor = a_color;
}