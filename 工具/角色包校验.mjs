// =====================================================================
// 角色包完整性校验脚本（零依赖纯 Node）
// 用法: node 工具/角色包校验.mjs
// 检查 characters/ 下每个角色的必备字段、类型、文件路径是否真实存在。
// 语音(voice)只做提示，不判失败。有 FAIL 时退出码为 1。
// 注意：character.js 不是 ESM，是挂在 window 上的全局对象，
//       这里用假 window 跑一遍文件内容来取配置。
// =====================================================================
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const log = (...a) => console.log(...a);

// ---------- 加载角色包 ----------
function loadCharacters() {
  const listPath = path.join(root, "characters", "index.js");
  const listSrc = fs.readFileSync(listPath, "utf8");
  const win = {};
  new Function("window", listSrc)(win);
  const list = win.Live2DMascotCharacterList;
  if (!Array.isArray(list) || !list.length) throw new Error("characters/index.js 里没有人物名单");

  const chars = {};
  for (const name of list) {
    const file = path.join(root, "characters", name, "character.js");
    if (!fs.existsSync(file)) {
      chars[name] = { error: "character.js 不存在" };
      continue;
    }
    const w = {};
    try {
      new Function("window", fs.readFileSync(file, "utf8"))(w);
    } catch (e) {
      chars[name] = { error: "character.js 执行出错: " + e.message };
      continue;
    }
    const bag = (w.Live2DMascotCharacters || {})[name];
    chars[name] = bag ? { config: bag } : { error: "没有注册 Live2DMascotCharacters." + name };
  }
  return { list, chars };
}

// ---------- 检查工具 ----------
const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isBox4 = (v) => Array.isArray(v) && v.length === 4 && v.every(isNum);
const isPoint2 = (v) => Array.isArray(v) && v.length === 2 && v.every(isNum);

// 台词：字符串、字符串数组、或按时段/等级再分一层的对象（叶子仍是字符串或字符串数组）
function checkLines(value, where, errs) {
  if (isStr(value)) return;
  if (Array.isArray(value)) {
    if (!value.every(isStr)) errs.push(`${where}: 数组里有不是字符串的台词`);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) checkLines(v, `${where}.${k}`, errs);
    return;
  }
  errs.push(`${where}: 应为字符串或字符串数组，实际是 ${value === null ? "null" : typeof value}`);
}

// sway / sitSway 条目
function checkSwayItem(item, where, errs) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errs.push(`${where}: 应为对象`);
    return;
  }
  if (!isBox4(item.box)) errs.push(`${where}.box: 应为 4 个数字的比例范围 [左,上,右,下]`);
  if (item.float !== undefined) {
    // float 写法：整块上下左右漂浮，不需要 pivot/angle
    if (!isPoint2(item.float)) errs.push(`${where}.float: 应为 2 个数字 [dx,dy]`);
  } else {
    if (!isPoint2(item.pivot)) errs.push(`${where}.pivot: 应为 2 个数字 [x,y]`);
    if (!isNum(item.angle)) errs.push(`${where}.angle: 应为数字`);
  }
  if (!isNum(item.period)) errs.push(`${where}.period: 应为数字（毫秒）`);
}

// 触摸部位条目 [名字, 范围]
function checkTouchZone(item, where, errs) {
  if (!Array.isArray(item) || item.length !== 2) {
    errs.push(`${where}: 应为 [名字, 范围] 二元组`);
    return;
  }
  if (!isStr(item[0])) errs.push(`${where}[0]: 部位名应为字符串`);
  if (!isBox4(item[1])) errs.push(`${where}[1]: 应为 4 个数字的范围`);
}

// ---------- 主流程 ----------
const { list, chars } = loadCharacters();
const problems = []; // [角色, 明细]
const notes = []; // 语音提示（不判失败）

// 名单和文件夹对得上
for (const name of list) {
  const dir = path.join(root, "characters", name);
  if (!fs.existsSync(dir)) problems.push([name, "名单里有「" + name + "」，但 characters/ 下没有这个文件夹"]);
}
for (const entry of fs.readdirSync(path.join(root, "characters"), { withFileTypes: true })) {
  if (entry.isDirectory() && !list.includes(entry.name)) {
    problems.push([entry.name, "characters/ 下有文件夹「" + entry.name + "」，但不在 index.js 名单里"]);
  }
}

for (const name of list) {
  const errs = [];
  const entry = chars[name];
  if (entry.error) {
    log(`✗ FAIL ${name}: ${entry.error}`);
    problems.push([name, entry.error]);
    continue;
  }
  const c = entry.config;

  // 公共必备
  if (c.id !== name) errs.push(`id: 应为 "${name}"，实际是 ${JSON.stringify(c.id)}`);
  if (!isStr(c.name) || !c.name) errs.push("name: 应为非空字符串");
  if (!["sprite", "live2d"].includes(c.type)) errs.push(`type: 应为 "sprite" 或 "live2d"，实际是 ${JSON.stringify(c.type)}`);
  if (!c.credit || typeof c.credit !== "object" || !isStr(c.credit.text)) errs.push("credit.text: 应为非空字符串（页面角落的版权说明）");
  if (c.lines === undefined || c.lines === null || typeof c.lines !== "object") {
    errs.push("lines: 应为台词对象");
  } else {
    for (const [k, v] of Object.entries(c.lines)) checkLines(v, `lines.${k}`, errs);
  }

  // 语音：只提示
  if (!c.voice || typeof c.voice !== "object" || !isStr(c.voice.id)) {
    notes.push(`${name}: 没有配置 voice.id（该角色不会说话）`);
  } else {
    for (const key of ["speed", "pitch"]) {
      if (c.voice[key] !== undefined && !isNum(c.voice[key])) notes.push(`${name}: voice.${key} 不是数字（不判失败）`);
    }
  }

  if (c.type === "sprite") {
    // 立绘角色
    const img = c.images;
    if (!img || typeof img !== "object") {
      errs.push("images: 立绘角色必须有 images 表");
    } else {
      if (!isStr(img.normal)) errs.push("images.normal: 必填（基础图）");
      for (const [k, p] of Object.entries(img)) {
        if (!isStr(p)) { errs.push(`images.${k}: 路径应为字符串`); continue; }
        if (!fs.existsSync(path.join(root, p))) errs.push(`images.${k}: 文件不存在 ${p}`);
      }
    }
    if (!c.outfits || typeof c.outfits !== "object" || !Object.keys(c.outfits).length) {
      errs.push("outfits: 立绘角色应至少登记一套换装");
    } else {
      for (const [k, p] of Object.entries(c.outfits)) {
        if (!isStr(p) || !fs.existsSync(path.join(root, p))) errs.push(`outfits.${k}: 文件不存在 ${p}`);
      }
    }
    if (c.outfitPoses !== undefined) {
      if (!c.outfitPoses || typeof c.outfitPoses !== "object") errs.push("outfitPoses: 应为对象");
      else
        for (const [outfit, poses] of Object.entries(c.outfitPoses)) {
          for (const [pose, p] of Object.entries(poses || {})) {
            if (!isStr(p) || !fs.existsSync(path.join(root, p))) errs.push(`outfitPoses.${outfit}.${pose}: 文件不存在 ${p}`);
          }
        }
    }
    if (!isBox4(c.faceBox)) errs.push("faceBox: 应为 4 个数字 [左,上,右,下]");
    if (c.eyeBox !== undefined && !isBox4(c.eyeBox)) errs.push("eyeBox: 应为 4 个数字");
    if (!isNum(c.scale)) errs.push("scale: 应为数字");
    if (c.sitSeat !== undefined && !isPoint2(c.sitSeat)) errs.push("sitSeat: 应为 2 个数字 [x,y]");
    if (c.sitSway !== undefined) {
      if (!Array.isArray(c.sitSway)) errs.push("sitSway: 应为数组");
      else c.sitSway.forEach((it, i) => checkSwayItem(it, `sitSway[${i}]`, errs));
    }
  } else {
    // Live2D 模型角色
    if (!isStr(c.model)) errs.push("model: 应为 model3.json 的路径字符串");
    else if (!fs.existsSync(path.join(root, c.model))) errs.push(`model: 文件不存在 ${c.model}`);
    if (!c.motions || typeof c.motions !== "object" || !Object.keys(c.motions).length) {
      errs.push("motions: 应为 { 程序动作名: 模型动作组名 } 且非空");
    } else {
      for (const [k, v] of Object.entries(c.motions)) {
        if (!isStr(v)) errs.push(`motions.${k}: 动作组名应为字符串`);
      }
    }
    if (!isStr(c.mouthParam) || !c.mouthParam) errs.push("mouthParam: 应为非空字符串（嘴巴参数名）");
  }

  // 两个类型通用的结构（有就查）
  if (c.sway !== undefined) {
    if (!Array.isArray(c.sway)) errs.push("sway: 应为数组");
    else c.sway.forEach((it, i) => checkSwayItem(it, `sway[${i}]`, errs));
  }
  if (c.touchZones !== undefined) {
    if (!Array.isArray(c.touchZones)) errs.push("touchZones: 应为数组");
    else c.touchZones.forEach((it, i) => checkTouchZone(it, `touchZones[${i}]`, errs));
  }
  if (c.moods !== undefined && (typeof c.moods !== "object" || Array.isArray(c.moods) || !c.moods)) {
    errs.push("moods: 应为对象");
  }
  if (c.states !== undefined && (typeof c.states !== "object" || Array.isArray(c.states) || !c.states)) {
    errs.push("states: 应为对象");
  }

  if (errs.length) {
    log(`✗ FAIL ${name}（${c.type || "类型未知"}）`);
    for (const e of errs) {
      log(`    - ${e}`);
      problems.push([name, e]);
    }
  } else {
    log(`✓ PASS ${name}（${c.type}）`);
  }
}

// ---------- 汇总 ----------
log("\n===== 角色包校验汇总 =====");
log(`共 ${list.length} 个角色，FAIL ${new Set(problems.map((p) => p[0])).size} 个，问题 ${problems.length} 条`);
if (notes.length) {
  log("\n语音提示（不影响结果）:");
  for (const n of notes) log("  " + n);
}
log(problems.length ? "\n结论: 角色包有问题" : "\n结论: 全部通过");
process.exit(problems.length ? 1 : 0);
