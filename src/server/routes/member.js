
const express = require('express');
const router = express.Router();
const path = require('path');

const {getMemberData,requestConfirmEmail} = require('../controllers/memberController');
const {removeAccount} = require('../controllers/removeAccountController');


router.get('/:member', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', req.i18n.resolvedLanguage, 'member.html'), {t: req.t});
});

router.get('/:member/data', getMemberData);

router.get('/:member/send-email', requestConfirmEmail)

router.delete('/:member/delete', removeAccount)

module.exports = router;