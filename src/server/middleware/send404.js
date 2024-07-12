const path = require('path');

function send404(req, res) {
    res.status(404);
    if (req.accepts('html')) {
        res.render(path.join(__dirname, '..', '..', '..', 'dist', 'views', 'errors', '404.ejs'), {t: req.t});
    } else if (req.accepts('json')) {
        res.json({ error: "404 Not Found" });
    } else {
        res.type('txt').send("404 Not Found");
    }
}

module.exports = send404;