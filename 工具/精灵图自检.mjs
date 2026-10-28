// 精灵图自检：对角色包做静态校验（零依赖 Node）。
// 用法：node 工具/精灵图自检.mjs <角色名>     （角色名对应 characters/<角色名>/character.js）
// 校验内容：
//   1. sheets 里的大图 / 索引 JSON 文件存在，索引能解析，size 合法；
//   2. 索引里的帧矩形（含网格简写换算）都在大图范围内，帧之间不重叠；
//   3. images / outfits / outfitPoses 里：老写法的文件存在；
//      新写法 {sheet, frame} 的图集存在、帧名在索引里存在；kind 是五个合法值之一。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const KINDS = new Set(["body", "face", "eyes", "pose", "patch"]);
const problems = [];
const notes = [];
let checks = 0;
const ok = (msg) => { checks++; };
const bad = (msg) => problems.push(msg);

function fail(msg) { return null; }

// 读取 PNG 的 IHDR，拿到真实宽高
function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// 把角色包 JS 变成对象：character.js 是往 window 上挂东西的浏览器写法，给个假 window 跑一遍
function loadCharacter(name) {
  const file = path.join(ROOT, "characters", name, "character.js");
  if (!fs.existsSync(file)) { bad(`角色包不存在：characters/${name}/character.js`); return null; }
  const fakeWindow = {};
  globalThis.window = fakeWindow;
  try {
    new Function(fs.readFileSync(file, "utf8"))();
  } catch (e) {
    bad(`character.js 执行出错：${e.message}`);
    return null;
  } finally { delete globalThis.window; }
  const def = fakeWindow.Live2DMascotCharacters?.[name];
  if (!def) { bad(`character.js 里没有挂出 characters.${name}`); return null; }
  ok();
  return def;
}

// 网格简写 [列, 行] → 矩形；对象写法原样返回
function frameRect(index, entry) {
  if (Array.isArray(entry)) {
    const cols = index.grid?.columns;
    if (!cols || !index.size) return null;
    return { x: entry[0] * index.size.w, y: entry[1] * index.size.h, w: index.size.w, h: index.size.h };
  }
  if (entry && typeof entry === "object") return entry;
  return null;
}

function checkSheet(name, sheet) {
  if (!sheet || typeof sheet !== "object" || !sheet.image) {
    bad(`sheets.${name}：缺少 image 字段`); return null;
  }
  const imgPath = path.join(ROOT, sheet.image);
  if (!fs.existsSync(imgPath)) { bad(`sheets.${name}：大图不存在 ${sheet.image}`); return null; }
  const real = pngSize(imgPath);
  if (!real) { bad(`sheets.${name}：大图不是 PNG ${sheet.image}`); return null; }
  ok(`图集 ${name} 大图 ${sheet.image}（${real.w}x${real.h}）`);

  let indexFile = sheet.index;
  if (!indexFile) {
    // 约定：索引和大图同目录同名，扩展名换 .json
    indexFile = sheet.image.replace(/\.[^.]+$/, ".json");
    notes.push(`sheets.${name}：未写 index，按同目录同名约定取 ${indexFile}`);
  }
  const indexPath = path.join(ROOT, indexFile);
  if (!fs.existsSync(indexPath)) { bad(`sheets.${name}：索引不存在 ${indexFile}`); return null; }
  let index;
  try { index = JSON.parse(fs.readFileSync(indexPath, "utf8")); }
  catch (e) { bad(`sheets.${name}：索引 JSON 解析失败（${indexFile}）：${e.message}`); return null; }
  if (!index.size || !(index.size.w > 0) || !(index.size.h > 0)) {
    bad(`sheets.${name}：索引缺少合法的 size`); return null;
  }
  if (!index.frames || typeof index.frames !== "object") {
    bad(`sheets.${name}：索引缺少 frames`); return null;
  }
  ok(`图集 ${name} 索引 ${indexFile}（size ${index.size.w}x${index.size.h}，${Object.keys(index.frames).length} 帧）`);

  // 逐帧：矩形在大图范围内；kind 合法
  const rects = {};
  for (const [fname, entry] of Object.entries(index.frames)) {
    const r = frameRect(index, entry);
    if (!r) { bad(`图集 ${name} 帧 ${fname}：写法不认识（既不是 [列,行] 也不是矩形对象）`); continue; }
    if (r.x < 0 || r.y < 0 || r.w <= 0 || r.h <= 0) { bad(`图集 ${name} 帧 ${fname}：矩形尺寸非法（${r.x},${r.y},${r.w},${r.h}）`); continue; }
    if (r.x + r.w > real.w || r.y + r.h > real.h) {
      bad(`图集 ${name} 帧 ${fname}：矩形越界（${r.x},${r.y},${r.w},${r.h} 超出大图 ${real.w}x${real.h}）`); continue;
    }
    if (entry.kind && !KINDS.has(entry.kind)) { bad(`图集 ${name} 帧 ${fname}：kind "${entry.kind}" 不是 body/face/eyes/pose/patch 之一`); }
    if (r.w > index.size.w || r.h > index.size.h) {
      notes.push(`图集 ${name} 帧 ${fname}：矩形比 size 大（${r.w}x${r.h} > ${index.size.w}x${index.size.h}），确认是不是故意的`);
    }
    rects[fname] = r;
  }
  // 两两不重叠
  const names = Object.keys(rects);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = rects[names[i]], b = rects[names[j]];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        bad(`图集 ${name}：帧 ${names[i]} 和 ${names[j]} 的矩形重叠`);
      }
    }
  }
  return { index, real, frames: rects };
}

function checkRef(where, value, sheets, name, defaultFrame) {
  // 老写法：字符串路径
  if (typeof value === "string") {
    if (!fs.existsSync(path.join(ROOT, value))) bad(`${where}：文件不存在 ${value}`);
    else ok(`${where} → ${value}`);
    return;
  }
  // 新写法：{ sheet, frame?, kind? }
  if (value && typeof value === "object") {
    if (!value.sheet || !sheets[value.sheet]) {
      bad(`${where}：引用了不存在的图集 "${value.sheet}"（可用：${Object.keys(sheets).join("、") || "无"}）`); return;
    }
    const frameName = value.frame ?? defaultFrame; // frame 省略时的默认帧（images/outfitPoses 取键名，outfits 取 normal）
    const info = sheets[value.sheet];
    if (!info.frames[frameName]) {
      bad(`${where}：图集 ${value.sheet} 里没有帧 "${frameName}"（可用帧名：${Object.keys(info.frames).join("、")}）`);
    } else ok(`${where} → 图集 ${value.sheet} 帧 ${frameName}`);
    if (value.kind !== undefined && !KINDS.has(value.kind)) {
      bad(`${where}：kind "${value.kind}" 不是 body/face/eyes/pose/patch 之一`);
    }
    return;
  }
  bad(`${where}：写法不认识（${JSON.stringify(value)}）`);
}

// ---------- 主流程 ----------
const name = process.argv[2];
if (!name) {
  console.error("用法：node 工具/精灵图自检.mjs <角色名>   例如：node 工具/精灵图自检.mjs sheetdemo");
  process.exit(2);
}
console.log(`== 精灵图自检：${name} ==`);
const def = loadCharacter(name);
if (!def) { report(); }
if (def.type && def.type !== "sprite") {
  console.log(`跳过：这是 ${def.type} 角色（Live2D），没有精灵图条目，不算问题。`);
  process.exit(0);
}

const sheets = {};
for (const [sname, sheet] of Object.entries(def.sheets || {})) {
  const info = checkSheet(sname, sheet);
  if (info) sheets[sname] = info;
}

if (def.images?.normal) {
  checkRef("images.normal", def.images.normal, sheets, "normal");
} else bad("images.normal 缺失（基础图必填）");
for (const [k, v] of Object.entries(def.images || {})) {
  if (k === "normal") continue;
  checkRef(`images.${k}`, v, sheets, k, k); // frame 省略时默认取键名（设计稿 3.5）
}
// 换装整身图：frame 省略时默认取图集的 normal 帧（设计稿 3.2 的约定）
for (const [k, v] of Object.entries(def.outfits || {})) checkRef(`outfits.${k}`, v, sheets, k, "normal");
for (const [outfit, poses] of Object.entries(def.outfitPoses || {})) {
  for (const [k, v] of Object.entries(poses || {})) checkRef(`outfitPoses.${outfit}.${k}`, v, sheets, k, k);
}

function report() {
  console.log("");
  for (const n of notes) console.log(`提示：${n}`);
  if (problems.length) {
    console.log(`\nFAIL：${problems.length} 个问题（通过 ${checks} 项检查）`);
    for (const p of problems) console.log("  ✗ " + p);
    process.exit(1);
  }
  console.log(`\nPASS：${checks} 项检查全部通过，没有发现问题。`);
  process.exit(0);
}
report();
