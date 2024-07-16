const express = require("express");
const router = express.Router(); // Here we define router instead of an app
const path = require("path");
const fs = require("fs");
const i18next = require("i18next");

const { handleLogin } = require("../controllers/authController");
const { handleRefreshToken } = require("../controllers/refreshTokenController");
const { handleLogout } = require("../controllers/logoutController");
const { verifyAccount } = require("../controllers/verifyAccountController");
const { ensureOwner, ensurePatron } = require("../middleware/verifyRoles");

const htmlDirectory = path.join(__dirname, "..", "..", "..", "dist", "views");

// router.get('/skeleton(.html)?', (req, res) => { // If it starts & ends with '/', OR it's '/index.html' OR '/index'
//     res.render(path.join(__dirname, '../views', 'skeleton.ejs'));
// });

// Send the index/root / home page
router.get("^/$|/index(.html)?", (req, res) => {
  // If it starts & ends with '/', OR it's '/index.html' OR '/index'
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "index.html"),
  );
});

router.get("/credits(.html)?", (req, res) => {
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "credits.html"),
  );
});

router.get("/play(.html)?", (req, res) => {
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "play.html"),
  );
});

router.get("/news(.html)?", (req, res) => {
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "news.html"),
  );
});

router.get("/login(.html)?", (req, res) => {
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "login.html"),
  );
});

router.post("/auth", handleLogin);

router.get("/refresh", handleRefreshToken);

router.get("/logout", handleLogout);

router.get("/termsofservice(.html)?", (req, res) => {
  // Disabled translations of legal documents
  res.render(
    path.join(htmlDirectory, "termsofservice.ejs"),
    {
      t: (function (key, options = {}) {
        options.lng = "en-US"; // Make sure language is correct
        return i18next.t(key, options);
      }),
      viewsfolder: path.join(__dirname, '..', '..', '..', 'dist', 'views'),
      languages: [],
    }
  );
  /*
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "termsofservice.html"),
    );
  */
});

router.get("/verify/:member/:id", verifyAccount);

const errorDirectory = path.join(htmlDirectory, "errors");

router.get("/400(.html)?", (req, res) => {
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "errors", "400.html"),
  );
});
router.get("/401(.html)?", (req, res) => {
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "errors", "401.html"),
  );
});
router.get("/404(.html)?", (req, res) => {
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "errors", "404.html"),
  );
});
router.get("/409(.html)?", (req, res) => {
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "errors", "409.html"),
  );
});
router.get("/500(.html)?", (req, res) => {
  res.sendFile(
    path.join(htmlDirectory, req.i18n.resolvedLanguage, "errors", "500.html"),
  );
});

router.post("/setlanguage", (req, res) => {
  res.cookie("i18next", req.i18n.resolvedLanguage);
  res.send(""); // Doesn't work without this for some reason
});

module.exports = router;
