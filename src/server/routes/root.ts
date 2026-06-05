// src/server/routes/root.ts

import type { ScriptTranslations } from '../../shared/types/script-translations.js';

import express, { NextFunction, Request, Response } from 'express';

import variantregistry from '../../shared/chess/variants/variantregistry.js';

import { verifyJWT } from '../middleware/verifyJWT.js';
import { getLanguageToServe } from '../utility/translate.js';
import { getVerifyPageState } from '../controllers/verifyAccountController.js';
import { getRandomSplashText } from './splashTexts.js';
import { getAwaitingPageState } from '../controllers/createAccountController.js';
import {
	getScriptTranslations,
	getTemplateTranslations,
} from '../config/componentTranslationLoader.js';

const router = express.Router();

// Page routes need auth state for SSR (header shows Profile/Logout vs Login/Register).
// verifyJWT does DB work, so it's only attached to the routers that need it.
router.use(verifyJWT);

// Resolve the user's language, and load component translations
// for that language, and expose auth state to every template.
// Nunjucks automatically merges res.locals into every template's render context,
// so {{ lang }}, {{ templateT }}, {{ scriptT }}, {{ memberInfo }}, are available in every template.
router.use((req: Request, res: Response, next: NextFunction) => {
	const lang = getLanguageToServe(req);
	res.locals['lang'] = lang;
	res.locals['templateT'] = (component: string) => getTemplateTranslations(component, lang);
	res.locals['scriptT'] = <C extends keyof ScriptTranslations>(component: C) =>
		getScriptTranslations(component, lang);
	res.locals['memberInfo'] = req.memberInfo;
	next();
});

/** Cache all variant groups and their variants. */
const variantGroups = variantregistry.getVariantGroupsWithVariants();

// Regular pages
router.get('^/$|/index(.html)?', (req: Request, res: Response) => res.render('index.njk', { variantGroups, splashText: getRandomSplashText(req) })); // prettier-ignore
router.get('/about(.html)?', (_req: Request, res: Response) => res.render('about.njk'));
router.get('/credits(.html)?', (_req: Request, res: Response) => res.render('credits.njk'));
router.get('/play(.html)?', (_req: Request, res: Response) => res.render('play.njk'));
router.get('/news(.html)?', (_req: Request, res: Response) => res.render('news.njk'));
router.get('/leaderboard(.html)?', (_req: Request, res: Response) => res.render('leaderboard.njk'));
router.get('/login(.html)?', (_req: Request, res: Response) => res.render('login.njk'));
router.get('/register(.html)?', (req: Request, res: Response) => {
	// Redirect to check-your-email page if register is pending
	if (getAwaitingPageState(req)) res.redirect('/register/awaiting');
	else res.render('register.njk');
});
router.get('/register/awaiting(.html)?', (req: Request, res: Response) => {
	const state = getAwaitingPageState(req);
	// Redirect to register page if no register is pending
	if (state === null) res.redirect('/register');
	else res.render('register-awaiting.njk', state);
});
router.get('/reset-password/:token', (_req: Request, res: Response) => res.render('resetpassword.njk')); // prettier-ignore
router.get('/verify/:token', (req: Request, res: Response) => {
	// The token sits in the URL; keep it out of any Referer header sent to third-party resources.
	res.setHeader('Referrer-Policy', 'no-referrer');
	res.render('verify.njk', getVerifyPageState(req));
});
router.get('/terms(.html)?', (_req: Request, res: Response) => res.render('terms.njk'));
router.get('/privacy(.html)?', (_req: Request, res: Response) => res.render('privacy.njk'));
router.get('/member(.html)?/:member', (_req: Request, res: Response) => res.render('member.njk'));
router.get('/admin(.html)?', (_req: Request, res: Response) => res.render('admin.njk'));
router.get('/icnvalidator(.html)?', (_req: Request, res: Response) => res.render('icnvalidator.njk')); // prettier-ignore
router.get('/tutorial(.html)?', (_req: Request, res: Response) => res.render('tutorial.njk'));
router.get('/checkmatepractice(.html)?', (_req: Request, res: Response) => res.render('checkmatepractice.njk')); // prettier-ignore
router.get('/analysis(.html)?', (_req: Request, res: Response) => res.render('analysis.njk'));
router.get('/editor(.html)?', (_req: Request, res: Response) => res.render('editor.njk'));
router.get('/patron(.html)?', (_req: Request, res: Response) => res.render('patron.njk'));

// Legacy URL redirects (permanent 301)
router.get('/termsofservice(.html)?', (_req: Request, res: Response) => res.redirect(301, '/terms')); // prettier-ignore

// Error pages
router.get('/400(.html)?', (_req: Request, res: Response) => res.render('errors/400.njk'));
router.get('/401(.html)?', (_req: Request, res: Response) => res.render('errors/401.njk'));
router.get('/404(.html)?', (_req: Request, res: Response) => res.render('errors/404.njk'));
router.get('/409(.html)?', (_req: Request, res: Response) => res.render('errors/409.njk'));
router.get('/500(.html)?', (_req: Request, res: Response) => res.render('errors/500.njk'));

export { router as rootRouter };
