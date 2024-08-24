import path from 'path';
import { getTranslationForReq } from '../utility/translate.mjs';

import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function send404(req, res) {
    res.status(404);
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', req.i18n.resolvedLanguage, 'errors', '404.html'), {t: req.t});
    } else if (req.accepts('json')) {
        res.json({ error: getTranslationForReq("server.javascript.ws-not_found", req) });
    } else {
        res.type('txt').send(getTranslationForReq("server.javascript.ws-not_found", req) );
    }
}

export { send404 };