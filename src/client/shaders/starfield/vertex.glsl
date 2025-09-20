#version 300 es


// Base shape vertex (a corner of the star's quad)
in vec2 a_position;

// Per-instance attributes
in vec2 a_instanceposition; // Center position of the star (x,y)
in vec4 a_instancecolor;    // Color of the star (r,g,b,a)
in float a_instancesize;    // Size of the star

uniform mat4 u_transformmatrix;

out vec4 vColor;

void main() {
    // Scale the base quad vertex by the instance's size, then add the instance's position.
    // This creates a quad of the correct size at the correct location.
    vec2 finalPosition = (a_position * a_instancesize) + a_instanceposition;

    // We provide z=0.0 and w=1.0 for a complete 3D position vector
    gl_Position = u_transformmatrix * vec4(finalPosition, 0.0, 1.0);
    vColor = a_instancecolor;
}