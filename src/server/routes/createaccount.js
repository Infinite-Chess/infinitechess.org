
import express from 'express';
const router = express.Router();
import path from 'path';

import { getRegisterData, checkEmailAssociated, checkUsernameAvailable, createNewMember } from '../controllers/createaccountController.js';
import { getLanguageToServe } from '../utility/translate.js';

import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

router.get('/', (req, res) => {
	const language = getLanguageToServe(req);
	res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', language, 'createaccount.html'));
});

router.post('/', createNewMember);

// Data needed for the createaccount page, fetched from the script
router.get('/data', getRegisterData);
router.get('/username/:username', checkUsernameAvailable);
router.get('/email/:email', checkEmailAssociated);

export { router };
