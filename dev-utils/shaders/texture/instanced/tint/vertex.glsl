#version 300 es

// This shader is capable of tinting all textures
// a specific color via a uniform

in vec4 aVertexPosition;        // Per-vertex position
in vec2 aTextureCoord;          // Per-vertex texture coordinates
in vec3 aInstancePosition;      // Per-instance position offset

uniform mat4 uTransformMatrix;  // Transformation matrix

out vec2 vTextureCoord;         // To fragment shader

void main() {
    // Apply instance position offset
    vec4 offsetPosition = aVertexPosition + vec4(aInstancePosition, 0.0);
    
    // Transform position and pass through texture coords
    gl_Position = uTransformMatrix * offsetPosition;
    
    // Pass texture coordinates to fragment shader
    vTextureCoord = aTextureCoord;
}