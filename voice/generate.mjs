// 生成语音：把每个角色的全部台词，用 MiniMax 语音合成一次性生成成 mp3，存在本地。
// 用法：双击 live2d-mascot\生成语音.bat（或 node voice/generate.mjs）
//   --yes          不询问，直接开始
//   --only=claude  只生成某一个角色
//   --test         只合成一句"你好"，检查密钥和地址
// 已经生成过的句子会跳过，中途断了重新运行就行，不会重复扣额度。
// 密钥写在 voice/配置.json 里（不会被存档），程序不会把密钥显示出来。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const VOICE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(VOICE_DIR, "..");
const CONFIG_FILE = path.join(VOICE_DIR, "配置.json");
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) || "").slice(7) || null;
const autoYes = args.includes("--yes");

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------
// minimax.cn 平台（包括 M Plan 订阅 Key）的接口地址是 api.minimax.cn
const CONFIG_TEMPLATE = { apiKey: "", host: "https://api.minimax.cn", model: "speech-2.8-hd" };
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG_TEMPLATE, null, 2) + "\n");
  console.log("已创建配置文件：" + CONFIG_FILE);
  console.log('请用记事本打开它，把 MiniMax 开放平台的 API Key 填进 "apiKey" 后面的引号里，保存后再运行一次。');
  process.exit(1);
}
let config;
try {
  config = Object.assign({}, CONFIG_TEMPLATE, JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")));
} catch {
  console.log("voice\\配置.json 不是合法的 JSON，请检查（不要把内容发给别人）");
  process.exit(1);
}
if (!config.apiKey) {
  console.log('配置文件里的 "apiKey" 还是空的：' + CONFIG_FILE);
  console.log("填好 MiniMax 开放平台的 API Key 后再运行一次。");
  process.exit(1);
}
// M Plan / Token Plan subscription keys: ask when the usage window refreshes.
async function quotaResetText() {
  try {
    const res = await fetch("https://www.minimax.cn/v1/token_plan/remains", {
      headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json" },
    });
    const m = ((await res.json()).model_remains || [])[0];
    if (!m) return "";
    const at = (t) => new Date(t).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const lines = [];
    if (m.current_interval_remaining_percent === 0) lines.push(`5 小时额度会在 ${at(m.end_time)} 恢复。`);
    lines.push(`本周额度还剩 ${m.current_weekly_remaining_percent}%（${at(m.weekly_end_time)} 刷新）。`);
    return "\n" + lines.join("\n") + "\n到时候再双击一次\"生成语音\"就行。";
  } catch {
    return "可以到 MiniMax 控制台的套餐详情里查看什么时候恢复。";
  }
}

// Accept the host with or without the endpoint path pasted after it.
const endpoint = config.host.trim().replace(/\/+$/, "").replace(/\/v1\/t2a_v2$/, "") + "/v1/t2a_v2";

// ---------------------------------------------------------------------------
// 读取角色和台词（和 widget.js 用同样的规则挑台词）
// ---------------------------------------------------------------------------
const sandbox = { window: {} };
vm.createContext(sandbox);
const run = (rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), sandbox, { filename: rel });
run("characters/index.js");
run("characters/default-lines.js");
if (fs.existsSync(path.join(ROOT, "characters/banter.js"))) run("characters/banter.js");
const ids = sandbox.window.Live2DMascotCharacterList || [];
for (const id of ids) run(`characters/${id}/character.js`);
const defs = sandbox.window.Live2DMascotCharacters || {};
const defaults = sandbox.window.Live2DMascotDefaultLines || {};

const isLineList = (v) => Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string");

// 必须和 widget.js 里的 timeText 完全一致，否则报时找不到对应的语音。
function timeText(h) {
  const period = h < 5 ? "凌晨" : h < 9 ? "早上" : h < 12 ? "上午" : h === 12 ? "中午" : h < 18 ? "下午" : "晚上";
  const n = h % 12 === 0 ? 12 : h % 12;
  return period + n + "点";
}

// 每种带时间的台词会在哪些整点出现（和 widget.js 的报时规则一致）
const HOURS = {
  hourly: [...Array(24).keys()].filter((h) => h !== 12 && h !== 18),
  lunch: [12],
  dinner: [18],
  lateNight: [23, 0, 1, 2, 3],
};

function textsFor(def) {
  const own = def.lines || {};
  const out = new Set();
  const groups = new Set([...Object.keys(defaults), ...Object.keys(own)]);
  // Touch-zone lines only play for characters that have touch zones.
  const zones = new Set((def.touchZones || []).map((z) => z[0]));
  const usesGroup = (g) => {
    const m = /^touch([A-Z]\w*?)(?:\+\d+)?$/.exec(g);
    if (!m) return true;
    const part = m[1].replace(/^Chest\w*$/, "Chest");
    return zones.has(part[0].toLowerCase() + part.slice(1));
  };
  for (const g of groups) {
    if (!usesGroup(g)) continue;
    if (g === "greeting") {
      const slots = new Set([...Object.keys(defaults.greeting || {}), ...Object.keys(own.greeting || {})]);
      for (const s of slots) {
        const list = (own.greeting && own.greeting[s]) || (defaults.greeting || {})[s];
        if (isLineList(list)) list.forEach((t) => out.add(t));
      }
      continue;
    }
    const list = isLineList(own[g]) ? own[g] : defaults[g];
    if (!isLineList(list)) continue;
    for (const t of list) {
      if (t.includes("{时间}")) {
        for (const h of HOURS[g] || [...Array(24).keys()]) out.add(t.split("{时间}").join(timeText(h)));
      } else {
        out.add(t);
      }
    }
  }
  if (def.thinkingText) out.add(def.thinkingText);
  // the spoken version of the 「你会什么」 list
  for (const h of sandbox.window.Live2DMascotHelp || []) out.add(h.say);
  // her parts in the companion banter (characters/banter.js)
  for (const d of sandbox.window.Live2DMascotBanter || []) for (const [who, text] of d.lines || []) if (who === def.id) out.add(text);
  return [...out];
}

// Anything that changes the sound goes into the file name, so editing a
// character's voice settings regenerates her lines instead of reusing old ones.
const QUALITY = "hq1";
const keyOf = (v, text) =>
  crypto
    .createHash("sha1")
    .update([v.model || config.model, v.id, v.speed ?? 1, v.pitch ?? 0, v.emotion || "", JSON.stringify(v.modify || {}), QUALITY, text].join("|"))
    .digest("hex")
    .slice(0, 16);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class StopError extends Error {}

// --test：只合成一句"你好"确认密钥和地址都没问题，不保存文件，只用几个字的额度。
if (args.includes("--test")) {
  const def = ids.map((id) => defs[id]).find((d) => d && d.voice);
  if (!def) {
    console.log("没有找到带 voice 配置的角色，没法测试。");
    process.exit(1);
  }
  console.log(`测试中：用「${def.name}」的音色合成"你好"……`);
  try {
    const r = await synth(def.voice, "你好");
    console.log(`成功！收到 ${r.audio.length} 字节的语音，时长 ${r.ms} 毫秒。可以正式生成了。`);
    process.exit(0);
  } catch (err) {
    console.log("失败：" + err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 统计要生成多少
// ---------------------------------------------------------------------------
const plan = [];
for (const id of ids) {
  const def = defs[id];
  if (!def || !def.voice || (only && id !== only)) continue;
  const dir = path.join(VOICE_DIR, id);
  const texts = textsFor(def);
  const todo = texts.filter((t) => !fs.existsSync(path.join(dir, keyOf(def.voice, t) + ".mp3")));
  plan.push({ id, def, dir, texts, todo });
}

console.log(`模型：${config.model}`);
let totalTodo = 0;
let totalChars = 0;
for (const p of plan) {
  const chars = p.todo.reduce((n, t) => n + [...t].length, 0);
  totalTodo += p.todo.length;
  totalChars += chars;
  console.log(`${p.def.name}：共 ${p.texts.length} 句，已有 ${p.texts.length - p.todo.length} 句，要新生成 ${p.todo.length} 句（约 ${chars} 字）`);
}
if (!totalTodo) {
  console.log("全部语音都已经生成好了。");
} else {
  console.log(`合计要新生成 ${totalTodo} 句，约 ${totalChars} 字（实际扣费以 MiniMax 后台为准）。`);
  if (!autoYes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question("确认开始生成吗？输入 Y 后按回车：")).trim().toLowerCase();
    rl.close();
    if (answer !== "y") {
      console.log("已取消，没有使用任何额度。");
      process.exit(0);
    }
  }
}

// ---------------------------------------------------------------------------
// 逐句生成
// ---------------------------------------------------------------------------

async function synth(voice, text) {
  const body = {
    model: voice.model || config.model, // a character may need another speech model (e.g. for whisper)
    text,
    stream: false,
    output_format: "hex",
    language_boost: "Chinese",
    voice_setting: {
      voice_id: voice.id,
      speed: voice.speed ?? 1,
      vol: 1,
      pitch: voice.pitch ?? 0,
      ...(voice.emotion ? { emotion: voice.emotion } : {}),
    },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
    ...(voice.modify ? { voice_modify: voice.modify } : {}),
  };
  for (let attempt = 1; attempt <= 6; attempt++) {
    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.apiKey },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.log(`  网络出错（${err.message}），${attempt * 3} 秒后重试……`);
      await sleep(attempt * 3000);
      continue;
    }
    const json = await res.json().catch(() => ({}));
    const code = json.base_resp ? json.base_resp.status_code : -1;
    if (code === 0 && json.data && json.data.audio) {
      return { audio: Buffer.from(json.data.audio, "hex"), ms: (json.extra_info && json.extra_info.audio_length) || 0, used: (json.extra_info && json.extra_info.usage_characters) || 0 };
    }
    const msg = (json.base_resp && json.base_resp.status_msg) || `HTTP ${res.status}`;
    if (code === 1002 || code === 1039 || code === 1001 || res.status >= 500) {
      console.log(`  请求太快或服务器忙（${code}），${attempt * 5} 秒后重试……`);
      await sleep(attempt * 5000);
      continue;
    }
    if (code === 1004) throw new StopError("密钥不对或已失效（鉴权失败）。请检查 voice/配置.json 里的 apiKey。");
    if (code === 2056) throw new StopError("套餐的这一轮额度用完了。" + (await quotaResetText()));
    throw new StopError(`MiniMax 返回错误 ${code}：${msg}`);
  }
  throw new StopError("重试多次仍然失败，请稍后再运行一次（已生成的不会丢）。");
}

function writeManifest(p) {
  const entries = {};
  // Clips left over from earlier voice settings are no longer used.
  const keep = new Set(p.texts.map((t) => keyOf(p.def.voice, t)));
  for (const name of fs.readdirSync(p.dir)) {
    const m = /^([0-9a-f]{16})\.(mp3|json)$/.exec(name);
    if (m && !keep.has(m[1])) fs.unlinkSync(path.join(p.dir, name));
  }
  for (const t of p.texts) {
    const k = keyOf(p.def.voice, t);
    const f = path.join(p.dir, k + ".mp3");
    if (!fs.existsSync(f)) continue;
    const metaFile = path.join(p.dir, k + ".json");
    const ms = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")).ms : 0;
    entries[t] = { f: k + ".mp3", ms };
  }
  const js =
    "// 自动生成，请不要手动修改。台词 -> 语音文件。重新运行生成语音工具会更新这里。\n" +
    `(window.Live2DMascotVoices = window.Live2DMascotVoices || {})[${JSON.stringify(p.id)}] = ${JSON.stringify(entries, null, 1)};\n`;
  fs.writeFileSync(path.join(p.dir, "manifest.js"), js);
  return Object.keys(entries).length;
}

let usedTotal = 0;
let done = 0;
try {
  for (const p of plan) {
    fs.mkdirSync(p.dir, { recursive: true });
    for (const t of p.todo) {
      const k = keyOf(p.def.voice, t);
      const r = await synth(p.def.voice, t);
      fs.writeFileSync(path.join(p.dir, k + ".mp3"), r.audio);
      fs.writeFileSync(path.join(p.dir, k + ".json"), JSON.stringify({ text: t, ms: r.ms }));
      usedTotal += r.used;
      done++;
      console.log(`  [${done}/${totalTodo}] ${p.def.name}：${t}`);
      await sleep(300);
    }
    const n = writeManifest(p);
    console.log(`${p.def.name}：语音目录已更新，共 ${n} 句。`);
  }
  if (totalTodo) console.log(`完成！本次生成 ${done} 句，计费字符约 ${usedTotal} 个。`);
} catch (err) {
  for (const p of plan) if (fs.existsSync(p.dir)) writeManifest(p);
  console.log("");
  console.log(err instanceof StopError ? err.message : "出错了：" + err.message);
  console.log(`已经生成的 ${done} 句都保存好了，下次运行会从没做完的地方继续。`);
  process.exit(1);
}
