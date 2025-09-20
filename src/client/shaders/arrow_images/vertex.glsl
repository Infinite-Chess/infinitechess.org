#version 300 es

in vec4 aVertexPosition;        // Per-vertex position (vec4 for homogeneous coordinates)
in vec2 aTextureCoord;          // Per-vertex texture coordinates
in vec3 aInstancePosition;      // Per-instance position offset (vec3: xyz)
in vec2 aInstanceTexCoord;      // Per-instance texture coordinate offset (vec2)
in vec4 aInstanceColor;         // Per-instance color (RGBA)

uniform mat4 uTransformMatrix;  // Transformation matrix

out vec2 vTextureCoord;         // To fragment shader
out vec4 vInstanceColor;        // To fragment shader

void main() {
    // Apply instance position offset
    vec4 offsetPosition = aVertexPosition + vec4(aInstancePosition, 0.0);
    
    // Transform position and pass through texture coords
    gl_Position = uTransformMatrix * offsetPosition;
    
    // Apply texture coordinate offset and pass to fragment shader
    vTextureCoord = aTextureCoord + aInstanceTexCoord;
    
    // Pass instance color to fragment shader
    vInstanceColor = aInstanceColor;
}