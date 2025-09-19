#version 300 es

in vec4 aVertexPosition;        // Per-vertex position (vec4 for homogeneous coordinates)
in vec2 aTextureCoord;          // Per-vertex texture coordinates
in vec3 aInstancePosition;      // Per-instance position offset (vec3: xyz)

uniform mat4 uTransformMatrix;  // Transformation matrix

out vec2 vTextureCoord;         // To fragment shader

void main() {
    // Apply instance position offset
    vec4 offsetPosition = aVertexPosition + vec4(aInstancePosition, 0.0);
    
    // Transform position and pass through texture coords
    gl_Position = uTransformMatrix * offsetPosition;
    
    // Pass texture coordinates directly to fragment shader
    vTextureCoord = aTextureCoord;
}