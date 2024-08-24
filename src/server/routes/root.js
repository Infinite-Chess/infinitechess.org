import express from "express";
const router = express.Router();
import path from "path";

import { handleLogin } from '../controllers/authController.js';
import { handleRefreshToken } from '../controllers/refreshTokenController.js';
import { handleLogout } from '../controllers/logoutController.js';
import { verifyAccount } from '../controllers/verifyAccountController.js';
import { ensureOwner, ensurePatron } from '../middleware/verifyRoles.js';
import { getLanguageToServe } from '../utility/translate.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const htmlDirectory = path.join(__dirname, "../../../dist/views");


// router.get('/skeleton(.html)?', (req, res) => { // If it starts & ends with '/', OR it's '/index.html' OR '/index'
//     res.render(path.join(__dirname, '../views', 'skeleton.ejs'));
// });

// Send the index/root / home page
router.get("^/$|/index(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "index.html"),
    );
});

router.get("/credits(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "credits.html"),
    );
});

router.get("/play(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "play.html"),
    );
});

router.get("/news(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "news.html"),
    );
});

router.get("/login(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "login.html"),
    );
});

router.post("/auth", handleLogin);

router.get("/refresh", handleRefreshToken);

router.get("/logout", handleLogout);

router.get("/termsofservice(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "termsofservice.html"),
    );
});

router.get("/verify/:member/:id", verifyAccount);

router.get("/400(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "errors", "400.html"),
    );
});
router.get("/401(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "errors", "401.html"),
    );
});
router.get("/404(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "errors", "404.html"),
    );
});
router.get("/409(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "errors", "409.html"),
    );
});
router.get("/500(.html)?", (req, res) => {
    const language = getLanguageToServe(req);
    res.sendFile(
        path.join(htmlDirectory, language, "errors", "500.html"),
    );
});

router.post("/setlanguage", (req, res) => {
    res.cookie("i18next", req.i18n.resolvedLanguage);
    res.send(""); // Doesn't work without this for some reason
});

export { router };
