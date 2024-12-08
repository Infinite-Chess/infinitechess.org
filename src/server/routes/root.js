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
 * @param {boolean} [isError=false] - If the file is an error page.
 * @returns {Function} Express middleware handler.
 */
const serveFile = (filePath) => (req, res) => {
	const language = getLanguageToServe(req);
	const file = path.join(htmlDirectory, language, filePath);
	/**
	 * sendFile() will AUTOMATICALLY check if the file's Last-Modified
	 * value is after the request's 'If-Modified-Since' header...
	 * 
	 * If so, it will send 200 OK with the updated file content!
	 * 
	 * Otherwise, it sends 304 Not Modified, signaling the client
	 * to use their cached version for another duration of the
	 * max-age property of the Cache-Control header we send!
	 */
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

// Error pages
router.get("/400(.html)?", serveFile("errors/400.html", true));
router.get("/401(.html)?", serveFile("errors/401.html", true));
router.get("/404(.html)?", serveFile("errors/404.html", true));
router.get("/409(.html)?", serveFile("errors/409.html", true));
router.get("/500(.html)?", serveFile("errors/500.html", true));

export { router };
