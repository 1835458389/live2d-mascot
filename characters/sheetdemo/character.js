// =====================================================================
// 测试角色：sheetdemo（精灵图格式演示用）
// 本角色是「支持精灵图格式」的示例素材，验证图集写法用，正式角色勿仿。
// 立绘来自 claude 角色的同一批图（用户用 ChatGPT 生成，外观参考画师
// ZipZipPipe 的 AI 娘设计。同人角色，与 Anthropic 官方无关，仅供个人使用），
// 由 工具/造精灵图示例.mjs 拼成 models/sheetdemo/sheet/ 下的图集。
// =====================================================================
(window.Live2DMascotCharacters = window.Live2DMascotCharacters || {}).sheetdemo = {
  id: "sheetdemo",
  name: "精灵图演示",
  type: "sprite",

  // 图集表：大图 + 索引 JSON（索引里的 image 字段指向大图，这里显式写 index）
  sheets: {
    main:    { image: "models/sheetdemo/sheet/faces.png", index: "models/sheetdemo/sheet/faces.json" },
    poses:   { image: "models/sheetdemo/sheet/poses.png", index: "models/sheetdemo/sheet/poses.json" },
    pajamas: { image: "models/sheetdemo/sheet/outfits/pajamas.png", index: "models/sheetdemo/sheet/outfits/pajamas.json" },
  },

  images: {
    // 网格简写帧（索引里 frames 是 [列, 行]）
    normal:    { sheet: "main", frame: "normal" },
    blink:     { sheet: "main", frame: "blink" },
    talk:      { sheet: "main", frame: "talk" },
    happy:     { sheet: "main", frame: "happy" },
    shy:       { sheet: "main", frame: "shy" },
    angry:     { sheet: "main", frame: "angry" },
    surprised: { sheet: "main", frame: "surprised" },
    // 裁剪帧（索引里带 ox/oy，切帧时会贴回标准尺寸画布）
    sleepy:    { sheet: "main", frame: "sleepy" },
    // 贴片帧（索引里 kind: "patch"；kind 也可以写在引用上，引用优先）
    lookLeft:  { sheet: "main", frame: "eyes:lookLeft", kind: "patch" },
    lookRight: { sheet: "main", frame: "eyes:lookRight", kind: "patch" },
    halfBlink: { sheet: "main", frame: "face:halfBlink", kind: "patch" },
    // 姿势帧：frame 省略时默认取条目自己的键名；索引里已标 kind: "pose"
    sit:   { sheet: "poses" },
    sleep: { sheet: "poses" },
    climb: { sheet: "poses" },
    climb2:{ sheet: "poses" },
    wave1: { sheet: "poses" },
    wave2: { sheet: "poses" },
    held:  { sheet: "poses" },
    sulk:  { sheet: "poses" },
  },

  // 换装：pajamas 走图集（frame 省略默认取 normal 帧）；
  // winter 故意保留老写法（单独文件），演示精灵图和分开图可以在同一个角色里混用。
  outfits: {
    pajamas: { sheet: "pajamas" },
    winter:  "models/claude/outfit_winter.png",
  },
  outfitPoses: {
    pajamas: {
      held:  { sheet: "pajamas", frame: "held" },
      wave1: { sheet: "pajamas", frame: "wave1" },
      wave2: { sheet: "pajamas", frame: "wave2" },
    },
    winter: {
      held: "models/claude/winter/held.png",
    },
  },

  backgroundTolerance: 24,

  // 以下框全部按图片宽高的比例写，和用不用图集无关（图集切帧后会还原成标准整身画布）
  faceBox: [0.375, 0.025, 0.595, 0.195],
  eyeBox: [0.37, 0.045, 0.6, 0.135],
  sitSeat: [0.52, 0.54],
  sitSway: [
    { box: [0.38, 0.56, 0.53, 1.02], pivot: [0.47, 0.55], angle: 4, period: 1700, lag: 0.2, feather: 0.25 },
    { box: [0.53, 0.56, 0.7, 1.02], pivot: [0.57, 0.55], angle: 4, period: 1700, phase: 3.14, lag: 0.2, feather: 0.25 },
  ],
  headBox: [0.33, 0, 0.66, 0.2],
  touchZones: [
    ["book", [0.51, 0.21, 0.65, 0.31]],
    ["hand", [0.43, 0.27, 0.6, 0.37]],
    ["chest", [0.39, 0.18, 0.52, 0.27]],
    ["foot", [0.37, 0.86, 0.57, 0.99]],
    ["leg", [0.42, 0.77, 0.56, 0.86]],
  ],
  scale: 0.9,

  sway: [
    { box: [-0.05, 0.28, 0.3, 0.56], pivot: [0.32, 0.16], angle: 4, period: 3600, lag: 1 },
    { box: [0.7, 0.28, 1.05, 0.58], pivot: [0.68, 0.16], angle: -4, period: 3600, phase: 1.2, lag: 1 },
    { box: [-0.05, 0.6, 0.38, 1.05], pivot: [0.4, 0.42], angle: 2.5, period: 2800, lag: 0.6 },
    { box: [0.6, 0.6, 1.05, 1.05], pivot: [0.6, 0.42], angle: 2.5, period: 2800, phase: 0.8, lag: 0.6 },
  ],

  credit: {
    text: "精灵图演示（测试角色）",
    title: "立绘由用户使用 ChatGPT 生成，外观参考画师 ZipZipPipe 的 AI 娘设计。同人角色，与 Anthropic 官方无关，仅供个人使用。仅用于验证精灵图加载格式。",
  },

  moods: {
    happy: { tilt: -1.5 },
    shy: { tilt: -2, face: "shy" },
    angry: { shake: 0.25, face: "angry" },
    dizzy: { wobble: 1, face: "sleepy" },
    surprised: { jump: 0.5, face: "surprised" },
    sleepy: { sink: 1, face: "sleepy" },
  },
  states: {
    thinking: { tilt: 3 },
  },

  thinkingText: "（让我想一想……）",
  lines: {
    greeting: {
      morning: ["测试角色上线。精灵图加载正常的话，我现在就是一张拼图拼出来的。"],
      night: ["深夜还在调图集？……辛苦了。"],
    },
    switchIn: ["精灵图演示角色，前来报到。", "我是一张大图切出来的，别戳散了。"],
    tap: [
      "戳吧。图集里十四帧任你戳。",
      "我是从 faces.png 里切出来的。",
      "坐标都在索引 JSON 里写着呢。",
    ],
    idle: ["人呢？……我去图集第 0 行第 3 列待着。"],
  },
  reactions: {
    tap: { think: 0.2 },
  },
};
