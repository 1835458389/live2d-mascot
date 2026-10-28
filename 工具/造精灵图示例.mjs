// 造精灵图示例（测试角色 sheetdemo 专用）。
// 零依赖 Node 脚本：手写 PNG 解码（zlib inflate + 逐行还原滤波）+ 手写 PNG 编码（RGBA8 + deflate），
// 把 models/claude/ 的单张图拼成 models/sheetdemo/sheet/ 下的图集 + 索引 JSON。
// 用法：node 工具/造精灵图示例.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "models", "claude");
const DST = path.join(ROOT, "models", "sheetdemo", "sheet");

// ---------- 最小 PNG 解码 ----------
function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("不是 PNG：" + file);
  let pos = 8, w = 0, h = 0, depth = 8, colorType = 6;
  let plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9];
    } else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
    if (type === "IEND") break;
  }
  if (depth !== 8 && depth !== 16) throw new Error("不支持的位深 " + depth);
  const step = depth === 16 ? 2 : 1;
  const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bpp = bppMap[colorType] * step;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const lines = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      if (step === 2) line[x] = line[x]; // 16 位时下面取值只取高字节
    }
    lines.push(line);
    prev = line;
  }
  // 转成 RGBA8
  const rgba = Buffer.alloc(w * h * 4);
  const get = (line, i) => line[i * step];
  for (let y = 0; y < h; y++) {
    const line = lines[y];
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      let r = 0, g = 0, b = 0, a = 255;
      if (colorType === 6) { r = get(line, x * 4); g = get(line, x * 4 + 1); b = get(line, x * 4 + 2); a = get(line, x * 4 + 3); }
      else if (colorType === 2) { r = get(line, x * 3); g = get(line, x * 3 + 1); b = get(line, x * 3 + 2); }
      else if (colorType === 4) { const v = get(line, x * 2); r = g = b = v; a = get(line, x * 2 + 1); }
      else if (colorType === 0) { r = g = b = get(line, x); }
      else if (colorType === 3) {
        const idx = get(line, x);
        r = plte[idx * 3]; g = plte[idx * 3 + 1]; b = plte[idx * 3 + 2];
        if (trns && idx < trns.length) a = trns[idx];
      }
      if (trns && colorType === 2 && r === trns[0] && g === trns[1] && b === trns[2]) a = 0;
      if (trns && colorType === 0 && r === trns[1]) a = 0;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    }
  }
  return { w, h, rgba };
}

// ---------- 最小 PNG 编码（RGBA8） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 位 RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function blit(atlas, aw, img, dx, dy) {
  for (let y = 0; y < img.h; y++) {
    const src = y * img.w * 4;
    const dst = ((dy + y) * aw + dx) * 4;
    img.rgba.copy(atlas, dst, src, src + img.w * 4);
  }
}
function crop(img, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let yy = 0; yy < h; yy++) {
    const src = ((y + yy) * img.w + x) * 4;
    img.rgba.copy(out, yy * w * 4, src, src + w * 4);
  }
  return { w, h, rgba: out };
}
function pad(n) { return Math.round(n); }

// ---------- 拼图 ----------
fs.mkdirSync(DST, { recursive: true });
fs.mkdirSync(path.join(DST, "outfits"), { recursive: true });

const load = (f) => decodePng(path.join(SRC, f));
// claude 的框（比例制）换算成像素
const FB = [0.375, 0.025, 0.595, 0.195].map((v, i) => pad(v * (i % 2 ? 1536 : 1024)));
const EB = [0.37, 0.045, 0.6, 0.135].map((v, i) => pad(v * (i % 2 ? 1536 : 1024)));

// ===== faces.png：上面 4×2 网格（整身表情），下面是贴片区和裁剪帧 =====
const FW = 1024, FH = 1536, COLS = 4;
const gridNames = [
  ["normal", "blink", "talk", "happy"],
  ["shy", "angry", "surprised", null], // [3,1] 留空，sleepy 用下方的裁剪帧演示 ox/oy
];
const patches = [
  ["face:happy", "happy", FB],
  ["face:shy", "shy", FB],
  ["face:angry", "angry", FB],
  ["eyes:lookLeft", "look_left", EB],
  ["eyes:lookRight", "look_right", EB],
  ["face:halfBlink", "half_blink", EB],
];
const patchW = Math.max(...patches.map((p) => p[2][2] - p[2][0]));
const patchH = Math.max(...patches.map((p) => p[2][3] - p[2][1]));
const patchY = 2 * FH + 40;                 // 贴片区起始
const sleepyY = patchY + patchH + 40;       // 裁剪帧起始
const sleepy = load("sleepy.png");
const sleepyRect = { x: FB[0] - 24, y: FB[1] - 24, w: FB[2] - FB[0] + 48, h: FB[3] - FB[1] + 48 };
const atlasH = sleepyY + sleepyRect.h + 10;
const atlas = { w: COLS * FW, h: atlasH, rgba: Buffer.alloc(COLS * FW * atlasH * 4) };

const frames = {};
for (let r = 0; r < gridNames.length; r++) {
  for (let c = 0; c < COLS; c++) {
    const name = gridNames[r][c];
    if (!name) continue;
    blit(atlas.rgba, atlas.w, load(name + ".png"), c * FW, r * FH);
    frames[name] = [c, r];
  }
}
patches.forEach(([name, file, box], i) => {
  const x = 20 + i * (patchW + 20), y = patchY;
  blit(atlas.rgba, atlas.w, crop(load(file + ".png"), box[0], box[1], box[2] - box[0], box[3] - box[1]), x, y);
  frames[name] = { x, y, w: box[2] - box[0], h: box[3] - box[1], kind: "patch" };
});
blit(atlas.rgba, atlas.w, crop(sleepy, sleepyRect.x, sleepyRect.y, sleepyRect.w, sleepyRect.h), 20, sleepyY);
frames.sleepy = { x: 20, y: sleepyY, w: sleepyRect.w, h: sleepyRect.h, ox: sleepyRect.x, oy: sleepyRect.y };

fs.writeFileSync(path.join(DST, "faces.png"), encodePng(atlas.w, atlas.h, atlas.rgba));
fs.writeFileSync(path.join(DST, "faces.json"), JSON.stringify({
  image: "faces.png",
  size: { w: FW, h: FH },
  grid: { columns: COLS },
  frames,
}, null, 2));
console.log(`faces.png  ${atlas.w}x${atlas.h}  帧：${Object.keys(frames).length} 个`);

// ===== poses.png：2 列网格，索引里写 kind: "pose" =====
const poseNames = ["sit", "sleep", "climb", "climb2", "wave1", "wave2", "held", "sulk"];
const pCols = 2, pRows = Math.ceil(poseNames.length / pCols);
const patlas = { w: pCols * FW, h: pRows * FH, rgba: Buffer.alloc(pCols * FW * pRows * FH * 4) };
const pframes = {};
poseNames.forEach((name, i) => {
  const c = i % pCols, r = Math.floor(i / pCols);
  blit(patlas.rgba, patlas.w, load(name + ".png"), c * FW, r * FH);
  pframes[name] = { x: c * FW, y: r * FH, w: FW, h: FH, kind: "pose" };
});
fs.writeFileSync(path.join(DST, "poses.png"), encodePng(patlas.w, patlas.h, patlas.rgba));
fs.writeFileSync(path.join(DST, "poses.json"), JSON.stringify({
  image: "poses.png",
  size: { w: FW, h: FH },
  grid: { columns: pCols },
  frames: pframes,
}, null, 2));
console.log(`poses.png  ${patlas.w}x${patlas.h}  帧：${Object.keys(pframes).length} 个`);

// ===== outfits/pajamas.png：换装图集（normal + 换装姿势） =====
const outNames = [["normal", "outfit_pajamas.png"], ["held", "pajamas/held.png"], ["wave1", "pajamas/wave1.png"], ["wave2", "pajamas/wave2.png"]];
const oCols = 2, oRows = 2;
const oatlas = { w: oCols * FW, h: oRows * FH, rgba: Buffer.alloc(oCols * FW * oRows * FH * 4) };
const oframes = {};
outNames.forEach(([name, file], i) => {
  const c = i % oCols, r = Math.floor(i / oCols);
  blit(oatlas.rgba, oatlas.w, decodePng(path.join(SRC, file)), c * FW, r * FH);
  oframes[name] = [c, r];
});
fs.writeFileSync(path.join(DST, "outfits", "pajamas.png"), encodePng(oatlas.w, oatlas.h, oatlas.rgba));
fs.writeFileSync(path.join(DST, "outfits", "pajamas.json"), JSON.stringify({
  image: "pajamas.png",
  size: { w: FW, h: FH },
  grid: { columns: oCols },
  frames: oframes,
}, null, 2));
console.log(`outfits/pajamas.png  ${oatlas.w}x${oatlas.h}  帧：${Object.keys(oframes).length} 个`);
console.log("完成。素材在 models/sheetdemo/sheet/ 下。");
