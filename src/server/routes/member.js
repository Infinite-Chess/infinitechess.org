
const express = require('express');
const router = express.Router();
const path = require('path');

const {getMemberData,requestConfirmEmail} = require('../controllers/memberController');
const {removeAccount} = require('../controllers/removeAccountController');


router.get('/:member', (req, res) => {
    res.render(path.join(__dirname, '..', '..', '..', 'dist', 'views', 'member.ejs'), {t: req.t});
});

router.get('/:member/data', getMemberData);

router.get('/:member/send-email', requestConfirmEmail)

router.delete('/:member/delete', removeAccount)

module.exports = router;