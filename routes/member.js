
const express = require('express');
const router = express.Router();
const path = require('path');

const {getMemberData,requestConfirmEmail,requestDeleteAccount} = require('../controllers/memberController');


router.get('/:member', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'member.html'));
});

router.get('/:member/data', getMemberData);

router.get('/:member/send-email', requestConfirmEmail)

router.get('/:member/delete', requestDeleteAccount)

module.exports = router;