// src/server/routes/root.ts

import express, { NextFunction, Request, Response } from 'express';

import { getLanguageToServe } from '../utility/translate.js';

const router = express.Router();

// Resolve the user's language once per request and expose it as res.locals.lang.
// Nunjucks automatically merges res.locals into every template's render context,
// so {{ lang }} is available in every template without passing it per-route.
router.use((req: Request, res: Response, next: NextFunction) => {
	res.locals['lang'] = getLanguageToServe(req);
	next();
});

// Regular pages
router.get('^/$|/index(.html)?', (_req: Request, res: Response) => res.render('index.njk'));
router.get('/credits(.html)?', (_req: Request, res: Response) => res.render('credits.njk'));
router.get('/play(.html)?', (_req: Request, res: Response) => res.render('play.njk'));
router.get('/guide(.html)?', (_req: Request, res: Response) => res.render('guide.njk'));
router.get('/news(.html)?', (_req: Request, res: Response) => res.render('news.njk'));
router.get('/leaderboard(.html)?', (_req: Request, res: Response) => res.render('leaderboard.njk'));
router.get('/login(.html)?', (_req: Request, res: Response) => res.render('login.njk'));
router.get('/createaccount(.html)?', (_req: Request, res: Response) => res.render('createaccount.njk')); // prettier-ignore
router.get('/reset-password/:token', (_req: Request, res: Response) => res.render('resetpassword.njk')); // prettier-ignore
router.get('/termsofservice(.html)?', (_req: Request, res: Response) => res.render('termsofservice.njk')); // prettier-ignore
router.get('/member(.html)?/:member', (_req: Request, res: Response) => res.render('member.njk'));
router.get('/admin(.html)?', (_req: Request, res: Response) => res.render('admin.njk'));
router.get('/icnvalidator(.html)?', (_req: Request, res: Response) => res.render('icnvalidator.njk')); // prettier-ignore

// Error pages
router.get('/400(.html)?', (_req: Request, res: Response) => res.render('errors/400.njk'));
router.get('/401(.html)?', (_req: Request, res: Response) => res.render('errors/401.njk'));
router.get('/404(.html)?', (_req: Request, res: Response) => res.render('errors/404.njk'));
router.get('/409(.html)?', (_req: Request, res: Response) => res.render('errors/409.njk'));
router.get('/500(.html)?', (_req: Request, res: Response) => res.render('errors/500.njk'));

export { router as rootRouter };
