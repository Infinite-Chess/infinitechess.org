// src/server/routes/root.ts

import express, { NextFunction, Request, RequestHandler, Response } from 'express';

import variantregistry from '../../shared/chess/variants/variantregistry.js';

import { resolveAuth } from '../middleware/resolveAuth.js';
import { getVerifyPageState } from '../controllers/verifyAccountController.js';
import { getRandomSplashText } from './splashTexts.js';
import { getAwaitingPageState } from '../controllers/createAccountController.js';
import { getBaseRenderContext } from '../utility/renderContext.js';

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
 * Registers a GET page route. Runs resolveAuth then attaches the render
 * context, before the route's own handler. Ensures auth doesn't run
 * on requests that merely pass through this catch-all ('/') mount.
 */
function page(path: string, handler: RequestHandler): void {
	router.get(path, resolveAuth, attachRenderContext, handler);
}

/** Cache all variant groups and their variants. */
const variantGroups = variantregistry.getVariantGroupsWithVariants();

// Regular pages
page('^/$|/index(.html)?', (req: Request, res: Response) => res.render('index.njk', { variantGroups, splashText: getRandomSplashText(req) })); // prettier-ignore
page('/about(.html)?', (_req: Request, res: Response) => res.render('about.njk'));
page('/credits(.html)?', (_req: Request, res: Response) => res.render('credits.njk'));
page('/play(.html)?', (_req: Request, res: Response) => res.render('play.njk'));
page('/news(.html)?', (_req: Request, res: Response) => res.render('news.njk'));
page('/leaderboard(.html)?', (_req: Request, res: Response) => res.render('leaderboard.njk'));
page('/login(.html)?', (_req: Request, res: Response) => res.render('login.njk'));
page('/register(.html)?', (req: Request, res: Response) => {
	// Redirect to check-your-email page if register is pending
	if (getAwaitingPageState(req)) res.redirect('/register/awaiting');
	else res.render('register.njk');
});
page('/register/awaiting(.html)?', (req: Request, res: Response) => {
	const state = getAwaitingPageState(req);
	// Redirect to register page if no register is pending
	if (state === null) res.redirect('/register');
	else res.render('register-awaiting.njk', state);
});
page('/reset-password/:token', (_req: Request, res: Response) => res.render('resetpassword.njk')); // prettier-ignore
page('/verify/:token', (req: Request, res: Response) => {
	// The token sits in the URL; keep it out of any Referer header sent to third-party resources.
	res.setHeader('Referrer-Policy', 'no-referrer');
	res.render('verify.njk', getVerifyPageState(req));
});
page('/terms(.html)?', (_req: Request, res: Response) => res.render('terms.njk'));
page('/privacy(.html)?', (_req: Request, res: Response) => res.render('privacy.njk'));
page('/member(.html)?/:member', (_req: Request, res: Response) => res.render('member.njk'));
page('/admin(.html)?', (_req: Request, res: Response) => res.render('admin.njk'));
page('/icnvalidator(.html)?', (_req: Request, res: Response) => res.render('icnvalidator.njk')); // prettier-ignore
page('/tutorial(.html)?', (_req: Request, res: Response) => res.render('tutorial.njk'));
page('/checkmatepractice(.html)?', (_req: Request, res: Response) => res.render('checkmatepractice.njk')); // prettier-ignore
page('/analysis(.html)?', (_req: Request, res: Response) => res.render('analysis.njk'));
page('/editor(.html)?', (_req: Request, res: Response) => res.render('editor.njk'));
page('/patron(.html)?', (_req: Request, res: Response) => res.render('patron.njk'));

// Legacy URL redirects (permanent 301)
router.get('/termsofservice(.html)?', (_req: Request, res: Response) => res.redirect(301, '/terms')); // prettier-ignore

export { router as rootRouter };
