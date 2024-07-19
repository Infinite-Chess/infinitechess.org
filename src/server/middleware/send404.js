const path = require('path');

function send404(req, res) {
    res.status(404);
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', req.i18n.resolvedLanguage, 'errors', '404.html'), {t: req.t});
    } else if (req.accepts('json')) {
        res.json({ error: "ws-not_found" });
    } else {
        res.type('txt').send("ws-not_found");
    }
}

module.exports = send404;