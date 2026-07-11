// src/server/routes/root.ts

import express, { NextFunction, Request, RequestHandler, Response } from 'express';

import variantregistry from '../../shared/chess/variants/variantregistry.js';

import send404 from '../middleware/send404.js';
import { resolveAuth } from '../middleware/resolveAuth.js';
import { getGamePageState } from '../controllers/gamePageController.js';
import { getVerifyPageState } from '../controllers/verifyAccountController.js';
import { TURNSTILE_SITE_KEY } from '../controllers/turnstile.js';
import { getRandomSplashText } from './splashTexts.js';
import { getAnalysisPageState } from '../controllers/analysisPageController.js';
import { getAwaitingPageState } from '../controllers/registerController.js';
import { getBaseRenderContext } from '../utility/renderContext.js';
import { getResetPasswordPageState } from '../controllers/passwordResetController.js';

const router = express.Router();

/**
 * Exposes the base render context to the template. Nunjucks merges res.locals into every
 * template's render context, so {{ lang }}, {{ templateT }}, etc. become available.
 * Reads req.memberInfo, so resolveAuth must run first (see `page`).
 */
function attachRenderContext(req: Request, res: Response, next: NextFunction): void {
	Object.assign(res.locals, getBaseRenderContext(req));
	next();
}

/**
 * Marks a response cross-origin isolated (COOP + COEP), which is what unlocks
 * `SharedArrayBuffer` — required by the multi-threaded (Lazy SMP) analysis engine build.
 *
 * Applied ONLY to the analysis page: `require-corp` would block cross-origin subresources
 * that don't send CORP (Turnstile, YouTube embeds, the analytics beacon) on other pages.
 * The analysis page's engine assets (worker, wasm, rayon snippet workers) are all
 * same-origin, so they're allowed without extra CORP headers.
 */
function crossOriginIsolation(_req: Request, res: Response, next: NextFunction): void {
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	next();
}
/**
 * Registers a GET page route. Runs resolveAuth then attaches the render
 * context, before the route's own handler. Ensures auth doesn't run
 * on requests that merely pass through this catch-all ('/') mount.
 */
function page(path: string, handler: RequestHandler, ...before: RequestHandler[]): void {
	router.get(path, resolveAuth, attachRenderContext, ...before, handler);
}

/** Cache all variant groups and their variants. */
const variantGroups = variantregistry.getVariantGroupsWithVariants();

// Regular pages
page('^/$|/index(.html)?', (req: Request, res: Response) => res.render('index.njk', { variantGroups, splashText: getRandomSplashText(req) })); // prettier-ignore
page('/about(.html)?', (_req: Request, res: Response) => res.render('about.njk'));
page('/credits(.html)?', (_req: Request, res: Response) => res.render('credits.njk'));
page(
	'/game/:id',
	(req: Request, res: Response) => {
		const state = getGamePageState(req);
		if (state === undefined) return send404(req, res); // Malformed or nonexistent id
		res.render('game.njk', state);
	},
	crossOriginIsolation, // Engine games run the multi-threaded engine (SharedArrayBuffer) locally.
);
page(
	'/analysis(.html)?/:id?',
	(req: Request, res: Response) => {
		const state = getAnalysisPageState(req);
		if (state === undefined) return send404(req, res); // Malformed or nonexistent id
		res.render('analysis.njk', state);
	},
	crossOriginIsolation, // Cross-origin isolate so the multi-threaded engine's SharedArrayBuffer works.
);
page('/news(.html)?', (_req: Request, res: Response) => res.render('news.njk'));
page('/leaderboard(.html)?', (_req: Request, res: Response) => res.render('leaderboard.njk'));
page('/login(.html)?', (_req: Request, res: Response) => res.render('login.njk'));
page('/forgot-password(.html)?', (_req: Request, res: Response) => res.render('forgotpassword.njk')); // prettier-ignore
page('/register(.html)?', (req: Request, res: Response) => {
	// Redirect to check-your-email page if register is pending
	if (getAwaitingPageState(req)) res.redirect('/register/awaiting');
	else res.render('register.njk', { turnstileSiteKey: TURNSTILE_SITE_KEY });
});
page('/register/awaiting(.html)?', (req: Request, res: Response) => {
	const state = getAwaitingPageState(req);
	// Redirect to register page if no register is pending
	if (state === null) res.redirect('/register');
	else res.render('register-awaiting.njk', state);
});
page('/verify/:token', (req: Request, res: Response) => {
	// The token sits in the URL; keep it out of any Referer
	// header sent to third-party resources to avoid leaking it.
	res.setHeader('Referrer-Policy', 'no-referrer');
	res.render('verify.njk', getVerifyPageState(req));
});
page('/reset-password/:token', (req: Request, res: Response) => {
	// The token sits in the URL; keep it out of any Referer
	// header sent to third-party resources to avoid leaking it.
	res.setHeader('Referrer-Policy', 'no-referrer');
	res.render('resetpassword.njk', getResetPasswordPageState(req));
});
page('/terms(.html)?', (_req: Request, res: Response) => res.render('terms.njk'));
page('/privacy(.html)?', (_req: Request, res: Response) => res.render('privacy.njk'));
page('/member(.html)?/:member', (_req: Request, res: Response) => res.render('member.njk'));
page('/admin(.html)?', (_req: Request, res: Response) => res.render('admin.njk'));
page('/icnvalidator(.html)?', (_req: Request, res: Response) => res.render('icnvalidator.njk')); // prettier-ignore
page('/tutorial(.html)?', (_req: Request, res: Response) => res.render('tutorial.njk'));
page('/checkmatepractice(.html)?', (_req: Request, res: Response) => res.render('checkmatepractice.njk')); // prettier-ignore
page('/editor(.html)?', (_req: Request, res: Response) => res.render('editor.njk'));
page('/patron(.html)?', (_req: Request, res: Response) => res.render('patron.njk'));

// Legacy URL redirects (permanent 301)
router.get('/termsofservice(.html)?', (_req: Request, res: Response) => res.redirect(301, '/terms')); // prettier-ignore

export { router as rootRouter };
