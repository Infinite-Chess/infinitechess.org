
import express from 'express';
const router = express.Router();
import path from 'path';

import { createaccountController } from '../controllers/createaccountController'
import { getRegisterData, checkEmailAssociated, checkUsernameAvailable } from '../controllers/createaccountController';
const { getLanguageToServe } = require("../utility/translate.mjs");



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
