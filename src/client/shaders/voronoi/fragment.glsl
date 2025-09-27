#version 300 es
precision highp float;

// Uniforms for customization
uniform vec2 u_resolution;
uniform float u_time;
uniform float grid_density; // Controls the density of points
uniform float evolution_strength; // 0.0 for static, higher for more movement
// The brightness range for the voronoi effect
// 0.0 = black, 1.0 = original brightness, >1.0 = brighter
uniform float u_min_brightness;
uniform float u_max_brightness;

// The input texture
uniform sampler2D u_texture;

in vec2 v_uv;

out vec4 fragColor;

// 2D pseudo-random function
vec2 random_2d(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// 3D noise function to get displacement values
// It returns a vec2 for x and y displacement
vec2 noise_3d_to_2d(vec3 p) {
    float x = fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float y = fract(sin(dot(p, vec3(269.5, 183.3, 246.3))) * 43758.5453);
    return vec2(x, y);
}

void main() {
    // --- VORONOI CALCULATION ---

    // Normalize coordinates and adjust for aspect ratio
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect_ratio = u_resolution.x / u_resolution.y;
    uv.x *= aspect_ratio;

    // Scale coordinates by density
    vec2 uv_scaled = uv * grid_density;
    
    // Get the integer and fractional parts of the coordinate
    vec2 cell_index = floor(uv_scaled);
    vec2 fractional_coord = fract(uv_scaled);

    float min_dist = 1.0; // Initialize with a large value

    // Loop through a 3x3 grid of neighboring cells
    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            vec2 neighbor_cell = vec2(float(i), float(j));
            vec2 point_position = cell_index + neighbor_cell;

            // Generate a random, stable offset for the point in the cell
            vec2 point_offset = random_2d(point_position);

            // Animate the point using 3D noise
            // The third dimension is time, allowing the noise to evolve
            vec3 noise_input = vec3(point_position, u_time * 0.1);
            
            // Get a displacement vector from the noise function
            // Map noise from [0, 1] to [-1, 1]
            vec2 displacement = (noise_3d_to_2d(noise_input) - 0.5) * 2.0;
            
            // The final animated point position
            vec2 animated_point = neighbor_cell + point_offset + displacement * evolution_strength;
            
            // Calculate distance from the current fragment to the animated point
            float dist = distance(fractional_coord, animated_point);

            // Keep the minimum distance
            min_dist = min(min_dist, dist);
        }
    }

    // --- TEXTURE AND BRIGHTNESS MODIFICATION ---

    // The final color is the distance, clamped to ensure it's between 0 and 1
    // 1. Get the final greyscale voronoi value
    float voronoi_value = smoothstep(0.0, 1.0, min_dist);

    // 2. Sample the texture using the object's own UVs from the vertex shader
    vec4 texture_color = texture(u_texture, v_uv);

    // 3. Map the voronoi value to your desired brightness range
    float brightness_factor = mix(u_min_brightness, u_max_brightness, voronoi_value);

    // 4. Modify the texture color's brightness
    vec3 final_rgb = texture_color.rgb * brightness_factor;


        // --- [OPTIONAL] Add Red Glow Near Points ---
        // This block adds a red glow to the darkest areas (pockets).
        // To disable, just comment out this entire block.

        // 1. Define the glow color and its intensity. You can tweak these values.
        const vec3 glow_color = vec3(1.0, 0.0, 0.0);
        const float glow_intensity = 0.25; // How strong the glow is

        // 2. Calculate a "glow factor" based on the distance to the nearest point.
        //    smoothstep(edge1, edge0, x) creates a smooth inverse falloff.
        //    It's 1.0 when min_dist is at 0.0, and fades to 0.0 as min_dist approaches 0.15.
        float glow_factor = smoothstep(0.15, 0.0, min_dist);

        // 3. Add the glow to the final color using an additive blend.
        //    The glow is strongest in the pockets and has no effect elsewhere.
        final_rgb += glow_color * glow_intensity * glow_factor;


    // 5. Output the final color
    fragColor = vec4(final_rgb, texture_color.a);
}