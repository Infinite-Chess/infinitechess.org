import express from "express";
import path from "path";
import { getLanguageToServe } from '../utility/translate.js';
import { fileURLToPath } from 'node:url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const htmlDirectory = path.join(__dirname, "../../../dist/client/views");

/**
 * Serves an HTML file based on the requested path and language.
 * @param {string} filePath - The relative file path to serve.
 * @param {boolean} [localized=true] - If the file is not localized to other languages.
 * @returns {Function} Express middleware handler.
 */
const serveFile = (filePath, localized = true) => (req, res) => {
	const language = localized ? getLanguageToServe(req) : "";
	const file = path.join(htmlDirectory, language, filePath);
	res.sendFile(file);
};

// Regular pages
router.get("^/$|/index(.html)?", serveFile("index.html"));
router.get("/credits(.html)?", serveFile("credits.html"));
router.get("/play(.html)?", serveFile("play.html"));
router.get("/news(.html)?", serveFile("news.html"));
router.get("/login(.html)?", serveFile("login.html"));
router.get("/createaccount(.html)?", serveFile("createaccount.html"));
router.get("/termsofservice(.html)?", serveFile("termsofservice.html"));
router.get("/member(.html)?/:member", serveFile("member.html"));
router.get("/admin(.html)?", serveFile("admin.html", false));

// Error pages
router.get("/400(.html)?", serveFile("errors/400.html", true));
router.get("/401(.html)?", serveFile("errors/401.html", true));
router.get("/404(.html)?", serveFile("errors/404.html", true));
router.get("/409(.html)?", serveFile("errors/409.html", true));
router.get("/500(.html)?", serveFile("errors/500.html", true));

export { router };
