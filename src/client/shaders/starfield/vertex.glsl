#version 300 es


// Base shape vertex (a corner of the star's quad)
in vec2 aVertexPosition;

// Per-instance attributes
in vec2 aInstancePosition; // Center position of the star (x,y)
in vec4 aInstanceColor;    // Color of the star (r,g,b,a)
in float aInstanceSize;    // Size of the star

uniform mat4 uTransformMatrix;

out vec4 vColor;

void main() {
    // Scale the base quad vertex by the instance's size, then add the instance's position.
    // This creates a quad of the correct size at the correct location.
    vec2 finalPosition = (aVertexPosition * aInstanceSize) + aInstancePosition;

    // We provide z=0.0 and w=1.0 for a complete 3D position vector
    gl_Position = uTransformMatrix * vec4(finalPosition, 0.0, 1.0);
    vColor = aInstanceColor;
}