#version 300 es

in vec4 a_position;
in vec3 a_instanceposition; // Instance position offset (vec3: xyz)
in vec4 a_instancecolor;    // Instance color (vec4: rgba)
in float aInstanceRotation; // Instance rotation (float: radians)

uniform mat4 u_transformmatrix;

out vec4 vColor;

void main() {
    // Create rotation matrix
    float cosA = cos(aInstanceRotation);
    float sinA = sin(aInstanceRotation);
    mat2 rotMat = mat2(cosA, sinA, -sinA, cosA);
    
    // Rotate vertex position
    vec2 rotated = rotMat * a_position.xy;
    vec3 rotatedPosition = vec3(rotated, a_position.z);
    
    // Add instance position offset
    vec3 finalPosition = rotatedPosition + a_instanceposition;
    
    gl_Position = u_transformmatrix * vec4(finalPosition, 1.0);
    vColor = a_instancecolor;
}