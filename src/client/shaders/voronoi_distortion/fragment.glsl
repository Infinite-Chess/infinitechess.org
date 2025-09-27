#version 300 es
precision highp float;

// Input from the vertex shader (normalized 0-1 coordinates)
in vec2 v_uv;

// The final color that will be written to the framebuffer
out vec4 out_color;

// The texture from the previous pass (our scene)
uniform sampler2D u_sceneTexture;

// --- Effect Controls ---
uniform vec2 u_resolution;      // Canvas dimensions for aspect ratio correction
uniform float u_time;           // Used for animation
uniform float u_density;        // Controls the number of Voronoi cells
uniform float u_strength;       // The maximum strength of the distortion


// --- Helper Functions (from your example) ---

// 2D pseudo-random function
vec2 random_2d(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// 3D noise function to get a 2D displacement vector for animation
vec2 noise_3d_to_2d(vec3 p) {
    float x = fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453));
    float y = fract(sin(dot(p, vec3(269.5, 183.3, 246.3))) * 43758.5453));
    return vec2(x, y);
}


void main() {
    // --- VORONOI CALCULATION ---

    // Normalize coordinates and adjust for aspect ratio to make cells more square
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect_ratio = u_resolution.x / u_resolution.y;
    uv.x *= aspect_ratio;

    // Scale coordinates by density
    vec2 uv_scaled = uv * u_density;
    
    // Get the integer and fractional parts of the coordinate
    vec2 cell_index = floor(uv_scaled);
    vec2 fractional_coord = fract(uv_scaled);

    float min_dist = 1.0;               // Initialize with a large value
    vec2 vector_to_closest = vec2(0.0); // Store the vector to the closest point

    // Loop through a 3x3 grid of neighboring cells
    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            vec2 neighbor_cell = vec2(float(i), float(j));
            vec2 point_position = cell_index + neighbor_cell;

            // Generate a random, stable offset for the point in the cell
            vec2 point_offset = random_2d(point_position);

            // Animate the point using 3D noise (time is the 3rd dimension)
            vec3 noise_input = vec3(point_position, u_time);
            vec2 displacement = (noise_3d_to_2d(noise_input) - 0.5) * 2.0;
            
            // The final animated point position
            // The `evolution_strength` is now built-in to the `u_strength`
            vec2 animated_point = neighbor_cell + point_offset + displacement * 0.5;
            
            // Calculate distance from the current fragment to this cell's point
            float dist = distance(fractional_coord, animated_point);

            // If this point is closer, update min_dist and store the vector
            if (dist < min_dist) {
                min_dist = dist;
                vector_to_closest = animated_point - fractional_coord;
            }
        }
    }

    // --- DISTORTION CALCULATION ---

    // 1. Determine the direction of distortion. We want to push *away* from the
    //    closest point, which is the inverse of the vector *to* the closest point.
    vec2 distortion_direction = normalize(-vector_to_closest);

    // 2. Determine the magnitude of the distortion. We want zero distortion near
    //    the point (min_dist = 0) and max distortion far from it.
    //    smoothstep() creates a nice curve for the falloff.
    float distortion_magnitude = u_strength * smoothstep(0.1, 0.8, min_dist);
    
    // 3. The final offset vector needs to be scaled back for the non-aspect-corrected UVs.
    vec2 total_offset = distortion_direction * distortion_magnitude;
    total_offset.x /= aspect_ratio;


    // --- FINAL TEXTURE SAMPLING ---

    // Apply the calculated offset to the original texture coordinates
    vec2 distorted_uv = v_uv + total_offset;

    // Sample the scene texture using the new, distorted coordinates.
    // CLAMP_TO_EDGE will handle cases where the distorted UV goes outside the 0-1 range.
	out_color = texture(u_sceneTexture, distorted_uv);
}