#version 300 es

in vec4 a_position;        // Per-vertex position (vec4 for homogeneous coordinates)
in vec2 a_texturecoord;          // Per-vertex texture coordinates
in vec3 a_instanceposition;      // Per-instance position offset (vec3: xyz)
in vec2 a_instancetexcoord;      // Per-instance texture coordinate offset (vec2)
in vec4 a_instancecolor;         // Per-instance color (RGBA)

uniform mat4 u_transformmatrix;  // Transformation matrix

out vec2 vTextureCoord;         // To fragment shader
out vec4 vInstanceColor;        // To fragment shader

void main() {
    // Apply instance position offset
    vec4 offsetPosition = a_position + vec4(a_instanceposition, 0.0);
    
    // Transform position and pass through texture coords
    gl_Position = u_transformmatrix * offsetPosition;
    
    // Apply texture coordinate offset and pass to fragment shader
    vTextureCoord = a_texturecoord + a_instancetexcoord;
    
    // Pass instance color to fragment shader
    vInstanceColor = a_instancecolor;
}