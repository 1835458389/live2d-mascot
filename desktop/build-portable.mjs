// Packs the desktop pet into a folder friends can run without installing
// anything: Electron's runtime with the pet as resources/app, then a zip.
//   node desktop/build-portable.mjs      ->  dist/桌面看板娘/  and  dist/桌面看板娘.zip
// The MiniMax key (voice/配置.json) is never copied.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DESKTOP = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DESKTOP, "..");
const NAME = "桌面看板娘";
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, NAME);
const ZIP = path.join(DIST, NAME + ".zip");
const ELECTRON = path.join(DESKTOP, "node_modules", "electron", "dist");

if (!fs.existsSync(path.join(ELECTRON, "electron.exe"))) {
  console.log("找不到 Electron 运行环境。请先双击一次“启动桌面宠物.bat”，让它准备好，再来打包。");
  process.exit(1);
}

console.log("正在清理上次的打包结果……");
fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(ZIP, { force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1. The runtime: Electron's files, only the Chinese and English language packs.
console.log("正在复制运行环境……");
const KEEP_LOCALES = new Set(["zh-CN.pak", "en-US.pak"]);
fs.cpSync(ELECTRON, OUT, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(ELECTRON, src);
    if (rel.startsWith("locales" + path.sep)) return KEEP_LOCALES.has(path.basename(src));
    return rel !== path.join("resources", "default_app.asar");
  },
});
fs.renameSync(path.join(OUT, "electron.exe"), path.join(OUT, NAME + ".exe"));

// 2. The pet itself, as resources/app.
console.log("正在复制看板娘……");
const APP = path.join(OUT, "resources", "app");
const SKIP = [
  path.join("voice", "配置.json"), // the MiniMax key stays on this computer
  path.join("voice", "试听"),
  path.join("voice", "generate.mjs"),
  path.join("voice", ".gitignore"),
  path.join("desktop", "node_modules"),
  path.join("desktop", "package-lock.json"),
  path.join("desktop", "package.json"),
  path.join("desktop", "build-portable.mjs"),
];
const copy = (rel) =>
  fs.cpSync(path.join(ROOT, rel), path.join(APP, rel), {
    recursive: true,
    filter: (src) => {
      const r = path.relative(ROOT, src);
      if (SKIP.some((s) => r === s || r.startsWith(s + path.sep))) return false;
      // per-clip notes from the voice generator aren't needed to play the clips
      if (r.startsWith("voice" + path.sep) && /^[0-9a-f]{16}\.json$/.test(path.basename(src))) return false;
      return true;
    },
  });
for (const rel of ["widget.js", "characters", "models", "vendor", "voice", "desktop", "使用说明.md", "第三方授权说明.md"]) copy(rel);
fs.writeFileSync(
  path.join(APP, "package.json"),
  JSON.stringify({ name: "live2d-desktop-pet", productName: NAME, version: "0.1.0", private: true, main: "desktop/main.mjs" }, null, 2),
);

// 3. A short note for whoever receives it.
fs.copyFileSync(path.join(ROOT, "使用说明.md"), path.join(OUT, "使用说明.md"));
fs.copyFileSync(path.join(ROOT, "第三方授权说明.md"), path.join(OUT, "第三方授权说明.md"));
fs.writeFileSync(
  path.join(OUT, "先看我.txt"),
  [
    "桌面看板娘",
    "",
    "双击「" + NAME + ".exe」就能打开，不用安装别的东西。",
    "打开后，屏幕右下角时钟旁边会有一个小爪子图标，右键它可以设置开机启动或退出。",
    "",
    "想和她用 AI 聊天：需要自己的 MiniMax 密钥。",
    "在 resources\\app\\voice 文件夹里新建一个「配置.json」，内容写成：",
    '{ "apiKey": "你的密钥", "host": "https://api.minimax.cn" }',
    "没有密钥也没关系，她照样会动、会说话，只是不能聊天。",
    "",
    "人物只能自己玩，不能商用。详见「第三方授权说明.md」。",
    "",
  ].join("\r\n"),
);

// Safety check: no key file anywhere in the package.
const leaked = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "配置.json") leaked.push(p);
  }
};
walk(OUT);
if (leaked.length) {
  console.log("出错：打包结果里有密钥文件，已停止。", leaked);
  process.exit(1);
}

// 4. Zip it (Windows' built-in tar can write zip files).
console.log("正在压缩成 zip，文件较大，需要一两分钟……");
// .NET's ZipFile keeps the Chinese file names intact (tar.exe mangles them on
// non-Chinese system locales). Paths go in through the environment to avoid quoting trouble.
// PowerShell 7 writes "/" in entry names as zip tools expect; the older built-in
// PowerShell writes "\" and is only the fallback.
const zipArgs = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:PET_SRC, $env:PET_ZIP, 'Optimal', $true)",
];
const zipEnv = { stdio: "inherit", env: { ...process.env, PET_SRC: OUT, PET_ZIP: ZIP } };
try {
  execFileSync("pwsh.exe", zipArgs, zipEnv);
} catch {
  fs.rmSync(ZIP, { force: true });
  execFileSync("powershell.exe", zipArgs, zipEnv);
}
const mb = (fs.statSync(ZIP).size / 1048576).toFixed(0);
console.log(`完成！发给朋友的文件：dist\\${NAME}.zip（约 ${mb} MB）。`);
console.log("朋友解压后，双击里面的「" + NAME + ".exe」就能用。");
