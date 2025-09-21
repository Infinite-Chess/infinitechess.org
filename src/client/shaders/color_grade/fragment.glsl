#version 300 es
precision lowp float;

// --- UNIFORMS ---
uniform sampler2D u_sceneTexture;

uniform float u_brightness; // 0.0 is no change
uniform float u_contrast;   // 1.0 is no change
uniform float u_gamma;      // 1.0 is no change
uniform float u_saturation; // 1.0 is no change, 0.0 = grayscale
uniform vec3 u_tintColor;   // vec3(1.0) is no change
uniform float u_hueOffset;  // 0.0 is no change (0.0 to 1.0)

in vec2 v_uv;
out vec4 out_color;

// --- CONSTANTS ---
// These are standard weights for calculating luminance, based on human eye perception.
const vec3 LUMINANCE_VECTOR = vec3(0.2126, 0.7152, 0.0722);

// --- HELPER FUNCTIONS for Hue Shift ---
// Converts RGB color space to HSV color space
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Converts HSV color space to RGB color space
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
	// Start with the original color from the scene
	vec4 color = texture(u_sceneTexture, v_uv);

	// --- ORDER OF OPERATIONS ---

	// 1. Apply Brightness
	color.rgb += u_brightness;

	// 2. Apply Contrast
	color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

	// 3. Apply Gamma Correction
	// We use 1.0 / gamma which is the standard for gamma correction.
	color.rgb = pow(color.rgb, vec3(1.0 / u_gamma));

	// 4. Apply Saturation
	// Calculate the grayscale value using the luminance vector.
	// The dot product is a fast way to do (r*0.2126 + g*0.7152 + b*0.0722).
	float luminance = dot(color.rgb, LUMINANCE_VECTOR);
	vec3 grayscale = vec3(luminance);
	// Blend between the grayscale color and the original color.
	// mix() is a built-in GLSL function for linear interpolation.
	color.rgb = mix(grayscale, color.rgb, u_saturation);

	// 5. Apply Tint
	color.rgb *= u_tintColor;

	// 6. Apply Hue Shift
	vec3 hsv = rgb2hsv(color.rgb);
	hsv.x += u_hueOffset;
	hsv.x = fract(hsv.x); // Wrap the hue value around (0.0 to 1.0)
	color.rgb = hsv2rgb(hsv);

	// Clamp the final color to ensure it's in the valid 0.0-1.0 range
	color.rgb = clamp(color.rgb, 0.0, 1.0);
	
	out_color = color;
}