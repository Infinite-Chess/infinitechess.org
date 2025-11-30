#version 300 es
precision highp float;

// This shader is used by ColorFlowRenderer.ts to render a fullscreen
// color flow effect in the background of the chess game, replacing the starfield.
// This is only used occasionally for obtaining cool video footage.

// --- Uniforms ---
uniform vec2 u_resolution;
uniform float u_flowDistance;       // Equivalent to time * speed
uniform vec2 u_flowDirectionVec;    // Calculated cos/sin vector
uniform float u_gradientRepeat;     // How dense the rainbow is
uniform float u_alpha;              // Master opacity

// The 6-stop gradient colors
uniform vec3 u_colors[6];

out vec4 fragColor;

// Linearly interpolates between 6 colors based on a 0-1 t value
vec3 getColorFromRamp(float t) {
    float scaledT = t * 6.0;
    int index = int(floor(scaledT));
    float blend = fract(scaledT);

    // Handle wrapping
    int nextIndex = (index + 1) % 6;

    // In WebGL2 we can index arrays dynamically
    // Note: We clamp index to avoid any precision issues at exactly 1.0
    if (index >= 6) index = 0;
    
    return mix(u_colors[index], u_colors[nextIndex], blend);
}

void main() {
    // 1. Normalized UV Coordinates with Aspect Ratio Correction
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    uv.x *= aspect;

    // 2. Project UV onto the flow vector
    // This creates the linear "river" direction
    float projectedUv = dot(uv, u_flowDirectionVec);

    // 3. Calculate Phase
    // (projected position * density) + animation offset
    float phase = (projectedUv * u_gradientRepeat) + u_flowDistance;

    // 4. Wrap for gradient lookup (0.0 to 1.0)
    float gradientCoord = fract(phase);

    // 5. Sample Color
    vec3 finalColor = getColorFromRamp(gradientCoord);

    fragColor = vec4(finalColor, u_alpha);
}