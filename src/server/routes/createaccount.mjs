
import express from 'express';
const router = express.Router();
import path from 'path';

import * as createaccountController from '../controllers/createaccountController.mjs'
import { getRegisterData, checkEmailAssociated, checkUsernameAvailable } from '../controllers/createaccountController.mjs';
import { getLanguageToServe } from '../utility/translate.mjs';

import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

router.get('/', (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', language, 'createaccount.html'));
});

router.post('/', createaccountController.createNewMember);

// Data needed for the createaccount page, fetched from the script
router.get('/data', getRegisterData);
router.get('/username/:username', checkUsernameAvailable);
router.get('/email/:email', checkEmailAssociated);

export { router };
