// Desktop pet shell. One transparent, always-on-top window covers the primary
// screen's work area and runs the very same widget.js as the web version, so
// both stay in sync. Clicks fall through to whatever is underneath except
// while the pointer is over her or her buttons (the widget reports that).
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, net, protocol, screen, shell } from "electron";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAI } from "./ai.mjs";

const DESKTOP_DIR = path.dirname(fileURLToPath(import.meta.url));
// The live2d-mascot folder: widget.js, characters/, vendor/, models/.
const ROOT = path.resolve(DESKTOP_DIR, "..");
// A fixed custom origin (not file://, not a random port) so the model's XHR
// loads work and the widget's saved settings persist between launches.
const PAGE_URL = "pet://app/desktop/pet.html";

protocol.registerSchemesAsPrivileged([
  { scheme: "pet", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let win = null;
let tray = null;
let windowWatcher = null;

function servePetFile(request) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return new Response("forbidden", { status: 403 });
  // 配置.json 里有 MiniMax 密钥，只留在主进程里，页面不能读到。
  if (path.basename(file).toLowerCase() === "配置.json") return new Response("forbidden", { status: 403 });
  // Audio elements ask for byte ranges; file:// fetches ignore that and some
  // clips then fail to decode. Answer range requests ourselves.
  const range = request.headers.get("range");
  if (range && path.extname(file).toLowerCase() === ".mp3") return serveRange(file, range);
  return net.fetch(pathToFileURL(file).toString());
}

function serveRange(file, range) {
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return new Response("not found", { status: 404 });
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (m && !m[1] && m[2]) {
    start = Math.max(0, size - Number(m[2])); // "bytes=-N": the last N bytes
    end = size - 1;
  }
  if (!m || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const fd = fs.openSync(file, "r");
  const body = Buffer.alloc(end - start + 1);
  try {
    fs.readSync(fd, body, 0, body.length, start);
  } finally {
    fs.closeSync(fd);
  }
  return new Response(body, {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(body.length),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

function createWindow() {
  win = new BrowserWindow({
    ...screen.getPrimaryDisplay().workArea,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(DESKTOP_DIR, "preload.cjs"),
      backgroundThrottling: false,
      // Let her greet out loud on startup without waiting for a click.
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setIgnoreMouseEvents(true, { forward: true });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());

  win.once("ready-to-show", () => {
    win.showInactive();
    watchWindows();
  });
  win.on("show", refreshTray);
  win.on("hide", refreshTray);
  win.loadURL(PAGE_URL);
}

// ---------------------------------------------------------------------------
// Other programs' windows, so she can climb onto them. windows.ps1 reports
// them in physical pixels; the page wants CSS pixels from its own corner.
// ---------------------------------------------------------------------------
function watchWindows() {
  if (process.platform !== "win32" || windowWatcher) return;
  const handle = win.getNativeWindowHandle();
  const self = handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0));
  windowWatcher = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(DESKTOP_DIR, "windows.ps1"), "-Self", self, "-ParentPid", String(process.pid)],
    { windowsHide: true },
  );
  // powershell 起不来（被安全软件拦下等）：记一笔，她的爬窗功能没了但不崩。
  windowWatcher.on("error", (err) => {
    console.error("windows.ps1 启动失败：", err);
    windowWatcher = null;
    if (win) win.webContents.send("pet:windows", []);
  });
  let pending = "";
  windowWatcher.stdout.setEncoding("utf8");
  windowWatcher.stdout.on("data", (chunk) => {
    pending += chunk;
    let nl;
    while ((nl = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, nl).trim();
      pending = pending.slice(nl + 1);
      if (line.startsWith("[")) sendWindows(line);
      else if (line.startsWith("{")) sendForeground(line);
    }
  });
  windowWatcher.on("exit", () => (windowWatcher = null));
}

function sendForeground(line) {
  if (!win) return;
  try {
    const { proc, title } = JSON.parse(line);
    win.webContents.send("pet:foreground", { proc: String(proc || ""), title: String(title || "") });
  } catch {
    // a half-written line; the next change will come through
  }
}

function sendWindows(line) {
  if (!win) return;
  let list;
  try {
    list = JSON.parse(line);
  } catch {
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  const out = [];
  for (const item of list) {
    // ps1 偶尔输出畸形行：结构不对就跳过这一条，不让整个看板娘崩掉。
    try {
      if (!Array.isArray(item) || item.length < 5) continue;
      const [id, l, t, r, b] = item;
      const d = screen.screenToDipRect(null, { x: l, y: t, width: r - l, height: b - t });
      out.push([String(id), d.x - area.x, d.y - area.y, d.x + d.width - area.x, d.y + d.height - area.y]);
    } catch {
      // 畸形的一条，丢掉就行
    }
  }
  win.webContents.send("pet:windows", out);
}

function fitToScreen() {
  if (win) win.setBounds(screen.getPrimaryDisplay().workArea);
}

function showPet() {
  if (!win.isVisible()) win.showInactive();
  win.webContents.send("pet:wake-up");
}

// ---------------------------------------------------------------------------
// Tray (the icons next to the clock)
// ---------------------------------------------------------------------------
function placeholderIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 56;
      const i = (y * size + x) * 4;
      buf[i] = 0xdc; // B
      buf[i + 1] = 0x6e; // G
      buf[i + 2] = 0x7a; // R
      buf[i + 3] = inside ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

// Run from the project, Electron needs the app folder; the packaged copy starts by itself.
const loginItemOptions = () => ({ path: process.execPath, args: process.defaultApp ? [DESKTOP_DIR] : [] });

function refreshTray() {
  if (!tray || !win) return;
  const visible = win.isVisible();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: visible ? "隐藏看板娘" : "显示看板娘", click: () => (visible ? win.hide() : showPet()) },
      {
        label: "打开设置",
        click: () => {
          showPet();
          win.webContents.send("pet:open-settings");
        },
      },
      { type: "separator" },
      {
        label: "开机自动启动",
        type: "checkbox",
        checked: app.getLoginItemSettings(loginItemOptions()).openAtLogin,
        click: (item) => app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: item.checked }),
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]),
  );
}

ipcMain.on("pet:interactive", (_event, interactive) => {
  if (!win) return;
  if (interactive) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.on("pet:quit", () => app.quit());

// Other programs on this machine (the AI company) can ask her to say one short line:
// POST http://127.0.0.1:8151/say  {"text": "...", "mood": "happy"}  with the header x-pet-say: 1.
// The custom header means a web page's request needs a preflight this server never answers,
// so a site you visit cannot make her talk. Loopback only; at most one line every 2 seconds.
const SAY_PORT = Number(process.env.PET_SAY_PORT) || 8151;
let lastSayAt = 0;
function startSayServer() {
  const server = http.createServer((req, res) => {
    const reply = (code) => { res.writeHead(code); res.end(); };
    if (req.method !== "POST" || req.url !== "/say" || req.headers["x-pet-say"] !== "1") return reply(404);
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2000) req.destroy();
    });
    req.on("end", () => {
      let line;
      try { line = JSON.parse(body); } catch { return reply(400); }
      if (!line || typeof line.text !== "string" || !line.text.trim()) return reply(400);
      if (Date.now() - lastSayAt < 2000) return reply(429);
      lastSayAt = Date.now();
      if (win) win.webContents.send("pet:say", { text: line.text.slice(0, 60), mood: typeof line.mood === "string" ? line.mood : undefined });
      reply(204);
    });
  });
  // Port taken (a second copy, or something else): she just goes without this feature.
  server.on("error", (err) => console.error(`/say 服务（端口 ${SAY_PORT}）出错：`, err));
  server.listen(SAY_PORT, "127.0.0.1");
}

// Chat with MiniMax; the key stays in this process.
const ai = createAI(ROOT);
ipcMain.handle("pet:chat", (_event, payload) => ai.chat(payload || {}));
ipcMain.handle("pet:speak", (_event, payload) => ai.speak(payload || {}));

ipcMain.on("pet:tray-icon", (_event, dataUrl) => {
  if (!tray) return;
  const big = nativeImage.createFromDataURL(dataUrl);
  if (big.isEmpty()) return;
  const icon = nativeImage.createEmpty();
  for (const scale of [1, 1.25, 1.5, 2]) {
    const px = Math.round(16 * scale);
    icon.addRepresentation({ scaleFactor: scale, width: px, height: px, buffer: big.resize({ width: px, height: px }).toPNG() });
  }
  tray.setImage(icon);
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => win && showPet());

  app.whenReady().then(() => {
    protocol.handle("pet", servePetFile);
    Menu.setApplicationMenu(null);

    tray = new Tray(placeholderIcon());
    tray.setToolTip("桌面看板娘（右键打开菜单）");
    tray.on("click", () => win && showPet());

    createWindow();
    refreshTray();
    startSayServer();

    screen.on("display-metrics-changed", fitToScreen);
    screen.on("display-added", fitToScreen);
    screen.on("display-removed", fitToScreen);
  });

  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => windowWatcher && windowWatcher.kill());
}
