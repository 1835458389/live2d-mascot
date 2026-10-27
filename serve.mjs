// 看板娘本地小服务器：零依赖，只用 Node 自带模块。
// 浏览器不允许直接双击打开的网页加载角色文件，所以需要它在本机提供这些文件。
// 用法：node serve.mjs [--open]   （--open 会自动打开浏览器）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const START_PORT = Number(process.env.PORT) || 8124;
const PAGE = "/demo/";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".moc3": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = path.join(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (rel.endsWith("/")) file = path.join(file, "index.html");
  // 配置.json 里有 MiniMax 密钥，不能通过网络提供给别的程序。
  if (path.basename(file).toLowerCase() === "配置.json") {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("这个文件不能通过网络访问");
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("找不到这个文件");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
    });
    fs.createReadStream(file).pipe(res);
  });
});

function listen(port) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && port < START_PORT + 20) {
      listen(port + 1);
    } else {
      console.error("启动失败：", err.message);
      process.exit(1);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}${PAGE}`;
    console.log("看板娘已启动：" + url);
    console.log("看完后关掉这个黑色窗口即可。");
    if (process.argv.includes("--open")) {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    }
  });
}

listen(START_PORT);
