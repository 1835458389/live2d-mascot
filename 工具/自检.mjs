// 看板娘自动自检脚本（零依赖纯 Node）
// 用法: node 工具/自检.mjs
// 流程: 找浏览器 -> headless 启动(PORT=8170) -> 起 serve.mjs(PORT=8164)
//       -> CDP 打开演示页 -> 跑 API 步骤 -> 收集 console 报错 / pageerror
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DEBUG_PORT = 8170;
const SERVE_PORT = 8164;
const URL_BASE = `http://127.0.0.1:${SERVE_PORT}/demo/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 中文控制台输出 ----------
const log = (...a) => console.log(...a);

// ---------- 1. 找浏览器 ----------
function findBrowser() {
  const roots = [
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"],
    process.env["LocalAppData"],
  ].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    candidates.push(
      path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
    );
  }
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

// ---------- 等调试端口就绪 ----------
async function waitPort(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.ok || r.status < 500) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

// ---------- 2. 起 serve.mjs ----------
function startServe(root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "serve.mjs")], {
      env: { ...process.env, PORT: String(SERVE_PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr.on("data", (d) => process.stderr.write("[serve] " + d));
    child.once("error", reject);
    setTimeout(async () => {
      if (await waitPort(SERVE_PORT, 8000)) resolve(child);
      else reject(new Error("serve.mjs 未能在端口 " + SERVE_PORT + " 就绪"));
    }, 500);
  });
}

// ---------- CDP 连接 ----------
async function connectCdp(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
  if (!page) throw new Error("没有可用的页面调试目标");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("WebSocket 连接失败"));
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const onEvent = (fn) => listeners.push(fn);
  return { ws, send, onEvent };
}

// ---------- 主流程 ----------
const root = path.resolve(import.meta.dirname, "..");
const browser = findBrowser();
if (!browser) {
  log("没找到浏览器，跳过");
  process.exit(0);
}
log("找到浏览器:", browser);

let serveChild = null;
let browserProc = null;
let exitCode = 0;
const consoleErrors = new Set(); // 去重
const pageErrors = [];
const stepResults = [];

try {
  serveChild = await startServe(root);
  log(`本地服务已启动: ${URL_BASE}`);

  browserProc = spawn(browser, [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--no-first-run",
    "--disable-gpu",
    "--user-data-dir=" + path.join(root, "工具", ".自检-临时用户目录"),
    URL_BASE,
  ], { stdio: "ignore" });

  if (!(await waitPort(DEBUG_PORT))) throw new Error("浏览器调试端口未就绪");
  log("headless 浏览器已启动，调试端口 " + DEBUG_PORT);

  const { ws, send, onEvent } = await connectCdp(DEBUG_PORT);

  // 收集 console 报错和异常
  onEvent((msg) => {
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ");
      consoleErrors.add(`[console.${msg.params.type}] ${text}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      const text = d.exception?.description || d.exception?.value || d.text || "未知异常";
      pageErrors.push(text.split("\n")[0]);
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      // 资源加载失败已由 Network.responseReceived 带着具体 URL 记录，这里不再重复
      if (!/Failed to load resource/.test(msg.params.entry.text)) {
        consoleErrors.add(`[log] ${msg.params.entry.text}`);
      }
    } else if (msg.method === "Network.responseReceived" && msg.params.response.status >= 400) {
      consoleErrors.add(`[网络] ${msg.params.response.status} ${msg.params.response.url}`);
    }
  });

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Network.enable");
  await sleep(1500); // 等页面和模型加载

  const evalJs = async (expr) => {
    const res = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  };

  const step = async (name, fn) => {
    try {
      const r = await fn();
      if (r === false) throw new Error("断言返回 false");
      stepResults.push([name, true, ""]);
      log(`  [通过] ${name}`);
    } catch (e) {
      stepResults.push([name, false, e.message]);
      log(`  [失败] ${name}: ${e.message}`);
    }
    await sleep(300);
  };

  log("开始执行自检步骤……");

  // 人物
  let chars = ["claude", "gpt", "deepseek", "hiyori", "mao"];
  try {
    const got = await evalJs("window.Live2DMascot ? Live2DMascot.getCharacters() : null");
    const ids = (Array.isArray(got) ? got : []).map((c) => (typeof c === "string" ? c : c && (c.id ?? c.name))).filter(Boolean);
    if (ids.length) chars = ids;
  } catch {}
  for (const c of chars) {
    await step(`setCharacter(${c})`, () => evalJs(`Live2DMascot.setCharacter(${JSON.stringify(c)})`));
  }

  // react 几个事件
  for (const ev of ["poke", "cheer", "greet"]) {
    await step(`react("${ev}")`, () => evalJs(`Live2DMascot.react(${JSON.stringify(ev)})`));
  }

  // setState 各进各出
  for (const s of ["thinking"]) {
    await step(`setState("${s}")`, () => evalJs(`Live2DMascot.setState(${JSON.stringify(s)})`));
    await step(`setState(null)`, () => evalJs(`Live2DMascot.setState(null)`));
  }

  // hold 各进各出（hold/anim 只有立绘角色支持，先切到 claude）
  await evalJs(`Live2DMascot.setCharacter("claude")`);
  for (const h of ["sit", "sleep", "focus", "sulk"]) {
    await step(`hold("${h}")`, () => evalJs(`Live2DMascot.hold(${JSON.stringify(h)})`));
    await step(`hold(null)`, () => evalJs(`Live2DMascot.hold(null)`));
  }

  // act
  for (const a of ["stretch", "lookAround", "yawn", "hum"]) {
    await step(`act("${a}")`, () => evalJs(`Live2DMascot.act(${JSON.stringify(a)})`));
  }

  // anim：playAnim 在别的动作/动画进行中会正常地返回 false，等姿势回到站立再放下一步
  for (const a of ["wave", "drink", "act"]) {
    for (let i = 0; i < 20; i++) {
      const p = await evalJs(`(window.Live2DMascot.getOutfit() || {}).pose`);
      if (p === "stand") break;
      await sleep(300);
    }
    await step(`anim("${a}")`, () => evalJs(`Live2DMascot.anim(${JSON.stringify(a)})`));
  }

  // setOutfit
  for (const o of ["pajamas", "winter"]) {
    await step(`setOutfit("${o}")`, () => evalJs(`Live2DMascot.setOutfit(${JSON.stringify(o)})`));
  }
  await step(`setOutfit(null)`, () => evalJs(`Live2DMascot.setOutfit(null)`));

  // command
  for (const cmd of ["猜拳 石头", "抛硬币", "十分钟后提醒我喝水", "挥挥手", "陪我学习到 10 点", "不学了"]) {
    await step(`command("${cmd}")`, () => evalJs(`Live2DMascot.command(${JSON.stringify(cmd)})`));
  }

  // 附加：say 与 getAffection
  await step(`say("自检测试","happy")`, () => evalJs(`Live2DMascot.say("自检测试","happy")`));
  await step(`getAffection()`, async () => {
    const a = await evalJs(`Live2DMascot.getAffection()`);
    if (!a || typeof a.points !== "number" || typeof a.level !== "number" || a.level < 0) return false;
  });

  // held 换装矩阵：三位角色 x 两套衣服，验证 held 图就位、换装生效、拖起来真的摆 held 姿势。
  // setCharacter 切到当前角色会按设计返回 false，所以先读实时身份，真切换才切（switching 进行中会拒绝，带重试）。
  const heldMatrix = async (char, outfit) => {
    const res = await fetch(`http://127.0.0.1:${SERVE_PORT}/models/${char}/${outfit}/held.png`);
    if (res.status !== 200) throw new Error("HTTP " + res.status + "：held 图没就位");
    if (((await evalJs(`Live2DMascot.getOutfit()`)) || {}).id !== char) {
      let swapped = false;
      for (let i = 0; i < 10 && !swapped; i++) {
        swapped = await evalJs(`Live2DMascot.setCharacter(${JSON.stringify(char)})`);
        if (!swapped) await sleep(500);
      }
      const now = ((await evalJs(`Live2DMascot.getOutfit()`)) || {}).id;
      if (now !== char) throw new Error("切换失败，当前还是 " + now);
    }
    await evalJs(`Live2DMascot.setOutfit(${JSON.stringify(outfit)})`);
    // 衣服构建要逐张去白底，冷启动可能要几秒：轮询等它真的就位（最多 ~10 秒）
    let o = null;
    for (let i = 0; i < 34; i++) {
      await sleep(300);
      const t = await evalJs(`Live2DMascot.getOutfit()`);
      if (t && t.outfit === outfit && Array.isArray(t.poses) && t.poses.includes("held")) { o = t; break; }
    }
    if (!o) throw new Error("10 秒内衣服没构建好（getOutfit=" + JSON.stringify(await evalJs(`Live2DMascot.getOutfit()`)) + "）");
    // 拖拽实测：她会走动，容器中心未必是她——用 whoAt 扫出她此刻的位置再抓
    const rect = await evalJs(`(() => { const r = document.documentElement.querySelector('#live2d-mascot-widget').shadowRoot.querySelector('.container').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
    if (!rect) throw new Error("拿不到挂件位置");
    let pt = null;
    for (let i = 0; i < 10 && !pt; i++) {
      pt = await evalJs(`(() => {
        const M = window.Live2DMascot;
        const r = ${JSON.stringify(rect)};
        for (let y = r.y + r.height * 0.05; y < r.y + r.height * 0.98; y += 5)
          for (let x = r.x + 4; x < r.x + r.width - 4; x += 5)
            if (M.whoAt(x, y) === 'main') return { x: Math.round(x), y: Math.round(y) };
        return null;
      })()`);
      if (!pt) await sleep(500); // 她可能在走路或过渡帧，稍等再扫
    }
    if (!pt) {
      const info = await evalJs(`(() => ({ pose: (window.Live2DMascot.getOutfit() || {}).pose, r: ${JSON.stringify(rect)}, c: window.Live2DMascot.whoAt(${Math.round(rect.x + rect.width / 2)}, ${Math.round(rect.y + rect.height / 2)}) }))()`);
      throw new Error("whoAt 扫不到她（可能在走路或隐藏）现场=" + JSON.stringify(info));
    }
    const x = pt.x, y = pt.y;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: y - 60, button: "left", buttons: 1 });
    await sleep(200);
    const dragging = await evalJs(`Live2DMascot.getOutfit()`);
    if (!dragging || dragging.pose !== "held") throw new Error("拖拽中 pose=" + (dragging && dragging.pose) + "（应为 held）");
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: y - 60, button: "left", buttons: 0, clickCount: 1 });
    // 还原
    await evalJs(`Live2DMascot.setOutfit(null)`);
    await sleep(300);
  };
  for (const char of ["claude", "gpt", "deepseek"]) {
    for (const outfit of ["pajamas", "winter"]) {
      await step(`held生效 ${char}/${outfit}`, () => heldMatrix(char, outfit));
    }
  }

  ws.close();
} catch (e) {
  log("自检中断:", e.message);
  exitCode = 1;
} finally {
  if (browserProc) browserProc.kill();
  if (serveChild) serveChild.kill();
  try { fs.rmSync(path.join(root, "工具", ".自检-临时用户目录"), { recursive: true, force: true }); } catch {}
}

// ---------- 汇总 ----------
log("\n===== 自检结果汇总 =====");
log(`共 ${stepResults.length} 步，失败 ${stepResults.filter((r) => !r[1]).length} 步`);
// favicon 404 属浏览器自动请求，不算页面问题
const realErrors = [...consoleErrors].filter((e) => !e.includes("/favicon.ico"));
for (const [name, ok, err] of stepResults) {
  if (!ok) log(`  失败步骤: ${name} -> ${err}`);
}
if (realErrors.length) {
  log("\n收集到 console 报错（去重）:");
  for (const e of realErrors) log("  " + e);
} else {
  log("\n没有收集到 console 报错");
}
if (pageErrors.length) {
  log("收集到 pageerror:");
  for (const e of new Set(pageErrors)) log("  " + e);
} else {
  log("没有收集到 pageerror");
}

if (exitCode === 0 && (stepResults.some((r) => !r[1]) || pageErrors.length)) exitCode = 1;
if (realErrors.length && exitCode === 0) exitCode = 1;
log(exitCode === 0 ? "\n结论: 自检通过" : "\n结论: 自检发现问题");
process.exit(exitCode);
