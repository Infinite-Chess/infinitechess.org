const path = require('path');

function send404(req, res) {
    res.status(404);
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, '..', '..', '..', 'dist', 'views', req.i18n.resolvedLanguage, 'errors', '404.html'), {t: req.t});
    } else if (req.accepts('json')) {
        res.json({ error: "404 Not Found" });
    } else {
        res.type('txt').send("404 Not Found");
    }
}

module.exports = send404;