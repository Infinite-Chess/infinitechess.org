
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

const htmlDirectory = path.join(__dirname, '..', '..', '..', 'dist', 'views');

// router.get('/skeleton(.html)?', (req, res) => { // If it starts & ends with '/', OR it's '/index.html' OR '/index'
//     res.sendFile(path.join(__dirname, '../views', 'skeleton.html'));
// });

// Send the index/root / home page
router.get('^/$|/index(.html)?', (req, res) => { // If it starts & ends with '/', OR it's '/index.html' OR '/index'
    res.sendFile(path.join(htmlDirectory, 'index.html'));
});

router.get('/credits(.html)?', (req, res) => {
    res.sendFile(path.join(htmlDirectory, 'credits.html'));
})

router.get('/play(.html)?', (req, res) => {
    // res.sendFile(path.join(__dirname, '../views', 'play.html'));
    const htmlFilePath = path.join(htmlDirectory, 'play.html');
    sendCachedHTML(req, res, htmlFilePath)
})

router.get('/play/devversion', ensureOwner, (req, res) => {
    const htmlFilePath = path.join(htmlDirectory, 'dev.html');
    sendCachedHTML(req, res, htmlFilePath)
})

router.get('/news(.html)?', (req, res) => {
    res.sendFile(path.join(htmlDirectory, 'news.html'));
})

router.get('/login(.html)?', (req, res) => {
    res.sendFile(path.join(htmlDirectory, 'login.html'));
})

router.post('/auth', handleLogin);

router.get('/refresh', handleRefreshToken);

router.get('/logout', handleLogout);

router.get('/termsofservice(.html)?', (req, res) => {
    res.sendFile(path.join(htmlDirectory, 'termsofservice.html'));
})

router.get('/verify/:member/:id', verifyAccount);

const errorDirectory = path.join(htmlDirectory, 'errors');

router.get('/400(.html)?', (req, res) => {
    res.sendFile(path.join(errorDirectory, '400.html'));
});
router.get('/401(.html)?', (req, res) => {
    res.sendFile(path.join(errorDirectory, '401.html'));
});
router.get('/404(.html)?', (req, res) => {
    res.sendFile(path.join(errorDirectory, '404.html'));
});
router.get('/409(.html)?', (req, res) => {
    res.sendFile(path.join(errorDirectory, '409.html'));
});
router.get('/500(.html)?', (req, res) => {
    res.sendFile(path.join(errorDirectory, '500.html'));
});


module.exports = router;
