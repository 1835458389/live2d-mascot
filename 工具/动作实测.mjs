// 第2批睡衣挥手：无头浏览器实测三位换睡衣后挥手动画两帧交替（全新临时配置，无缓存）
// 用法：node 工具/.挥手实测.mjs（跑完自动清理浏览器与服务）
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8172, CDP = 8173;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 找 Chrome/Edge
const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const exe = CANDIDATES.find((p) => fs.existsSync(p));
if (!exe) { console.log("没找到 Chrome/Edge，跳过"); process.exit(0); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "wave-test-"));
const serve = spawn(process.execPath, [path.join(ROOT, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const browser = spawn(exe, [`--headless=new`, `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, "--no-first-run", "--proxy-server=direct://", "--proxy-bypass-list=*", "about:blank"], { stdio: "ignore" });
await sleep(2500);

// CDP 小客户端
let ws, seq = 0;
const pending = new Map();
const charReqs = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
{
  const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  ws = await new Promise((res, rej) => {
    const w = new WebSocket(page.webSocketDebuggerUrl);
    w.onopen = () => res(w);
    w.onerror = () => rej(new Error("CDP 连接失败"));
    w.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); }
      if (m.method === "Network.responseReceived" && /character\.js/.test(m.params.response.url)) {
        charReqs.set(m.params.requestId, m.params.response.url);
      }
    };
  });
}
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

let out = {};
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/demo/` });
  await sleep(4000);
  // 抓实际收到的 character.js 响应体
  for (const [rid, url] of charReqs) {
    if (!/claude/.test(url)) continue;
    try {
      const body = await send("Network.getResponseBody", { requestId: rid });
      const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
      out.网络实际收到_claude = { url, 含wave1: text.includes("pajamas/wave1"), 长度: text.length };
    } catch (e) { out.网络实际收到_claude = { url, 错误: e.message }; }
  }
  await evalJs(`(() => { window.__w = []; const ow = console.warn; console.warn = (...a) => { window.__w.push(a.join(' ')); ow(...a); }; })()`);
  out.页面内角色包定义 = await evalJs(`JSON.stringify((window.Live2DMascotCharacters||{}).claude && window.Live2DMascotCharacters.claude.outfitPoses)`);
  for (const c of ["claude", "gpt", "deepseek"]) {
    await evalJs(`window.Live2DMascot.setCharacter(${JSON.stringify(c)})`);
    await evalJs(`window.Live2DMascot.setOutfit('pajamas')`);
    let ready = false;
    for (let i = 0; i < 66 && !ready; i++) {
      await sleep(300);
      ready = await evalJs(`(() => { const o = window.Live2DMascot.getOutfit(); return o.outfit === 'pajamas' && o.poses.includes('wave1') && o.poses.includes('wave2'); })()`);
    }
    if (!ready) { out[c] = { 两帧就位: false, 现场: await evalJs(`window.Live2DMascot.getOutfit()`) }; continue; }
    for (let i = 0; i < 40; i++) { if (await evalJs(`window.Live2DMascot.getOutfit().pose`) === "stand") break; await sleep(300); }
    let started = await evalJs(`window.Live2DMascot.anim('wave')`);
    for (let i = 0; i < 12 && !started; i++) { await sleep(400); started = await evalJs(`window.Live2DMascot.anim('wave')`); }
    const seen = await evalJs(`(async () => {
      const seen = new Set();
      for (let i = 0; i < 22; i++) {
        await new Promise(r => setTimeout(r, 180));
        const p = window.Live2DMascot.getOutfit().pose;
        if (p === 'wave1' || p === 'wave2') seen.add(p);
      }
      return [...seen];
    })()`);
    await evalJs(`window.Live2DMascot.setOutfit(null)`);
    await sleep(400);
    out[c] = { 两帧就位: true, 动画启动: started, 交替出现: seen };
  }
  out.加载警告 = await evalJs(`(window.__w||[]).filter(w => !w.includes('RUM'))`);
} catch (e) {
  out = { 错误: e.message };
} finally {
  try { ws.close(); } catch {}
  browser.kill(); serve.kill();
  await sleep(1500);
  for (let i = 0; i < 3; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(1000); } }
}
console.log(JSON.stringify(out, null, 2));
