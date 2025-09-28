#version 300 es
precision highp float;

// --- UNIFORMS ---
uniform sampler2D u_sceneTexture;

uniform float u_masterStrength; // 0.0 = no effect, 1.0 = full effect
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
	vec4 originalColor = texture(u_sceneTexture, v_uv);
	vec4 processedColor = texture(u_sceneTexture, v_uv);

	// --- ORDER OF OPERATIONS ---

	// 1. Apply Brightness
	processedColor.rgb += u_brightness;

	// 2. Apply Contrast
	processedColor.rgb = (processedColor.rgb - 0.5) * u_contrast + 0.5;

	// 3. Apply Gamma Correction
	// We use 1.0 / gamma which is the standard for gamma correction.
	// Use max() to ensure the input to pow() is never negative, preventing NaN errors.
	processedColor.rgb = pow(max(processedColor.rgb, 0.0), vec3(1.0 / u_gamma));

	// 4. Apply Saturation
	// Calculate the grayscale value using the luminance vector.
	// The dot product is a fast way to do (r*0.2126 + g*0.7152 + b*0.0722).
	float luminance = dot(processedColor.rgb, LUMINANCE_VECTOR);
	vec3 grayscale = vec3(luminance);
	// Blend between the grayscale processed color and the original color.
	// mix() is a built-in GLSL function for linear interpolation.
	processedColor.rgb = mix(grayscale, processedColor.rgb, u_saturation);

	// 5. Apply Tint
	processedColor.rgb *= u_tintColor;

	// 6. Apply Hue Shift
	vec3 hsv = rgb2hsv(processedColor.rgb);
	hsv.x += u_hueOffset;
	hsv.x = fract(hsv.x); // Wrap the hue value around (0.0 to 1.0)
	processedColor.rgb = hsv2rgb(hsv);

	// Clamp the processed color to ensure it's in the valid 0.0-1.0 range
	processedColor.rgb = clamp(processedColor.rgb, 0.0, 1.0);

	// Apply Master Strength
	// Blend between the original color and the fully processed color
	vec3 finalRgb = mix(originalColor.rgb, processedColor.rgb, u_masterStrength);
	
	out_color = vec4(finalRgb, originalColor.a); // Preserve original alpha
}