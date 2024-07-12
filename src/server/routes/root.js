
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
//     res.render(path.join(__dirname, '../views', 'skeleton.ejs'));
// });

// Send the index/root / home page
router.get('^/$|/index(.html)?', (req, res) => { // If it starts & ends with '/', OR it's '/index.html' OR '/index'
    res.render(path.join(htmlDirectory, 'index.ejs'), {t: req.t});
});

router.get('/credits(.html)?', (req, res) => {
    res.render(path.join(htmlDirectory, 'credits.ejs'), {t: req.t});
})

router.get('/play(.html)?', (req, res) => {
    // res.render(path.join(__dirname, '../views', 'play.ejs'));
	console.log("html directory", htmlDirectory);
    const htmlFilePath = path.join(htmlDirectory, 'play.ejs');
    sendCachedHTML(req, res, htmlFilePath)
})

router.get('/news(.html)?', (req, res) => {
    res.render(path.join(htmlDirectory, 'news.ejs'), {t: req.t});
})

router.get('/login(.html)?', (req, res) => {
    res.render(path.join(htmlDirectory, 'login.ejs'), {t: req.t});
})

router.post('/auth', handleLogin);

router.get('/refresh', handleRefreshToken);

router.get('/logout', handleLogout);

router.get('/termsofservice(.html)?', (req, res) => {
    res.render(path.join(htmlDirectory, 'termsofservice.ejs'), {t: req.t});
})

router.get('/verify/:member/:id', verifyAccount);

const errorDirectory = path.join(htmlDirectory, 'errors');

router.get('/400(.html)?', (req, res) => {
    res.render(path.join(errorDirectory, '400.ejs'), {t: req.t});
});
router.get('/401(.html)?', (req, res) => {
    res.render(path.join(errorDirectory, '401.ejs'), {t: req.t});
});
router.get('/404(.html)?', (req, res) => {
    res.render(path.join(errorDirectory, '404.ejs'), {t: req.t});
});
router.get('/409(.html)?', (req, res) => {
    res.render(path.join(errorDirectory, '409.ejs'), {t: req.t});
});
router.get('/500(.html)?', (req, res) => {
    res.render(path.join(errorDirectory, '500.ejs'), {t: req.t});
});


module.exports = router;
