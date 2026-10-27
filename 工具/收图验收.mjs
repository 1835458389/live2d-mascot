// =====================================================================
// 收图验收：接住 GPT 交回的换装姿势图，帮人快速逐张验收，再一键装入项目。
//
// 用法（一般直接双击项目根目录的「双击收图验收.bat」）：
//   node 工具/收图验收.mjs                     收图 → 生成验收页 → 打开浏览器
//   node 工具/收图验收.mjs 装入 验收结果.json     把标了「通过」的图拷进 models/
//                                               并登记到角色包的 outfitPoses
//
// 收图的两个来源：
//   1. 互助文件夹的交付目录（按名字自动找，见下面 deliveryDirs），脚本会自动复制过来；
//   2. 自己把图丢进项目里的「收图」文件夹，结构照旧：收图/角色名/pajamas|winter/文件名.png
//      文件名和底图同名（wave1.png、sit.png……）。
//
// 装入会做三件事（都在本项目里，不动原项目）：
//   拷贝 收图/角色/衣服/x.png → models/角色/衣服/x.png
//   重写 characters/角色/character.js 的 outfitPoses（以 models 里的文件为准，改前有备份）
//   提示走路图目前停用（角色包里已注释），登记了也不会显示
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DROP = path.join(ROOT, "收图");
const PAGE = path.join(DROP, "验收.html");
const PORT = 8163;
// 交付目录按名字自动找：互助文件夹顶层和「看板娘」项目文件夹下，
// 任何 GPT_日期[_批次]_成品_看板娘换装姿势* 形状的文件夹都收（每批一个目录也没关系）。
const HELP_ROOTS = ["D:\\AI 互助文件夹", "D:\\AI 互助文件夹\\看板娘"];
function deliveryDirs() {
  const found = [];
  for (const root of HELP_ROOTS) {
    try {
      for (const name of fs.readdirSync(root)) {
        const p = path.join(root, name);
        if (/^GPT_\d{8}_成品_看板娘换装姿势/.test(name)) {
          try { if (fs.statSync(p).isDirectory()) found.push(p); } catch {}
        }
      }
    } catch {} // 根目录不存在就跳过
  }
  return found;
}

const ROLES = ["claude", "gpt", "deepseek"];           // 有换装的三位 AI 娘
const OUTFITS = ["pajamas", "winter"];
const PAIR_NAMES = new Set(["walk1", "walk2", "wave1", "wave2", "drink1", "drink2",
  "act1", "act2", "cheer1", "cheer2", "climb", "climb2"]);
// 底图姿态键和文件名的对应（多数同名，个别带下划线转驼峰）
const poseKeyFor = (file) => {
  const stem = file.replace(/\.png$/i, "");
  const camel = stem.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return { stem, key: camel };
};

function pngSize(file) {
  const fd = fs.openSync(file, "r");
  try {
    const b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0);
    if (b.readUInt32BE(12) !== 0x49484452) return null; // IHDR
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } finally { fs.closeSync(fd); }
}
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
// 大小相同不代表内容相同：返工稿完全可能与旧稿同字节数，收没收到一律按内容哈希判断。
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// ---------- 第一步：从互助文件夹收图 ----------
// 纯扫描：所有交付目录聚合成候选（带内容哈希，不写任何文件）。gather 和 install 共用。
function scanCandidates() {
  const cands = new Map(); // "角色/衣服/文件" -> [{ src, dir, hash }]
  for (const dir of deliveryDirs()) {
    for (const role of fs.readdirSync(dir)) {
      if (!ROLES.includes(role)) continue;
      for (const outfit of OUTFITS) {
        const srcDir = path.join(dir, role, outfit);
        if (!exists(srcDir)) continue;
        for (const f of fs.readdirSync(srcDir)) {
          if (!/\.png$/i.test(path.extname(f))) continue;
          const key = [role, outfit, f].join("/");
          let list = cands.get(key);
          if (!list) cands.set(key, (list = []));
          const src = path.join(srcDir, f);
          list.push({ src, dir: path.basename(dir), hash: sha256(src) });
        }
      }
    }
  }
  return cands;
}
// 收图：内容一致的多来源合并；内容冲突的不收（列出来让人选稿），绝不按遍历顺序静默覆盖。
function gather() {
  const cands = scanCandidates();
  const out = { copied: 0, revised: [], conflicts: [] };
  for (const [key, list] of cands) {
    const hashes = list.map((c) => c.hash);
    if (hashes.some((h) => h !== hashes[0])) {
      out.conflicts.push({ key, sources: list.map((c) => ({ dir: c.dir, hash: c.hash })) });
      continue;
    }
    const dst = path.join(DROP, ...key.split("/"));
    const digest = hashes[0];
    if (exists(dst)) {
      if (sha256(dst) === digest) continue; // 同一稿已经收过
      out.revised.push(key); // 换了新稿：收进来重新验收
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(list[0].src, dst);
    out.copied++;
  }
  return out;
}

// ---------- 第二步：清点收图文件夹 ----------
// conflicts 来自 gather()：键 = 角色/衣服/文件。冲突时看收图里这份内容属于哪个来源：
// 对得上某个来源 = 已选稿（照常验收）；对不上 = 冲突待选（页面锁定判定，装入也会拒绝）。
function collect(conflicts = []) {
  const conflictMap = new Map(conflicts.map((c) => [c.key, c.sources]));
  const items = [], strays = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.png$/i.test(f.name)) {
        const rel = path.relative(DROP, p).split(path.sep);
        if (rel.length === 3 && ROLES.includes(rel[0]) && OUTFITS.includes(rel[1])) {
          const { stem, key } = poseKeyFor(rel[2]);
          const base = path.join("models", rel[0], stem + ".png");
          const baseAbs = path.join(ROOT, base);
          const baseSize = exists(baseAbs) ? pngSize(baseAbs) : null;
          const newSize = pngSize(p);
          const hash = sha256(p);
          const installedAt = path.join("models", rel[0], rel[1], rel[2]);
          const installedAbs = path.join(ROOT, installedAt);
          const charFile = path.join(ROOT, "characters", rel[0], "character.js");
          const charText = exists(charFile) ? fs.readFileSync(charFile, "utf8") : "";
          // 已装入 = models 里不但有这个文件，内容也得就是收来的这一稿
          const installed = exists(installedAbs) && sha256(installedAbs) === hash;
          const item = {
            char: rel[0], outfit: rel[1], pose: key, stem, hash,
            file: ["收图", rel[0], rel[1], rel[2]].join("/"),
            base: base.split(path.sep).join("/"), baseOk: !!baseSize,
            newW: newSize?.w, newH: newSize?.h, baseW: baseSize?.w, baseH: baseSize?.h,
            installed,
            registered: charText.includes(installedAt.split(path.sep).join("/")),
          };
          const srcs = conflictMap.get([rel[0], rel[1], rel[2]].join("/"));
          if (srcs) {
            const chosen = srcs.find((s) => s.hash === hash);
            if (chosen) item.picked = chosen.dir; // 收图这份就是某来源的稿：已选稿
            else {
              item.conflict = true; // 收图里是过期/来历不明的旧稿：待选
              item.conflictSources = srcs.map((s) => ({ dir: s.dir, hash: s.hash.slice(0, 8) }));
            }
          }
          items.push(item);
        } else strays.push(path.relative(DROP, p));
      }
    }
  };
  if (exists(DROP)) walk(DROP);
  return { items, strays };
}

// ---------- 第三步：生成验收页 ----------
function buildPage(items) {
  const tpl = fs.readFileSync(path.join(ROOT, "工具", "验收页模板.html"), "utf8");
  const html = tpl.replace("/*__INDEX__*/[]", () => JSON.stringify(items));
  fs.mkdirSync(DROP, { recursive: true });
  fs.writeFileSync(PAGE, html);
}

// ---------- 打开浏览器（带上小服务器，本地才读得到图） ----------
async function openPage() {
  const url = `http://127.0.0.1:${PORT}/收图/验收.html`;
  const up = await fetch(`http://127.0.0.1:${PORT}/`).then(() => true, () => false);
  if (!up) {
    spawn(process.execPath, [path.join(ROOT, "serve.mjs")], {
      cwd: ROOT, detached: true, stdio: "ignore",
      env: { ...process.env, PORT: String(PORT) },
    }).unref();
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await fetch(`http://127.0.0.1:${PORT}/`).then(() => true, () => false)) break;
    }
  }
  spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  console.log("验收页：" + url);
  console.log("（看完关掉浏览器就行，服务器窗口可以留在后台，下次自动复用。）");
}

// ---------- 装入：拷图 + 重写 outfitPoses ----------
function outfitPosesBlock(installed) {
  // installed: { pajamas: [{key, file}, ...], winter: [...] }（key 是姿态键，file 是不含扩展名的文件名，按名字排）
  const body = (outfit) => {
    const list = installed[outfit] || [];
    if (!list.length) return "    " + outfit + ": {},";
    return "    " + outfit + ": {\n" +
      list.map((e) => `      "${e.key}": "models/{{ROLE}}/${outfit}/${e.file}.png",`).join("\n") + "\n    },";
  };
  return "\n  // 换装姿势图：由「收图验收」工具按 models/{{ROLE}}/<衣服>/ 里的文件登记，装入时会整段重写；\n" +
    "  // 手工登记的图只要文件放在 models 里，重写时也会被带上。\n  outfitPoses: {\n" +
    body("pajamas") + "\n" + body("winter") + "\n  },";
}

function install(jsonPath) {
  const verdicts = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const rows = verdicts.结果 || [];
  let copied = 0, skipped = 0, refused = 0;
  // 冲突守卫：装入前重新扫一遍交付来源，冲突未选稿的一律拒绝
  const candMap = scanCandidates();
  const byRole = {};
  for (const row of rows) {
    const rel = String(row.文件 || "").split("/");
    if (rel.length !== 4 || rel[0] !== "收图") {
      console.log("  跳过一条看不懂的结果：" + row.文件);
      continue;
    }
    if (row.判定 !== "pass") { if (row.判定 === "fail") skipped++; continue; }
    const src = path.join(ROOT, ...rel);
    // 版本绑定：结果里必须带验收时的内容哈希，且和现在收图里的这稿一致；旧结果（无哈希）或换过稿都拒绝
    const cur = exists(src) ? sha256(src) : null;
    if (!cur || typeof row.哈希 !== "string" || row.哈希 !== cur) {
      console.log(`  拒绝装入 ${rel[1]}/${rel[2]}/${rel[3]}：验收结果没带哈希，或和当前收图内容不符，请重新验收`);
      refused++;
      continue;
    }
    const srcs = candMap.get([rel[1], rel[2], rel[3]].join("/"));
    if (srcs && new Set(srcs.map((s) => s.hash)).size > 1 && !srcs.some((s) => s.hash === cur)) {
      console.log(`  拒绝装入 ${rel[1]}/${rel[2]}/${rel[3]}：交付来源仍在冲突而收图这份不是其中任何一稿，请先明确选稿`);
      refused++;
      continue;
    }
    const dst = path.join(ROOT, "models", rel[1], rel[2], rel[3]);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++;
    (byRole[rel[1]] = byRole[rel[1]] || { pajamas: 0, winter: 0 })[rel[2]]++;
    console.log(`  装入 ${rel[1]}/${rel[2]}/${rel[3]}`);
  }
  // 以 models 里实际存在的文件为准，重写各角色 outfitPoses
  for (const role of ROLES) {
    const dir = path.join(ROOT, "models", role);
    if (!exists(dir)) continue;
    const installed = { pajamas: [], winter: [] };
    let has = false;
    for (const outfit of OUTFITS) {
      const d = path.join(dir, outfit);
      if (!exists(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (!/\.png$/i.test(f)) continue;
        installed[outfit].push({ key: poseKeyFor(f).key, file: f.replace(/\.png$/i, "") });
        has = true;
      }
      installed[outfit].sort((a, b) => a.file.localeCompare(b.file));
    }
    if (!has && !byRole[role]) continue;
    const charFile = path.join(ROOT, "characters", role, "character.js");
    if (!exists(charFile)) continue;
    let text = fs.readFileSync(charFile, "utf8");
    const block = outfitPosesBlock(installed).replaceAll("{{ROLE}}", role);
    let next;
    if (/^ {2}\/\/ 换装姿势图：由「收图验收」工具[\s\S]*?\n {2}\},$/m.test(text)) {
      next = text.replace(/^ {2}\/\/ 换装姿势图：由「收图验收」工具[\s\S]*?\n {2}\},$/m, block.trim());
    } else if (/^ {2}outfits: \{[^\n]*\},$/m.test(text)) {
      next = text.replace(/^( {2}outfits: \{[^\n]*\},)$/m, "$1\n" + block.trim());
    } else {
      console.log(`  ${role}: 没找到 outfits 行， outfitPoses 没写入，请手工登记`);
      continue;
    }
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const bak = charFile + ".备份" + stamp;
    if (!exists(bak)) fs.copyFileSync(charFile, bak);
    fs.writeFileSync(charFile, next);
    console.log(`  ${role}: outfitPoses 登记 ${installed.pajamas.length + installed.winter.length} 条（睡衣 ${installed.pajamas.length}，冬装 ${installed.winter.length}）`);
  }
  console.log(`\n装好了 ${copied} 张${skipped ? `，退回 ${skipped} 张没有装` : ""}${refused ? `，拒绝 ${refused} 张（版本或选稿未确认）` : ""}。`);
  console.log("桌面宠物和网页都要重新打开才会用上新图。");
  console.log("走路图（walk1/walk2）目前停用：角色包里已注释，登记了也不会显示。");
}

// ---------- 主流程 ----------
const [cmd, arg] = process.argv.slice(2);
if (cmd === "装入") {
  if (!arg || !exists(arg)) { console.log("找不到验收结果文件：" + (arg || "（没给）")); process.exit(1); }
  install(arg);
} else {
  const { copied, revised, conflicts } = gather();
  if (copied) console.log(`从互助文件夹收了 ${copied} 张新图。`);
  if (revised.length) console.log(`注意：这 ${revised.length} 张换了新稿（内容变了），旧判定已失效，需要重新验收：\n  ` + revised.join("\n  "));
  if (conflicts.length) {
    console.log(`\n有 ${conflicts.length} 张图在不同的交付目录里内容不一样，已跳过、没有乱收。`);
    console.log("各来源都保留不动；请明确选稿：把选中的那张复制进 收图\\角色\\衣服\\ 覆盖旧文件，再跑一次本工具：");
    for (const c of conflicts) console.log(`  ${c.key}：来自 ` + c.sources.map((s) => `${s.dir}（${s.hash.slice(0, 8)}）`).join("、"));
  }
  const { items, strays } = collect(conflicts);
  if (strays.length) console.log("这些文件不在 角色/衣服/ 文件名 的结构里，验收页看不到：\n  " + strays.join("\n  "));
  buildPage(items);
  const locked = items.filter((i) => i.conflict).length;
  const picked = items.filter((i) => i.picked).length;
  console.log(`\n收图文件夹里共 ${items.length} 张待验收（${items.filter((i) => i.installed).length} 张内容一致的已装入过` +
    (locked ? `，${locked} 张冲突待选` : "") + (picked ? `，${picked} 张已选稿` : "") + `）。`);
  await openPage();
  console.log("\n验收完在页面上下载「验收结果.json」，然后运行：");
  console.log("  node 工具/收图验收.mjs 装入 验收结果.json");
}
