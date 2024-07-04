
const express = require('express');
const router = express.Router(); // Here we define router instead of an app
const path = require('path');
const fs = require('fs');

const { handleLogin } = require('../controllers/authController');
const { handleRefreshToken } = require('../controllers/refreshTokenController');
const { handleLogout } = require('../controllers/logoutController');
const { verifyAccount } = require('../controllers/verifyAccountController');
const { ensureOwner, ensurePatron } = require('../middleware/verifyRoles');
const { getCachedHTML, sendCachedHTML } = require('../utility/HTMLScriptInjector');

// router.get('/skeleton(.html)?', (req, res) => { // If it starts & ends with '/', OR it's '/index.html' OR '/index'
//     res.sendFile(path.join(__dirname, '../views', 'skeleton.html'));
// });

// Send the index/root / home page
router.get('^/$|/index(.html)?', (req, res) => { // If it starts & ends with '/', OR it's '/index.html' OR '/index'
    res.sendFile(path.join(__dirname, '..', 'views', 'index.html'));
});

router.get('/credits(.html)?', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'credits.html'));
})

router.get('/play(.html)?', (req, res) => {
    // res.sendFile(path.join(__dirname, '../views', 'play.html'));
    const htmlFilePath = path.join(__dirname, '..', 'views', 'play.html');
    sendCachedHTML(req, res, htmlFilePath)
})

router.get('/play/devversion', ensureOwner, (req, res) => {
    const htmlFilePath = path.join(__dirname, '..', 'views', 'dev.html');
    sendCachedHTML(req, res, htmlFilePath)
})

router.get('/news(.html)?', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'news.html'));
})

router.get('/login(.html)?', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'login.html'));
})

router.post('/auth', handleLogin);

router.get('/refresh', handleRefreshToken);

router.get('/logout', handleLogout);

router.get('/termsofservice(.html)?', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'termsofservice.html'));
})

router.get('/verify/:member/:id', verifyAccount);


router.get('/400(.html)?', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'errors', '400.html'));
});
router.get('/401(.html)?', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'errors', '401.html'));
});
router.get('/404(.html)?', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'errors', '404.html'));
});
router.get('/409(.html)?', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'errors', '409.html'));
});
router.get('/500(.html)?', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'errors', '500.html'));
});


module.exports = router;