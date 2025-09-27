#version 300 es
precision highp float;

// Input Texture
uniform sampler2D u_sceneTexture;

// Effect Controls
uniform float u_time;           // Used for animation
uniform float u_density;        // Controls the number of Voronoi cells
uniform float u_strength;       // The maximum strength of the cells' distortion
uniform float u_ridgeThickness; // The width of the ridges between cells
uniform float u_ridgeStrength;   // The intensity of the ridges' lensing

// Canvas Properties
uniform vec2 u_resolution;      // Canvas dimensions for aspect ratio correction

in vec2 v_uv;
out vec4 out_color;

// --- Helper Functions ---

vec2 noise2x2(vec2 p) {
    // A small constant is added after the dot product, preventing the bottom-left point from being stationary.
	float x = dot(p, vec2(123.4, 234.5)) + 42.0;
	float y = dot(p, vec2(345.6, 456.7)) + 24.0;
	vec2 noise = vec2(x, y);
	noise = sin(noise);
	noise = noise * 43758.5453;
	noise = fract(noise);
	return noise;
}


void main() {
    // Voronoi Cell Calculation

    // Normalize coordinates and adjust for aspect ratio to make cells more square
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect_ratio = u_resolution.x / u_resolution.y;
    uv.x *= aspect_ratio;

    // Scale coordinates by density
    vec2 uv_scaled = uv * u_density;
    
    // Get the integer and fractional parts of the coordinate
    vec2 currentGridId = floor(uv_scaled);
    vec2 currentGridCoord = fract(uv_scaled);
	currentGridCoord = currentGridCoord - 0.5; // Moves range from [0,1] to [-0.5,0.5]

    float d1 = 10.0; // Distance to the closest point
    float d2 = 10.0; // Distance to the second-closest point

    vec2 d1_vector = vec2(0.0); // Vector to the closest point

    // Loop through a 3x3 grid of neighboring cells
    for (float i = -1.0; i <= 1.0; i++) {
        for (float j = -1.0; j <= 1.0; j++) {
            vec2 adjGridCoords = vec2(i, j);

			// Vary points based on time + noise.
			vec2 noise = noise2x2(currentGridId + adjGridCoords);
			vec2 pointOnAdjGrid = adjGridCoords + sin(u_time * noise) * 0.5; // 0.5 controls how far the points can move (should not exceed nearest neighbor)

            // Calculate distance from the current fragment to this cell's point
			float dist = length(currentGridCoord - pointOnAdjGrid);

            if (dist < d1) {
                // This point is the new closest.
                // The old closest becomes the new second-closest.
                d2 = d1;
                d1 = dist;
                d1_vector = pointOnAdjGrid - currentGridCoord;
            } else if (dist < d2) {
                // This point is not the closest, but it is the new second-closest.
                d2 = dist;
            }
        }
    }

    // Distortion Calculation

    // Determine the direction of distortion. We want to push *away* from the
    // closest point, which is the inverse of the vector *to* the closest point.
    vec2 distortion_direction = normalize(-d1_vector);

    // Determine the magnitude of the distortion. We want zero distortion near
    // the point (min_dist = 0) and max distortion far from it.
    float distortion_magnitude = u_strength * smoothstep(0.1, 0.8, d1);

    vec2 total_offset = distortion_direction * distortion_magnitude;


    // Boundary Lensing Effect

    // Calculate the boundary "ridge" mask.
    // (d2 - d1) is our edge detector. It's almost 0 on the boundary.
    float ridge_mask = 1.0 - smoothstep(0.0, u_ridgeThickness, d2 - d1);

    // Create the sharp "lensing" distortion perpendicular to the boundary.
    // The direction is perpendicular to the vector pointing from the pixel to the cell center.
    vec2 ridge_direction = normalize(vec2(d1_vector.y, -d1_vector.x));
    vec2 ridge_offset = ridge_direction * ridge_mask * u_ridgeStrength;

    // Combine the base distortion with the new boundary distortion.
    total_offset = total_offset + ridge_offset;


	// The final offset vector needs to be scaled back for the non-aspect-corrected UVs.
    total_offset.x /= aspect_ratio;


	// [DEBUG] Visualize the raw distance field.
	// out_color = vec4(vec3(d1), 1.0);
	// return;


    // Final Texture Sampling

    // Apply the calculated offset to the original texture coordinates
    vec2 distorted_uv = v_uv + total_offset;

    // Sample the scene texture using the new, distorted coordinates.
	out_color = texture(u_sceneTexture, distorted_uv);
}