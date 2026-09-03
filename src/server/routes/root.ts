// src/server/routes/root.ts

/**
 * The URL table for every SSR'd HTML page, mounted at `/`. Each route resolves auth,
 * attaches the base render context, then renders its Nunjucks template — with the page's
 * own state coming from a controller where the page needs any.
 */

import express, { NextFunction, Request, RequestHandler, Response } from 'express';

import validators from '../../shared/util/validators.js';
import variantregistry from '../../shared/chess/variants/variantregistry.js';

import send404 from '../middleware/send404.js';
import turnstile from '../controllers/turnstile.js';
import resolveAuth from '../middleware/resolveAuth.js';
import renderContext from '../utility/renderContext.js';
import gamePageController from '../controllers/gamePageController.js';
import registerController from '../controllers/registerController.js';
import analysisPageController from '../controllers/analysisPageController.js';
import verifyAccountController from '../controllers/verifyAccountController.js';
import passwordResetController from '../controllers/passwordResetController.js';
import componentTranslationLoader from '../config/componentTranslationLoader.js';

// Constants -------------------------------------------------------------------

const router = express.Router();

/** The `maxlength` every auth form input renders with. */
const AUTH_INPUT_MAX_LENGTHS = {
	USERNAME: validators.MAX_USERNAME_LENGTH,
	EMAIL: validators.MAX_EMAIL_LENGTH,
	PASSWORD: validators.MAX_PASSWORD_LENGTH,
};

// Helpers ---------------------------------------------------------------------

/**
 * Exposes the base render context to the template. Nunjucks merges res.locals into every
 * template's render context, so {{ lang }}, {{ templateT }}, etc. become available.
 * Reads req.memberInfo, so resolveAuth.resolve must run first (see `page`).
 */
function attachRenderContext(req: Request, res: Response, next: NextFunction): void {
	Object.assign(res.locals, renderContext.getBaseRenderContext(req));
	next();
}

/**
 * Marks a response cross-origin isolated (COOP + COEP), which is what unlocks
 * `SharedArrayBuffer` — required by the multi-threaded (Lazy SMP) analysis engine build.
 *
 * Applied to analysis and game pages, whose engine assets are all same-origin.
 * Other pages may load cross-origin resources that don't send CORP.
 */
function crossOriginIsolation(_req: Request, res: Response, next: NextFunction): void {
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	next();
}
/**
 * Registers a GET page route. Runs resolveAuth.resolve then attaches the render
 * context, before the route's own handler. Ensures auth doesn't run
 * on requests that merely pass through this catch-all ('/') mount.
 */
function page(path: string, handler: RequestHandler, ...before: RequestHandler[]): void {
	router.get(path, resolveAuth.resolve, attachRenderContext, ...before, handler);
}

/** Picks the home page's hero tagline at random, in the request's resolved language. */
function getRandomSplashText(req: Request): string {
	const splashes = componentTranslationLoader.getTemplate('splashes', req.lang) as Record<
		string,
		string
	>;
	const values = Object.values(splashes);
	return values[Math.floor(Math.random() * values.length)]!;
}

/** Cache all variant groups and their variants. */
const variantGroups = variantregistry.getGroupsWithVariants();

// Pages -----------------------------------------------------------------------

page('^/$|/index(.html)?', (req: Request, res: Response) => res.render('index.njk', { variantGroups, splashText: getRandomSplashText(req) })); // prettier-ignore
page('/about(.html)?', (_req: Request, res: Response) => res.render('about.njk'));
page('/credits(.html)?', (_req: Request, res: Response) => res.render('credits.njk'));
page(
	'/game/:id/:color(w|b)?',
	(req: Request, res: Response) => {
		const state = gamePageController.getPageState(req);
		if (state === undefined) return send404(req, res); // Malformed or nonexistent id
		res.render('game.njk', state);
	},
	crossOriginIsolation, // Engine games run the multi-threaded engine (SharedArrayBuffer) locally.
);
page(
	'/analysis(.html)?/:id?/:color(w|b)?',
	(req: Request, res: Response) => {
		const state = analysisPageController.getPageState(req);
		if (state === undefined) return send404(req, res); // Malformed or nonexistent id
		res.render('analysis.njk', state);
	},
	crossOriginIsolation, // Cross-origin isolate so the multi-threaded engine's SharedArrayBuffer works.
);
page('/news(.html)?', (_req: Request, res: Response) => res.render('news.njk'));
page('/leaderboard(.html)?', (_req: Request, res: Response) => res.render('leaderboard.njk'));
page('/login(.html)?', (_req: Request, res: Response) => res.render('login.njk', { maxLengths: AUTH_INPUT_MAX_LENGTHS })); // prettier-ignore
page('/forgot-password(.html)?', (_req: Request, res: Response) => res.render('forgotpassword.njk', { maxLengths: AUTH_INPUT_MAX_LENGTHS })); // prettier-ignore
page('/register(.html)?', (req: Request, res: Response) => {
	// Redirect to check-your-email page if register is pending
	if (registerController.getAwaitingPageState(req)) res.redirect('/register/awaiting');
	else res.render('register.njk', { turnstileSiteKey: turnstile.SITE_KEY, maxLengths: AUTH_INPUT_MAX_LENGTHS }); // prettier-ignore
});
page('/register/awaiting(.html)?', (req: Request, res: Response) => {
	const state = registerController.getAwaitingPageState(req);
	// Redirect to register page if no register is pending
	if (state === null) res.redirect('/register');
	else res.render('register-awaiting.njk', { ...state, maxLengths: AUTH_INPUT_MAX_LENGTHS });
});
page('/verify/:token', (req: Request, res: Response) => {
	// The token sits in the URL; keep it out of any Referer
	// header sent to third-party resources to avoid leaking it.
	res.setHeader('Referrer-Policy', 'no-referrer');
	res.render('verify.njk', verifyAccountController.getPageState(req));
});
page('/reset-password/:token', (req: Request, res: Response) => {
	// The token sits in the URL; keep it out of any Referer
	// header sent to third-party resources to avoid leaking it.
	res.setHeader('Referrer-Policy', 'no-referrer');
	res.render('resetpassword.njk', { ...passwordResetController.getPageState(req), maxLengths: AUTH_INPUT_MAX_LENGTHS }); // prettier-ignore
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

// Legacy Redirects ------------------------------------------------------------

// Permanent 301s
router.get('/termsofservice(.html)?', (_req: Request, res: Response) => res.redirect(301, '/terms')); // prettier-ignore

// Exports ---------------------------------------------------------------------

export default router;
