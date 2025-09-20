#version 300 es

in vec4 aVertexPosition;
in vec3 aInstancePosition; // Instance position offset (vec3: xyz)
in vec4 aInstanceColor;    // Instance color (vec4: rgba)
in float aInstanceRotation; // Instance rotation (float: radians)

uniform mat4 uTransformMatrix;

out vec4 vColor;

void main() {
    // Create rotation matrix
    float cosA = cos(aInstanceRotation);
    float sinA = sin(aInstanceRotation);
    mat2 rotMat = mat2(cosA, sinA, -sinA, cosA);
    
    // Rotate vertex position
    vec2 rotated = rotMat * aVertexPosition.xy;
    vec3 rotatedPosition = vec3(rotated, aVertexPosition.z);
    
    // Add instance position offset
    vec3 finalPosition = rotatedPosition + aInstancePosition;
    
    gl_Position = uTransformMatrix * vec4(finalPosition, 1.0);
    vColor = aInstanceColor;
}