// src/server/middleware/contentSecurityPolicy.ts

import helmet from 'helmet';

/**
 * CSP (Content Security Policy): protects our users by telling the browser to only load/run
 * resources (scripts, frames, images, ...) from sources we explicitly allowlist below.
 * Its main job is mitigating XSS: an injected or inline script from a non-allowlisted source won't run.
 */
const contentSecurityPolicy = helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			scriptSrc: [
				"'self'",
				"'unsafe-inline'",
				"'wasm-unsafe-eval'",
				'https://static.cloudflareinsights.com',
				'https://challenges.cloudflare.com', // Cloudflare Turnstile (register page human-check)
			], // Allows inline scripts
			scriptSrcAttr: ["'self'", "'unsafe-inline'"], // Allows inline event handlers
			// blob: lets the multi-threaded analysis engine spawn its Lazy SMP sub-workers
			// (wasm-bindgen-rayon self-spawns each thread from a blob of its own script).
			workerSrc: ["'self'", 'blob:'],
			objectSrc: ["'none'"],
			frameSrc: ["'self'", 'https://www.youtube.com', 'https://challenges.cloudflare.com'],
			imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com', 'blob:'],
		},
	},
});

export default contentSecurityPolicy;
