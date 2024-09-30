
import express from 'express';
const router = express.Router();
import path from 'path';

import { getMemberData,requestConfirmEmail } from '../controllers/memberController.js';
import { removeAccount } from '../controllers/removeAccountController.js';
import { getLanguageToServe } from '../utility/translate.js';

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

router.get('/:member', (req, res) => {
	const language = getLanguageToServe(req);
	res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', language, 'member.html'), {t: req.t});
});

router.get('/:member/data', getMemberData);

router.get('/:member/send-email', requestConfirmEmail);

router.delete('/:member/delete', removeAccount);

export { router };