#version 300 es

// This shader is capable of tinting all textures
// a specific color via a uniform

in vec4 a_position;        // Per-vertex position
in vec2 a_texturecoord;          // Per-vertex texture coordinates
in vec3 a_instanceposition;      // Per-instance position offset

uniform mat4 u_transformmatrix;  // Transformation matrix

out vec2 vTextureCoord;         // To fragment shader

void main() {
    // Apply instance position offset
    vec4 offsetPosition = a_position + vec4(a_instanceposition, 0.0);
    
    // Transform position and pass through texture coords
    gl_Position = u_transformmatrix * offsetPosition;
    
    // Pass texture coordinates to fragment shader
    vTextureCoord = a_texturecoord;
}