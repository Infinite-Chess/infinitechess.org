
const express = require('express');
const router = express.Router();
const path = require('path');

const {getMemberData,requestConfirmEmail} = require('../controllers/memberController');


router.get('/:member', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', 'member.html'));
});

router.get('/:member/data', getMemberData);

router.get('/:member/send-email', requestConfirmEmail)

module.exports = router;