
const express = require('express');
const router = express.Router();
const path = require('path');

const { getMemberData,requestConfirmEmail } = require('../controllers/memberController');
const { removeAccount } = require('../controllers/removeAccountController');
const { getLanguageToServe } = require("../utility/translate");


router.get('/:member', (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', language, 'member.html'), {t: req.t});
});

router.get('/:member/data', getMemberData);

router.get('/:member/send-email', requestConfirmEmail);

router.delete('/:member/delete', removeAccount);

module.exports = router;