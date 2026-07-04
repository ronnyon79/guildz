/* Minimal static file server for local play. Usage: node serve.js [port] */
const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.argv[2]) || 47810;
const root = __dirname;
const types = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = path.join(root, path.normalize(urlPath));
    if (!filePath.startsWith(root)) { res.writeHead(403); return res.end("Forbidden"); }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(port, "0.0.0.0", () => console.log(`Guildz running at http://0.0.0.0:${port}`));
