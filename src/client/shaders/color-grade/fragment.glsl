#version 300 es
precision lowp float;

uniform sampler2D u_sceneTexture;
uniform float u_saturation; // 0.0 = grayscale, 1.0 = original color

in vec2 v_uv;
out vec4 out_color;

// These are standard weights for calculating luminance, based on human eye perception.
const vec3 LUMINANCE_VECTOR = vec3(0.2126, 0.7152, 0.0722);

void main() {
	// Get the original color from the scene texture.
	vec4 originalColor = texture(u_sceneTexture, v_uv);

	// Calculate the grayscale value using the luminance vector.
	// The dot product is a fast way to do (r*0.2126 + g*0.7152 + b*0.0722).
	float luminance = dot(originalColor.rgb, LUMINANCE_VECTOR);
	vec3 grayscaleColor = vec3(luminance);

	// Blend between the grayscale color and the original color.
	// mix() is a built-in GLSL function for linear interpolation.
	vec3 saturatedColor = mix(grayscaleColor, originalColor.rgb, u_saturation);

	// Output the final color, keeping the original alpha.
	out_color = vec4(saturatedColor, originalColor.a);
}