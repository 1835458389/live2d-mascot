// 通用动作矩阵实测：三位角色 x 换装 {平时, pajamas, winter} x 动作
//   {wave, drink, act, held, sit, sleep, cheer1, sulk, focus}
// 按「该角色这套衣服实际有哪些姿势图」自动跳过没有的组合（明确报跳过，不算失败）。
// 用法：
//   node 工具/动作实测.mjs                        # 跑完整矩阵
//   node 工具/动作实测.mjs --char claude          # 只跑一个角色
//   node 工具/动作实测.mjs --outfit pajamas       # 只跑一套衣服
//   node 工具/动作实测.mjs --char gpt --outfit winter --action held   # 只测一格
// 零依赖、无头、自清理（临时浏览器配置跑完删）。端口 8172/8173（与自检的 8164/8170 错开）。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8172, CDP = 8173;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ---------- 参数 ----------
const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const ONLY_CHAR = argOf("char");
const ONLY_OUTFIT = argOf("outfit");
const ONLY_ACTION = argOf("action");

const CHARS = ["claude", "gpt", "deepseek"];
const OUTFITS = ["base", "pajamas", "winter"]; // base = 平时（setOutfit(null) 强制回平时）
// 每个动作：触发放法 + 要采样到的姿势帧。frames 两帧的动画必须两帧都出现。
const ACTIONS = {
  wave: { kind: "anim", frames: ["wave1", "wave2"] },
  drink: { kind: "anim", frames: ["drink1", "drink2"] },
  act: { kind: "anim", frames: ["act1", "act2"] },
  cheer1: { kind: "react", reactEvent: "focusDone", frames: ["cheer1", "cheer2"] }, // cheer 动画没有公开按钮入口，走事件
  held: { kind: "drag", frames: ["held"] },
  sit: { kind: "hold", frames: ["sit", "sitGround"], matchAny: true }, // 坐到地面上时姿势会改名 sitGround（同一张 sit 图）
  sleep: { kind: "hold", frames: ["sleep", "sleepPajamas"], prefer: "sleep" }, // 睡衣+sleepPajamas 时 setPose 会改叫 sleepPajamas
  sulk: { kind: "hold", frames: ["sulk"] },
  focus: { kind: "hold", frames: ["focus"] },
};
// 这套衣服里真正要采样到的帧：优先 prefer 指定的名字，否则取第一个有的
const expectFrames = (def, avail) => {
  const have = def.frames.filter((f) => avail.includes(f));
  if (def.prefer && have.includes(def.prefer)) return [def.prefer];
  return have;
};

// ---------- 找浏览器 ----------
const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const exe = CANDIDATES.find((p) => fs.existsSync(p));
if (!exe) { log("没找到 Chrome/Edge，跳过"); process.exit(0); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pose-matrix-"));
const serve = spawn(process.execPath, [path.join(ROOT, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const browser = spawn(exe, ["--headless=new", `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--proxy-server=direct://", "--proxy-bypass-list=*", "about:blank"], { stdio: "ignore" });
await sleep(2500);

// ---------- CDP 小客户端（写法同 自检.mjs）----------
let ws, seq = 0;
const pending = new Map();
const listeners = [];
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
      else if (m.method) for (const fn of listeners) fn(m);
    };
  });
}
const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

// ---------- 测试记录 ----------
const results = {}; // `${char}/${outfit}` -> { action: {状态, 原因} }
let cellKey = null;
const netBad = []; // 每个加载失败记到当时的格子上
listeners.push((m) => {
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400 && !/favicon/.test(m.params.response.url)) {
    netBad.push({ cell: cellKey, text: `[网络] ${m.params.response.status} ${m.params.response.url}` });
  }
});
const warnsOf = async () => {
  const w = (await evalJs(`JSON.stringify(window.__w || [])`)) || [];
  return JSON.parse(w).filter((x) => !/RUM|favicon|DevTools/i.test(x));
};

// ---------- 动作触发与采样 ----------
async function waitStand(timeoutMs = 9000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((await evalJs(`(window.Live2DMascot.getOutfit()||{}).pose`)) === "stand") return true;
    await sleep(300);
  }
  return false;
}

// 采样：在时限内反复读 pose，返回见过的帧集合
async function samplePoses(timeoutMs) {
  return evalJs(`(async () => {
    const seen = new Set();
    const end = performance.now() + ${timeoutMs};
    while (performance.now() < end) {
      const p = (window.Live2DMascot.getOutfit() || {}).pose;
      if (p) seen.add(p);
      await new Promise(r => setTimeout(r, 120));
    }
    return [...seen];
  })()`);
}

async function dragHeld() {
  const rect = await evalJs(`(() => {
    const el = document.documentElement.querySelector('#live2d-mascot-widget');
    const r = el && el.shadowRoot && el.shadowRoot.querySelector('.container');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  })()`);
  if (!rect) throw new Error("拿不到挂件位置");
  // 她可能在扫描和按下之间走动，一次不中就松手重来（最多 4 次）
  for (let attempt = 0; attempt < 4; attempt++) {
    let pt = null;
    for (let i = 0; i < 10 && !pt; i++) {
      pt = await evalJs(`(() => {
        const M = window.Live2DMascot, r = ${JSON.stringify(rect)};
        for (let y = r.y + r.height * 0.05; y < r.y + r.height * 0.98; y += 5)
          for (let x = r.x + 4; x < r.x + r.width - 4; x += 5)
            if (M.whoAt(x, y) === 'main') return { x: Math.round(x), y: Math.round(y) };
        return null;
      })()`);
      if (!pt) await sleep(500); // 她可能在走路或过渡帧
    }
    if (!pt) continue;
    const { x, y } = pt;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: y - 60, button: "left", buttons: 1 });
    const pose = await evalJs(`(window.Live2DMascot.getOutfit() || {}).pose`);
    if (pose !== "held") {
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: y - 60, button: "left", buttons: 0, clickCount: 1 });
      await evalJs(`window.Live2DMascot.setMode('idle')`).catch(() => {});
      await waitStand(3000);
      continue;
    }
    const seen = await samplePoses(2500);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: y - 60, button: "left", buttons: 0, clickCount: 1 });
    return seen;
  }
  throw new Error("whoAt 扫不到她或按不中（可能在走路或隐藏）");
}

async function runCell(char, outfit, name) {
  const def = ACTIONS[name];
  // 0) 假装有人在电脑前：无头浏览器一直没动静，跑到后面她会自动打瞌睡、睡着，睡着时不做动作
  await evalJs(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }))`).catch(() => {});
  // 1) 确认角色（切换进行中会返回 false，带重试）
  if (((await evalJs(`(window.Live2DMascot.getOutfit()||{}).id`))) !== char) {
    let swapped = false;
    for (let i = 0; i < 10 && !swapped; i++) {
      swapped = await evalJs(`window.Live2DMascot.setCharacter(${JSON.stringify(char)})`);
      if (!swapped) await sleep(500);
    }
    const now = (await evalJs(`(window.Live2DMascot.getOutfit()||{}).id`));
    if (now !== char) return { 状态: "失败", 原因: "切角色失败，当前 " + now };
  }
  // 2) 换装（base 用 null 强制回平时，绕开按钟点自动换）
  await evalJs(`window.Live2DMascot.setOutfit(${outfit === "base" ? "null" : JSON.stringify(outfit)})`);
  let o = null;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    const t = await evalJs(`window.Live2DMascot.getOutfit()`);
    if (t && t.outfit === (outfit === "base" ? null : outfit)) { o = t; break; }
  }
  if (!o) return { 状态: "失败", 原因: "12 秒内衣服没换好（getOutfit=" + JSON.stringify(await evalJs(`window.Live2DMascot.getOutfit()`)) + "）" };
  if (outfit !== "base") {
    // 换装姿势图是逐张构建的：等 poses 集齐角色包里登记的全部姿势再读，避免漏判成"无图"
    const registered = Object.keys((await evalJs(`((window.Live2DMascotCharacters||{})[${JSON.stringify(char)}]||{}).outfitPoses || {}`))[outfit] || {});
    for (let i = 0; i < 40; i++) {
      const poses = (await evalJs(`window.Live2DMascot.getOutfit().poses`)) || [];
      if (registered.every((p) => poses.includes(p))) break;
      await sleep(300);
    }
  }
  // 3) 这套衣服实际有哪些姿势图：换装用 getOutfit().poses，平时用角色包 images 底表
  const avail = outfit === "base"
    ? Object.keys((await evalJs(`(window.Live2DMascotCharacters||{})[${JSON.stringify(char)}] || {}`)).images || {})
    : (await evalJs(`window.Live2DMascot.getOutfit().poses`)) || [];
  const missing = def.frames.filter((f) => !avail.includes(f));
  if (missing.length === def.frames.length) {
    return { 状态: "跳过", 原因: "无图（缺 " + def.frames.join("/") + "）" };
  }
  const expect = expectFrames(def, avail);
  // 4) 触发 + 采样
  const warnBefore = (await warnsOf()).length;
  let seen = [];
  try {
    // 拖拽/走路之后她还可能在走，走路中 anim 会被拒绝：先回 idle 再等站定
    await evalJs(`window.Live2DMascot.setMode('idle')`).catch(() => {});
    await waitStand();
    if (def.kind === "anim" || def.kind === "react") {
      let started = false;
      for (let i = 0; i < 12 && !started; i++) {
        started = def.kind === "anim"
          ? !!(await evalJs(`window.Live2DMascot.anim(${JSON.stringify(name)}) || window.Live2DMascot.act(${JSON.stringify(name)})`)) // act=doAction，会先站起/结束睡姿再播
          : !!await evalJs(`window.Live2DMascot.react(${JSON.stringify(def.reactEvent)})`);
        await sleep(400);
        if (started) break;
        await evalJs(`window.Live2DMascot.setMode('idle')`).catch(() => {});
        await waitStand(2500);
      }
      if (!started && def.kind === "anim") return { 状态: "失败", 原因: "anim(" + name + ") 启动失败" };
      seen = await samplePoses(8000);
    } else if (def.kind === "hold") {
      await evalJs(`window.Live2DMascot.hold(null)`);
      const ok = await evalJs(`window.Live2DMascot.hold(${JSON.stringify(name)})`);
      if (!ok) return { 状态: "失败", 原因: "hold(" + name + ") 被拒绝" };
      seen = await samplePoses(4000);
      await evalJs(`window.Live2DMascot.hold(null)`);
    } else if (def.kind === "drag") {
      await waitStand();
      seen = await dragHeld();
      await sleep(500);
    }
  } finally {
    await evalJs(`window.Live2DMascot.hold(null)`).catch(() => {});
    await waitStand(4000).catch(() => {});
  }
  const notSeen = def.matchAny
    ? (def.frames.some((f) => seen.includes(f)) ? [] : def.frames)
    : expect.filter((f) => !seen.includes(f));
  if (notSeen.length) {
    return { 状态: "失败", 原因: "姿势没切到 " + notSeen.join("/") + "（采样到 " + (seen.join(",") || "无") + "）" };
  }
  const newWarns = (await warnsOf()).slice(warnBefore);
  const cellNet = netBad.filter((n) => n.cell === cellKey).map((n) => n.text);
  if (newWarns.length || cellNet.length) {
    return { 状态: "失败", 原因: "加载警告: " + [...newWarns, ...cellNet].join(" | ").slice(0, 160) };
  }
  return { 状态: "通过", 原因: "帧: " + expect.join("/") };
}

// ---------- 主流程 ----------
let exitCode = 0;
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  // 页面里劫持 console.warn，收集加载类警告
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/demo/` });
  await sleep(4000);
  await evalJs(`(() => { window.__w = []; const ow = console.warn; console.warn = (...a) => { window.__w.push(a.join(' ')); ow(...a); }; })()`);

  const chars = ONLY_CHAR ? [ONLY_CHAR] : CHARS;
  const outfits = ONLY_OUTFIT ? [ONLY_OUTFIT] : OUTFITS;
  const actions = ONLY_ACTION ? [ONLY_ACTION] : Object.keys(ACTIONS);
  for (const bad of [ONLY_CHAR, ONLY_OUTFIT, ONLY_ACTION]) {
    if (bad && !chars.includes(bad) && !outfits.includes(bad) && !actions.includes(bad)) {
      log(`未知参数值: ${bad}（角色 ${CHARS.join("/")}；衣服 ${OUTFITS.join("/")}；动作 ${Object.keys(ACTIONS).join("/")}）`);
      process.exit(1);
    }
  }

  const rows = [];
  for (const char of chars) {
    for (const outfit of outfits) {
      cellKey = `${char}/${outfit}`;
      results[cellKey] = {};
      log(`\n== ${cellKey} ==`);
      for (const name of actions) {
        let r;
        try { r = await runCell(char, outfit, name); }
        catch (e) { r = { 状态: "失败", 原因: e.message.slice(0, 160) }; }
        results[cellKey][name] = r;
        log(`  ${r.状态 === "通过" ? "[通过]" : r.状态 === "跳过" ? "[跳过]" : "[失败]"} ${name}${r.原因 ? " — " + r.原因 : ""}`);
        await sleep(300);
      }
      rows.push(cellKey);
    }
  }

  // ---------- 矩阵表 ----------
  const head = ["角色/衣服", ...actions];
  const width = (s) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
  const pad = (s, n) => s + " ".repeat(Math.max(0, n - width(s)));
  const colW = head.map((h) => Math.max(width(h), ...rows.map((r) => {
    const c = results[r][h] || { 状态: "-" };
    return width(c.状态 === "跳过" ? "跳过" : c.状态);
  })) + 2);
  const line = colW.map((w) => "-".repeat(w)).join("+");
  log("\n" + colW.map((w, i) => pad(head[i], w)).join("|"));
  log(line);
  for (const r of rows) {
    const cells = [pad(r, colW[0])];
    actions.forEach((a, i) => {
      const c = results[r][a] || { 状态: "-" };
      cells.push(pad(c.状态 === "跳过" ? "跳过" : c.状态, colW[i + 1]));
    });
    log(cells.join("|"));
  }
  const all = rows.flatMap((r) => actions.map((a) => results[r][a])).filter(Boolean);
  const nOk = all.filter((c) => c.状态 === "通过").length;
  const nSkip = all.filter((c) => c.状态 === "跳过").length;
  const nFail = all.filter((c) => c.状态 === "失败").length;
  log(`\n===== 汇总：共 ${all.length} 格，通过 ${nOk}，跳过 ${nSkip}（无图），失败 ${nFail} =====`);
  for (const r of rows) for (const a of actions) {
    const c = results[r][a];
    if (c && c.状态 !== "通过") log(`  ${r} / ${a}: ${c.状态}${c.原因 ? " — " + c.原因 : ""}`);
  }
  const strayWarns = await warnsOf();
  if (strayWarns.length) log("全程警告: " + strayWarns.join(" | ").slice(0, 300));
  if (nFail) exitCode = 1;
  log(exitCode === 0 ? "结论: 矩阵全部通过" : "结论: 有失败项");
} catch (e) {
  log("实测中断:", e.message);
  exitCode = 1;
} finally {
  try { ws.close(); } catch {}
  browser.kill(); serve.kill();
  await sleep(1500);
  for (let i = 0; i < 3; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(1000); } }
}
process.exit(exitCode);
