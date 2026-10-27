/*!
 * Live2D floating mascot widget — drop-in embed.
 *
 * Usage (one line, defaults to bottom-right):
 *   <script src="https://your-host/widget.js"></script>
 * Upload widget.js together with the characters/, vendor/ and models/
 * folders next to it; everything is loaded relative to widget.js.
 *
 * Configure via data-attributes on the script tag:
 *   <script src="widget.js" data-position="bottom-left" data-scale="0.8" data-character="mao"></script>
 * ...or a global object set BEFORE this script tag runs:
 *   <script>window.LIVE2D_MASCOT_CONFIG = { position: 'bottom-right', scale: 1 };</script>
 * Viewers can override character/size/walking/reminders from the in-widget
 * settings panel; those choices are remembered in the viewer's browser.
 *
 * Characters are packs in characters/<id>/character.js (model, moods, mouth
 * parameter, motions, lines, credit). The widget only talks to a small
 * character interface, so a sprite-based renderer can slot in next to the
 * Live2D one. Sample characters are Live2D's official samples (Free Material
 * License); each pack carries its own required credit.
 *
 * Design notes:
 * - Everything lives in a Shadow DOM root so ids/classes/styles can never
 *   collide with the host page.
 * - The canvas spans the full viewport but is ALWAYS `pointer-events: none`.
 *   Gaze, tap, pat and drag are driven from window-level listeners that do
 *   their own hit-testing, so the host page is unaffected everywhere except
 *   on her own body.
 * - Every reaction (tap, pat, reminders, external triggers) goes through one
 *   event -> reaction table, which characters can override.
 * - Moods only blend the model's own built-in parameters at runtime; the
 *   character designs themselves are never altered, as Live2D's sample terms
 *   require.
 */
(function () {
  if (window.__live2dMascotLoaded) return;
  window.__live2dMascotLoaded = true;

  const CURRENT_SCRIPT = document.currentScript;
  const BASE_URL = (CURRENT_SCRIPT && CURRENT_SCRIPT.src) || document.baseURI;
  const local = (rel) => new URL(rel, BASE_URL).href;

  const PIXI_URL = local("vendor/pixi.min.js");
  const CUBISM_CORE_URL = local("vendor/live2dcubismcore.min.js");
  const CUBISM4_URL = local("vendor/cubism4.min.js");
  const CHARACTER_LIST_URL = local("characters/index.js");
  const DEFAULT_LINES_URL = local("characters/default-lines.js");
  const characterUrl = (id) => local(`characters/${id}/character.js`);

  const SETTINGS_KEY = "live2d-mascot-settings";
  const IDLE_PROMPT_MS = 3 * 60 * 1000;
  const AWAY_MS = 5 * 60 * 1000;
  const CHAR_MS = 70;
  const CHATTER_MINUTES = { rare: 10, normal: 4, chatty: 1.5 };

  // Used when the lines files are missing or a group was edited into something unusable.
  const FALLBACK_LINES = {
    tap: ["你好呀～"],
    tapHead: ["唔～"],
    pat: ["嘿嘿～"],
    tooManyTaps: ["别点啦！"],
    dragStart: ["哇！"],
    dragEnd: ["呼……"],
    idle: ["你还在吗？"],
    welcomeBack: ["欢迎回来～"],
    restore: ["我回来啦！"],
    switchIn: ["换我上场啦！"],
    hourly: ["现在是{时间}整。"],
    lunch: ["{时间}了，该吃午饭啦！"],
    dinner: ["{时间}了，该吃晚饭啦！"],
    lateNight: ["{时间}半了，早点睡吧。"],
    rest: ["休息一下吧！"],
    chatter: ["……"],
    walk: ["散散步～"],
    greeting: ["你好！"],
    climb: ["嘿咻！"],
    fall: ["哇啊——！"],
    land: ["呼……安全着陆。"],
    sulky: ["哼……"],
    tapSulky: ["哼。"],
    makeUp: ["……好吧。"],
    peek: ["嘿。"],
    appLong: ["休息一下吧。"],
  };

  // event -> how she reacts. Characters may override any entry via `reactions`.
  // priority: higher interrupts lower; chance: probability the reaction fires;
  // moodRules: switch mood when the picked line matches a pattern;
  // think: probability of showing the character's thinkingText (in the
  // "thinking" state) for thinkMs before the line.
  const DEFAULT_REACTIONS = {
    greeting: { mood: "happy", priority: 2 },
    switchIn: { mood: "happy", priority: 3 },
    tap: { mood: "happy", motion: "tap", priority: 2 },
    tapHead: { mood: "happy", motion: "tap", priority: 2 },
    pat: { mood: "shy", priority: 2 },
    tooManyTaps: { mood: "angry", motion: "tap", priority: 3, moodRules: [{ match: "晕|圈", mood: "dizzy" }] },
    dragStart: { mood: "surprised", priority: 3 },
    dragEnd: { mood: "happy", priority: 3 },
    idle: { mood: "sleepy", priority: 1 },
    welcomeBack: { mood: "happy", priority: 2 },
    restore: { mood: "happy", priority: 2 },
    hourly: { priority: 2 },
    lunch: { mood: "happy", priority: 2 },
    dinner: { mood: "happy", priority: 2 },
    lateNight: { mood: "sleepy", priority: 2 },
    rest: { mood: "happy", priority: 3 },
    chatter: { priority: 0 },
    walk: { priority: 0, chance: 0.35 },
    climb: { mood: "happy", priority: 1, chance: 0.6 },
    fall: { mood: "surprised", priority: 3 },
    land: { mood: "dizzy", priority: 3 },
    sulky: { mood: "angry", priority: 1 },
    touchHand: { mood: "shy", priority: 2 },
    reminderSet: { mood: "happy", priority: 3 },
    helpIntro: { mood: "happy", priority: 3 },
    outfitChange: { mood: "shy", priority: 3 },
    sleepTalk: { priority: 2 },
    bedtime: { mood: "sleepy", priority: 3 },
    actionNo: { priority: 3 },
    reminderNoTime: { priority: 3 },
    reminderNone: { priority: 3 },
    reminderList: { priority: 3 },
    reminderCancel: { priority: 3 },
    reminderDue: { mood: "surprised", priority: 4 },
    reminderLate: { mood: "shy", priority: 4 },
    focusStart: { mood: "happy", priority: 3 },
    focusTap: { priority: 2 },
    focusDone: { mood: "happy", priority: 4 },
    focusStop: { priority: 3 },
    rpsStart: { mood: "happy", priority: 3 },
    rpsRock: { priority: 3 },
    rpsScissors: { priority: 3 },
    rpsPaper: { priority: 3 },
    rpsWin: { mood: "happy", priority: 3 },
    rpsLose: { mood: "angry", priority: 3 },
    rpsDraw: { mood: "surprised", priority: 3 },
    coinHeads: { priority: 3 },
    coinTails: { priority: 3 },
    choiceIntro: { priority: 3 },
    riddleAsk: { mood: "happy", priority: 3 },
    riddleRight: { mood: "surprised", priority: 3 },
    riddleWrong: { priority: 3 },
    riddleGiveUp: { mood: "happy", priority: 3 },
    anniv7: { mood: "shy", priority: 3 },
    anniv30: { mood: "shy", priority: 3 },
    anniv100: { mood: "shy", priority: 3 },
    anniv365: { mood: "shy", priority: 3 },
    birthday: { mood: "happy", priority: 3 },
    touchLeg: { mood: "surprised", priority: 2 },
    touchFoot: { mood: "happy", motion: "tap", priority: 2 },
    touchChest: { mood: "shy", priority: 2 },
    touchChestTease: { mood: "shy", priority: 2 },
    touchChestMore: { mood: "angry", priority: 3 },
    touchTail: { mood: "surprised", priority: 2 },
    touchWing: { mood: "shy", priority: 2 },
    touchFin: { mood: "shy", priority: 2 },
    touchHorn: { mood: "surprised", priority: 2 },
    touchPet: { mood: "happy", priority: 2 },
    touchBook: { mood: "happy", priority: 2 },
    tapSulky: { mood: "angry", priority: 2 },
    makeUp: { mood: "shy", priority: 2 },
    peek: { mood: "happy", priority: 1 },
    appLong: { priority: 2 },
  };

  // Affection (好感度), kept per character. Each level unlocks extra lines:
  // a group named "tap+2" joins "tap" from level 2 on; "levelUp2" is said on reaching it.
  const AFFECTION_KEY = "live2d-mascot-affection";
  const AFFECTION_LEVELS = [
    { min: 0, name: "初次见面" },
    { min: 30, name: "渐渐熟悉" },
    { min: 100, name: "好朋友" },
    { min: 250, name: "亲密伙伴" },
    { min: 500, name: "最重要的人" },
  ];
  const levelOf = (points) => AFFECTION_LEVELS.reduce((lv, x, i) => (points >= x.min ? i : lv), 0);
  for (let i = 1; i < AFFECTION_LEVELS.length; i++) DEFAULT_REACTIONS["levelUp" + i] = { mood: "shy", priority: 3 };

  // Holidays: solar ones by month/day, lunar ones through the Chinese calendar.
  const HOLIDAYS = [
    ["NewYear", "solar", 1, 1],
    ["Valentine", "solar", 2, 14],
    ["Labor", "solar", 5, 1],
    ["Children", "solar", 6, 1],
    ["National", "solar", 10, 1],
    ["Halloween", "solar", 10, 31],
    ["ChristmasEve", "solar", 12, 24],
    ["Christmas", "solar", 12, 25],
    ["SpringEve", "lunarEve"],
    ["Spring", "lunar", 1, 1],
    ["Lantern", "lunar", 1, 15],
    ["Dragon", "lunar", 5, 5],
    ["Qixi", "lunar", 7, 7],
    ["MidAutumn", "lunar", 8, 15],
    ["DoubleNinth", "lunar", 9, 9],
  ];
  for (const [k] of HOLIDAYS) DEFAULT_REACTIONS["holiday" + k] = { mood: "happy", priority: 3 };
  function lunarOf(d) {
    try {
      const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "numeric", day: "numeric" }).formatToParts(d);
      const m = parts.find((p) => p.type === "month");
      const day = parts.find((p) => p.type === "day");
      if (!m || !day || !/^\d+$/.test(m.value)) return null; // leap months come back as e.g. "6bis"
      return { m: Number(m.value), d: Number(day.value) };
    } catch {
      return null;
    }
  }
  function holidayOn(d) {
    const lunar = lunarOf(d);
    const next = lunarOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    for (const [k, kind, m, day] of HOLIDAYS) {
      if (kind === "solar" && d.getMonth() + 1 === m && d.getDate() === day) return k;
      if (kind === "lunar" && lunar && lunar.m === m && lunar.d === day) return k;
      if (kind === "lunarEve" && next && next.m === 1 && next.d === 1) return k;
    }
    return null;
  }

  // Chinese numbers in times: 十五, 两, 二十三, 半...
  function cnNumber(t) {
    if (/^\d+$/.test(t)) return Number(t);
    const digit = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (t === "十") return 10;
    const m = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(t);
    if (m) return (m[1] ? digit[m[1]] : 1) * 10 + (m[2] ? digit[m[2]] : 0);
    if (t.length === 1 && t in digit) return digit[t];
    return NaN;
  }
  const NUM = "[\\d零一二两三四五六七八九十]+";
  // "十分钟后" / "半小时后" / "一个半小时以后"
  const REL_RE = new RegExp(`(半|${NUM}\\s*个?\\s*半?)\\s*(小时|钟头|分钟|分|秒钟|秒)\\s*(?:后|以后|之后)`);
  // "明天下午三点半" / "15:30" / "晚上八点二十"
  const ABS_RE = new RegExp(`(今天|今晚|明天|明早|后天)?\\s*(早上|早晨|上午|中午|下午|傍晚|晚上|夜里|凌晨)?\\s*(${NUM})\\s*(?:点|:|：|时)\\s*(半|${NUM}\\s*分?)?`);
  // When does the text say? Returns { at, match } or null.
  function parseWhen(text, now = new Date()) {
    let m = REL_RE.exec(text);
    if (m) {
      const raw = m[1].replace(/\s|个/g, "");
      let n = raw === "半" ? 0.5 : cnNumber(raw.replace("半", "")) + (raw.endsWith("半") ? 0.5 : 0);
      if (!(n > 0)) return null;
      const unit = m[2].startsWith("小") || m[2] === "钟头" ? 3600000 : m[2].startsWith("秒") ? 1000 : 60000;
      return { at: now.getTime() + n * unit, match: m[0] };
    }
    m = ABS_RE.exec(text);
    if (m) {
      let h = cnNumber(m[3]);
      let min = !m[4] ? 0 : m[4] === "半" ? 30 : cnNumber(m[4].replace(/\s|分/g, ""));
      if (!(h >= 0 && h <= 24) || !(min >= 0 && min < 60)) return null;
      const period = m[2] || (m[1] === "今晚" ? "晚上" : m[1] === "明早" ? "早上" : "");
      if (/下午|傍晚|晚上|夜里/.test(period) && h < 12) h += 12;
      if (period === "中午" && h < 11) h += 12;
      if (period === "凌晨" && h === 12) h = 0;
      const day = /明/.test(m[1] || "") ? 1 : m[1] === "后天" ? 2 : 0;
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, h, min);
      // no day or period said and the time has passed: the afternoon one, or else tomorrow
      if (!m[1] && !period && at <= now) {
        if (h < 12 && at.getTime() + 12 * 3600000 > now.getTime()) at.setHours(h + 12);
        else at.setDate(at.getDate() + 1);
      }
      if (at <= now) return null;
      return { at: at.getTime(), match: m[0] };
    }
    return null;
  }

  // "12:30" / "明天 8:05"
  function whenText(at) {
    const d = new Date(at);
    const today = new Date();
    const dayDiff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    const day = dayDiff === 0 ? "" : dayDiff === 1 ? "明天 " : dayDiff === 2 ? "后天 " : `${d.getMonth() + 1}月${d.getDate()}日 `;
    return day + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  // What the program in front says about what they're doing (desktop pet, opt-in).
  // Sorted on this computer only; checked in order, first match wins.
  const APP_KINDS = [
    ["Video", (p, t) => /bilibili|哔哩哔哩|youtube|爱奇艺|优酷|腾讯视频|芒果tv|netflix|西瓜视频|抖音/i.test(t) || /^(potplayer\w*|vlc|mpc-hc\w*|kmplayer|qqlive|iqiyi\w*)$/i.test(p)],
    ["Game", (p) => /^(steam|steamwebhelper|yuanshen|genshinimpact|starrail|zenlesszonezero|leagueclient|league of legends|wegame|epicgameslauncher|minecraft\w*|javaw|hearthstone|valorant\w*|cs2|dota2)$/i.test(p)],
    ["Code", (p) => /^(code|cursor|devenv|idea64|pycharm64|webstorm64|clion64|goland64|rider64|sublime_text|notepad\+\+|windowsterminal|powershell|pwsh|cmd|claude|codex)$/i.test(p)],
    ["Write", (p) => /^(winword|wps|wpp|notepad|obsidian|typora|onenote|notion|marktext)$/i.test(p)],
    ["Sheet", (p) => /^(excel|et)$/i.test(p)],
    ["Chat", (p) => /^(wechat|weixin|qq|dingtalk|feishu|lark|telegram|discord|whatsapp)$/i.test(p)],
    ["Music", (p) => /^(cloudmusic|qqmusic|kugou|kwmusic|spotify|foobar2000)$/i.test(p)],
    ["Browse", (p) => /^(chrome|msedge|firefox|360se|360chrome|qqbrowser|sogouexplorer|opera|brave)$/i.test(p)],
  ];
  const APP_NAMES = { Video: "看视频", Game: "玩游戏", Code: "写代码", Write: "写东西", Sheet: "做表格", Chat: "和人聊天", Music: "听歌", Browse: "上网" };
  const MOOD_NAMES = [
    [75, "开心"],
    [45, "平常"],
    [30, "有点闷"],
    [0, "闹别扭"],
  ];
  const moodName = (m) => MOOD_NAMES.find(([min]) => m >= min)[1];
  // Energy through the day (0..1): fresh in the morning, sleepy after lunch, worn out late at night.
  function energyAt(h) {
    if (h >= 23 || h < 6) return 0.3;
    if (h < 9) return 0.7;
    if (h < 12) return 1;
    if (h < 14) return 0.8;
    if (h < 16) return 0.5;
    if (h < 20) return 0.9;
    return 0.7;
  }
  const energyName = (e) => (e >= 0.85 ? "精神很好" : e >= 0.6 ? "还行" : e >= 0.4 ? "有点犯困" : "很困");

  // Which little animation goes with an event (when the character has the pictures).
  const ANIM_FOR = {
    switchIn: "wave", welcomeBack: "wave", restore: "wave", greeting: "wave", peek: "wave",
    rest: "drink", appLong: "drink",
    focusDone: "cheer", rpsWin: "cheer", levelUp1: "cheer", levelUp2: "cheer", levelUp3: "cheer", levelUp4: "cheer",
  };

  // Which little effect goes with each mood.
  const MOOD_FX = { happy: "sparkle", shy: "hearts", angry: "anger", dizzy: "dizzy", surprised: "surprise", sleepy: "zzz" };

  // -----------------------------------------------------------------------
  // Config + saved settings
  // -----------------------------------------------------------------------
  function readConfig() {
    const ds = (CURRENT_SCRIPT && CURRENT_SCRIPT.dataset) || {};
    const g = window.LIVE2D_MASCOT_CONFIG || {};
    const dsScale = ds.scale !== undefined ? parseFloat(ds.scale) : undefined;
    const dsAutoWander = ds.autoWander !== undefined ? ds.autoWander !== "false" : undefined;
    return {
      position: g.position ?? ds.position ?? "bottom-right", // "bottom-right" | "bottom-left"
      scale: g.scale ?? dsScale ?? 1,
      character: g.character ?? ds.character ?? null,
      // A bare model URL still works: it becomes an ad-hoc "custom" character.
      modelUrl: g.modelUrl ?? ds.model ?? null,
      autoWander: g.autoWander ?? dsAutoWander ?? true,
      mobileBreakpoint: g.mobileBreakpoint ?? 700,
      // Only set by the desktop-pet shell: { onInteractiveChange(bool), onClose() }.
      desktop: g.desktop || null,
    };
  }

  function defaultSettings(config, characterIds) {
    return {
      character: config.character && characterIds.includes(config.character) ? config.character : characterIds[0],
      size: config.scale,
      autoWander: config.autoWander,
      hourly: true,
      restMinutes: 45,
      chatter: "normal",
      voice: true,
      volume: 0.8,
      effects: true,
      chatVoice: true,
      aiChatter: "rare",
      watchApps: false,
      buddy: "",
      buddy2: "",
      outfit: "auto",
      bedTime: "off",
      wakeTime: "7",
    };
  }

  function loadSettings(defaults, characterIds) {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      saved = {};
    }
    const settings = Object.assign({}, defaults, saved);
    if (!characterIds.includes(settings.character)) settings.character = defaults.character;
    return settings;
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // storage blocked (private mode etc.) — settings just won't persist
    }
  }

  // -----------------------------------------------------------------------
  // Dependency + character loading — one script tag pulls in everything else.
  // -----------------------------------------------------------------------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("live2d-mascot: failed to load " + src));
      document.head.appendChild(el);
    });
  }

  async function ensureDeps() {
    if (!window.PIXI) await loadScript(PIXI_URL);
    if (!window.Live2DCubismCore) await loadScript(CUBISM_CORE_URL);
    if (!(window.PIXI && window.PIXI.live2d)) await loadScript(CUBISM4_URL);
  }

  // Returns { list: [id...], defs: {id: def}, defaultLines }.
  async function loadCharacters(config) {
    window.Live2DMascotCharacters = window.Live2DMascotCharacters || {};
    await loadScript(CHARACTER_LIST_URL).catch((err) => console.warn(err.message));
    await loadScript(DEFAULT_LINES_URL).catch((err) => console.warn(err.message));
    await loadScript(local("characters/banter.js")).catch(() => {}); // companion banter is optional
    const ids = Array.isArray(window.Live2DMascotCharacterList) ? window.Live2DMascotCharacterList : [];
    await Promise.all(ids.map((id) => loadScript(characterUrl(id)).catch((err) => console.warn(err.message))));

    const defs = window.Live2DMascotCharacters;
    if (config.modelUrl) {
      defs.custom = { id: "custom", name: "自定义模型", type: "live2d", model: config.modelUrl, motions: { tap: "TapBody", walk: "TapBody" } };
    }
    const list = [...(config.modelUrl ? ["custom"] : []), ...ids.filter((id) => defs[id])];
    if (!list.length) throw new Error("live2d-mascot: no characters found in characters/");
    return { list, defs, defaultLines: window.Live2DMascotDefaultLines || {} };
  }

  // -----------------------------------------------------------------------
  // Lines
  // -----------------------------------------------------------------------
  function isLineList(v) {
    return Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string");
  }

  const recentPicks = {};
  function pickFrom(memoKey, list, fallbackKey) {
    if (!isLineList(list)) list = FALLBACK_LINES[fallbackKey] || ["……"];
    const recent = recentPicks[memoKey] || (recentPicks[memoKey] = []);
    const avoid = Math.min(recent.length, list.length - 1);
    const recentSlice = avoid > 0 ? recent.slice(-avoid) : [];
    let candidates = list.map((_, i) => i).filter((i) => !recentSlice.includes(i));
    if (!candidates.length) candidates = [0];
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    recent.push(idx);
    if (recent.length > 6) recent.shift();
    return list[idx];
  }

  function timeText(h) {
    const period = h < 5 ? "凌晨" : h < 9 ? "早上" : h < 12 ? "上午" : h === 12 ? "中午" : h < 18 ? "下午" : "晚上";
    const n = h % 12 === 0 ? 12 : h % 12;
    return period + n + "点";
  }

  function greetingSlot(h) {
    if (h < 5 || h >= 23) return "lateNight";
    if (h < 7) return "earlyMorning";
    if (h < 9) return "morning";
    if (h < 11) return "forenoon";
    if (h < 13) return "noon";
    if (h < 17) return "afternoon";
    if (h < 19) return "evening";
    return "night";
  }

  // -----------------------------------------------------------------------
  // Character renderers. Each returns the same small interface:
  //   view            PIXI display object, anchored at her feet
  //   naturalHeight   height in the view's own units
  //   hitAreas(x, y)  hit-area names (lowercase) at a stage point
  //   focus(x, y)     look towards a stage point
  //   motion(key, force)  play the motion mapped to key in def.motions
  //   onFrame(fn)     fn runs right before each render, after motions/physics
  //   applyMood(params, weight)  blend mood targets in (0..1 weight)
  //   setMouth(open)  0..1, while talking
  //   visibleExtents()  { left, right, top } of what's actually drawn, in
  //                     view units from her feet (props like a staff included)
  //   destroy()
  // -----------------------------------------------------------------------
  async function createLive2DCharacter(def, PIXI) {
    const { Live2DModel } = PIXI.live2d;
    const MotionPriority = PIXI.live2d.MotionPriority || { NONE: 0, IDLE: 1, NORMAL: 2, FORCE: 3 };
    const model = await Live2DModel.from(local(def.model), { autoInteract: false });
    model.anchor.set(0.5, 1);
    const im = model.internalModel;
    const core = im.coreModel;

    const groups = (im.settings && im.settings.json && im.settings.json.Groups) || [];
    const lipSync = groups.find((g) => g.Name === "LipSync");
    const mouthParam = def.mouthParam || (lipSync && lipSync.Ids && lipSync.Ids[0]) || "ParamMouthOpenY";

    return {
      def,
      view: model,
      naturalHeight: im.originalHeight,
      hitAreas: (x, y) => model.hitTest(x, y).map((n) => String(n).toLowerCase()),
      focus: (x, y) => model.focus(x, y),
      motion(key, force) {
        const group = def.motions && def.motions[key];
        // A motion still loading when she's swapped out rejects after destroy; that's harmless.
        if (group) model.motion(group, undefined, force ? MotionPriority.FORCE : MotionPriority.NORMAL).catch(() => {});
      },
      onFrame: (fn) => im.on("beforeModelUpdate", fn),
      applyMood(params, weight) {
        for (const id in params) {
          // Sprite-only entries (face, stretch, look, ...) aren't model parameters.
          if (typeof params[id] !== "number" || !id.startsWith("Param")) continue;
          const cur = core.getParameterValueById(id);
          core.setParameterValueById(id, cur + (params[id] - cur) * weight);
        }
      },
      setMouth: (open) => core.setParameterValueById(mouthParam, open),
      visibleExtents() {
        const W = im.originalWidth;
        const H = im.originalHeight;
        const b = new PIXI.Rectangle();
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        const count = im.getDrawableIDs().length;
        for (let i = 0; i < count; i++) {
          if (core.getDrawableOpacity && core.getDrawableOpacity(i) < 0.01) continue;
          im.getDrawableBounds(i, b);
          if (b.width <= 0 || b.height <= 0) continue;
          minX = Math.min(minX, b.x);
          maxX = Math.max(maxX, b.x + b.width);
          minY = Math.min(minY, b.y);
        }
        if (minX === Infinity) return null;
        return { left: W / 2 - minX, right: maxX - W / 2, top: H - minY };
      },
      destroy: () => model.destroy(),
    };
  }

  // ---- Sprite (立绘) characters -----------------------------------------
  // A sprite pack lists images by name: `normal` is required; `blink`, `talk`
  // and one per mood face (happy, shy, ...) are optional and swapped in when
  // present. Without them, moods are acted out with movement instead.

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("live2d-mascot: failed to load image " + url));
      img.src = url;
    });
  }

  // Packs ship 1024x1536 pictures, but she's drawn at about half the screen's
  // height, and each picture is held several times over (decoded, cut out, as
  // a texture). Shrink them to what this screen can actually show; at the
  // largest size setting that's still about one picture pixel per screen pixel.
  async function loadSpriteImage(url) {
    const img = await loadImage(url);
    // some embedded browsers report a 0x0 screen: fall back to the window, and never shrink below 512
    const tall = Math.max(screen.height || 0, window.innerHeight || 0);
    const max = Math.max(512, Math.round(tall * Math.min(window.devicePixelRatio || 1, 2) * 0.65));
    if (img.naturalHeight <= max) return img;
    const c = document.createElement("canvas");
    c.width = Math.round((img.naturalWidth * max) / img.naturalHeight);
    c.height = max;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  // Illustrations (and most AI drawing tools) often come on a plain backdrop.
  // Flood-fill it away from the border so lines inside her stop the fill,
  // then feather the light fringe so no halo is left. Also returns the
  // bounding box of what remains and an alpha mask for hit-testing.
  function cutOutBackground(img, tolerance) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const px = imageData.data;

    if (tolerance > 0 && px[3] > 0) {
      const bg = [px[0], px[1], px[2]];
      const diff = (i) =>
        Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2]));
      const seen = new Uint8Array(w * h);
      const stack = new Int32Array(w * h);
      let top = 0;
      const push = (p) => {
        if (!seen[p] && diff(p * 4) <= tolerance) {
          seen[p] = 1;
          stack[top++] = p;
        }
      };
      for (let x = 0; x < w; x++) {
        push(x);
        push((h - 1) * w + x);
      }
      for (let y = 0; y < h; y++) {
        push(y * w);
        push(y * w + w - 1);
      }
      while (top) {
        const p = stack[--top];
        px[p * 4 + 3] = 0;
        const x = p % w;
        if (x > 0) push(p - 1);
        if (x < w - 1) push(p + 1);
        if (p >= w) push(p - w);
        if (p < w * (h - 1)) push(p + w);
      }
      // Feather: light pixels touching the removed area fade with their distance from the backdrop color.
      for (let p = 0; p < w * h; p++) {
        if (seen[p]) continue;
        const x = p % w;
        const edge = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < w * (h - 1) && seen[p + w]);
        if (!edge) continue;
        const d = diff(p * 4);
        if (d < tolerance * 3) px[p * 4 + 3] = Math.round((255 * d) / (tolerance * 3));
      }
      ctx.putImageData(imageData, 0, 0);
    }

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] > 40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      minX = 0;
      minY = 0;
      maxX = w - 1;
      maxY = h - 1;
    }
    return { canvas, width: w, height: h, pixels: px, bbox: { minX, minY, maxX, maxY } };
  }

  // AI tools redraw the whole picture for every expression, so hair and
  // clothes drift slightly between variants and would shimmer on each blink.
  // Keep the normal image everywhere and take only the face from the variant,
  // with a soft edge so the seam doesn't show.
  function pasteFace(normal, variant, faceBox) {
    const w = normal.naturalWidth || normal.width;
    const h = normal.naturalHeight || normal.height;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    ctx.drawImage(normal, 0, 0);

    const [x0, y0, x1, y1] = faceBox;
    const feather = Math.round(Math.min(w, h) * 0.02);
    const face = document.createElement("canvas");
    face.width = w;
    face.height = h;
    const fctx = face.getContext("2d");
    fctx.filter = `blur(${feather}px)`;
    fctx.fillStyle = "#fff";
    fctx.fillRect(x0 * w + feather, y0 * h + feather, (x1 - x0) * w - feather * 2, (y1 - y0) * h - feather * 2);
    fctx.filter = "none";
    fctx.globalCompositeOperation = "source-in";
    fctx.drawImage(variant, 0, 0, w, h);
    ctx.drawImage(face, 0, 0);
    return out;
  }

  // Local sway on a sprite's grid. Each region is a box in image fractions
  // [left, top, right, bottom] whose edges fade out softly:
  //   { box, pivot: [x, y], angle: degrees, period: ms, phase, lag }
  //     bends around the pivot, more the farther from it (hair, tail, wing);
  //     lag > 0 makes the far end trail behind like a whip.
  //   { box, float: [dx, dy], period, phase }
  //     drifts the whole box back and forth (a floating pet), in image fractions.
  function createSway(regions, plane, W, H) {
    if (!regions || !regions.length) return { update() {} };
    const buffer = plane.geometry.getBuffer("aVertexPosition");
    const rest = Float32Array.from(buffer.data);
    const n = rest.length / 2;
    const smooth = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
    // Precompute, per region, which vertices it moves and how strongly.
    const parts = regions.map((r) => {
      const [x0, y0, x1, y1] = [r.box[0] * W, r.box[1] * H, r.box[2] * W, r.box[3] * H];
      const fade = Math.min(x1 - x0, y1 - y0) * (r.feather ?? 0.3);
      const px = r.pivot ? r.pivot[0] * W : 0;
      const py = r.pivot ? r.pivot[1] * H : 0;
      let reach = 1;
      if (r.pivot) for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) reach = Math.max(reach, Math.hypot(cx - px, cy - py));
      const idx = [];
      const weight = [];
      const along = [];
      for (let i = 0; i < n; i++) {
        const vx = rest[i * 2];
        const vy = rest[i * 2 + 1];
        let w = smooth(Math.min(vx - x0, x1 - vx) / fade) * smooth(Math.min(vy - y0, y1 - vy) / fade);
        const d = r.pivot ? Math.hypot(vx - px, vy - py) / reach : 0;
        if (r.pivot) w *= Math.pow(Math.min(1, d), 1.5);
        if (w <= 0.001) continue;
        idx.push(i);
        weight.push(w);
        along.push(d);
      }
      return { r, px, py, idx, weight, along, rad: ((r.angle || 0) * Math.PI) / 180, period: r.period || 3000, phase: r.phase || 0 };
    });
    const out = buffer.data;
    return {
      update(t, strength) {
        out.set(rest);
        for (const p of parts) {
          const base = (t / p.period) * Math.PI * 2 + p.phase;
          for (let k = 0; k < p.idx.length; k++) {
            const i = p.idx[k] * 2;
            const w = p.weight[k] * strength;
            if (p.r.float) {
              const s = Math.sin(base) * w;
              out[i] += p.r.float[0] * W * s;
              out[i + 1] += p.r.float[1] * H * s;
            } else {
              const a = p.rad * w * Math.sin(base - p.along[k] * (p.r.lag || 0));
              const vx = rest[i] - p.px;
              const vy = rest[i + 1] - p.py;
              const c = Math.cos(a) - 1;
              const sn = Math.sin(a);
              out[i] += c * vx - sn * vy;
              out[i + 1] += sn * vx + c * vy;
            }
          }
        }
        buffer.update();
      },
    };
  }

  // ---- Little effects around her head (hearts, 💤, dizzy stars, ...) ----
  // start(kind, ms) runs a kind for a while, keep(kind) keeps it alive for
  // this frame. update() gets an anchor in screen pixels:
  //   { x, top, hw, hh, size, facing }  head centre x, head top y, head
  //   half-width / height, glyph size, which way she faces.
  const FX_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  const rand = (a, b) => a + Math.random() * (b - a);
  const FX_KINDS = {
    sparkle: { glyphs: ["✨"], every: 260, burst: 1000, life: 750, move: "pop",
      spawn: (a) => ({ dx: rand(-1.2, 1.2) * a.hw, dy: rand(-0.1, 0.8) * a.hh, k: rand(0.55, 0.9) }) },
    hearts: { glyphs: ["💕", "💗", "💖"], every: 380, life: 1800, move: "rise",
      spawn: (a) => {
        const side = Math.random() < 0.5 ? -1 : 1;
        return { dx: side * rand(0.75, 1.3) * a.hw, dy: rand(0.3, 0.75) * a.hh, vx: side * a.size * 0.3, vy: -a.size * 0.9, k: rand(0.65, 1) };
      } },
    anger: { glyphs: ["💢"], persist: 1, move: "pulse",
      spawn: (a) => ({ dx: a.facing * a.hw * 0.85, dy: 0.08 * a.hh, k: 1 }) },
    dizzy: { glyphs: ["⭐"], persist: 3, move: "orbit", spawn: () => ({ k: 0.6 }) },
    surprise: { glyphs: ["!"], once: true, life: 1000, move: "pop",
      spawn: (a) => ({ dx: a.facing * a.hw * 1.1, dy: 0.1 * a.hh, k: 1.15 }) },
    zzz: { glyphs: ["💤"], every: 1100, life: 2800, move: "rise", grow: true,
      spawn: (a) => ({ dx: a.facing * a.hw * 0.9, dy: 0.35 * a.hh, vx: a.facing * a.size * 0.9, vy: -a.size * 0.7, k: rand(0.55, 0.8) }) },
    notes: { glyphs: ["🎵", "🎶"], every: 650, life: 2000, move: "rise",
      spawn: (a) => ({ dx: a.facing * a.hw * rand(0.8, 1.2), dy: 0.6 * a.hh, vx: a.facing * a.size * 0.8, vy: -a.size * 0.8, k: rand(0.6, 0.85) }) },
    yawn: { glyphs: ["💨"], once: true, life: 1400, move: "rise",
      spawn: (a) => ({ dx: a.facing * a.hw * 0.7, dy: 0.75 * a.hh, vx: a.facing * a.size * 1.2, vy: -a.size * 0.3, k: 0.7 }) },
    thinking: { persist: 3, move: "dots", spawn: () => ({ k: 1 }) },
  };

  function createEffects(PIXI, layer, renderer) {
    const glyphs = {};
    function glyphTexture(ch) {
      if (!glyphs[ch]) {
        // Plain marks (not emoji) are drawn bold with an outline so they read on any background.
        const style = /^[!?]$/.test(ch)
          ? { fontFamily: "Arial Black, Arial, sans-serif", fontWeight: "900", fontSize: 72, fill: "#ff4d5e", stroke: "#ffffff", strokeThickness: 10, padding: 12 }
          : { fontFamily: FX_FONT, fontSize: 72, fill: "#ff7aa2", padding: 12 };
        const t = new PIXI.Text(ch, style);
        t.updateText(false);
        glyphs[ch] = t;
      }
      return glyphs[ch].texture;
    }
    let dotTex = null;
    function dotTexture() {
      if (!dotTex) {
        const g = new PIXI.Graphics();
        g.lineStyle(6, 0xb9b3cc, 1);
        g.beginFill(0xffffff, 1);
        g.drawCircle(40, 40, 34);
        g.endFill();
        dotTex = renderer.generateTexture(g);
        g.destroy();
      }
      return dotTex;
    }

    const active = {}; // kind -> { since, until, last, emitted }
    let parts = [];

    function start(kind, ms) {
      if (!FX_KINDS[kind]) return;
      const now = performance.now();
      const a = active[kind];
      if (a) a.until = Math.max(a.until, now + ms);
      else active[kind] = { since: now, until: now + ms, last: 0, emitted: false };
    }

    function spawn(kind, a, now, i) {
      const K = FX_KINDS[kind];
      const p = Object.assign({ dx: 0, dy: 0, vx: 0, vy: 0, k: 1 }, K.spawn(a));
      const tex = K.move === "dots" ? dotTexture() : glyphTexture(K.glyphs[Math.floor(Math.random() * K.glyphs.length)]);
      p.s = new PIXI.Sprite(tex);
      p.s.anchor.set(0.5);
      p.kind = kind;
      p.born = now;
      p.i = i || 0;
      p.phase = Math.random() * 6.28;
      p.fadeFrom = 0;
      layer.addChild(p.s);
      parts.push(p);
    }

    function update(now, a) {
      for (const kind in active) {
        const K = FX_KINDS[kind];
        const st = active[kind];
        if (now > st.until) {
          delete active[kind];
          continue;
        }
        if (K.persist) {
          const have = parts.filter((p) => p.kind === kind && !p.fadeFrom).length;
          for (let i = have; i < K.persist; i++) spawn(kind, a, now, i);
        } else if (K.once) {
          if (!st.emitted) spawn(kind, a, now);
          st.emitted = true;
        } else if ((!K.burst || now - st.since < K.burst) && now - st.last >= K.every) {
          st.last = now;
          spawn(kind, a, now);
        }
      }

      parts = parts.filter((p) => {
        const K = FX_KINDS[p.kind];
        const age = now - p.born;
        let alpha = 1;
        if (K.persist) {
          if (!active[p.kind] && !p.fadeFrom) p.fadeFrom = now;
          if (p.fadeFrom) alpha = 1 - (now - p.fadeFrom) / 300;
          alpha = Math.min(alpha, age / 200);
        } else {
          const t = age / K.life;
          alpha = Math.min(age / 150, t < 0.6 ? 1 : (1 - t) / 0.4);
        }
        if (alpha <= 0 && age > 50) {
          p.s.destroy();
          return false;
        }
        let x = a.x + p.dx + (p.vx * age) / 1000;
        let y = a.top + p.dy + (p.vy * age) / 1000;
        let scale = p.k;
        if (K.move === "pop") {
          const g = Math.min(1, age / 200);
          scale *= g < 1 ? 1.4 * g - 0.4 * g * g : 1;
        } else if (K.move === "rise") {
          x += Math.sin(age / 320 + p.phase) * a.size * 0.25;
          if (K.grow) scale *= 0.7 + (0.6 * age) / K.life;
        } else if (K.move === "pulse") {
          scale *= 1 + 0.15 * Math.sin(age / 110);
        } else if (K.move === "orbit") {
          const ang = (age / 650) * Math.PI * 2 + (p.i * Math.PI * 2) / K.persist;
          x = a.x + Math.cos(ang) * a.hw * 1.05;
          y = a.top + a.hh * 0.08 + Math.sin(ang) * a.hh * 0.16;
          scale *= 0.85 + 0.25 * Math.sin(ang);
        } else if (K.move === "dots") {
          // Three dots growing up and away from her head, lit one after another.
          x = a.x + a.facing * (a.hw * 1.05 + p.i * a.size * 0.6);
          y = a.top + a.hh * 0.35 - p.i * a.size * 0.35;
          scale = 0.3 + p.i * 0.13;
          const lit = Math.floor(age / 380) % 4;
          alpha *= p.i < lit ? 1 : 0.15;
        }
        p.s.position.set(x, y);
        p.s.scale.set((scale * a.size) / 72);
        p.s.alpha = Math.max(0, Math.min(1, alpha));
        return true;
      });
    }

    function clear() {
      for (const p of parts) p.s.destroy();
      parts = [];
      for (const kind in active) delete active[kind];
    }

    return { start, keep: (kind) => start(kind, 100), update, clear };
  }

  // Images that differ from normal only around the eyes.
  const EYE_ONLY = ["lookLeft", "lookRight", "halfBlink"];
  // Whole-body pose pictures: shown on their own, nothing pasted onto normal.
  const POSE_IMAGES = ["sit", "sleep", "climb", "climb2", "wave1", "wave2", "drink1", "drink2", "act1", "act2",
    "walk1", "walk2", "walk3", "walk4", "held", "sulk", "cheer1", "cheer2", "focus", "sleepPajamas"];
  const ACTION_FRAMES = ["wave1", "wave2", "drink1", "drink2", "act1", "act2"];

  // Outfits: put an expression onto a picture in other clothes. Only the
  // pixels where the expression actually differs from the plain face are
  // taken (inside an oval over the face, never the neck), softened at the
  // edge, so a new scarf or earmuffs right next to the face stay intact.
  function pasteChanges(normal, variant, target, box) {
    const w = normal.naturalWidth || normal.width;
    const h = normal.naturalHeight || normal.height;
    const [x0, y0, x1, y1] = [box[0] * w, box[1] * h, box[2] * w, box[3] * h].map(Math.round);
    const bw = x1 - x0;
    const bh = y1 - y0;
    const read = (img) => {
      const c = document.createElement("canvas");
      c.width = bw;
      c.height = bh;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, x0, y0, bw, bh, 0, 0, bw, bh);
      return g.getImageData(0, 0, bw, bh).data;
    };
    const a = read(normal);
    const b = read(variant);
    const mask = document.createElement("canvas");
    mask.width = bw;
    mask.height = bh;
    const mg = mask.getContext("2d");
    const md = mg.createImageData(bw, bh);
    const cx = bw / 2;
    const cy = bh * 0.45;
    for (let y = 0; y < bh * 0.85; y++) {
      for (let x = 0; x < bw; x++) {
        if (((x - cx) / (bw / 2)) ** 2 + ((y - cy) / (bh / 2)) ** 2 > 1) continue;
        const i = (y * bw + x) * 4;
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d > 36) md.data[i + 3] = 255;
      }
    }
    mg.putImageData(md, 0, 0);
    const soft = document.createElement("canvas");
    soft.width = bw;
    soft.height = bh;
    const sg = soft.getContext("2d");
    sg.filter = `blur(${Math.max(3, Math.round(Math.min(w, h) * 0.005))}px)`;
    for (let k = 0; k < 3; k++) sg.drawImage(mask, 0, 0); // stacked blurs: a little wider, soft edge
    sg.filter = "none";
    sg.globalCompositeOperation = "source-in";
    sg.drawImage(variant, x0, y0, bw, bh, 0, 0, bw, bh);
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const og = out.getContext("2d");
    og.drawImage(target, 0, 0);
    og.drawImage(soft, x0, y0);
    return out;
  }

  async function createSpriteCharacter(def, PIXI) {
    const tolerance = def.backgroundTolerance ?? 24;
    const names = Object.keys(def.images || {});
    if (!names.includes("normal")) throw new Error(`live2d-mascot: sprite character "${def.id}" needs images.normal`);
    const raw = {};
    await Promise.all(names.map(async (name) => (raw[name] = await loadSpriteImage(local(def.images[name])))));
    const cut = {};
    for (const name of names) {
      // Eye-only images (glances, half-blink) take just the eyes when the pack says where they are.
      const box = EYE_ONLY.includes(name) && def.eyeBox ? def.eyeBox : def.faceBox;
      const src = name !== "normal" && box && !POSE_IMAGES.includes(name) ? pasteFace(raw.normal, raw[name], box) : raw[name];
      cut[name] = cutOutBackground(src, tolerance);
    }
    // Let go of what nothing reads again: outfits rebuild faces from the uncut
    // pictures but never need the pose ones, and only `normal` and the poses
    // are hit-tested or measured pixel by pixel.
    for (const name of names) {
      if (POSE_IMAGES.includes(name)) delete raw[name];
      else if (name !== "normal") cut[name].pixels = null;
    }
    const base = cut.normal;
    const textures = {};
    for (const name of names) textures[name] = PIXI.Texture.from(cut[name].canvas);

    const { width: W, height: H, bbox } = base;
    const footX = (bbox.minX + bbox.maxX) / 2;
    const footY = bbox.maxY + 1;

    const view = new PIXI.Container(); // origin at her feet
    const body = new PIXI.Container(); // takes the acted-out movement
    view.addChild(body);
    // The picture is laid on a bendable grid so hair ends, tails and hems
    // can sway (def.sway) while the rest of her stays put.
    const sprite = new PIXI.SimplePlane(textures.normal, 33, 49);
    sprite.position.set(-footX, -footY);
    body.addChild(sprite);
    const sway = createSway(def.sway, sprite, W, H);

    // Whole-body poses with pictures of their own. Each has an anchor that
    // lands where her feet would be:
    //   sit             the seat (def.sitSeat) on a window edge; lower legs swing (def.sitSway)
    //   sleep           the bottom of the picture, on the ground
    //   climb, climb2   the picture's right edge (the wall she clings to), at her feet's height
    // headX / top: where her head is, from the anchor, to place the bubble and effects.
    function headSpot(c, ax) {
      const b = c.bbox;
      let sum = 0;
      let n = 0;
      for (let y = b.minY; y < Math.min(H, b.minY + Math.round(H * 0.08)); y++) {
        for (let x = b.minX; x <= b.maxX; x += 2) {
          if (c.pixels[(y * W + x) * 4 + 3] > 40) {
            sum += x;
            n++;
          }
        }
      }
      return (n ? sum / n : (b.minX + b.maxX) / 2) - ax;
    }
    const standHead = { x: headSpot(base, footX), top: footY - bbox.minY };
    // Where each pose picture's anchor is, from a set of cut-out pictures: [x, y].
    function poseAnchors(c) {
      const a = {};
      if (c.sit && def.sitSeat) {
        a.sit = [def.sitSeat[0] * W, def.sitSeat[1] * H];
        // on the ground there's no edge to hang her legs over: the hem rests on the floor
        a.sitGround = [def.sitSeat[0] * W, c.sit.bbox.maxY + 1];
      }
      if (c.sleep) a.sleep = [(c.sleep.bbox.minX + c.sleep.bbox.maxX) / 2, c.sleep.bbox.maxY + 1];
      if (c.climb) {
        // both climbing frames share the first one's anchor, so they line up as drawn
        const b = c.climb.bbox;
        a.climb = [b.maxX, b.maxY + 1];
        if (c.climb2) a.climb2 = [b.maxX, b.maxY + 1];
      }
      for (const n of ACTION_FRAMES) if (c[n]) a[n] = [footX, footY];
      // Standing poses drawn on their own stand on that picture's lowest point; the
      // later frames of a set share the first one's line, so a jump stays a jump.
      for (const [p, ...rest] of [["walk1", "walk2", "walk3", "walk4"], ["cheer1", "cheer2"], ["sulk"], ["focus"]]) {
        if (!c[p]) continue;
        a[p] = [footX, c[p].bbox.maxY + 1];
        // walking frames: line their heads up with the first one, so she glides
        // forward smoothly instead of jittering side to side between pictures
        const walking = p === "walk1";
        for (const q of rest) if (c[q]) a[q] = walking ? [footX + headSpot(c[q], 0) - headSpot(c[p], 0), a[p][1]] : a[p];
      }
      if (c.held) a.held = [footX, footY]; // dangling, feet off the ground as drawn
      if (c.sleepPajamas && c.sleep) a.sleepPajamas = [(c.sleep.bbox.minX + c.sleep.bbox.maxX) / 2, c.sleep.bbox.maxY + 1];
      return a;
    }
    const POSE_FROM = { sitGround: "sit" }; // poses that reuse another pose's picture
    function makePose(name, tex, c, [ax, ay]) {
      const swings = name === "sit" || name === "sitGround";
      const obj = swings ? new PIXI.SimplePlane(tex, 17, 25) : new PIXI.Sprite(tex);
      obj.position.set(-ax, -ay);
      obj.visible = false;
      body.addChild(obj);
      return {
        obj,
        cut: c,
        headX: headSpot(c, ax),
        top: ay - c.bbox.minY,
        sway: swings ? createSway(def.sitSway, obj, W, H) : null, // lower legs swing
      };
    }
    const poses = {};
    for (const [n, at] of Object.entries(poseAnchors(cut))) {
      const src = POSE_FROM[n] || n;
      poses[n] = makePose(n, textures[src], cut[src], at);
    }

    // Outfits (def.outfits: { pajamas: "...png", winter: "...png" }), built the first time they're worn.
    let dress = textures; // the face set in use: normal, blink, talk, moods...
    let dressBase = base;
    let outfitWanted = null;
    const outfitSets = {};
    async function buildOutfit(name) {
      const img = await loadSpriteImage(local(def.outfits[name]));
      const set = {};
      const ob = cutOutBackground(img, tolerance);
      set.normal = PIXI.Texture.from(ob.canvas);
      for (const n of names) {
        if (n === "normal" || POSE_IMAGES.includes(n)) continue;
        const box = EYE_ONLY.includes(n) && def.eyeBox ? def.eyeBox : def.faceBox;
        if (!box) continue;
        set[n] = PIXI.Texture.from(cutOutBackground(pasteChanges(raw.normal, raw[n], img, box), tolerance).canvas);
        await new Promise((r) => setTimeout(r, 0)); // let the page breathe between pictures
      }
      // Pose pictures drawn in this outfit (def.outfitPoses), placed by the same rules as the usual ones.
      const own = {};
      for (const [n, file] of Object.entries((def.outfitPoses || {})[name] || {})) {
        try {
          own[n] = cutOutBackground(await loadSpriteImage(local(file)), tolerance);
        } catch {
          console.warn(`live2d-mascot: ${def.id} ${name} pose "${n}" didn't load`);
        }
        await new Promise((r) => setTimeout(r, 0));
      }
      const at = poseAnchors(Object.assign({}, cut, own));
      const outfitPoses = {};
      for (const n in at) {
        const src = own[n] ? n : own[POSE_FROM[n]] ? POSE_FROM[n] : null;
        if (src) outfitPoses[n] = makePose(n, PIXI.Texture.from(own[src].canvas), own[src], at[n]);
      }
      return { textures: set, base: ob, poses: outfitPoses };
    }
    let dressPoses = {}; // pose pictures of the outfit being worn
    // The picture shown for a pose: the outfit's own when it has one.
    const poseOf = (n) => dressPoses[n] || poses[n];
    let pose = "stand";

    // Blush drawn over the cheeks, faded in by the "blush" effect.
    const blush = new PIXI.Graphics();
    for (const [cx, cy] of def.cheeks || []) {
      blush.beginFill(0xff6f8e, 0.55);
      blush.drawEllipse(cx * W - footX, cy * H - footY, W * 0.028, H * 0.008);
      blush.endFill();
    }
    blush.alpha = 0;
    body.addChild(blush);

    function showPose() {
      if (pose !== "stand" && !poseOf(pose)) pose = "stand"; // outfit swap may drop this pose's texture
      sprite.visible = pose === "stand";
      blush.visible = pose === "stand";
      const shown = pose === "stand" ? null : poseOf(pose).obj;
      for (const k in poses) poses[k].obj.visible = poses[k].obj === shown;
      for (const o in outfitSets) for (const k in outfitSets[o].poses) outfitSets[o].poses[k].obj.visible = outfitSets[o].poses[k].obj === shown;
    }

    const headBox = def.headBox || [0.3, 0, 0.7, 0.2];
    const frameFns = [];
    let effects = {};
    let face = null;
    let mouth = 0;
    let lean = 0;
    let leanTarget = 0;
    let hopUntil = 0;
    let swayKick = 0;
    let nextBlinkAt = performance.now() + 2500;
    let blinkStart = -1;
    // Gaze: -1 her image's left, 0 ahead, 1 its right (the picture may be mirrored on screen).
    let gaze = 0;
    let gazeTarget = 0;
    let gazeSince = 0;
    let lastFocusAt = 0;
    const start = performance.now();

    function tick() {
      const now = performance.now();
      effects = {};
      face = null;
      mouth = 0;
      for (const fn of frameFns) fn();

      const t = now - start;
      if (pose !== "stand" && !poseOf(pose)) pose = "stand";
      const e = (k) => effects[k] || 0;
      let y = 0;
      let x = 0;
      let rot = 0;
      let sx = 1;
      let sy = 1 + 0.006 * Math.sin(t / 650); // breathing

      lean += (leanTarget - lean) * 0.06;
      rot += lean;
      if (now < hopUntil) y -= Math.abs(Math.sin(((hopUntil - now) / 450) * Math.PI)) * H * 0.02;
      y -= Math.abs(Math.sin(t / 170)) * H * 0.008 * e("hop");
      y -= H * 0.025 * e("jump");
      x += Math.sin(t / 35) * W * 0.012 * e("shake");
      rot += (e("tilt") * Math.PI) / 180;
      rot += (Math.sin(t / 260) * 6 * e("wobble") * Math.PI) / 180;
      y += H * 0.012 * e("sink");
      sy -= 0.02 * e("sink");
      sy += 0.035 * e("stretch"); // reaching up: taller and a touch narrower
      sx -= 0.012 * e("stretch");
      x += W * 0.022 * e("look"); // glancing to one side (negative = the other)
      rot += (e("look") * 4 * Math.PI) / 180;

      // Talking flips to the open-mouth image, except while a mood face is
      // showing (it would jump between two expressions) — then just bob.
      const faceTex = face && dress[face];
      if (faceTex) {
        sprite.texture = faceTex;
        y -= mouth * H * 0.004;
      } else if (dress.talk && mouth > 0.35) {
        sprite.texture = dress.talk;
      } else {
        // Eyes follow the pointer; looking around (the idle action) glances too.
        // Hold a new direction for a moment so the eyes don't flicker.
        const want = Math.abs(e("look")) > 0.3 ? Math.sign(e("look")) : now - lastFocusAt > 5000 ? 0 : gazeTarget;
        if (want !== gaze && now - gazeSince > 250) {
          gaze = want;
          gazeSince = now;
        }
        const glance = gaze < 0 ? dress.lookLeft : gaze > 0 ? dress.lookRight : null;
        sprite.texture = glance || dress.normal;
        if (!dress.talk) y -= mouth * H * 0.004;
      }
      if (!faceTex && dress.blink && mouth <= 0.5) {
        if (now > nextBlinkAt) {
          blinkStart = now;
          nextBlinkAt = now + 2500 + Math.random() * 3500;
          if (Math.random() < 0.15) nextBlinkAt = now + 260; // now and then a double blink
        }
        // open -> half -> closed -> half -> open, when there's a half-closed image
        const b = now - blinkStart;
        if (b < 170) {
          const half = dress.halfBlink && (b < 40 || b >= 120);
          sprite.texture = half ? dress.halfBlink : dress.blink;
        }
      }

      // Movement makes hair and clothes swing harder for a moment.
      swayKick = Math.max(swayKick * 0.97, e("hop") + e("jump") + e("shake") * 1.5 + e("wobble") + e("stretch") + Math.abs(e("look")) * 0.8 + (now < hopUntil ? 1 : 0));
      if (pose === "sit" || pose === "sitGround") poseOf(pose).sway.update(t, 1);
      else if (pose === "stand") sway.update(t, 1 + Math.min(1.5, swayKick));

      body.position.set(x, y);
      body.rotation = rot;
      body.scale.set(sx, sy);
      blush.alpha = Math.min(1, e("blush"));
    }
    PIXI.Ticker.shared.add(tick);

    return {
      def,
      view,
      naturalHeight: footY - bbox.minY,
      hitAreas(x, y) {
        const shown = pose === "stand" ? sprite : poseOf(pose).obj;
        const pixels = pose === "stand" ? dressBase.pixels : poseOf(pose).cut.pixels;
        const p = shown.toLocal(new PIXI.Point(x, y));
        const ix = Math.round(p.x);
        const iy = Math.round(p.y);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H || pixels[(iy * W + ix) * 4 + 3] <= 60) return [];
        const fx = ix / W;
        const fy = iy / H;
        if (pose === "stand") {
          for (const [name, [x0, y0, x1, y1]] of def.touchZones || []) {
            if (fx >= x0 && fx <= x1 && fy >= y0 && fy <= y1) return [name];
          }
        }
        return fx >= headBox[0] && fx <= headBox[2] && fy >= headBox[1] && fy <= headBox[3] ? ["head"] : ["body"];
      },
      focus(x, y) {
        const g = view.getGlobalPosition();
        leanTarget = Math.max(-1, Math.min(1, (x - g.x) / 600)) * 0.03;
        // Where the pointer is relative to her face, in the picture's own coordinates.
        const p = sprite.toLocal(new PIXI.Point(x, y));
        const fb = def.eyeBox || def.faceBox || headBox;
        const cx = ((fb[0] + fb[2]) / 2) * W;
        const reach = (fb[2] - fb[0]) * W;
        const dx = p.x - cx;
        if (Math.abs(dx) > reach * 0.9) gazeTarget = Math.sign(dx);
        else if (Math.abs(dx) < reach * 0.4) gazeTarget = 0;
        lastFocusAt = performance.now();
      },
      motion(key) {
        if (key === "tap") hopUntil = performance.now() + 450;
      },
      onFrame: (fn) => frameFns.push(fn),
      applyMood(params, weight) {
        for (const k in params) {
          if (k === "face") {
            if (weight > 0.5 && dress[params.face]) face = params.face;
          } else {
            effects[k] = (effects[k] || 0) + params[k] * weight;
          }
        }
      },
      setMouth(open) {
        mouth = open;
      },
      // "stand" | "sit" | "sleep" | "climb" | "climb2"; false when there's no picture for it.
      setPose(name) {
        if (name === "sleep" && outfitWanted === "pajamas" && !dressPoses.sleep && poses.sleepPajamas) name = "sleepPajamas";
        if (name !== "stand" && !poseOf(name)) return false;
        pose = name;
        showPose();
        return true;
      },
      canPose: (name) => !!poseOf(name),
      // false when the pose is only drawn in her usual clothes and she's wearing something else
      poseFits: (name) => name === "stand" || !outfitWanted || !!dressPoses[name] || (name === "sleep" && outfitWanted === "pajamas" && !!poses.sleepPajamas),
      // "pajamas" | "winter" | null; quietly ignored when the pack has no such outfit.
      async setOutfit(name) {
        if (!def.outfits || !def.outfits[name]) name = null;
        if (name === outfitWanted) return;
        const prev = outfitWanted;
        outfitWanted = name;
        if (name && !outfitSets[name]) {
          try {
            outfitSets[name] = await buildOutfit(name);
          } catch (err) {
            console.warn(err.message);
            outfitWanted = prev; // roll back so she isn't stuck "wearing" it; retry next time
            return;
          }
        }
        if (outfitWanted !== name) return; // changed again while it was being built
        dress = name ? outfitSets[name].textures : textures;
        dressBase = name ? outfitSets[name].base : base;
        dressPoses = name ? outfitSets[name].poses : {};
        if (pose !== "stand" && !dressPoses[pose] && !poses[pose]) pose = "stand";
        sprite.texture = dress.normal;
        showPose();
      },
      // Read-only test hook (used by 工具/自检.mjs): who she is, the outfit worn, the pose pictures it has, and the pose shown now.
      getOutfit: () => ({ id: def.id, outfit: outfitWanted, poses: Object.keys(dressPoses), pose }),
      outfit: () => outfitWanted,
      canSit: () => !!poseOf("sit"),
      sitHeight: () => (poseOf("sit") ? poseOf("sit").top : 0), // from the seat to the top of her head, in view units
      // How far her head moves from where it is standing (view units; dy > 0 = lower).
      poseShift: () => (pose === "stand" ? { dx: 0, dy: 0 } : { dx: poseOf(pose).headX - standHead.x, dy: standHead.top - poseOf(pose).top }),
      headDrop: () => (pose === "stand" ? 0 : standHead.top - poseOf(pose).top),
      visibleExtents: () => ({ left: footX - bbox.minX, right: bbox.maxX - footX, top: footY - bbox.minY }),
      destroy() {
        PIXI.Ticker.shared.remove(tick);
        view.destroy({ children: true });
        for (const name of names) textures[name].destroy(true);
        for (const k in outfitSets) for (const n in outfitSets[k].textures) outfitSets[k].textures[n].destroy(true);
        for (const k in outfitSets) for (const n in outfitSets[k].poses) {
          const t = outfitSets[k].poses[n] && outfitSets[k].poses[n].obj && outfitSets[k].poses[n].obj.texture;
          if (t) t.destroy(true);
        }
      },
    };
  }

  function createCharacter(def, PIXI) {
    const type = def.type || "live2d";
    if (type === "live2d") return createLive2DCharacter(def, PIXI);
    if (type === "sprite") return createSpriteCharacter(def, PIXI);
    return Promise.reject(new Error(`live2d-mascot: unknown character type "${type}"`));
  }

  // -----------------------------------------------------------------------
  // Shadow DOM shell
  // -----------------------------------------------------------------------
  function buildShell(position) {
    const hostEl = document.createElement("div");
    hostEl.id = "live2d-mascot-widget";
    hostEl.style.all = "initial"; // don't let host-page inherited styles leak in
    document.documentElement.appendChild(hostEl);

    const shadow = hostEl.attachShadow({ mode: "open" });
    const side = position === "bottom-left" ? "left" : "right";

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .container {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 2147483000;
          font-family: "PingFang SC", "Microsoft YaHei", -apple-system, "Segoe UI", sans-serif;
        }
        canvas.stage {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none; /* interaction is handled manually, see widget.js */
          touch-action: none;
        }
        .bubble {
          position: absolute;
          left: 0;
          top: 0;
          max-width: 240px;
          padding: 8px 13px;
          background: rgba(255,255,255,0.97);
          color: #2b2540;
          border: 1px solid rgba(120,110,220,0.35);
          border-radius: 14px;
          box-shadow: 0 4px 16px rgba(30,20,60,0.18);
          font-size: 14px;
          line-height: 1.55;
          white-space: pre-wrap;
          word-break: break-all;
          pointer-events: none;
          opacity: 0;
          transition: opacity .2s ease;
        }
        .bubble.show { opacity: 1; }
        .bubble::after {
          content: "";
          position: absolute;
          bottom: -7px;
          left: var(--tail-x, 50%);
          margin-left: -7px;
          border: 7px solid transparent;
          border-bottom: 0;
          border-top-color: rgba(255,255,255,0.97);
        }
        .bubble .rest { visibility: hidden; }
        .controls {
          position: absolute;
          bottom: 14px;
          ${side}: 14px;
          display: flex;
          gap: 6px;
          pointer-events: none;
        }
        .btn {
          pointer-events: auto;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.25);
          background: rgba(30,25,55,0.6);
          color: #fff;
          border-radius: 999px;
          width: 26px;
          height: 26px;
          font-size: 12px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(6px);
          transition: background .15s ease, transform .1s ease;
        }
        .btn:hover { background: rgba(120,110,220,0.65); }
        .btn:active { transform: scale(0.9); }
        .restore-tab {
          position: absolute;
          bottom: 14px;
          ${side}: 14px;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          pointer-events: auto;
          cursor: pointer;
          background: rgba(120,110,220,0.85);
          color: #fff;
          border: none;
          font-size: 18px;
        }
        .panel {
          position: absolute;
          bottom: 50px;
          ${side}: 14px;
          width: 300px;
          padding: 14px 16px 12px;
          background: #fff;
          color: #2b2540;
          border-radius: 16px;
          border: 1px solid rgba(120,110,220,0.25);
          box-shadow: 0 14px 40px rgba(30,20,60,0.25);
          font: 13px/1.5 system-ui, "Microsoft YaHei", sans-serif;
          pointer-events: auto;
          /* never taller than the screen: scroll inside instead */
          max-height: calc(100vh - 66px);
          overflow-y: auto;
          overscroll-behavior: contain;
          box-sizing: border-box;
        }
        .panel-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 15px;
          font-weight: 600;
          margin: -14px -16px 10px;
          padding: 12px 16px 8px;
          position: sticky;
          top: -14px;
          background: #fff;
          z-index: 1;
          border-bottom: 1px solid #eeebf7;
        }
        .panel-close {
          border: none;
          background: none;
          font-size: 18px;
          color: #776f93;
          cursor: pointer;
          line-height: 1;
          padding: 2px 4px;
        }
        .field { display: block; margin: 10px 0; }
        .field-title { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .field select, .field input[type="range"] { width: 100%; font: inherit; }
        .field select { padding: 4px 6px; border: 1px solid #d4d0e6; border-radius: 6px; background: #fff; color: inherit; }
        .check { display: flex; align-items: center; gap: 8px; margin: 8px 0; cursor: pointer; }
        .panel-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
        .reset {
          border: 1px solid #d4d0e6;
          background: #f6f4fd;
          color: #4b3fd1;
          border-radius: 6px;
          padding: 4px 10px;
          font: inherit;
          cursor: pointer;
        }
        .note { color: #8c87a3; font-size: 12px; }
        .bond {
          margin: 8px 0 2px;
          padding: 8px 10px;
          border-radius: 10px;
          background: #faf8ff;
          font-size: 12px;
          color: #6a6385;
          line-height: 1.6;
        }
        .tabs {
          display: flex;
          gap: 2px;
          padding: 3px;
          margin-bottom: 10px;
          border-radius: 10px;
          background: #f1eefb;
        }
        .tab {
          flex: 1;
          border: none;
          background: none;
          padding: 5px 0;
          border-radius: 8px;
          font: 12px system-ui, "Microsoft YaHei", sans-serif;
          color: #6a6385;
          cursor: pointer;
        }
        .tab.on { background: #fff; color: #4b3fd1; font-weight: 600; box-shadow: 0 1px 3px rgba(60,40,120,0.15); }
        .sec { margin: 12px 0 6px; font-size: 12px; font-weight: 600; color: #4a4466; display: flex; align-items: baseline; gap: 6px; }
        .sec .val { margin-left: auto; font-weight: 400; color: #8c87a3; }
        .hint { font-weight: 400; color: #9f99b8; font-size: 11px; }
        .avatars { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
        .avatars button {
          border: none;
          background: none;
          padding: 4px 0;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          font: 11px system-ui, "Microsoft YaHei", sans-serif;
          color: #6a6385;
        }
        .avatars button:hover { background: #f6f4fd; }
        .avatars .face {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          object-fit: cover;
          background: #e9e5fb;
          box-shadow: 0 0 0 2px #fff, 0 0 0 3px #e3dff3;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          color: #fff;
        }
        .avatars.small .face { width: 34px; height: 34px; font-size: 13px; }
        .avatars button span:not(.face) { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .avatars button.on { color: #4b3fd1; font-weight: 600; }
        .avatars button.on .face { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #7a6edc; }
        .avatars .none-face { background: #f1eefb; color: #aaa4c2; }
        .seg { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: #f1eefb; }
        .seg button {
          flex: 1;
          border: none;
          background: none;
          padding: 5px 2px;
          border-radius: 8px;
          font: 12px system-ui, "Microsoft YaHei", sans-serif;
          color: #6a6385;
          cursor: pointer;
          white-space: nowrap;
        }
        .seg button.on { background: #fff; color: #4b3fd1; font-weight: 600; box-shadow: 0 1px 3px rgba(60,40,120,0.15); }
        .switch { display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer; border-bottom: 1px solid #f3f1f9; }
        .switch span { display: flex; flex-direction: column; line-height: 1.35; }
        .switch small { color: #9f99b8; font-size: 11px; }
        .switch input {
          appearance: none;
          -webkit-appearance: none;
          flex: none;
          width: 36px;
          height: 20px;
          margin: 0;
          border-radius: 999px;
          background: #d9d5ea;
          position: relative;
          cursor: pointer;
          transition: background .15s;
        }
        .switch input::before {
          content: "";
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          transition: transform .15s;
        }
        .switch input:checked { background: #7a6edc; }
        .switch input:checked::before { transform: translateX(16px); }
        .panel input[type="range"] { width: 100%; accent-color: #7a6edc; }
        .act-btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .act-btns button {
          border: 1px solid #ebe7f7;
          background: #faf8ff;
          color: #4a4466;
          border-radius: 12px;
          padding: 10px 4px 8px;
          font: 12px system-ui, "Microsoft YaHei", sans-serif;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .act-btns button b { font-size: 22px; font-weight: 400; line-height: 1; }
        .act-btns button:hover { background: #f1eefb; border-color: #d9d3f3; }
        .act-btns button:active { transform: scale(0.96); }
        .act-btns button[hidden] { display: none; }
        .act-btns button.on { background: #f1eefb; border-color: #7a6edc; color: #4b3fd1; font-weight: 600; }
        .hold-end {
          width: 100%;
          margin-top: 8px;
          padding: 7px 0;
          border: none;
          border-radius: 10px;
          background: #7a6edc;
          color: #fff;
          font: 13px system-ui, "Microsoft YaHei", sans-serif;
          cursor: pointer;
        }
        .hold-end:hover { background: #6a5dd0; }
        .chatbox {
          position: absolute;
          bottom: 50px;
          ${side}: 14px;
          width: 340px;
          max-width: calc(100vw - 28px);
          max-height: calc(100vh - 66px);
          display: flex;
          flex-direction: column;
          background: #fff;
          border-radius: 16px;
          border: 1px solid rgba(120,110,220,0.25);
          box-shadow: 0 14px 40px rgba(30,20,60,0.25);
          pointer-events: auto;
          overflow: hidden;
          font: 13px/1.5 system-ui, "Microsoft YaHei", sans-serif;
          color: #2b2540;
        }
        .chat-head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: linear-gradient(135deg, #f3f0ff, #fdf2f8);
          border-bottom: 1px solid #eeebf7;
        }
        .chat-av { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; background: #e9e5fb; box-shadow: 0 0 0 2px #fff; }
        .chat-who { flex: 1; display: flex; flex-direction: column; line-height: 1.3; }
        .chat-who small { color: #8c87a3; font-size: 11px; }
        .chat-close { border: none; background: none; font-size: 20px; color: #8c87a3; cursor: pointer; line-height: 1; padding: 2px 6px; border-radius: 8px; }
        .chat-close:hover { background: rgba(0,0,0,0.05); }
        .chat-log {
          flex: 1;
          min-height: 120px;
          max-height: 260px;
          overflow-y: auto;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: #fbfaff;
        }
        .msg { max-width: 82%; padding: 6px 10px; border-radius: 12px; white-space: pre-wrap; word-break: break-all; }
        .msg.her { align-self: flex-start; background: #fff; border: 1px solid #ebe7f7; border-bottom-left-radius: 4px; }
        .msg.me { align-self: flex-end; background: #7a6edc; color: #fff; border-bottom-right-radius: 4px; }
        .msg.typing { color: #8c87a3; letter-spacing: 3px; }
        .chat-empty { margin: auto; color: #aaa4c2; font-size: 12px; text-align: center; }
        .chat-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px 0; }
        .chat-log, .panel { scrollbar-width: thin; scrollbar-color: #d6d1ec transparent; }
        .chat-log::-webkit-scrollbar, .panel::-webkit-scrollbar { width: 6px; }
        .chat-log::-webkit-scrollbar-thumb, .panel::-webkit-scrollbar-thumb { background: #d6d1ec; border-radius: 3px; }
        .chat-chips button {
          flex: none;
          border: 1px solid #e3dff3;
          background: #fff;
          color: #4b3fd1;
          border-radius: 999px;
          padding: 3px 10px;
          font: 12px system-ui, "Microsoft YaHei", sans-serif;
          cursor: pointer;
        }
        .chat-chips button:hover { background: #f3f0ff; }
        .chat-row { display: flex; gap: 6px; padding: 8px 10px 10px; }
        .chat-input {
          flex: 1;
          min-width: 0;
          font: 14px/1.4 system-ui, "Microsoft YaHei", sans-serif;
          padding: 8px 12px;
          border: 1px solid #ddd8ee;
          border-radius: 999px;
          color: #2b2540;
          background: #fff;
          outline: none;
        }
        .chat-input:focus { border-color: #7a6edc; box-shadow: 0 0 0 3px rgba(122,110,220,0.15); }
        .chat-send {
          width: 38px;
          border: none;
          background: #7a6edc;
          color: #fff;
          border-radius: 50%;
          font-size: 15px;
          cursor: pointer;
        }
        .chat-send:hover { background: #6a5dd0; }
        .chat-send:disabled { background: #c9c3ec; cursor: default; }
        .memory { margin: 8px 0; font-size: 12px; color: #6a6385; }
        .memory summary { cursor: pointer; }
        .memory ul { margin: 6px 0; padding-left: 18px; max-height: 120px; overflow: auto; }
        .mem-clear {
          margin-top: 4px;
          border: 1px solid #e6c9d2;
          background: #fff6f8;
          color: #c0445f;
          border-radius: 6px;
          padding: 3px 8px;
          font: inherit;
          cursor: pointer;
        }
        .bond .hearts { color: #ff6f8e; letter-spacing: 1px; margin-right: 4px; }
        .credit {
          position: absolute;
          bottom: 4px;
          ${side}: 4px;
          color: rgba(255,255,255,0.35);
          font-size: 10px;
          pointer-events: none;
          text-shadow: 0 1px 3px rgba(0,0,0,.6);
        }
        .container.minimized canvas.stage,
        .container.minimized .controls,
        .container.minimized .credit,
        .container.minimized .bubble,
        .container.minimized .chatbox,
        .container.minimized .panel {
          display: none;
        }
        .container.closed { display: none; }
        [hidden] { display: none !important; }
        @media (max-width: 699px) {
          .bubble { max-width: 180px; font-size: 13px; }
        }
      </style>
      <div class="container">
        <canvas class="stage"></canvas>
        <div class="bubble"><span class="shown"></span><span class="rest"></span></div>
        <div class="panel ui" hidden>
          <div class="panel-head">
            <span class="ph-title">看板娘设置</span>
            <button class="panel-close" title="关闭设置">×</button>
          </div>
          <div class="tabs">
            <button class="tab" data-tab="who">人物</button>
            <button class="tab" data-tab="life">日常</button>
            <button class="tab" data-tab="talk">声音和聊天</button>
            <button class="tab" data-tab="move">动作</button>
          </div>

          <section class="page" data-page="who">
            <div class="sec">主人物</div>
            <div class="avatars" data-pick="character"></div>
            <div class="bond"></div>
            <div class="sec">同伴 <span class="hint">可以和她是同一个人</span></div>
            <div class="avatars small" data-pick="buddy"></div>
            <div class="sec">第二位同伴</div>
            <div class="avatars small" data-pick="buddy2"></div>
            <div class="sec">衣服</div>
            <div class="seg" data-pick="outfit"></div>
            <div class="sec">大小 <span class="val size-val"></span></div>
            <input type="range" min="0.6" max="1.6" step="0.1" data-k="size" />
            <select data-k="character" hidden></select>
            <select data-k="buddy" hidden></select>
            <select data-k="buddy2" hidden></select>
            <select data-k="outfit" hidden>
              <option value="auto" data-short="🕒 自动" title="晚上睡衣，冬天冬装">按时间自动换</option>
              <option value="none" data-short="👗 原来的">一直穿原来的衣服</option>
              <option value="pajamas" data-short="🌙 睡衣">睡衣</option>
              <option value="winter" data-short="🧣 冬装">冬装</option>
            </select>
          </section>

          <section class="page" data-page="life" hidden>
            <label class="switch"><input type="checkbox" data-k="autoWander" /><span>自己四处走动</span></label>
            <label class="switch"><input type="checkbox" data-k="hourly" /><span>整点报时<small>含吃饭、熬夜提醒</small></span></label>
            <label class="switch"><input type="checkbox" data-k="effects" /><span>小特效和待机小动作</span></label>
            <label class="switch desktop-only" hidden><input type="checkbox" data-k="watchApps" /><span>让她知道我在用什么程序<small>只在这台电脑上判断，不会发出去</small></span></label>
            <div class="sec">晚上自动睡觉 <span class="hint">到点抱着枕头睡，夜里动鼠标也不醒</span></div>
            <div class="seg" data-pick="bedTime"></div>
            <div class="sec">起床时间 <span class="hint">过了这个点，你一动她就醒</span></div>
            <div class="seg" data-pick="wakeTime"></div>
            <select data-k="bedTime" hidden>
              <option value="off" data-short="关">不自动睡</option>
              <option value="22" data-short="22:00">晚上 10 点</option>
              <option value="23" data-short="23:00">晚上 11 点</option>
              <option value="0" data-short="0:00">半夜 12 点</option>
              <option value="1" data-short="1:00">凌晨 1 点</option>
            </select>
            <select data-k="wakeTime" hidden>
              <option value="6" data-short="6:00">早上 6 点</option>
              <option value="7" data-short="7:00">早上 7 点</option>
              <option value="8" data-short="8:00">早上 8 点</option>
              <option value="9" data-short="9:00">早上 9 点</option>
            </select>
            <div class="sec">休息提醒</div>
            <div class="seg" data-pick="restMinutes"></div>
            <div class="sec">说话频率</div>
            <div class="seg" data-pick="chatter"></div>
            <select data-k="restMinutes" hidden>
              <option value="0" data-short="关">关闭</option>
              <option value="30" data-short="30 分">每 30 分钟</option>
              <option value="45" data-short="45 分">每 45 分钟</option>
              <option value="60" data-short="1 小时">每 1 小时</option>
              <option value="90" data-short="1.5 小时">每 1 个半小时</option>
            </select>
            <select data-k="chatter" hidden>
              <option value="off" data-short="安静" title="只在互动和提醒时说话">安静</option>
              <option value="rare" data-short="偶尔">偶尔说几句</option>
              <option value="normal" data-short="正常">正常</option>
              <option value="chatty" data-short="话多">话多</option>
            </select>
          </section>

          <section class="page" data-page="talk" hidden>
            <label class="switch"><input type="checkbox" data-k="voice" /><span>说话出声</span></label>
            <div class="sec">音量 <span class="val volume-val"></span></div>
            <input type="range" min="0" max="1" step="0.05" data-k="volume" />
            <div class="chat-only" hidden>
              <label class="switch"><input type="checkbox" data-k="chatVoice" /><span>聊天的回答也读出来<small>会用 MiniMax 额度</small></span></label>
              <div class="sec">主动找你聊天 <span class="hint">用 AI，会用额度</span></div>
              <div class="seg" data-pick="aiChatter"></div>
              <select data-k="aiChatter" hidden>
                <option value="off" data-short="关闭">关闭</option>
                <option value="rare" data-short="偶尔" title="约 2 小时一次">偶尔</option>
                <option value="often" data-short="常常" title="约 40 分钟一次">常常</option>
              </select>
              <div class="memory">
                <details>
                  <summary>⏰ 提醒（<span class="rem-count">0</span> 个）</summary>
                  <ul class="rem-list"></ul>
                </details>
                <details>
                  <summary>📒 她记得的事（<span class="mem-count">0</span> 条）</summary>
                  <ul class="mem-list"></ul>
                </details>
                <button class="mem-clear">清空记忆和聊天记录</button>
              </div>
            </div>
            <p class="hint web-only">AI 聊天只有桌面版才有。</p>
          </section>

          <section class="page" data-page="move" hidden>
            <div class="sec">点一下，让她做个动作</div>
            <div class="act-btns">
              <button data-act="wave"><b>👋</b>挥手</button>
              <button data-act="drink"><b>☕</b>喝水</button>
              <button data-act="act"><b>✨</b>专属动作</button>
              <button data-act="cheer"><b>🎉</b>欢呼</button>
              <button data-act="stretch"><b>🙆</b>伸懒腰</button>
              <button data-act="lookAround"><b>👀</b>东张西望</button>
              <button data-act="yawn"><b>🥱</b>打哈欠</button>
              <button data-act="hum"><b>🎵</b>哼歌</button>
            </div>
            <div class="sec">让她保持一个状态 <span class="hint">一直保持，直到你取消</span></div>
            <div class="act-btns holds">
              <button data-hold="sit"><b>🪑</b>坐下</button>
              <button data-hold="sleep"><b>😴</b>睡觉</button>
              <button data-hold="focus"><b>📖</b>看书学习</button>
              <button data-hold="act"><b>✨</b>专属动作</button>
              <button data-hold="sulk"><b>😤</b>闹别扭</button>
              <button data-hold="happy"><b>😊</b>开心</button>
              <button data-hold="shy"><b>😳</b>害羞</button>
              <button data-hold="angry"><b>💢</b>生气</button>
              <button data-hold="surprised"><b>😮</b>惊讶</button>
              <button data-hold="sleepy"><b>🥱</b>犯困</button>
            </div>
            <button class="hold-end" hidden>↩ 恢复正常</button>
          </section>

          <div class="panel-foot">
            <button class="reset">恢复默认</button>
            <span class="note">设置会自动保存</span>
          </div>
        </div>
        <div class="controls ui">
          <button class="btn chat-toggle" title="和她聊天" hidden>💬</button>
          <button class="btn settings" title="设置">⚙</button>
          <button class="btn walk-toggle" title="开始走动">\u{1F6B6}</button>
          <button class="btn minimize" title="最小化">–</button>
          <button class="btn close" title="关闭">×</button>
        </div>
        <div class="chatbox ui" hidden>
          <div class="chat-head">
            <img class="chat-av" alt="" />
            <div class="chat-who"><b class="chat-name"></b><small>和她聊聊天</small></div>
            <button class="chat-close" title="收起（Esc）">×</button>
          </div>
          <div class="chat-log"></div>
          <div class="chat-chips">
            <button data-chip-send="你会什么">❓ 你会什么</button>
            <button data-chip-fill="十分钟后提醒我喝水">⏰ 提醒我…</button>
            <button data-chip-send="我要专心学习25分钟">📖 专注 25 分钟</button>
            <button data-chip-send="猜拳">✊ 猜拳</button>
            <button data-chip-send="出个谜语">🧩 谜语</button>
            <button data-chip-send="挥挥手">👋 挥挥手</button>
          </div>
          <div class="chat-row">
            <input class="chat-input" type="text" maxlength="300" placeholder="想对她说什么？按回车发送" />
            <button class="chat-send" title="发送">➤</button>
          </div>
        </div>
        <div class="credit"></div>
        <button class="restore-tab ui" hidden title="叫她回来">\u{1F43E}</button>
      </div>
    `;

    const q = (sel) => shadow.querySelector(sel);
    return {
      hostEl,
      containerEl: q(".container"),
      canvas: q("canvas.stage"),
      bubble: q(".bubble"),
      bubbleShown: q(".bubble .shown"),
      bubbleRest: q(".bubble .rest"),
      panel: q(".panel"),
      panelClose: q(".panel-close"),
      characterSelect: q('select[data-k="character"]'),
      sizeVal: q(".size-val"),
      bond: q(".bond"),
      volumeVal: q(".volume-val"),
      resetBtn: q(".reset"),
      settingsBtn: q(".settings"),
      chatBtn: q(".chat-toggle"),
      chatBox: q(".chatbox"),
      chatInput: q(".chat-input"),
      chatSend: q(".chat-send"),
      chatLogEl: q(".chat-log"),
      chatAv: q(".chat-av"),
      chatName: q(".chat-name"),
      chatClose: q(".chat-close"),
      memCount: q(".mem-count"),
      memList: q(".mem-list"),
      memClear: q(".mem-clear"),
      remCount: q(".rem-count"),
      remList: q(".rem-list"),
      walkBtn: q(".walk-toggle"),
      minBtn: q(".minimize"),
      closeBtn: q(".close"),
      credit: q(".credit"),
      restoreTab: q(".restore-tab"),
    };
  }

  // -----------------------------------------------------------------------
  // Main init
  // -----------------------------------------------------------------------
  async function init() {
    const config = readConfig();
    await ensureDeps();
    const roster = await loadCharacters(config);

    const PIXI = window.PIXI;
    const DEFAULTS = defaultSettings(config, roster.list);
    let settings = loadSettings(DEFAULTS, roster.list);

    const dom = buildShell(config.position);
    const { canvas, containerEl, bubble, panel, walkBtn } = dom;

    dom.characterSelect.innerHTML = roster.list
      .map((id) => `<option value="${id}">${roster.defs[id].name || id}</option>`)
      .join("");

    const app = new PIXI.Application({
      view: canvas,
      resizeTo: window,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      // Off: a multisampled buffer the size of the whole screen costs well over
      // 100 MB, and her edges come from the pictures' own alpha anyway.
      antialias: false,
    });

    // The actor holds her position and facing; the character view inside it
    // can be swapped without her jumping around.
    const actor = new PIXI.Container();
    app.stage.addChild(actor);
    // Effects sit above her, unmirrored, in screen pixels.
    const fxLayer = new PIXI.Container();
    app.stage.addChild(fxLayer);
    const fx = createEffects(PIXI, fxLayer, app.renderer);

    let character = null;
    let switching = false;

    const isHidden = () =>
      containerEl.classList.contains("minimized") || containerEl.classList.contains("closed");

    // -----------------------------------------------------------------
    // Layout / responsive sizing
    // -----------------------------------------------------------------
    let baseScale = 1;
    let groundY = 0;
    let facing = 1;
    let isMobile = false;
    let userPositioned = false;

    // Body regions in character units relative to her feet; refreshed by measureBody().
    let body = { top: 0, bottom: 0, half: 0, cx: 0 };
    let head = null; // set only when the character has its own "Head" hit area
    let extents = null; // what's actually drawn, which can be lopsided (e.g. a staff on one side)

    function fallbackBody() {
      const oh = character.naturalHeight;
      body = { top: 0.755 * oh, bottom: 0.41 * oh, half: 0.124 * oh, cx: 0 };
      head = null;
      extents = null;
    }

    // How far she reaches towards a screen side, plus a gap, so she's never cut off.
    // Facing flips which of her sides points left.
    function sideMargin(screenSide) {
      const reach = extents
        ? (screenSide === "left") === (facing === 1) ? extents.left : extents.right
        : body.half * 1.3;
      return reach * baseScale + 12;
    }

    function defaultX() {
      const w = window.innerWidth;
      return config.position === "bottom-left" ? sideMargin("left") : w - sideMargin("right");
    }

    const clampX = (x) => Math.min(Math.max(x, sideMargin("left")), window.innerWidth - sideMargin("right"));

    function layout() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // A hidden or not-yet-laid-out window reports 0x0; keep the last good layout.
      if (!character || !w || !h) return;
      isMobile = w < config.mobileBreakpoint;
      const mobileFactor = isMobile ? 0.6 : 1;
      const charScale = character.def.scale || 1;
      baseScale = ((h * 0.5) / character.naturalHeight) * settings.size * charScale * mobileFactor;
      character.view.scale.set(baseScale);
      actor.scale.x = facing;
      groundY = h - Math.max(16, h * 0.03);
      if (perch || fall || hop) {
        // standing on, or on her way to, another program's window
      } else if (!userPositioned) {
        actor.x = defaultX();
        actor.y = groundY;
      } else {
        actor.x = clampX(actor.x);
        actor.y = Math.min(Math.max(actor.y, h * 0.25), h - 10);
      }
      // Her size decides which windows she fits on; recheck the one she's on.
      if (windowsNow.length) refreshPlatforms();
      for (const c of companions) if (c.r) layoutCompanion(c);
    }

    window.addEventListener("resize", layout);

    // -----------------------------------------------------------------
    // Body regions. Not every model has a "Head" hit area (Hiyori's only
    // covers neck to skirt), so a missing head is derived from the body box.
    // -----------------------------------------------------------------
    function measureBox(name) {
      const charH = character.naturalHeight * baseScale;
      const step = Math.max(2, charH / 70);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let y = actor.y - charH; y <= actor.y; y += step) {
        for (let x = actor.x - charH * 0.4; x <= actor.x + charH * 0.4; x += step) {
          if (character.hitAreas(x, y).includes(name)) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (minX === Infinity) return null;
      return {
        top: (actor.y - minY) / baseScale,
        bottom: (actor.y - maxY) / baseScale,
        half: (maxX - minX) / 2 / baseScale,
        cx: (((minX + maxX) / 2 - actor.x) * facing) / baseScale,
      };
    }

    function measureBody() {
      if (!character) return;
      if (!(baseScale > 0)) {
        // Not laid out yet (e.g. the window is still hidden); try again shortly.
        setTimeout(measureBody, 500);
        return;
      }
      const b = measureBox("body");
      if (b) body = b;
      head = measureBox("head");
      extents = character.visibleExtents();
      if (!userPositioned && mode !== "walk") layout(); // edge margins depend on the measured width
    }

    const headTop = () => (head ? head.top : body.top + 0.45 * (body.top - body.bottom));
    const headCx = () => (head ? head.cx : body.cx);

    function regionAt(x, y) {
      if (!character) return null;
      const names = character.hitAreas(x, y);
      if (names.includes("head")) return "head";
      if (names.length && names[0] !== "body") return names[0]; // a named touch zone (hand, tail, ...)
      const fx = ((x - actor.x) * facing) / baseScale; // horizontal offset from her feet, in her units
      const uy = (actor.y - y) / baseScale;
      if (head) {
        // Head hit areas tend to cover just the face; give patting some slack.
        const headH = head.top - head.bottom;
        if (uy >= head.bottom - 0.1 * headH && uy <= head.top + 0.15 * headH && Math.abs(fx - head.cx) <= head.half * 1.4)
          return "head";
      } else {
        const bodyH = body.top - body.bottom;
        if (uy >= body.top - 0.04 * bodyH && uy <= headTop() && Math.abs(fx - body.cx) <= body.half * 0.85) return "head";
      }
      if (names.length) return "body";
      if (uy >= 0 && uy < body.bottom && Math.abs(fx - body.cx) <= body.half * 0.4) return "body";
      return null;
    }

    // -----------------------------------------------------------------
    // Moods, states, mouth — blended right before each render, after
    // motions, blinking and physics have written their values.
    // -----------------------------------------------------------------
    let mood = null; // { params, start, end }
    let stateName = null;
    let stateWeight = 0;
    let lastFrameAt = performance.now();
    let talkingUntil = 0;

    const moodParams = (name) => (character && character.def.moods && character.def.moods[name]) || null;
    const stateParams = (name) => (character && character.def.states && character.def.states[name]) || null;

    function setMood(name, durationMs) {
      const params = moodParams(name);
      if (!params) return;
      const now = performance.now();
      mood = { params, start: now, end: now + durationMs };
      idleAction = null;
      const own = character.def.moodEffects || {};
      const effect = name in own ? own[name] : MOOD_FX[name];
      if (settings.effects && effect) fx.start(effect, durationMs);
    }

    // -----------------------------------------------------------------
    // Idle actions: left alone, she now and then stretches, looks around,
    // yawns or hums. Each frame(p) gives targets for p = 0..1; sprite
    // effects (stretch, look, ...) and Live2D parameters sit side by side,
    // and each renderer simply ignores the names it doesn't have.
    // -----------------------------------------------------------------
    const bump = (p) => Math.sin(Math.PI * p);
    const IDLE_ACTIONS = {
      stretch: {
        ms: 2600,
        frame: (p) => {
          const b = bump(p);
          return Object.assign(
            { stretch: b, ParamAngleY: 22 * b, ParamBodyAngleY: 6 * b, ParamEyeLOpen: 1 - 0.8 * b, ParamEyeROpen: 1 - 0.8 * b },
            b > 0.45 ? { face: "happy" } : {}
          );
        },
      },
      lookAround: {
        ms: 3800,
        frame: (p) => {
          const s = Math.sin(Math.PI * 2 * p);
          return { look: s, ParamAngleX: 28 * s, ParamEyeBallX: 0.9 * s, ParamBodyAngleX: 5 * s };
        },
      },
      yawn: {
        ms: 2800,
        fx: "yawn",
        frame: (p) => {
          const b = bump(p);
          return Object.assign(
            { stretch: 0.5 * b, ParamAngleY: 14 * b, ParamMouthOpenY: b, ParamEyeLOpen: 1 - b, ParamEyeROpen: 1 - b },
            b > 0.35 ? { face: "sleepy" } : {}
          );
        },
      },
      hum: {
        ms: 4200,
        fx: "notes",
        frame: (p) => {
          const s = Math.sin(Math.PI * 4 * p);
          return { wobble: 0.35, face: "happy", ParamAngleZ: 9 * s, ParamBodyAngleZ: 3 * s, ParamEyeLSmile: 1, ParamEyeRSmile: 1 };
        },
      },
    };
    let idleAction = null; // { name, start }
    let lastIdleAction = null;
    let nextIdleActionAt = performance.now() + 12000;
    let dozeWeight = 0;

    function startIdleAction(name) {
      const a = IDLE_ACTIONS[name];
      if (!a) return;
      idleAction = { name, start: performance.now() };
      lastIdleAction = name;
      if (a.fx) fx.start(a.fx, a.ms - 400);
    }

    function maybeIdleAction(now) {
      if (now < nextIdleActionAt) return;
      nextIdleActionAt = now + 15000 + Math.random() * 20000;
      if (!settings.effects || hold || idleAction || mood || speech || stateName || dragState || mode !== "idle" || chatting() || sitting || sleeping || climb || hop || fall || focusing()) return;
      // Dozing off while they're away: only the odd yawn.
      // Tired: mostly yawns and stretches. Lively or in a good mood: more humming and looking around.
      const e = energyAt(new Date().getHours());
      const weights = { stretch: 1, lookAround: 1, yawn: e < 0.5 ? 3 : e < 0.8 ? 1 : 0.3, hum: (e >= 0.85 ? 2 : 1) * (moodOf() >= 75 ? 2 : moodOf() < 30 ? 0.2 : 1) };
      const pool = [];
      for (const n of Object.keys(IDLE_ACTIONS)) if (n !== lastIdleAction) for (let k = 0; k < Math.round(weights[n] * 2); k++) pool.push(n);
      if (!idlePrompted && Math.random() < 0.35 && playAnim(Math.random() < 0.65 ? "act" : "drink")) return;
      const names = idlePrompted ? ["yawn"] : pool.length ? pool : Object.keys(IDLE_ACTIONS);
      startIdleAction(names[Math.floor(Math.random() * names.length)]);
    }

    function setState(name) {
      stateName = name && stateParams(name) ? name : null;
    }

    // -----------------------------------------------------------------
    // Voice: lines pre-generated by voice/generate.mjs, looked up by exact
    // text in voice/<id>/manifest.js. Playback runs through an analyser so
    // the mouth follows the actual loudness of the speech.
    // -----------------------------------------------------------------
    const loadedVoiceManifests = new Set();
    let audioCtx = null;
    let analyser = null;
    let gainNode = null;
    let voicePlaying = null; // { el, src }
    let mouthLevel = 0;
    const levelBuf = new Float32Array(512);

    function loadVoiceManifest(id) {
      if (loadedVoiceManifests.has(id)) return Promise.resolve();
      loadedVoiceManifests.add(id);
      return loadScript(local(`voice/${id}/manifest.js`)).catch(() => {}); // no voice for this character yet
    }

    // If voices were regenerated while she was running, the list she read at
    // start points at clips that are gone. Read it again (at most once a minute).
    const voiceReloadedAt = {};
    function reloadVoiceManifest(id) {
      const now = Date.now();
      if (now - (voiceReloadedAt[id] || 0) < 60000) return;
      voiceReloadedAt[id] = now;
      loadScript(local(`voice/${id}/manifest.js`) + "?t=" + now).catch(() => {});
    }

    function ensureAudio() {
      if (audioCtx) return;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        audioCtx = null; // no Web Audio available; text bubbles and audio elements still work
        return;
      }
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      gainNode = audioCtx.createGain();
      gainNode.gain.value = settings.volume;
      analyser.connect(gainNode);
      gainNode.connect(audioCtx.destination);
    }

    function stopVoice() {
      if (!voicePlaying) return;
      voicePlaying.el.pause();
      voicePlaying.src.disconnect();
      voicePlaying = null;
    }

    // Returns the clip length in ms, or 0 when there's no clip / voice is off.
    // clip: { url, ms } for speech made on the spot (chat replies) instead of a pre-made line.
    function playVoice(text, clip) {
      if (!settings.voice || !character) return 0;
      const id = character.def.id;
      const entry = clip || ((window.Live2DMascotVoices || {})[id] || {})[text];
      if (!entry) return 0;
      ensureAudio();
      if (!audioCtx || !analyser) return 0; // Web Audio unavailable: skip, the line still shows
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      const el = new Audio(clip ? clip.url : local(`voice/${id}/${entry.f}`));
      const src = audioCtx.createMediaElementSource(el);
      src.connect(analyser);
      const playing = { el, src };
      voicePlaying = playing;
      el.onended = () => {
        if (voicePlaying === playing) stopVoice();
      };
      el.onerror = () => {
        if (voicePlaying === playing) stopVoice();
        if (!clip) reloadVoiceManifest(id);
      };
      // Browsers block sound until the visitor has interacted with the page; then it simply stays silent.
      el.play().catch(() => {
        if (voicePlaying === playing) stopVoice();
      });
      return entry.ms || 0;
    }

    // Loudness of the playing clip mapped to 0..1, or null when nothing is playing.
    function voiceLevel() {
      if (!voicePlaying) {
        mouthLevel = 0;
        return null;
      }
      if (!analyser) return null;
      analyser.getFloatTimeDomainData(levelBuf);
      let sum = 0;
      for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
      const target = Math.min(1, Math.sqrt(sum / levelBuf.length) * 7);
      mouthLevel += (target - mouthLevel) * (target > mouthLevel ? 0.6 : 0.3);
      return mouthLevel;
    }

    // Autoplay rules: the audio context may only start after a user gesture.
    const resumeAudio = () => audioCtx && audioCtx.state === "suspended" && audioCtx.resume().catch(() => {});

    function onCharacterFrame() {
      const now = performance.now();
      const dt = now - lastFrameAt;
      lastFrameAt = now;

      const target = stateName ? 1 : 0;
      stateWeight += (target - stateWeight) * Math.min(1, dt / 250);
      const sp = stateParams(stateName);
      if (sp && stateWeight > 0.001) character.applyMood(sp, stateWeight);
      if (stateName === "thinking" && settings.effects) fx.keep("thinking");

      // Nobody around for a while: she nods off until they come back.
      const dozing = settings.effects && idlePrompted && !speech;
      dozeWeight += ((dozing ? 1 : 0) - dozeWeight) * Math.min(1, dt / 600);
      const sleepy = moodParams("sleepy");
      if (sleepy && dozeWeight > 0.001) character.applyMood(sleepy, dozeWeight);
      if (dozing) fx.keep("zzz");

      if (idleAction) {
        const a = IDLE_ACTIONS[idleAction.name];
        const age = now - idleAction.start;
        if (age >= a.ms || speech) {
          idleAction = null;
        } else {
          const w = Math.min(1, age / 300, (a.ms - age) / 300);
          character.applyMood(a.frame(age / a.ms), w);
        }
      }

      if (mood) {
        if (now > mood.end + 400) {
          mood = null;
        } else {
          const w = Math.min(1, (now - mood.start) / 200) * Math.min(1, Math.max(0, (mood.end + 400 - now) / 400));
          character.applyMood(mood.params, w);
        }
      }
      const level = voiceLevel();
      if (level !== null) {
        character.setMouth(level);
      } else if (now < talkingUntil) {
        character.setMouth(0.2 + 0.8 * Math.abs(Math.sin(now / 55)) * (0.55 + 0.45 * Math.sin(now / 170)));
      }
    }

    // -----------------------------------------------------------------
    // Speech bubble
    // -----------------------------------------------------------------
    let speech = null; // { chars, priority, start, shown, endAt }
    let lastSpokeAt = 0;
    let thinkingNow = false;

    function say(text, opts = {}) {
      if (!text || isHidden() || !character) return false;
      const priority = opts.priority ?? 1;
      const now = performance.now();
      if (speech && now < speech.endAt && priority < speech.priority) return false;
      const chars = Array.from(String(text));
      stopVoice();
      // opts.voice: the clip is recorded under different (spoken) words than the bubble shows
      const voiceMs = playVoice(opts.voice || String(text), opts.clip);
      // With a voice clip, type the text out at the pace it's spoken.
      const charMs = voiceMs ? Math.max(25, Math.min(CHAR_MS, (voiceMs * 0.85) / chars.length)) : CHAR_MS;
      const typeMs = chars.length * charMs;
      const readMs = Math.min(6000, Math.max(2500, 1800 + chars.length * 90));
      const totalMs = Math.max(typeMs + readMs, voiceMs + 700);
      speech = { chars, priority, start: now, shown: -1, endAt: now + totalMs, charMs };
      bubble.classList.add("show");
      if (!dom.chatBox.hidden && String(text) !== character.def.thinkingText) pushChat("her", String(text));
      lastSpokeAt = Date.now();
      if (opts.mood) setMood(opts.mood, totalMs);
      updateBubble(now); // place it right away instead of flashing at its old spot
      return true;
    }

    function linesFor(event) {
      const own = (character && character.def.lines) || {};
      if (event.startsWith("greeting.")) {
        const slot = event.slice(9);
        return (own.greeting && own.greeting[slot]) || (roster.defaultLines.greeting || {})[slot];
      }
      const groupOf = (name) => (isLineList(own[name]) ? own[name] : roster.defaultLines[name]);
      const base = groupOf(event);
      if (!character) return base;
      let unlocked = [];
      for (let k = 1; k <= levelOf(bond().points); k++) {
        const more = groupOf(event + "+" + k);
        if (isLineList(more)) unlocked = unlocked.concat(more);
      }
      return unlocked.length ? (isLineList(base) ? base : []).concat(unlocked) : base;
    }

    // -----------------------------------------------------------------
    // Affection: grows with time together, taps and head pats; saved per
    // character in this browser (the desktop pet keeps its own).
    // -----------------------------------------------------------------
    let affection = {};
    try {
      affection = JSON.parse(localStorage.getItem(AFFECTION_KEY) || "{}") || {};
      if (typeof affection !== "object" || affection === null || Array.isArray(affection)) affection = {};
    } catch {
      affection = {};
    }
    const gainedAt = {};

    function bond() {
      const id = character.def.id;
      return affection[id] || (affection[id] = { points: 0, days: 0, lastDay: "", activeMs: 0 });
    }

    function saveAffection() {
      try {
        localStorage.setItem(AFFECTION_KEY, JSON.stringify(affection));
      } catch {
        // private window etc.: the bond just won't outlive this visit
      }
    }

    // reason + cooldownMs keep repeated pokes from farming points.
    function gainAffection(amount, reason, cooldownMs = 0) {
      if (!character) return;
      const now = Date.now();
      const key = character.def.id + ":" + reason;
      if (cooldownMs && now - (gainedAt[key] || 0) < cooldownMs) return;
      gainedAt[key] = now;
      const b = bond();
      const before = levelOf(b.points);
      b.points = Math.max(0, b.points + amount);
      saveAffection();
      renderBond();
      const after = levelOf(b.points);
      if (after > before) {
        const who = character;
        const wait = speech ? Math.max(0, speech.endAt - performance.now()) : 0;
        setTimeout(() => {
          if (character !== who) return;
          react("levelUp" + after);
          if (settings.effects) fx.start("hearts", 3000);
        }, wait + 600);
      }
    }

    // Mood (0..100, per character): attention lifts it, being ignored while
    // you're right there slowly sinks it until she sulks.
    const moodOf = () => {
      const b = bond();
      return typeof b.mood === "number" ? b.mood : 60;
    };
    let lastAttentionAt = Date.now();
    function changeMood(delta, attention) {
      if (!character) return;
      const b = bond();
      const before = moodOf();
      b.mood = Math.max(0, Math.min(100, before + delta));
      if (attention) lastAttentionAt = Date.now();
      saveAffection();
      renderBond();
      // making up after a sulk
      if (before < 30 && b.mood >= 30) setTimeout(() => react("makeUp"), (speech ? Math.max(0, speech.endAt - performance.now()) : 0) + 500);
    }

    // First time she sees you on a new day.
    function noteNewDay() {
      if (!character) return;
      const today = new Date().toDateString();
      const b = bond();
      if (b.lastDay === today) return;
      b.lastDay = today;
      b.days += 1;
      gainAffection(5, "day");
      if ([7, 30, 100, 365].includes(b.days)) {
        const who = character;
        setTimeout(() => {
          if (character !== who) return;
          react("anniv" + b.days);
          if (settings.effects) fx.start("hearts", 4000);
        }, 4000);
      }
    }

    function renderBond() {
      if (!character || !dom.bond) return;
      const b = bond();
      const lv = Math.max(0, Math.min(levelOf(b.points), AFFECTION_LEVELS.length - 1));
      const next = AFFECTION_LEVELS[lv + 1];
      const hearts = "❤".repeat(Math.max(0, lv + 1)) + "♡".repeat(Math.max(0, AFFECTION_LEVELS.length - lv - 1));
      dom.bond.innerHTML = `<span class="hearts">${hearts}</span>好感度：${AFFECTION_LEVELS[lv].name}（${b.points}${next ? " / " + next.min : ""}）· 认识 ${Math.max(1, b.days)} 天<br>心情：${moodName(moodOf())} · 精力：${energyName(energyAt(new Date().getHours()))}`;
    }

    // The single entry point for "something happened, respond to it".
    const warnedMoodRules = new Set();
    function react(event, vars = {}) {
      if (!character) return null;
      const base = event.startsWith("greeting.") ? "greeting" : event;
      const r = Object.assign({}, DEFAULT_REACTIONS[base], character.def.reactions && character.def.reactions[base]);
      if (r.chance != null && Math.random() > r.chance) return null;

      let line = pickFrom(character.def.id + ":" + event, linesFor(event), base);
      for (const k in vars) line = line.split("{" + k + "}").join(vars[k]);

      if (settings.effects && ANIM_FOR[base]) playAnim(ANIM_FOR[base]);

      let moodName = r.mood;
      for (const rule of r.moodRules || []) {
        try {
          if (new RegExp(rule.match).test(line)) moodName = rule.mood;
        } catch {
          if (!warnedMoodRules.has(rule.match)) {
            warnedMoodRules.add(rule.match);
            console.warn("live2d-mascot: bad moodRule pattern skipped:", rule.match);
          }
        }
      }
      const priority = r.priority ?? 1;

      // "Think before answering": a thinking bubble and pose first, then the line.
      const thinkingText = character.def.thinkingText;
      if (r.think && thinkingText && !thinkingNow && Math.random() < r.think) {
        if (!say(thinkingText, { priority })) return null;
        thinkingNow = true;
        const who = character;
        const prevState = stateName;
        setState("thinking");
        setTimeout(() => {
          thinkingNow = false;
          if (character !== who) return;
          setState(prevState);
          if (r.motion) character.motion(r.motion, true);
          say(line, { priority, mood: moodName });
        }, r.thinkMs || 1600);
        return line;
      }

      if (r.motion) character.motion(r.motion, true);
      return say(line, { priority, mood: moodName }) ? line : null;
    }

    function updateBubble(now) {
      if (!speech) return;
      if (now >= speech.endAt || isHidden()) {
        bubble.classList.remove("show");
        speech = null;
        return;
      }
      const n = Math.min(speech.chars.length, Math.floor((now - speech.start) / speech.charMs));
      if (n !== speech.shown) {
        speech.shown = n;
        dom.bubbleShown.textContent = speech.chars.slice(0, n).join("");
        dom.bubbleRest.textContent = speech.chars.slice(n).join("");
      }
      if (n < speech.chars.length) talkingUntil = now + 120;

      const headX = actor.x + (headCx() + poseDx()) * baseScale * facing;
      // Above whatever is drawn highest (a hat sticks out above the head hit area).
      const topUnits = (extents ? Math.max(extents.top, headTop()) : headTop()) - poseDrop();
      const headY = actor.y - topUnits * baseScale;
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;
      const left = Math.min(Math.max(headX - bw / 2, 8), window.innerWidth - bw - 8);
      const top = Math.max(8, headY - bh - 12);
      bubble.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      bubble.style.setProperty("--tail-x", Math.min(Math.max(headX - left, 14), bw - 14) + "px");
    }

    // -----------------------------------------------------------------
    // Character switching
    // -----------------------------------------------------------------
    function applyCredit(def) {
      const credit = def.credit || {};
      dom.credit.textContent = credit.text || "";
      dom.credit.title = credit.title || "";
    }

    async function setCharacter(id, announce = true) {
      const def = roster.defs[id];
      if (!def || switching || (character && character.def.id === id)) return false;
      switching = true;
      try {
        const [next] = await Promise.all([createCharacter(def, PIXI), loadVoiceManifest(id)]);
        stopVoice();
        if (character) {
          actor.removeChild(character.view);
          character.destroy();
        }
        character = next;
        dayPose = null;
        if (hold && inNight(new Date())) nightOff = nightKey(new Date());
        hold = null;
        saveHold();
        actor.addChild(character.view);
        character.onFrame(onCharacterFrame);
        mood = null;
        stateName = null;
        stateWeight = 0;
        idleAction = null;
        anim = null;
        sitting = false;
        sleeping = false;
        climb = null;
        climbAfterWalk = null;
        fx.clear();
        speech = null;
        bubble.classList.remove("show");
        applyCredit(def);
        fallbackBody();
        layout();
        // Let a few frames pose her before measuring her body regions.
        renderBond();
        applyOutfit();
        if (!dom.chatBox.hidden) openChat();
        setTimeout(() => {
          measureBody();
          if (announce) react("switchIn");
          noteNewDay();
        }, 600);
        return true;
      } catch (err) {
        console.error(err);
        return false;
      } finally {
        switching = false;
      }
    }

    // -----------------------------------------------------------------
    // Surfaces (desktop pet only): the tops of other programs' windows.
    // She can hop onto them, rides along when a window is dragged, and
    // falls when the window under her closes, minimizes or gets covered.
    // -----------------------------------------------------------------
    let windowsNow = []; // [[id, left, top, right, bottom], ...] front-most first
    let platforms = []; // visible stretches of window tops: { id, y, x0, x1, left }
    let perch = null; // { id, y, left } while standing on a window
    let fall = null; // { vy, fromDrag, fromY }
    let hop = null; // { x0, y0, x1, y1, top, start, ms, seg }
    let hopAfterWalk = null; // { id, x }: where to hop once the walk ends
    let sitting = false; // sitting on the edge of the window she stands on
    let sleeping = false; // asleep on the ground, hugging a pillow
    let climb = null; // { id, side, wallX, top, frame, frameAt } while climbing a window's side
    let climbAfterWalk = null; // { id, side }: climb once the walk ends
    let perchSince = 0;
    let sitAllowedAt = 0;

    // Little animations from pairs of pictures (wave, drink, her own thing).
    const ANIMS = {
      wave: [["wave1", 350], ["wave2", 350], ["wave1", 350], ["wave2", 350], ["wave1", 350], ["wave2", 450]],
      drink: [["drink1", 900], ["drink2", 1700], ["drink1", 700]],
      act: [["act1", 1300], ["act2", 1100], ["act1", 900], ["act2", 1300]],
      cheer: [["cheer1", 300], ["cheer2", 380], ["cheer1", 300], ["cheer2", 380], ["cheer1", 500]],
    };
    let anim = null; // { steps, i, at }
    function playAnim(kind) {
      const steps = ANIMS[kind];
      if (!steps || !character || !character.canPose || !steps.every(([p]) => character.canPose(p))) return false;
      if (hold || anim || sitting || sleeping || climb || hop || fall || dragState || mode === "walk") return false;
      anim = { steps, i: 0, at: performance.now() };
      character.setPose(steps[0][0]);
      return true;
    }
    function stepAnim(now) {
      if (!anim) return;
      if (dragState || mode === "walk" || hop || fall || climb) {
        anim = null;
        character.setPose("stand");
        return;
      }
      if (now - anim.at < anim.steps[anim.i][1]) return;
      anim.i++;
      anim.at = now;
      if (anim.i >= anim.steps.length) {
        anim = null;
        character.setPose("stand");
      } else {
        character.setPose(anim.steps[anim.i][0]);
      }
    }

    // Actions on request (settings buttons, chat words): stop walking or sitting first.
    const ACTION_KIND = { wave: "anim", drink: "anim", act: "anim", cheer: "anim", stretch: "idle", lookAround: "idle", yawn: "idle", hum: "idle" };
    function canDoAction(name) {
      if (!character) return false;
      if (ACTION_KIND[name] === "anim") return !!(character.canPose && ANIMS[name].every(([p]) => character.canPose(p)));
      return !!ACTION_KIND[name];
    }
    function doAction(name) {
      if (!canDoAction(name)) return false;
      endHold();
      if (mode === "walk") setMode("idle");
      if (sitting) standUp();
      if (sleeping) {
        sleeping = false;
        character.setPose("stand");
      }
      if (anim) {
        anim = null;
        character.setPose("stand");
      }
      idleAction = null;
      autoWanderAt = performance.now() + 10000;
      if (ACTION_KIND[name] === "anim") return playAnim(name);
      startIdleAction(name);
      return true;
    }

    // Outfit by the clock (settings: 衣服) or chosen there; the API can force one for a while.
    let outfitOverride;
    function outfitNow(d = new Date()) {
      if (outfitOverride !== undefined) return outfitOverride;
      // older settings had an on/off switch called "outfits"
      const pick = settings.outfit === "auto" && settings.outfits === false ? "none" : settings.outfit || "auto";
      if (pick === "none") return null;
      if (pick === "pajamas" || pick === "winter") return pick;
      const h = d.getHours();
      const m = d.getMonth() + 1;
      if (h >= 22 || h < 7) return "pajamas";
      if (m === 12 || m <= 2) return "winter";
      return null;
    }
    function applyOutfit() {
      const o = outfitNow();
      if (character && character.setOutfit) character.setOutfit(o);
      for (const c of companions) if (c.r && c.r.setOutfit) c.r.setOutfit(o);
    }

    // Head and bubble come down with her when she sits.
    const poseDrop = () => (character && character.headDrop ? character.headDrop() : 0);
    const poseDx = () => (character && character.poseShift ? character.poseShift().dx : 0);

    function standUp() {
      if (!sitting) return;
      sitting = false;
      character.setPose("stand");
      sitAllowedAt = performance.now() + 10000;
    }

    // Left alone on a window for a while, she sits down on its edge.
    function updateSitting(now) {
      if (!character || !character.canSit || anim) return;
      if (hold) {
        sitting = false; // the held state owns her pose
        sleeping = false;
        return;
      }
      // Away for a while and already dozing on the ground: she falls asleep with her pillow.
      const wantSleep =
        settings.effects && idlePrompted && Date.now() - lastActivity > IDLE_PROMPT_MS + 60000 &&
        !perch && !hop && !fall && !climb && !dragState && !speech && mode === "idle" && character.canPose("sleep");
      if (wantSleep && !sleeping) sleeping = character.setPose("sleep");
      else if (sleeping && !wantSleep) {
        sleeping = false;
        character.setPose("stand");
      }
      if (sleeping || climb) return;
      if (perch && perch.sitOnly) {
        // No room to stand here: she talks and reacts sitting down, and only gets up to leave.
        const leaving = hop || fall || dragState || mode === "walk";
        if (sitting && leaving) standUp();
        else if (!sitting && !leaving) sitting = character.setPose("sit");
        return;
      }
      const busy = !perch || mode !== "idle" || hop || fall || dragState || speech || mood || idleAction || stateName || chatting();
      if (sitting && busy) standUp();
      else if (!sitting && !busy && character.canSit() && now - perchSince > 6000 && now > sitAllowedAt) {
        sitting = character.setPose("sit");
      }
    }
    const GRAVITY = 2600; // pixels per second, per second

    const surfaceY = () => (perch ? perch.y : groundY);

    // Where she can stand on her current surface without poking over its ends.
    function clampToSurface(x) {
      x = clampX(x);
      if (!perch) return x;
      const seg = platforms.find((p) => p.id === perch.id && actor.x >= p.x0 - 4 && actor.x <= p.x1 + 4);
      if (!seg) return x;
      const half = Math.min(body.half * baseScale, (seg.x1 - seg.x0) / 2);
      return Math.min(Math.max(x, seg.x0 + half), seg.x1 - half);
    }

    // Remove [a, b] from a list of [x0, x1] stretches.
    function cutSpan(spans, a, b) {
      const out = [];
      for (const [x0, x1] of spans) {
        if (b <= x0 || a >= x1) out.push([x0, x1]);
        else {
          if (a > x0) out.push([x0, a]);
          if (b < x1) out.push([b, x1]);
        }
      }
      return out;
    }

    function refreshPlatforms() {
      if (!character || !(baseScale > 0)) return;
      const w = window.innerWidth;
      const height = character.naturalHeight * baseScale;
      // Where there's no room to stand she can still sit, which needs about half the height.
      const sitHeight = character.canSit && character.canSit() ? character.sitHeight() * baseScale : height;
      const minWidth = Math.max(60, body.half * baseScale * 2.2);
      const next = [];
      windowsNow.forEach(([id, l, t, r, b], i) => {
        // She needs headroom above the edge, and the edge must be above the taskbar.
        if (t < Math.min(height, sitHeight) + 8 || t > groundY - 30 || r <= 0 || l >= w) return;
        let spans = [[Math.max(0, l), Math.min(w, r)]];
        for (let j = 0; j < i; j++) {
          const [, L, T, R, B] = windowsNow[j];
          if (T <= t + 2 && B > t) spans = cutSpan(spans, L, R); // covered by a window in front
        }
        const sitOnly = t < height + 8;
        for (const [x0, x1] of spans) if (x1 - x0 >= minWidth) next.push({ id, y: t, x0, x1, left: l, sitOnly });
      });
      platforms = next;

      if (!perch) return;
      // Follow her window around; drop her if it's gone from under her feet.
      const own = platforms.filter((p) => p.id === perch.id);
      const shift = own.length ? own[0].left - perch.left : 0;
      const x = actor.x + shift;
      const seg = own.find((p) => x >= p.x0 - 4 && x <= p.x1 + 4);
      if (!seg) {
        startFall(false);
        return;
      }
      perch.y = seg.y;
      perch.left = seg.left;
      perch.sitOnly = seg.sitOnly;
      if (!dragState && !hop) {
        actor.x = x;
        if (mode === "walk") walkTargetX = clampToSurface(walkTargetX + shift);
        else actor.y = perch.y;
      }
    }

    if (config.desktop && config.desktop.onWindows) {
      config.desktop.onWindows((list) => {
        windowsNow = Array.isArray(list) ? list : [];
        refreshPlatforms();
      });
    }

    function startFall(fromDrag) {
      perch = null;
      hop = null;
      hopAfterWalk = null;
      if (mode === "walk") setMode("idle");
      fall = { vy: 0, fromDrag, fromY: actor.y };
      if (!fromDrag) react("fall");
    }

    function stepFall(dtMs) {
      const dt = Math.min(dtMs, 50) / 1000;
      const prevY = actor.y;
      fall.vy += GRAVITY * dt;
      let y = prevY + fall.vy * dt;
      let landOn = null;
      if (y >= groundY) {
        y = groundY;
        landOn = { id: "ground" };
      } else {
        for (const p of platforms) {
          if (p.y >= prevY - 1 && p.y <= y && actor.x >= p.x0 && actor.x <= p.x1 && (!landOn || p.y < landOn.y)) landOn = p;
        }
        if (landOn) y = landOn.y;
      }
      actor.y = y;
      if (!landOn) return;
      const wasDrag = fall.fromDrag;
      const dropped = y - fall.fromY;
      fall = null;
      perch = landOn.id === "ground" ? null : { id: landOn.id, y: landOn.y, left: landOn.left, sitOnly: landOn.sitOnly };
      perchSince = performance.now();
      userPositioned = false;
      character.motion("tap");
      if (wasDrag) react("dragEnd");
      else if (dropped > 120) react("land");
      autoWanderAt = performance.now() + (perch ? 20000 + Math.random() * 20000 : 8000 + Math.random() * 8000);
    }

    // A window she can climb: its side reaches down near the taskbar and is on
    // screen and not hidden under a window in front. Returns { side, x } or null.
    function climbableSide(id) {
      const i = windowsNow.findIndex((w) => w[0] === id);
      if (i < 0) return null;
      const [, l, t, r, b] = windowsNow[i];
      if (b < groundY - 60) return null;
      const covered = (x) => windowsNow.slice(0, i).some(([, L, T, R, B]) => x >= L && x <= R && B > t && T < groundY);
      const room = character.naturalHeight * baseScale * 0.5;
      const sides = [];
      if (l > room && !covered(l - 2)) sides.push({ side: "left", x: l });
      if (r < window.innerWidth - room && !covered(r + 2)) sides.push({ side: "right", x: r });
      if (!sides.length) return null;
      // the side nearer to where she is now
      sides.sort((a, c) => Math.abs(a.x - actor.x) - Math.abs(c.x - actor.x));
      return sides[0];
    }

    function startClimb(plan) {
      climbAfterWalk = null;
      const w = windowsNow.find((x) => x[0] === plan.id);
      if (!w) return;
      const wallX = plan.side === "left" ? w[1] : w[3];
      // the picture clings to a wall on its right; mirror it for a wall on her left
      facing = plan.side === "left" ? 1 : -1;
      actor.scale.x = facing;
      actor.x = wallX;
      perch = null;
      climb = { id: plan.id, side: plan.side, wallX, top: w[2], frame: 0, frameAt: performance.now() };
      character.setPose("climb");
      react("climb");
    }

    function stepClimb(now, dtMs) {
      const w = windowsNow.find((x) => x[0] === climb.id);
      if (!w) {
        // the window closed or minimized under her hands
        climb = null;
        character.setPose("stand");
        startFall(false);
        return;
      }
      climb.wallX = climb.side === "left" ? w[1] : w[3];
      climb.top = w[2];
      actor.x = climb.wallX;
      // a step every 300 ms: swap hands and pull up a little faster on the swap
      if (now - climb.frameAt > 300) {
        climb.frame = 1 - climb.frame;
        climb.frameAt = now;
        if (character.canPose("climb2")) character.setPose(climb.frame ? "climb2" : "climb");
      }
      const phase = (now - climb.frameAt) / 300;
      actor.y -= (70 + 60 * Math.sin(Math.PI * phase)) * (Math.min(dtMs, 50) / 1000);
      if (actor.y > climb.top) return;
      // at the top: step over onto the window
      const id = climb.id;
      const side = climb.side;
      climb = null;
      actor.y = w[2];
      character.setPose("stand");
      facing = side === "left" ? 1 : -1;
      actor.scale.x = facing;
      if (!startHop({ id, x: side === "left" ? w[1] + 40 : w[3] - 40 })) startFall(false);
    }

    function startHop(target) {
      hopAfterWalk = null;
      const seg = target.id === "ground" ? null : platforms.find((p) => p.id === target.id && target.x >= p.x0 - 4 && target.x <= p.x1 + 4);
      if (target.id !== "ground" && !seg) return false; // that window moved away meanwhile
      const half = seg ? Math.min(body.half * baseScale, (seg.x1 - seg.x0) / 2) : 0;
      const x1 = seg ? Math.min(Math.max(actor.x, seg.x0 + half), seg.x1 - half) : clampX(actor.x);
      const y1 = seg ? seg.y : groundY;
      const top = Math.min(actor.y, y1) - Math.max(60, character.naturalHeight * baseScale * 0.12);
      hop = { x0: actor.x, y0: actor.y, x1, y1, top, start: performance.now(), ms: 650, seg };
      perch = null;
      if (seg) react("climb");
      return true;
    }

    function stepHop(now) {
      const t = Math.min(1, (now - hop.start) / hop.ms);
      // A parabola through the start, the top of the arc and the landing spot.
      const { x0, y0, x1, y1, top } = hop;
      const c = 2 * top - (y0 + y1) / 2;
      actor.x = x0 + (x1 - x0) * t;
      actor.y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * c + t * t * y1;
      if (t < 1) return;
      const seg = hop.seg;
      hop = null;
      userPositioned = false;
      autoWanderAt = performance.now() + (seg ? 20000 + Math.random() * 20000 : 8000 + Math.random() * 8000);
      if (seg) {
        const still = platforms.find((p) => p.id === seg.id && actor.x >= p.x0 - 4 && actor.x <= p.x1 + 4);
        if (still) {
          perch = { id: still.id, y: still.y, left: still.left, sitOnly: still.sitOnly };
          perchSince = performance.now();
        }
        else startFall(false);
      }
    }

    // -----------------------------------------------------------------
    // Idle <-> Walk. None of the samples has an authored walk cycle, so
    // "walking" = she strolls along the bottom of the viewport.
    // -----------------------------------------------------------------
    let mode = "idle";
    let walkTargetX = 0;
    const WALK_SPEED = 95;
    let autoWanderAt = performance.now() + 6000 + Math.random() * 4000;

    let peekAfterWalk = false;
    function walkToPeek(x) {
      setMode("walk");
      hopAfterWalk = null;
      climbAfterWalk = null;
      walkTargetX = clampX(x);
      facing = walkTargetX >= actor.x ? 1 : -1;
      actor.scale.x = facing;
      peekAfterWalk = true;
    }

    function pickWalkTarget() {
      const w = window.innerWidth;
      const lo = Math.min(sideMargin("left"), sideMargin("right"));
      walkTargetX = lo + Math.random() * Math.max(1, w - lo * 2);
      hopAfterWalk = null;
      // Now and then: walk under another window and hop onto it, or hop back down.
      if (platforms.length && Math.random() < 0.4) {
        const here = perch ? perch.id : "ground";
        const options = platforms.filter((p) => p.id !== here);
        if (perch) options.push({ id: "ground" });
        const target = options[Math.floor(Math.random() * options.length)];
        if (target) {
          if (target.id !== "ground") walkTargetX = target.x0 + Math.random() * (target.x1 - target.x0);
          hopAfterWalk = { id: target.id, x: walkTargetX };
        }
      }
      if (perch && perch.sitOnly) {
        if (!hopAfterWalk) hopAfterWalk = { id: "ground", x: actor.x };
        walkTargetX = actor.x; // no strolling where she can't stand up
      }
      climbAfterWalk = null;
      if (hopAfterWalk && hopAfterWalk.id !== "ground" && !perch && character.canPose && character.canPose("climb") && Math.random() < 0.6) {
        const side = climbableSide(hopAfterWalk.id);
        if (side) {
          climbAfterWalk = { id: hopAfterWalk.id, side: side.side };
          hopAfterWalk = null;
          walkTargetX = side.x;
        }
      }
      facing = walkTargetX >= actor.x ? 1 : -1;
      actor.scale.x = facing;
      walkTargetX = clampToSurface(walkTargetX); // margins depend on which way she now faces
      actor.y = surfaceY();
      userPositioned = false;
    }

    function setMode(next) {
      mode = next;
      walkBtn.textContent = mode === "walk" ? "⏸" : "\u{1F6B6}";
      walkBtn.title = mode === "walk" ? "停下来" : "开始走动";
      if (mode === "idle") {
        // tired: she stays put longer between strolls
        autoWanderAt = performance.now() + (8000 + Math.random() * 8000) / (0.4 + energyAt(new Date().getHours()));
      } else if (character) {
        pickWalkTarget();
        character.motion("walk");
        react("walk");
      }
    }

    walkBtn.addEventListener("click", () => {
      endHold();
      setMode(mode === "walk" ? "idle" : "walk");
    });

    // Everyday poses: steps while walking, dangling while held, studying while you
    // focus, sulking when she's upset. Sitting, sleeping, climbing and actions own
    // her pose while they last. Talking (unless walking) shows the normal picture (it has the mouth).
    // In pajamas or winter clothes a pose is used only when it's drawn in them (def.outfitPoses).
    // States picked in the settings (or by chat) that she keeps until cancelled.
    // Mouse moves and time don't end them; dragging her, switching character or
    // 「恢复正常」 does. A pose state owns her picture; a mood state keeps her face.
    const HOLDS = {
      sit: { pose: "sit" },
      sleep: { pose: "sleep" },
      focus: { pose: "focus" },
      act: { pose: "act" },
      sulk: { pose: "sulk" },
      happy: { mood: "happy" },
      shy: { mood: "shy" },
      angry: { mood: "angry" },
      surprised: { mood: "surprised" },
      sleepy: { mood: "sleepy" },
    };
    let hold = null; // { kind, pose?, mood?, auto? } — auto: started by the bedtime
    const HOLD_KEY = "live2d-mascot-hold";
    function saveHold() {
      try {
        if (hold && character) localStorage.setItem(HOLD_KEY, JSON.stringify({ kind: hold.kind, auto: !!hold.auto, char: character.def.id }));
        else localStorage.removeItem(HOLD_KEY);
      } catch {
        // fine: it just won't be remembered
      }
    }
    // After a restart: back into the state she was keeping (same character only).
    function restoreHold() {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(HOLD_KEY) || "null");
      } catch {
        // fine
      }
      if (!saved || !character || saved.char !== character.def.id || !startHold(saved.kind)) return null;
      hold.auto = !!saved.auto;
      saveHold();
      return saved.kind;
    }
    function canHold(kind) {
      const h = HOLDS[kind];
      if (!h || !character) return false;
      if (h.mood) return !!moodParams(h.mood);
      if (!character.canPose) return false;
      if (h.pose === "act") return character.canPose("act1") && character.canPose("act2");
      return character.canPose(h.pose);
    }
    function startHold(kind) {
      if (!canHold(kind)) return false;
      hold = Object.assign({ kind }, HOLDS[kind]);
      saveHold();
      if (mode === "walk") setMode("idle");
      hopAfterWalk = null;
      climbAfterWalk = null;
      peekAfterWalk = false;
      anim = null;
      idleAction = null;
      sitting = false;
      sleeping = false;
      dayPose = null;
      if (hold.mood) {
        setMood(hold.mood, 2500); // with its little effect once
        mood.end = performance.now() + 600000;
        mood.hold = true;
      } else if (mood && mood.hold) {
        mood = null;
      }
      if (!panel.hidden) renderPanel();
      return true;
    }
    function endHold() {
      if (!hold) return false;
      // ended during the night (by you, or by being picked up): she stays up for the rest of it
      if (inNight(new Date())) nightOff = nightKey(new Date());
      hold = null;
      saveHold();
      dayPose = null;
      if (mood && mood.hold) mood = null;
      autoWanderAt = performance.now() + 8000;
      if (!panel.hidden) renderPanel();
      return true;
    }
    // Bedtime (settings.bedTime / wakeTime, in hours): she goes to sleep at bedtime and
    // sleeps through the night; after the wake-up time, the first sign of you wakes her.
    let nightOff = null; // the night you sent her back to being awake
    function inNight(d) {
      if (settings.bedTime === "off" || settings.bedTime == null) return false;
      const bed = Number(settings.bedTime);
      const wake = Number(settings.wakeTime);
      const h = d.getHours() + d.getMinutes() / 60;
      return bed > wake ? h >= bed || h < wake : h >= bed && h < wake;
    }
    // Which night it is: the date it started on.
    function nightKey(d) {
      let wake = Number(settings.wakeTime);
      if (!Number.isFinite(wake)) wake = 7; // default wake time (settings.wakeTime fallback)
      const start = new Date(d);
      if (d.getHours() < wake + 1) start.setDate(start.getDate() - 1);
      return start.toDateString();
    }
    function stepBedtime(d) {
      const night = inNight(d);
      if (hold && hold.auto && hold.kind === "sleep") {
        if (!night && Date.now() - lastActivity < 11000) {
          hold = null; // morning, and you're here
          saveHold();
          dayPose = null;
          if (!panel.hidden) renderPanel();
          react("greeting." + greetingSlot(d.getHours()));
          return true;
        }
        return false;
      }
      if (!night || hold || nightOff === nightKey(d) || !canHold("sleep")) return false;
      if (dragState || chatting() || focusing() || climb || hop || fall) return false;
      react("bedtime");
      setTimeout(() => {
        if (hold || !inNight(new Date())) return;
        if (startHold("sleep")) {
          hold.auto = true;
          saveHold();
        }
      }, 3500);
      return true;
    }

    // A mood state comes back after a reaction's own face has passed.
    function stepHold(now) {
      if (!hold || !hold.mood || mood) return;
      const params = moodParams(hold.mood);
      if (params) mood = { params, start: now, end: now + 600000, hold: true };
    }

    // Walking: a cycle of step pictures, walk1..walk4 (a step, the other foot passing,
    // the next step, passing again); packs with only walk1/walk2 alternate those two.
    // She rises a little while a foot passes and sinks as it lands, in time with the pictures.
    const WALK_FRAMES = ["walk1", "walk2", "walk3", "walk4"];
    function walkCycle(r) {
      const have = WALK_FRAMES.filter((n) => r && r.canPose && r.canPose(n) && poseFits(r, n));
      if (have.length === 4) return have;
      return have[0] === "walk1" && have[1] === "walk2" ? have.slice(0, 2) : [];
    }
    const frameMs = (frames) => (frames.length === 4 ? 190 : 280);
    function walkFrame(r, now) {
      const f = walkCycle(r);
      return f.length ? f[Math.floor(now / frameMs(f)) % f.length] : "stand";
    }
    function walkBob(r, now) {
      if (!walkCycle(r).length) return Math.abs(Math.sin(now * 0.012)); // no step pictures: a light bounce
      const u = (now / frameMs(walkCycle(r))) % 2; // one step = two pictures
      return 0.5 - 0.5 * Math.cos(Math.PI * (u - 0.5)); // 0 mid-landing .. 1 mid-passing
    }
    // Dangling is short, so it may show her usual clothes; the longer poses wait for pictures in the outfit.
    const poseFits = (r, name) => name === "held" || !r.poseFits || r.poseFits(name);
    let dayPose = null;
    function stepDayPose(now) {
      if (!character || !character.canPose) return;
      if (hold && hold.pose && !climb) {
        let want = hold.pose === "sit" ? (perch ? "sit" : "sitGround") : hold.pose === "act" ? (Math.floor(now / 1200) % 2 ? "act2" : "act1") : hold.pose;
        if (!character.canPose(want)) want = "stand";
        if (want !== dayPose) {
          character.setPose(want);
          dayPose = want;
        }
        return;
      }
      if (anim || sitting || sleeping || climb) {
        dayPose = null;
        return;
      }
      const talking = speech && now < speech.endAt;
      let want = "stand";
      if ((dragState && dragState.moved) || (fall && fall.fromDrag)) want = "held";
      else if (hop) want = "stand";
      else if (mode === "walk") want = walkFrame(character, now); // she keeps stepping while she talks
      else if (talking) want = "stand";
      else if (focusing()) want = "focus";
      else if (moodOf() < 30 && !userPositioned) want = "sulk";
      if (want !== "stand" && !(character.canPose(want) && poseFits(character, want))) want = "stand";
      if (want !== dayPose) {
        character.setPose(want);
        dayPose = want;
      }
    }

    app.ticker.add(() => {
      const now = performance.now();
      const dtMs = app.ticker.deltaMS;

      updateSitting(now);
      stepAnim(now);
      if (!character || dragState) {
        // nothing loaded yet, or the drag handler is driving her position
      } else if (hop) {
        stepHop(now);
      } else if (fall) {
        stepFall(dtMs);
      } else if (climb) {
        stepClimb(now, dtMs);
      } else if (mode === "walk") {
        const dx = walkTargetX - actor.x;
        const step = WALK_SPEED * (0.7 + 0.4 * energyAt(new Date().getHours())) * (dtMs / 1000);
        if (Math.abs(dx) <= step) {
          actor.x = walkTargetX;
          const next = hopAfterWalk;
          const up = climbAfterWalk;
          const peek = peekAfterWalk;
          peekAfterWalk = false;
          setMode("idle");
          if (peek) react("peek");
          if (up) startClimb(up);
          else if (next) startHop(next);
        } else {
          actor.x += Math.sign(dx) * step;
          actor.y = surfaceY() - walkBob(character, now) * 9;
        }
      } else if (!userPositioned) {
        actor.y = surfaceY();
        if (settings.autoWander && !hold && !isMobile && !speech && !chatting() && !sleeping && !focusing() && !anim && now > autoWanderAt) {
          setMode("walk");
        }
      }

      if (character && !isHidden() && settings.effects) {
        if (mode === "idle" && !userPositioned) maybeIdleAction(now);
        fx.update(now, fxAnchor());
      } else {
        fx.clear();
      }

      stepHold(now);
      stepDayPose(now);
      updateBubble(now);
      stepCompanions(now, dtMs);
    });

    // Where effects gather: around her head, in screen pixels.
    function fxAnchor() {
      const u = character.naturalHeight * baseScale;
      const top = actor.y - (headTop() - poseDrop()) * baseScale;
      const bottom = actor.y - ((head ? head.bottom : body.top) - poseDrop()) * baseScale;
      return {
        x: actor.x + (headCx() + poseDx()) * baseScale * facing,
        top,
        hw: Math.max(12, (head ? head.half : body.half * 0.6) * baseScale),
        hh: Math.max(16, bottom - top),
        size: Math.max(18, Math.min(46, u * 0.055)),
        facing,
      };
    }

    // -----------------------------------------------------------------
    // Pointer handling. Everything hangs off window listeners; the
    // canvas never receives events, so the host page keeps them.
    // -----------------------------------------------------------------
    let dragState = null;
    const DRAG_THRESHOLD = 6;
    let pat = { x: 0, dir: 0, changes: 0, lastAt: 0 };
    let lastPatAt = 0;
    let tapTimes = [];
    let lastAnnoyedAt = 0;

    function localXY(e) {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    }

    const fromOwnUI = (e) => e.composedPath().some((n) => n.classList && n.classList.contains("ui"));

    // Desktop pet only: the window lets clicks fall through to other apps
    // except while the pointer is over her or over the widget's own buttons.
    let interactive = false;
    function setInteractive(v) {
      if (!config.desktop || v === interactive) return;
      interactive = v;
      config.desktop.onInteractiveChange(v);
    }

    let pointer = null; // where the pointer last was, for coming over to peek
    let pointerAt = 0;
    function onPointerMove(e) {
      const [x, y] = localXY(e);
      if (!pointer || Math.abs(pointer.x - x) + Math.abs(pointer.y - y) > 30) pointerAt = Date.now();
      pointer = { x, y };
      if (character) character.focus(x, y);
      noteActivity();

      const region = isHidden() ? null : regionAt(x, y);
      setInteractive(!!dragState || !!compDrag || !!region || !!companionAt(x, y) || fromOwnUI(e));

      if (dragState || region !== "head") return;
      const now = performance.now();
      if (now - pat.lastAt > 700) pat = { x: e.clientX, dir: 0, changes: 0, lastAt: now };
      const dx = e.clientX - pat.x;
      if (Math.abs(dx) >= 6) {
        const dir = Math.sign(dx);
        if (pat.dir && dir !== pat.dir) pat.changes++;
        pat.dir = dir;
        pat.x = e.clientX;
      }
      pat.lastAt = now;
      if (pat.changes >= 4 && now - lastPatAt > 5000) {
        lastPatAt = now;
        pat.changes = 0;
        react("pat");
        gainAffection(3, "pat", 45000);
        changeMood(6, true);
      }
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    // Web pages can give any element a line of its own:
    //   <a href="#contact" data-mascot-say="联系方式在这里哦～" data-mascot-mood="happy">联系我们</a>
    // Pointing at it makes her say it (at most once every 20 seconds per element).
    const hoverSaidAt = new WeakMap();
    function onPageHover(e) {
      if (isHidden() || dragState || fromOwnUI(e)) return;
      const el = e.target && e.target.closest ? e.target.closest("[data-mascot-say]") : null;
      if (!el) return;
      const now = performance.now();
      if (now - (hoverSaidAt.get(el) ?? -Infinity) < 20000) return;
      hoverSaidAt.set(el, now);
      say(el.getAttribute("data-mascot-say"), { priority: 1, mood: el.getAttribute("data-mascot-mood") || undefined });
    }
    document.addEventListener("pointerover", onPageHover, { passive: true });

    let chestTaps = [];
    let lastChestTeaseAt = -Infinity;
    const hasLines = (event) => isLineList(linesFor(event));

    function onTap(region) {
      const now = performance.now();
      if (hold && hold.kind === "sleep") {
        react("sleepTalk");
        return;
      }
      tapTimes = tapTimes.filter((t) => now - t < 2500);
      tapTimes.push(now);
      if (tapTimes.length >= 5 && now - lastAnnoyedAt > 8000) {
        lastAnnoyedAt = now;
        tapTimes = [];
        react("tooManyTaps");
        gainAffection(-3, "annoyed", 30000);
        changeMood(-8, true);
        return;
      }
      if (focusing()) {
        react("focusTap");
        return;
      }
      // sulking: half the time she lets you know
      if (moodOf() < 30 && Math.random() < 0.5) {
        react("tapSulky");
      } else if (region === "chest") {
        // always a little pushback; now and then (at most every half hour) a tease;
        // keep at it and she gets properly annoyed
        chestTaps = chestTaps.filter((t) => now - t < 60000);
        chestTaps.push(now);
        if (chestTaps.length >= 3) {
          chestTaps = [];
          react("touchChestMore");
          changeMood(-6, true);
        } else if (now - lastChestTeaseAt > 30 * 60000 && Math.random() < 0.25 && hasLines("touchChestTease")) {
          lastChestTeaseAt = now;
          react("touchChestTease");
        } else {
          react("touchChest");
          changeMood(-2, true);
        }
        return; // no affection for this
      } else {
        const zone = region === "head" ? "tapHead" : region === "body" ? "tap" : "touch" + region[0].toUpperCase() + region.slice(1);
        react(zone === "tap" || zone === "tapHead" || hasLines(zone) ? zone : "tap");
      }
      gainAffection(1, "tap", 20000);
      changeMood(2, true);
    }

    function onPointerDownCapture(e) {
      if (isHidden() || fromOwnUI(e)) return;
      const [x, y] = localXY(e);
      const region = regionAt(x, y);
      const comp = region ? null : companionAt(x, y);
      if (comp) {
        e.preventDefault();
        e.stopPropagation();
        noteActivity();
        startCompanionDrag(comp, e);
        return;
      }
      if (!region) return;

      e.preventDefault();
      e.stopPropagation();

      dragState = {
        pointerId: e.pointerId,
        region,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: actor.x,
        startY: actor.y,
        moved: false,
      };
      window.addEventListener("pointermove", onPointerMoveCapture, true);
      window.addEventListener("pointerup", onPointerUpCapture, true);
      window.addEventListener("pointercancel", onPointerUpCapture, true);
    }

    function onPointerMoveCapture(e) {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      const dx = e.clientX - dragState.startClientX;
      const dy = e.clientY - dragState.startClientY;
      if (!dragState.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragState.moved = true;
        userPositioned = true;
        perch = null;
        fall = null;
        hop = null;
        hopAfterWalk = null;
        climbAfterWalk = null;
        if (climb) {
          climb = null;
          character.setPose("stand");
        }
        if (mode === "walk") setMode("idle");
        endHold();
        react("dragStart");
      }
      if (dragState.moved) {
        e.preventDefault();
        e.stopPropagation();
        const h = window.innerHeight;
        actor.x = clampX(dragState.startX + dx);
        actor.y = Math.min(Math.max(dragState.startY + dy, h * 0.25), h - 10);
      }
    }

    function onPointerUpCapture(e) {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      window.removeEventListener("pointermove", onPointerMoveCapture, true);
      window.removeEventListener("pointerup", onPointerUpCapture, true);
      window.removeEventListener("pointercancel", onPointerUpCapture, true);
      if (dragState.moved && config.desktop) {
        startFall(true); // on the desktop she doesn't float: she drops onto whatever is below
      } else if (dragState.moved) {
        react("dragEnd");
        autoWanderAt = performance.now() + 15000 + Math.random() * 10000;
      } else if (e.type !== "pointercancel") {
        onTap(dragState.region); // an interrupted drag never counts as a tap
      }
      dragState = null;
    }

    window.addEventListener("pointerdown", onPointerDownCapture, true);

    // -----------------------------------------------------------------
    // Activity, clock, reminders, chatter
    // -----------------------------------------------------------------
    let lastActivity = Date.now();
    let nextSulkAt = 0;
    let nextPeekAt = Date.now() + 5 * 60000;
    // the program in front (desktop pet, only when allowed in settings)
    let appKind = null;
    let appSince = 0;
    let appCommented = null;
    const appCommentAt = {};
    let appLongAt = Date.now();
    const busyWatching = () => settings.watchApps && (appKind === "Video" || appKind === "Game");
    if (config.desktop && config.desktop.onForeground) {
      config.desktop.onForeground(({ proc, title }) => {
        if (!settings.watchApps) {
          appKind = null;
          return;
        }
        const hit = APP_KINDS.find(([, test]) => test(proc || "", title || ""));
        const kind = hit ? hit[0] : null;
        if (kind !== appKind) {
          appKind = kind;
          appSince = Date.now();
        }
      });
    }
    let idlePrompted = false;
    let restAnchor = Date.now();
    let nextChatterAt = 0;

    function noteActivity() {
      lastActivity = Date.now();
      resumeAudio();
      if (idlePrompted) {
        idlePrompted = false;
        react("welcomeBack");
      }
    }
    const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"];
    ACTIVITY_EVENTS.forEach((t) => window.addEventListener(t, noteActivity, { passive: true }));

    function scheduleChatter() {
      const minutes = CHATTER_MINUTES[settings.chatter];
      nextChatterAt = minutes ? Date.now() + minutes * 60000 * (0.6 + 0.8 * Math.random()) : Infinity;
    }
    scheduleChatter();

    const clockKey = (d) => d.toDateString() + " " + d.getHours() + ":" + (d.getMinutes() < 30 ? "00" : "30");
    let lastClockKey = clockKey(new Date());

    function scheduler() {
      if (isHidden() || !character) return;
      const now = Date.now();
      const d = new Date();
      const h = d.getHours();
      const m = d.getMinutes();
      const idleFor = now - lastActivity;

      // Ten minutes at the computer together: a little closer.
      if (idleFor < AWAY_MS) {
        const b = bond();
        b.activeMs = (b.activeMs || 0) + 10000;
        if (b.activeMs >= 600000) {
          b.activeMs -= 600000;
          gainAffection(1, "time");
        } else if (b.activeMs % 60000 === 0) {
          saveAffection();
        }
      }
      noteNewDay();

      // At most one line per tick; anything else that's due waits for the next tick.
      let spoke = stepBedtime(d);
      applyOutfit();

      if (focusUntil && now >= focusUntil) {
        focusUntil = 0;
        spoke = !!react("focusDone");
        gainAffection(3, "focus", 0);
        changeMood(5, true);
      }
      if (!spoke) spoke = dueReminder(now);
      if (!spoke && anyCompanion() && now >= nextBanterAt && idleFor < AWAY_MS && !chatting() && !focusing() && !busyWatching() && !speech && !companionSpeaking() && now - lastSpokeAt > 30000) {
        nextBanterAt = now + (6 + Math.random() * 8) * 60000;
        spoke = true;
        runBanter();
      }
      if (!spoke && idleFor < AWAY_MS) spoke = specialDay(d);

      if (!idlePrompted && idleFor > IDLE_PROMPT_MS) {
        idlePrompted = true;
        spoke = !!react("idle");
      }

      const key = clockKey(d);
      if (!spoke && settings.hourly && (m === 0 || m === 30) && key !== lastClockKey) {
        lastClockKey = key;
        const vars = { 时间: timeText(h) };
        if (m === 0 && h === 12) spoke = !!react("lunch", vars);
        else if (m === 0 && h === 18) spoke = !!react("dinner", vars);
        else if (m === 0) spoke = !!react("hourly", vars);
        else if (h >= 23 || h < 4) spoke = !!react("lateNight", vars);
      }

      if (settings.restMinutes > 0) {
        if (idleFor > AWAY_MS) {
          restAnchor = now; // they're already away from the screen
        } else if (!spoke && now - restAnchor >= settings.restMinutes * 60000) {
          restAnchor = now;
          spoke = !!react("rest");
        }
      }

      // Ignored while they're right here: mood sinks; otherwise it drifts back to normal.
      {
        const m = moodOf();
        const ignoredMin = (now - lastAttentionAt) / 60000;
        if (idleFor < AWAY_MS && ignoredMin > 40) changeMood(-0.35, false); // about -2 every minute
        else if (Math.abs(m - 60) > 1) changeMood(m > 60 ? -0.15 : 0.15, false);
        if (!spoke && moodOf() < 30 && idleFor < AWAY_MS && now >= nextSulkAt) {
          nextSulkAt = now + (15 + Math.random() * 15) * 60000;
          spoke = !!react("sulky");
        }
      }

      // What they're doing (opt-in): a word when they settle into something, a nudge after a long stretch.
      if (!spoke && settings.watchApps && appKind && idleFor < AWAY_MS && !focusing()) {
        const stayed = now - appSince;
        if (stayed > 30000 && appKind !== appCommented && now - (appCommentAt[appKind] || 0) > 20 * 60000) {
          appCommented = appKind;
          appCommentAt[appKind] = now;
          if (Math.random() < 0.6) spoke = !!react("app" + appKind);
        } else if (stayed > 90 * 60000 && now - appLongAt > 90 * 60000 && appKind !== "Video" && appKind !== "Game") {
          appLongAt = now;
          spoke = !!react("appLong");
        }
      }

      // Now and then she comes over to where the pointer is resting and peeks.
      if (!spoke && now >= nextPeekAt && !focusing() && !hold && settings.autoWander && mode === "idle" && !perch && !userPositioned && !speech && !chatting() && !sleeping && idleFor < 120000) {
        const still = now - pointerAt;
        if (pointer && still > 10000 && still < 90000) {
          nextPeekAt = now + (10 + Math.random() * 15) * 60000 / (0.5 + energyAt(d.getHours()));
          walkToPeek(pointer.x);
          spoke = true;
        }
      }

      if (!spoke && canChat && now >= nextAiChatterAt) {
        scheduleAiChatter();
        // only when they're right here and nothing else is going on
        if (idleFor < 120000 && !chatting() && !speech && !busyWatching() && !focusing() && now - lastSpokeAt > 60000) {
          spoke = true;
          aiChatter();
        }
      }

      if (!spoke && now >= nextChatterAt) {
        scheduleChatter();
        if (!idlePrompted && !chatting() && !busyWatching() && !focusing() && now - lastSpokeAt > 45000) react("chatter");
      }
    }
    const schedulerTimer = setInterval(scheduler, 10000);

    // -----------------------------------------------------------------
    // AI chat (desktop pet only): the main process talks to MiniMax with
    // the key from voice/配置.json; the page only sends the conversation.
    // -----------------------------------------------------------------
    const canChat = !!(config.desktop && config.desktop.chat);
    const CHAT_KEY = "live2d-mascot-chat";
    const MOOD_TAGS = { 开心: "happy", 害羞: "shy", 生气: "angry", 吃惊: "surprised", 困: "sleepy", 平静: null };
    let chatLog = {};
    try {
      chatLog = JSON.parse(localStorage.getItem(CHAT_KEY) || "{}") || {};
    } catch {
      chatLog = {};
    }
    let chatBusy = false;
    const chatting = () => chatBusy || !dom.chatBox.hidden;

    function personaPrompt() {
      const def = character.def;
      const b = bond();
      const now = new Date();
      return [
        `你是「${def.name}」，住在用户电脑桌面上的看板娘，正在和用户聊天。`,
        def.persona || "你性格温柔开朗，喜欢陪着用户。",
        `你和用户现在的关系：${AFFECTION_LEVELS[levelOf(b.points)].name}（认识 ${Math.max(1, b.days)} 天）。关系还浅时有礼貌、带点距离感；越亲近，说话越亲昵自然。`,
        `你现在的心情：${moodName(moodOf())}；精力：${energyName(energyAt(now.getHours()))}。让语气自然地带上这种状态，但不要直接说出这些词。`,
        ...(settings.watchApps && appKind ? [`用户现在正在${APP_NAMES[appKind]}。`] : []),
        `现在是 ${now.getMonth() + 1} 月 ${now.getDate()} 日${timeText(now.getHours())}${now.getMinutes()}分。`,
        ...(memory.notes.length
          ? ["你记得关于用户的这些事（在自然的时候提起就好，不要每次都提，也不要像背书一样念出来）：\n- " + memory.notes.join("\n- ")]
          : []),
        "回答要求：用口语化的简体中文，像面对面说话；一般一到三句话，最多八十个字；不要用 Markdown、列表、表情符号或颜文字，因为你的话会被念出来；可以用「……」表达停顿。",
        "回答的最前面，先用方括号写出你此刻的表情，只能是这几个之一：[开心] [害羞] [生气] [吃惊] [困] [平静]。例如：[开心]今天也辛苦啦！",
        "用户要你做做不到的事（比如操作电脑、上网查资料）时，坦白说做不到，但可以陪他聊聊。",
      ].join("\n");
    }

    // Short bubbles, cut at sentence ends.
    function splitForBubbles(text) {
      const parts = text.match(/[^。！？!?～\n]+[。！？!?～]*|[。！？!?～]+/g) || [text];
      const out = [];
      let cur = "";
      for (const raw of parts) {
        const p = raw.trim();
        if (!p) continue;
        if (cur && (cur + p).length > 40) {
          out.push(cur);
          cur = p;
        } else {
          cur += p;
        }
      }
      if (cur) out.push(cur);
      return out;
    }

    const noEmoji = (t) => t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").trim();

    function clipFrom(res) {
      if (!res || !res.audio) return null;
      const bytes = Uint8Array.from(atob(res.audio), (c) => c.charCodeAt(0));
      return { url: URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })), ms: res.ms || 0 };
    }

    // Until the bubble is fully typed out and the clip has finished.
    function speechDone() {
      return new Promise((resolve) => {
        const check = () => {
          const typed = !speech || speech.shown >= speech.chars.length;
          if (typed && !voicePlaying) setTimeout(resolve, 350);
          else setTimeout(check, 120);
        };
        setTimeout(check, 200);
      });
    }

    async function speakReply(reply, moodName, who) {
      const chunks = splitForBubbles(reply);
      const voice = settings.voice && settings.chatVoice && who.def.voice && config.desktop.speak;
      // Ask for every sentence's audio at once; each plays when its bubble comes up.
      const clips = chunks.map((c) =>
        voice ? config.desktop.speak({ text: noEmoji(c), voice: who.def.voice }).then(clipFrom).catch(() => null) : Promise.resolve(null)
      );
      for (let i = 0; i < chunks.length; i++) {
        const clip = await clips[i];
        if (character !== who) break;
        say(chunks[i], { priority: 3, mood: moodName, clip });
        if (i < chunks.length - 1) await speechDone();
        if (clip) setTimeout(() => URL.revokeObjectURL(clip.url), 60000);
      }
    }

    async function sendChat() {
      const text = dom.chatInput.value.trim();
      if (!text || chatBusy || !character) return;
      pushChat("me", text);
      if (handleLocal(text)) {
        dom.chatInput.value = "";
        return;
      }
      chatBusy = true;
      dom.chatInput.value = "";
      dom.chatSend.disabled = true;
      if (!dom.chatBox.hidden) renderChatView();
      const who = character;
      const id = who.def.id;
      const log = chatLog[id] || (chatLog[id] = []);
      log.push({ role: "user", content: text });

      try {
        setState("thinking");
        say(who.def.thinkingText || "嗯……让我想想。", { priority: 3 });
        const res = await config.desktop.chat({ system: personaPrompt(), messages: log.slice(-20) }).catch(() => ({ error: "连不上网络" }));
        if (character === who) setState(null);

        if (!res || res.error || !res.text) {
          log.pop();
          if (character === who) say(`唔……我现在回答不了你（${(res && res.error) || "没有收到回复"}）。`, { priority: 3, mood: "sleepy" });
        } else {
          let reply = res.text.trim();
          let moodName = null;
          const tag = /^[\[【]([^\]】]{1,4})[\]】]\s*/.exec(reply);
          if (tag) {
            moodName = MOOD_TAGS[tag[1]] || null;
            reply = reply.slice(tag[0].length);
          }
          reply = noEmoji(reply.replace(/[\[【][^\]】]{1,4}[\]】]/g, "").replace(/[*#`>]/g, "")) || "……";
          log.push({ role: "assistant", content: reply });
          chatLog[id] = log.slice(-40);
          try {
            localStorage.setItem(CHAT_KEY, JSON.stringify(chatLog));
          } catch {
            // no room to keep it; the chat still works
          }
          turnsSinceMemory++;
          if (turnsSinceMemory >= 4) updateMemory(who);
          if (character === who) {
            gainAffection(2, "chat", 60000);
            changeMood(4, true);
            await speakReply(reply, moodName, who);
          }
        }
      } finally {
        chatBusy = false;
        dom.chatSend.disabled = false;
        if (!dom.chatBox.hidden) renderChatView();
      }
    }

    // -----------------------------------------------------------------
    // Long-term memory: every few turns the chat model boils the recent
    // conversation down to short notes about the user (shared by all
    // characters, kept only on this computer, viewable and clearable in
    // settings). The notes go into every chat prompt.
    // -----------------------------------------------------------------
    const MEMORY_KEY = "live2d-mascot-memory";
    let memory = { notes: [] };
    try {
      memory = Object.assign({ notes: [] }, JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}"));
    } catch {
      memory = { notes: [] };
    }
    let turnsSinceMemory = 0;
    let memoryBusy = false;

    function saveMemory() {
      try {
        localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
      } catch {
        // no room; she'll just remember less
      }
    }

    async function updateMemory(who) {
      if (memoryBusy || !canChat) return;
      const log = (chatLog[who.def.id] || []).slice(-12);
      if (!log.some((m) => m.role === "user")) return;
      memoryBusy = true;
      turnsSinceMemory = 0;
      const now = new Date();
      const talk = log.map((m) => (m.role === "user" ? "用户：" : who.def.name + "：") + m.content).join("\n");
      const ask = [
        `今天是 ${now.getMonth() + 1} 月 ${now.getDate()} 日。`,
        "已有的记忆：",
        memory.notes.length ? "- " + memory.notes.join("\n- ") : "（还没有）",
        "",
        "最近的对话：",
        talk,
        "",
        "请更新关于「用户」的长期记忆：保留仍然有用的，加入新的重要信息（名字或称呼、生日、喜好、讨厌的东西、工作学习、近期的计划和重要的事，事件要写上日期），删掉过时或不重要的。",
        "只记用户本人亲口说过的事实，不记闲聊、不记看板娘说的话、不要猜测或编造。每条不超过三十个字，最多三十条。",
        '只输出一个 JSON 数组，例如 ["名字叫小明", "10月23日：说下周有考试"]；没有可记的就原样输出已有的记忆。',
      ].join("\n");
      try {
        const res = await config.desktop.chat({ system: "你是一个记忆整理助手，只输出 JSON。", messages: [{ role: "user", content: ask }] });
        const m = res && res.text ? /\[[\s\S]*\]/.exec(res.text) : null;
        const notes = m ? JSON.parse(m[0]) : null;
        if (Array.isArray(notes)) {
          memory = { notes: notes.filter((n) => typeof n === "string" && n.trim()).map((n) => n.trim().slice(0, 40)).slice(0, 30), updatedAt: Date.now() };
          saveMemory();
          renderMemory();
        }
      } catch {
        // try again after the next few turns
      } finally {
        memoryBusy = false;
      }
    }

    function renderMemory() {
      if (!dom.memCount) return;
      dom.memCount.textContent = String(memory.notes.length);
      dom.memList.innerHTML = "";
      for (const n of memory.notes) {
        const li = document.createElement("li");
        li.textContent = n;
        dom.memList.appendChild(li);
      }
    }

    // Now and then she starts a conversation herself (settings: 主动找你聊天).
    const AI_CHATTER_MINUTES = { rare: 120, often: 40 };
    let nextAiChatterAt = 0;
    function scheduleAiChatter() {
      const minutes = AI_CHATTER_MINUTES[settings.aiChatter];
      nextAiChatterAt = minutes ? Date.now() + minutes * 60000 * (0.7 + 0.6 * Math.random()) : Infinity;
    }
    scheduleAiChatter();

    async function aiChatter() {
      if (!character || chatBusy) return;
      chatBusy = true;
      const who = character;
      const log = chatLog[who.def.id] || (chatLog[who.def.id] = []);
      const nudge = {
        role: "user",
        content:
          "（旁白：用户现在没有在和你说话，正在电脑前忙自己的事。请你主动开口说一句话：可以结合现在的时间、你记得的关于用户的事，或你们之前聊过的内容，关心、闲聊或调侃都行，不超过四十个字，不要提到这段旁白。）",
      };
      try {
        const res = await config.desktop.chat({ system: personaPrompt(), messages: [...log.slice(-10), nudge] }).catch(() => null);
        if (character !== who) return;
        if (!res || res.error || !res.text) return; // she started this herself; a failed nudge stays quiet
        let reply = res.text.trim();
        let moodName = null;
        const tag = /^[\[【]([^\]】]{1,4})[\]】]\s*/.exec(reply);
        if (tag) {
          moodName = MOOD_TAGS[tag[1]] || null;
          reply = reply.slice(tag[0].length);
        }
        reply = noEmoji(reply.replace(/[\[【][^\]】]{1,4}[\]】]/g, "").replace(/[*#`>]/g, ""));
        if (!reply) return;
        log.push({ role: "assistant", content: reply });
        chatLog[who.def.id] = log.slice(-40);
        try {
          localStorage.setItem(CHAT_KEY, JSON.stringify(chatLog));
        } catch {
          // fine
        }
        await speakReply(reply, moodName, who);
      } finally {
        chatBusy = false;
      }
    }

    // -----------------------------------------------------------------
    // Companion things handled right here, without the AI: reminders,
    // focus time and little games typed into the chat box, plus birthdays
    // and holidays.
    // -----------------------------------------------------------------
    const REMINDER_KEY = "live2d-mascot-reminders";
    let reminders = [];
    try {
      reminders = JSON.parse(localStorage.getItem(REMINDER_KEY) || "[]") || [];
    } catch {
      reminders = [];
    }
    function saveReminders() {
      reminders.sort((a, b) => a.at - b.at);
      try {
        localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders));
      } catch {
        // can't keep it past this run
      }
      renderReminders();
    }
    function renderReminders() {
      if (!dom.remCount) return;
      dom.remCount.textContent = String(reminders.length);
      dom.remList.innerHTML = "";
      for (const r of reminders) {
        const li = document.createElement("li");
        li.textContent = whenText(r.at) + "  " + (r.what || "（没说什么事）");
        dom.remList.appendChild(li);
      }
    }

    // A few lines one after another: pre-voiced ones by text, the rest shown silently
    // (or read aloud on the spot when `live` and chat voice is on).
    async function sayInTurn(items) {
      const who = character;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (character !== who) return;
        if (it.event) react(it.event);
        else if (it.live && canChat) await speakReply(it.text, it.mood || null, who);
        else say(it.text, { priority: 3, mood: it.mood, voice: it.voice });
        if (i < items.length - 1) await speechDone();
      }
    }

    function dueReminder(nowMs) {
      const due = reminders.find((r) => r.at <= nowMs);
      if (!due) return false;
      reminders = reminders.filter((r) => r !== due);
      saveReminders();
      if (containerEl.classList.contains("minimized")) {
        containerEl.classList.remove("minimized");
        dom.restoreTab.hidden = true;
      }
      const late = nowMs - due.at > 5 * 60000; // she wasn't running when it was due
      sayInTurn([
        { event: late ? "reminderLate" : "reminderDue" },
        due.what ? { text: (late ? `（${whenText(due.at)} 的提醒）` : "") + `该${due.what}啦！`, live: true, mood: "surprised" } : null,
      ].filter(Boolean));
      if (settings.effects) fx.start("surprise", 1500);
      return true;
    }

    // Once a day: her birthday wishes or a holiday greeting.
    const SPECIAL_KEY = "live2d-mascot-special-day";
    function specialDay(d) {
      const today = d.toDateString();
      let said = "";
      try {
        said = localStorage.getItem(SPECIAL_KEY) || "";
      } catch {
        said = "";
      }
      if (said === today) return false;
      const bd = memory.notes
        .map((n) => /生日[^\d]{0,6}(\d{1,2})\s*月\s*(\d{1,2})/.exec(n))
        .find(Boolean);
      let event = null;
      if (bd && Number(bd[1]) === d.getMonth() + 1 && Number(bd[2]) === d.getDate()) event = "birthday";
      else {
        const h = holidayOn(d);
        if (h) event = "holiday" + h;
      }
      try {
        localStorage.setItem(SPECIAL_KEY, today);
      } catch {
        // she might say it again after a restart; harmless
      }
      if (!event || !isLineList(linesFor(event))) return false;
      react(event);
      if (settings.effects) fx.start(event === "birthday" ? "hearts" : "sparkle", 4000);
      if (event === "birthday") gainAffection(10, "birthday", 0);
      return true;
    }

    // focus time
    let focusUntil = 0;
    const focusing = () => focusUntil > Date.now();

    // little games: what's waiting for an answer
    let game = null; // { kind: "rps" | "riddle", at, answers?, tries? }
    const RPS = [["石头", "Rock"], ["剪刀", "Scissors"], ["布", "Paper"]];

    // Typed into the chat box. True when handled here (nothing goes to the AI).
    const REL_DURATION = new RegExp(`(半|${NUM}\\s*个?\\s*半?)\\s*(小时|钟头|分钟|分)`);
    function handleLocal(text) {
      const t = text.replace(/\s+/g, "");
      if (game && Date.now() - game.at > 3 * 60000) game = null;

      // --- answers to a game in progress ---
      const rpsHit = RPS.find(([w]) => t === w || t === "出" + w || t === "我出" + w);
      if ((game && game.kind === "rps") || rpsHit) {
        const mine = rpsHit || RPS.find(([w]) => t.includes(w));
        if (mine) {
          game = null;
          const hers = RPS[Math.floor(Math.random() * 3)];
          const beats = { 石头: "剪刀", 剪刀: "布", 布: "石头" };
          const result = hers[0] === mine[0] ? "rpsDraw" : beats[hers[0]] === mine[0] ? "rpsWin" : "rpsLose";
          sayInTurn([{ event: "rps" + hers[1] }, { event: result }]);
          if (result === "rpsLose") changeMood(1, true);
          return true;
        }
      }
      // --- what she can do --- (anchored: a plain question like 「微信怎么用」 must go to the AI)
      if (/^(?:帮助|指令|命令|怎么用|你会什么|你能做什么|你会干什么|有什么功能|有哪些功能)[?？!！。]*$/.test(t.replace(/\s+/g, ""))) {
        sayInTurn([
          { event: "helpIntro" },
          // the bubble shows the exact words to type; the voice reads a spoken version
          ...(window.Live2DMascotHelp || []).map((h) => ({ text: h.text, voice: h.say })),
        ]);
        return true;
      }

      // --- reminders ---
      if (/(有哪些|有什么|查看|看看|列出).*(提醒|闹钟)|^(提醒|闹钟)列表$/.test(t)) {
        if (!reminders.length) react("reminderNone");
        else sayInTurn([{ event: "reminderList" }, { text: reminders.map((r) => whenText(r.at) + " " + (r.what || "提醒")).join("；") }]);
        return true;
      }
      if (/(取消|删掉|删除|清空|不用).*(提醒|闹钟)/.test(t)) {
        reminders = [];
        saveReminders();
        react("reminderCancel");
        return true;
      }
      if (/提醒|叫我|喊我|闹钟/.test(t)) {
        const when = parseWhen(t);
        if (!when) {
          react("reminderNoTime");
          return true;
        }
        const what = t
          .replace(when.match.replace(/\s+/g, ""), "")
          .replace(/(请|麻烦|帮我|你|记得)*(提醒一下我|提醒我一下|提醒我|叫我一下|叫一下我|叫我|喊我一下|喊我|定个闹钟|设个闹钟|定一个闹钟|设一个闹钟|闹钟)/g, "")
          .replace(/^[，,。、：:\s]*(去|要|该|得|把|的时候|时)?/, "")
          .replace(/[，,。！!~～吧哦啊呀呢了的时候]+$/, "")
          .slice(0, 30);
        reminders.push({ at: when.at, what });
        saveReminders();
        sayInTurn([{ event: "reminderSet" }, { text: `（${whenText(when.at)}${what ? "：" + what : ""}）` }]);
        return true;
      }

      // --- focus time ---
      if (/(别专注了|别专心了|别学了|不想专注了|不想专心了|不想学了|不用专注了|不用专心了|不用学了|(?:结束|停止|取消)(?:专注|专心|学习)|不学了|先不学了|专注结束)/.test(t)) {
        if (!focusing()) return false;
        focusUntil = 0;
        react("focusStop");
        return true;
      }
      const until = /(?:学习|专注|专心|工作|写作业|看书|复习)到(.+)/.exec(t);
      const untilWhen = until && /陪我|我要|我想|开始|准备|专注|专心/.test(t) ? parseWhen(until[1]) : null;
      if (untilWhen) {
        focusUntil = Math.min(untilWhen.at, Date.now() + 12 * 3600000);
        if (mode === "walk") setMode("idle");
        sayInTurn([{ event: "focusStart" }, { text: `（${whenText(focusUntil)} 叫你休息）` }]);
        return true;
      }
      if (/专注|专心|番茄/.test(t) || (/(我要|我想|开始|陪我|准备)/.test(t) && /学习|工作|写作业|看书|复习/.test(t) && REL_DURATION.test(t))) {
        const m = REL_DURATION.exec(t);
        let minutes = 25;
        if (m) {
          const raw = m[1].replace(/个/g, "");
          const n = raw === "半" ? 0.5 : cnNumber(raw.replace("半", "")) + (raw.endsWith("半") ? 0.5 : 0);
          if (n > 0) minutes = /小时|钟头/.test(m[2]) ? n * 60 : n;
        }
        minutes = Math.max(1, Math.min(240, Math.round(minutes)));
        focusUntil = Date.now() + minutes * 60000;
        if (mode === "walk") setMode("idle");
        sayInTurn([{ event: "focusStart" }, { text: `（${minutes} 分钟后叫你休息）` }]);
        return true;
      }

      // --- clothes ---
      const dress = /^(?:换|穿|换上|穿上)(睡衣|冬装|冬衣|大衣)/.exec(t) || (/^(?:换回来|换回原来的衣服|穿原来的衣服|脱掉外套)/.test(t) ? [t, "none"] : null);
      if (dress) {
        settings.outfit = dress[1] === "睡衣" ? "pajamas" : dress[1] === "none" ? "none" : "winter";
        delete settings.outfits;
        saveSettings(settings);
        applyOutfit();
        if (!panel.hidden) renderPanel();
        react("outfitChange");
        return true;
      }
      if (/^(?:按时间换衣服|自动换衣服)/.test(t)) {
        settings.outfit = "auto";
        saveSettings(settings);
        applyOutfit();
        react("outfitChange");
        return true;
      }

      // --- states she keeps ---
      const HOLD_WORDS = [
        [/^(坐下|坐一会儿?|坐下来|坐着吧)/, "sit"],
        [/^(睡觉吧?|去睡觉|睡一会儿?|睡吧|晚安)$/, "sleep"],
        [/^(看会儿?书|陪我学习)$/, "focus"],
      ];
      for (const [re, kind] of HOLD_WORDS) {
        if (re.test(t)) {
          if (!startHold(kind)) react("actionNo");
          return true;
        }
      }
      if (/^(起来吧?|起床了?|醒醒|站起来|恢复正常|别装了)$/.test(t) && hold) {
        endHold();
        return true;
      }

      // --- actions ---
      const ACT_WORDS = [
        [/^(挥挥?手|挥个手|打个招呼)/, "wave"],
        [/^(喝口水|喝点水|喝杯茶|喝口茶)/, "drink"],
        [/^(做个动作|来个动作|你的专属动作)/, "act"],
        [/^(欢呼一下|来个欢呼|欢呼吧)$/, "cheer"],
        [/^(伸个?懒腰)/, "stretch"],
        [/^(东张西望|看看四周)/, "lookAround"],
        [/^(打个?哈欠)/, "yawn"],
        [/^(哼首?歌|唱首?歌|哼个歌)/, "hum"],
      ];
      for (const [re, name] of ACT_WORDS) {
        if (re.test(t)) {
          if (!doAction(name)) react("actionNo");
          return true;
        }
      }

      // --- little games ---
      if (/猜拳|石头剪刀布|剪刀石头布/.test(t)) {
        game = { kind: "rps", at: Date.now() };
        react("rpsStart");
        return true;
      }
      if (/抛硬币|扔硬币|掷硬币|丢硬币/.test(t)) {
        react(Math.random() < 0.5 ? "coinHeads" : "coinTails");
        return true;
      }
      const pick = /(?:帮我选|帮我决定|选哪个|选一个)?[：:，,]?(.{1,12}?)还是(.{1,12}?)[?？吗呢好]*$/.exec(t);
      if (pick && /帮我|选|决定/.test(t)) {
        const a = pick[1].replace(/^(帮我选|帮我决定|选哪个|选一个|我该|应该|是)/, "");
        const b = pick[2];
        if (a && b) {
          sayInTurn([{ event: "choiceIntro" }, { text: `选「${Math.random() < 0.5 ? a : b}」！` }]);
          return true;
        }
      }
      if (/谜语|猜谜|出个题|出道题/.test(t)) {
        const answers = roster.defaultLines.riddleAnswers || {};
        const q = pickFrom("riddle", roster.defaultLines.riddleAsk, "riddleAsk");
        if (!answers[q]) return false;
        game = { kind: "riddle", at: Date.now(), answers: answers[q], tries: 0 };
        say(q, { priority: 3, mood: "happy" });
        return true;
      }

      // A riddle is running: only text that matched no command above counts as
      // a guess (or giving up), so other local commands still work mid-riddle.
      if (game && game.kind === "riddle") {
        const clean = t.replace(/[\s，。、！？!?,.:：;；~～·"'’“”()（）\-]+/g, "");
        if (/不知道|放弃|答案|猜不出|告诉我/.test(t)) {
          const ans = game.answers[0];
          game = null;
          sayInTurn([{ event: "riddleGiveUp" }, { text: `答案是「${ans}」。` }]);
          return true;
        }
        // digits must match exactly (so "18" never answers "8"); words also accept a lead-in like 「是月亮」
        const hit = game.answers.some((a) => {
          const as = a.replace(/[\s，。、！？!?,.:：;；~～·"'’“”()（）\-]+/g, "");
          return clean === as || (!/^\d+$/.test(as) && clean.endsWith(as));
        });
        if (hit) {
          game = null;
          react("riddleRight");
          gainAffection(1, "riddle", 0);
          return true;
        }
        game.tries++;
        if (game.tries >= 3) {
          const ans = game.answers[0];
          game = null;
          sayInTurn([{ event: "riddleGiveUp" }, { text: `答案是「${ans}」。` }]);
        } else {
          react("riddleWrong");
        }
        return true;
      }
      return false;
    }

    // -----------------------------------------------------------------
    // Companions (settings: 同伴 1 / 同伴 2): up to two more AI-chans on the
    // desktop, any of them, even the same one as her. They follow her along
    // the ground, can be tapped and dragged, have their own bubble, mouth
    // and voice, and now and then two of the three banter with pre-voiced
    // lines from characters/banter.js. Chat and everything else stays with
    // the main character.
    // -----------------------------------------------------------------
    const COMPANION_KEYS = ["buddy", "buddy2"];
    const spriteIds = () => roster.list.filter((id) => roster.defs[id] && roster.defs[id].type === "sprite");
    const companions = COMPANION_KEYS.map((key, slot) => makeCompanion(key, slot));
    let compDrag = null; // { c, pointerId, startClientX, startClientY, startX, startY, moved }
    let nextBanterAt = Infinity;
    const banterRecent = [];
    const anyCompanion = () => companions.some((c) => c.r);
    const companionSpeaking = () => companions.some((c) => c.speech);
    function companionAt(x, y) {
      if (isHidden()) return null;
      // the one drawn in front first
      for (let i = companions.length - 1; i >= 0; i--) {
        const c = companions[i];
        if (c.r && c.r.hitAreas(x, y).length) return c;
      }
      return null;
    }

    function makeCompanion(key, slot) {
      const c = {
        key,
        slot,
        r: null, // the renderer
        loading: false,
        actor: new PIXI.Container(),
        scale: 1,
        facing: -1,
        walking: false,
        mood: null, // { params, start, end }
        speech: null, // { chars, start, charMs, endAt, shown }
        voice: null, // { el, src }
        analyser: null,
        mouth: 0,
        buf: new Float32Array(512),
        pinnedUntil: 0, // after being dragged she stays put for a while
        fall: null, // { vy }
        dragging: false,
      };
      app.stage.addChildAt(c.actor, app.stage.getChildIndex(actor)); // behind her
      c.bubble = document.createElement("div");
      c.bubble.className = "bubble";
      c.bubble.innerHTML = '<span class="shown"></span><span class="rest"></span>';
      bubble.parentNode.insertBefore(c.bubble, bubble.nextSibling);
      return c;
    }

    function renderCompanionOptions() {
      const opts = '<option value="">不要</option>' + spriteIds().map((id) => `<option value="${id}">${roster.defs[id].name || id}</option>`).join("");
      for (const c of companions) {
        const sel = panel.querySelector(`select[data-k="${c.key}"]`);
        if (!sel) continue;
        sel.innerHTML = opts;
        sel.value = settings[c.key] || "";
      }
    }

    async function setCompanion(c, id) {
      if (c.loading) return;
      const want = id && spriteIds().includes(id) ? id : "";
      if ((c.r ? c.r.def.id : "") === want) return;
      c.loading = true;
      try {
        stopCompanionVoice(c);
        c.speech = null;
        c.bubble.classList.remove("show");
        if (c.r) {
          c.actor.removeChild(c.r.view);
          c.r.destroy();
          c.r = null;
        }
        if (!want) return;
        const [r] = await Promise.all([createCharacter(roster.defs[want], PIXI), loadVoiceManifest(want)]);
        c.r = r;
        c.pose = "stand";
        c.actor.addChild(r.view);
        r.onFrame(() => companionFrame(c));
        c.fall = null;
        c.pinnedUntil = 0;
        layoutCompanion(c, true);
        if (r.setOutfit) r.setOutfit(outfitNow());
        nextBanterAt = Math.min(nextBanterAt, Date.now() + 25000); // a first exchange soon after she arrives
        setTimeout(() => companionReact(c, "switchIn"), 1500 + c.slot * 1500);
      } catch (err) {
        console.error(err);
      } finally {
        c.loading = false;
      }
    }

    // Where she'd stand: next to the main character. The first takes the
    // roomier side, the second the other side (or beyond the first).
    function companionHomeX(c) {
      const w = window.innerWidth;
      const half = c.r.naturalHeight * c.scale * 0.2;
      const gap = body.half * baseScale + half + 24;
      const roomy = actor.x > w / 2 ? -1 : 1;
      const side = c.slot === 0 ? roomy : -roomy;
      let x = actor.x + side * gap;
      if (x < half + 8 || x > w - half - 8) {
        const other = companions[1 - c.slot];
        x = actor.x - side * gap * (other && other.r ? 2.1 : 1);
      }
      return Math.min(Math.max(x, half + 8), w - half - 8);
    }

    function layoutCompanion(c, snap) {
      const h = window.innerHeight;
      if (!c.r || !h || !(baseScale > 0)) return;
      c.scale = ((h * 0.5) / c.r.naturalHeight) * settings.size * (c.r.def.scale || 1) * (isMobile ? 0.6 : 1);
      c.r.view.scale.set(c.scale);
      if (!c.fall && !c.dragging) c.actor.y = groundY;
      if (snap) c.actor.x = companionHomeX(c);
      c.actor.scale.x = c.facing;
    }

    function stepCompanion(c, now, dtMs) {
      if (!c.r || c.dragging) return;
      if (c.fall) {
        const dt = Math.min(dtMs, 50) / 1000;
        c.fall.vy += GRAVITY * dt;
        c.actor.y += c.fall.vy * dt;
        if (c.actor.y >= groundY) {
          c.actor.y = groundY;
          c.fall = null;
          c.r.motion("tap");
        }
        return;
      }
      if (now < c.pinnedUntil) {
        c.actor.y = groundY;
        c.facing = actor.x >= c.actor.x ? 1 : -1;
        c.actor.scale.x = c.facing;
        return;
      }
      const dx = companionHomeX(c) - c.actor.x;
      const step = WALK_SPEED * 0.9 * (dtMs / 1000);
      if (Math.abs(dx) > 40 || (c.walking && Math.abs(dx) > step)) {
        c.walking = true;
        c.actor.x += Math.sign(dx) * Math.min(step, Math.abs(dx));
        c.actor.y = groundY - walkBob(c.r, now + c.slot * 97) * 8;
        c.facing = dx > 0 ? 1 : -1;
      } else {
        c.walking = false;
        c.actor.y = groundY;
        c.facing = actor.x >= c.actor.x ? 1 : -1; // looks towards her
      }
      c.actor.scale.x = c.facing;
    }

    function companionLinesFor(c, event) {
      const own = c.r.def.lines || {};
      return isLineList(own[event]) ? own[event] : roster.defaultLines[event];
    }

    function companionReact(c, event) {
      if (!c.r) return null;
      const lines = companionLinesFor(c, event);
      if (!isLineList(lines)) return null;
      const line = pickFrom("companion" + c.slot + ":" + c.r.def.id + ":" + event, lines, event);
      const r = Object.assign({}, DEFAULT_REACTIONS[event], c.r.def.reactions && c.r.def.reactions[event]);
      if (r.motion) c.r.motion(r.motion, true);
      companionSay(c, line, r.mood);
      return line;
    }

    function companionTap(c, part) {
      const ev = part === "head" ? "tapHead" : !part || part === "body" ? "tap" : "touch" + part[0].toUpperCase() + part.slice(1);
      if (!companionReact(c, ev)) companionReact(c, "tap");
    }

    function stopCompanionVoice(c) {
      if (!c.voice) return;
      c.voice.el.pause();
      c.voice.src.disconnect();
      c.voice = null;
    }

    function playCompanionVoice(c, text) {
      if (!settings.voice || !c.r) return 0;
      const id = c.r.def.id;
      const entry = ((window.Live2DMascotVoices || {})[id] || {})[text];
      if (!entry) return 0;
      ensureAudio();
      if (!audioCtx) return 0; // Web Audio unavailable: skip, the line still shows
      if (!c.analyser) {
        c.analyser = audioCtx.createAnalyser();
        c.analyser.fftSize = 512;
        c.analyser.connect(gainNode);
      }
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      const el = new Audio(local(`voice/${id}/${entry.f}`));
      const src = audioCtx.createMediaElementSource(el);
      src.connect(c.analyser);
      const playing = { el, src };
      c.voice = playing;
      el.onended = el.onerror = () => {
        if (c.voice === playing) stopCompanionVoice(c);
      };
      el.play().catch(() => {
        if (c.voice === playing) stopCompanionVoice(c);
      });
      return entry.ms || 0;
    }

    // Returns how long the line stays up, in ms.
    function companionSay(c, text, moodName) {
      if (!c.r || !text || isHidden()) return 0;
      stopCompanionVoice(c);
      const ms = playCompanionVoice(c, text);
      const chars = Array.from(String(text));
      const charMs = ms ? Math.max(25, Math.min(CHAR_MS, (ms * 0.85) / chars.length)) : CHAR_MS;
      const total = Math.max(chars.length * charMs + Math.min(6000, Math.max(2500, 1800 + chars.length * 90)), ms + 700);
      const now = performance.now();
      c.speech = { chars, start: now, charMs, endAt: now + total, shown: -1 };
      c.bubble.classList.add("show");
      const params = moodName && c.r.def.moods && c.r.def.moods[moodName];
      c.mood = params ? { params, start: now, end: now + total } : null;
      return total;
    }

    function companionDone(c) {
      return new Promise((resolve) => {
        const check = () => {
          const typed = !c.speech || c.speech.shown >= c.speech.chars.length;
          if (typed && !c.voice) setTimeout(resolve, 400);
          else setTimeout(check, 120);
        };
        setTimeout(check, 200);
      });
    }

    function companionFrame(c) {
      const now = performance.now();
      if (c.mood) {
        if (now > c.mood.end + 400) c.mood = null;
        else c.r.applyMood(c.mood.params, Math.min(1, (now - c.mood.start) / 200) * Math.min(1, Math.max(0, (c.mood.end + 400 - now) / 400)));
      }
      if (c.voice) {
        c.analyser.getFloatTimeDomainData(c.buf);
        let sum = 0;
        for (let i = 0; i < c.buf.length; i++) sum += c.buf[i] * c.buf[i];
        const target = Math.min(1, Math.sqrt(sum / c.buf.length) * 7);
        c.mouth += (target - c.mouth) * (target > c.mouth ? 0.6 : 0.3);
        c.r.setMouth(c.mouth);
      } else if (c.speech && c.speech.shown < c.speech.chars.length) {
        c.r.setMouth(0.2 + 0.8 * Math.abs(Math.sin(now / 55)));
      }
    }

    // Each bubble over her head, moved up out of the way of bubbles already placed.
    function updateCompanionBubble(c, now, taken) {
      const bb = c.bubble;
      if (!c.speech) return;
      if (!c.r || now >= c.speech.endAt || isHidden()) {
        bb.classList.remove("show");
        c.speech = null;
        return;
      }
      const n = Math.min(c.speech.chars.length, Math.floor((now - c.speech.start) / c.speech.charMs));
      if (n !== c.speech.shown) {
        c.speech.shown = n;
        bb.firstElementChild.textContent = c.speech.chars.slice(0, n).join("");
        bb.lastElementChild.textContent = c.speech.chars.slice(n).join("");
      }
      const ext = c.r.visibleExtents();
      const headX = c.actor.x;
      const headY = c.actor.y - (ext ? ext.top : c.r.naturalHeight) * c.scale;
      const bw = bb.offsetWidth;
      const bh = bb.offsetHeight;
      const left = Math.min(Math.max(headX - bw / 2, 8), window.innerWidth - bw - 8);
      let top = Math.max(8, headY - bh - 12);
      for (let pass = 0; pass < 3; pass++) {
        const hit = taken.find((r) => left < r.right && left + bw > r.left && top < r.bottom && top + bh > r.top);
        if (!hit) break;
        top = Math.max(8, hit.top - bh - 8);
      }
      taken.push({ left, right: left + bw, top, bottom: top + bh });
      bb.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      bb.style.setProperty("--tail-x", Math.min(Math.max(headX - left, 14), bw - 14) + "px");
    }

    function stepCompanions(now, dtMs) {
      const taken = bubble.classList.contains("show") ? [bubble.getBoundingClientRect()] : [];
      for (const c of companions) {
        if (!c.r) continue;
        stepCompanion(c, now, dtMs);
        if (c.r.canPose) {
          let want = c.dragging || c.fall ? "held" : c.walking ? walkFrame(c.r, now + c.slot * 97) : "stand";
          if (want !== "stand" && !(c.r.canPose(want) && poseFits(c.r, want))) want = "stand";
          if (want !== c.pose) {
            c.r.setPose(want);
            c.pose = want;
          }
        }
        updateCompanionBubble(c, now, taken);
      }
    }

    // Dragging a companion: lift her, and when let go she drops to the ground
    // and stays there a while before following again.
    function startCompanionDrag(c, e) {
      compDrag = { c, pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startX: c.actor.x, startY: c.actor.y, moved: false };
      window.addEventListener("pointermove", onCompanionDragMove, true);
      window.addEventListener("pointerup", onCompanionDragUp, true);
    }
    function onCompanionDragMove(e) {
      if (!compDrag || e.pointerId !== compDrag.pointerId) return;
      const { c } = compDrag;
      const dx = e.clientX - compDrag.startClientX;
      const dy = e.clientY - compDrag.startClientY;
      if (!compDrag.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        compDrag.moved = true;
        c.dragging = true;
        c.fall = null;
        companionReact(c, "dragStart");
      }
      if (!compDrag.moved) return;
      e.preventDefault();
      e.stopPropagation();
      const w = window.innerWidth;
      const h = window.innerHeight;
      c.actor.x = Math.min(Math.max(compDrag.startX + dx, 20), w - 20);
      c.actor.y = Math.min(Math.max(compDrag.startY + dy, h * 0.25), groundY);
    }
    function onCompanionDragUp(e) {
      if (!compDrag || e.pointerId !== compDrag.pointerId) return;
      window.removeEventListener("pointermove", onCompanionDragMove, true);
      window.removeEventListener("pointerup", onCompanionDragUp, true);
      const { c, moved } = compDrag;
      compDrag = null;
      if (moved) {
        c.dragging = false;
        if (c.actor.y < groundY - 2) c.fall = { vy: 0 };
        c.pinnedUntil = performance.now() + 90000;
        companionReact(c, "dragEnd");
      } else if (c.r) {
        const [x, y] = localXY(e);
        companionTap(c, c.r.hitAreas(x, y)[0]);
      }
    }

    // A short exchange from characters/banter.js between two of the three.
    async function runBanter() {
      if (!character) return;
      const cast = [{ id: character.def.id, main: true }].concat(companions.filter((c) => c.r).map((c) => ({ id: c.r.def.id, c })));
      const options = [];
      for (const d of window.Live2DMascotBanter || []) {
        if (!d.pair || d.pair[0] === d.pair[1]) continue;
        const a = cast.find((m) => m.id === d.pair[0]);
        const b = cast.find((m) => m.id === d.pair[1]);
        if (a && b) options.push({ d, who: { [d.pair[0]]: a, [d.pair[1]]: b } });
      }
      if (!options.length) return;
      const fresh = options.filter((o) => !banterRecent.includes(o.d));
      const pool = fresh.length ? fresh : options;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      banterRecent.push(pick.d);
      if (banterRecent.length > Math.max(1, options.length - 1)) banterRecent.shift();
      const who0 = character;
      for (const [speaker, text] of pick.d.lines) {
        if (character !== who0 || chatting()) return;
        const m = pick.who[speaker];
        if (!m) continue;
        if (m.main) {
          if (!say(text, { priority: 1 })) return; // something more important came up
          await speechDone();
        } else {
          if (!m.c.r || !companionSay(m.c, text)) return;
          await companionDone(m.c);
        }
      }
    }

    if (config.desktop) panel.querySelectorAll(".desktop-only").forEach((el) => (el.hidden = false));
    if (canChat) panel.querySelectorAll(".web-only").forEach((el) => (el.hidden = true));

    if (canChat) {
      dom.memClear.addEventListener("click", () => {
        if (!window.confirm("确定要清空吗？她会忘记你告诉过她的事，聊天记录也会删掉。")) return;
        memory = { notes: [] };
        chatLog = {};
        saveMemory();
        try {
          localStorage.removeItem(CHAT_KEY);
        } catch {
          // fine
        }
        renderMemory();
      });
      renderMemory();
    }

    // What shows in the chat window: this session's lines, seeded from the saved chat.
    let chatView = [];
    let chatViewFor = null;
    function renderChatView() {
      const el = dom.chatLogEl;
      el.innerHTML = "";
      if (!chatView.length) {
        const p = document.createElement("div");
        p.className = "chat-empty";
        p.textContent = "说点什么吧～也可以点下面的按钮。";
        el.appendChild(p);
      }
      for (const m of chatView) {
        const d = document.createElement("div");
        d.className = "msg " + m.who;
        d.textContent = m.text;
        el.appendChild(d);
      }
      if (chatBusy) {
        const d = document.createElement("div");
        d.className = "msg her typing";
        d.textContent = "···";
        el.appendChild(d);
      }
      el.scrollTop = el.scrollHeight;
    }
    function pushChat(who, text) {
      if (!text) return;
      const last = chatView[chatView.length - 1];
      if (last && last.who === who && last.text === text) return;
      chatView.push({ who, text });
      if (chatView.length > 60) chatView = chatView.slice(-60);
      if (!dom.chatBox.hidden) renderChatView();
    }
    function openChat() {
      if (!character) return;
      const id = character.def.id;
      if (chatViewFor !== id) {
        chatViewFor = id;
        chatView = (chatLog[id] || []).slice(-16).map((m) => ({ who: m.role === "user" ? "me" : "her", text: m.content }));
      }
      dom.chatName.textContent = character.def.name || id;
      dom.chatAv.dataset.av = id;
      const src = avatarFor(id);
      if (src) dom.chatAv.src = src;
      else dom.chatAv.removeAttribute("src");
      renderChatView();
    }
    function closeChat() {
      dom.chatBox.hidden = true;
      if (turnsSinceMemory > 0) updateMemory(character);
    }

    if (canChat) {
      dom.chatBtn.hidden = false;
      panel.querySelectorAll(".chat-only").forEach((el) => (el.hidden = false));
      dom.chatBtn.addEventListener("click", () => {
        if (!dom.chatBox.hidden) {
          closeChat();
          return;
        }
        dom.chatBox.hidden = false;
        panel.hidden = true;
        if (mode === "walk") setMode("idle");
        openChat();
        dom.chatInput.focus();
      });
      dom.chatClose.addEventListener("click", closeChat);
      dom.chatBox.addEventListener("click", (e) => {
        const b = e.target.closest && e.target.closest("[data-chip-send],[data-chip-fill]");
        if (!b) return;
        if (b.dataset.chipFill) {
          dom.chatInput.value = b.dataset.chipFill;
          dom.chatInput.focus();
          dom.chatInput.select();
        } else {
          dom.chatInput.value = b.dataset.chipSend;
          sendChat();
        }
      });
      dom.chatSend.addEventListener("click", sendChat);
      dom.chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          sendChat();
        } else if (e.key === "Escape") {
          closeChat();
        }
      });
    }

    // -----------------------------------------------------------------
    // Settings panel
    // -----------------------------------------------------------------
    const inputs = Array.from(panel.querySelectorAll("[data-k]"));

    // Tabs: remembered per viewer.
    let tabNow = "who";
    try {
      tabNow = localStorage.getItem("live2d-mascot-tab") || "who";
    } catch {
      // fine
    }
    function showTab(name) {
      if (!panel.querySelector(`[data-page="${name}"]`)) name = "who";
      tabNow = name;
      panel.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === name));
      panel.querySelectorAll(".page").forEach((p) => (p.hidden = p.dataset.page !== name));
      try {
        localStorage.setItem("live2d-mascot-tab", name);
      } catch {
        // fine
      }
    }
    panel.addEventListener("click", (e) => {
      const t = e.target.closest && e.target.closest(".tab");
      if (t) showTab(t.dataset.tab);
    });
    showTab(tabNow);

    // Round avatars cut from each sprite character's face; Live2D ones get an initial.
    const avatarCache = {};
    function avatarFor(id) {
      if (avatarCache[id] !== undefined) return avatarCache[id];
      const def = roster.defs[id];
      avatarCache[id] = null;
      if (def && def.images && def.images.normal) {
        loadImage(local(def.images.normal))
          .then((img) => {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const [x0, y0, x1, y1] = def.faceBox || [0.35, 0.02, 0.65, 0.2];
            const size = (x1 - x0) * w * 1.25;
            const cx = ((x0 + x1) / 2) * w;
            const cy = ((y0 + y1) / 2) * h;
            const c = document.createElement("canvas");
            c.width = c.height = 96;
            const g = c.getContext("2d");
            g.fillStyle = "#fff";
            g.fillRect(0, 0, 96, 96);
            g.drawImage(img, cx - size / 2, cy - size / 2, size, size, 0, 0, 96, 96);
            avatarCache[id] = c.toDataURL("image/jpeg", 0.85);
            panel.querySelectorAll(`img[data-av="${id}"]`).forEach((el) => (el.src = avatarCache[id]));
            if (dom.chatAv.dataset.av === id) dom.chatAv.src = avatarCache[id];
          })
          .catch(() => {});
      }
      return null;
    }
    const AV_COLORS = ["#f59e8b", "#8bb4f5", "#a78bfa", "#6cc5a3", "#f5b86b"];
    function faceEl(id, name) {
      if (!id) {
        const d = document.createElement("span");
        d.className = "face none-face";
        d.textContent = "—";
        return d;
      }
      const def = roster.defs[id] || {};
      if (def.images && def.images.normal) {
        const img = document.createElement("img");
        img.className = "face";
        img.dataset.av = id;
        img.alt = "";
        const src = avatarFor(id);
        if (src) img.src = src;
        return img;
      }
      const d = document.createElement("span");
      d.className = "face";
      d.style.background = AV_COLORS[roster.list.indexOf(id) % AV_COLORS.length];
      d.textContent = (name || id).trim()[0];
      return d;
    }

    // Pickers drawn from their hidden <select data-k>: avatars or a row of buttons.
    function renderPickers() {
      panel.querySelectorAll("[data-pick]").forEach((box) => {
        const sel = panel.querySelector(`select[data-k="${box.dataset.pick}"]`);
        if (!sel) return;
        box.innerHTML = "";
        for (const opt of sel.options) {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.value = opt.value;
          if (opt.title) b.title = opt.title;
          if (box.classList.contains("avatars")) {
            const name = opt.value ? (roster.defs[opt.value] || {}).name || opt.textContent : "不要";
            b.appendChild(faceEl(opt.value, name));
            const label = document.createElement("span");
            label.textContent = name.replace(/（.*?）/, "").replace(/\s*娘$/, "");
            b.title = name;
            b.appendChild(label);
          } else {
            b.textContent = opt.dataset.short || opt.textContent;
          }
          b.classList.toggle("on", opt.value === sel.value);
          b.addEventListener("click", () => {
            sel.value = opt.value;
            sel.dispatchEvent(new Event("input", { bubbles: true }));
          });
          box.appendChild(b);
        }
      });
    }

    function renderPanel() {
      for (const el of inputs) {
        const v = settings[el.dataset.k];
        if (el.type === "checkbox") el.checked = !!v;
        else el.value = String(v);
      }
      dom.sizeVal.textContent = Math.round(settings.size * 100) + "%";
      renderCompanionOptions();
      panel.querySelectorAll("[data-act]").forEach((b) => (b.hidden = !canDoAction(b.dataset.act)));
      panel.querySelectorAll("[data-hold]").forEach((b) => {
        b.hidden = !canHold(b.dataset.hold);
        b.classList.toggle("on", !!hold && hold.kind === b.dataset.hold);
      });
      panel.querySelector(".hold-end").hidden = !hold;
      renderPickers();
      dom.volumeVal.textContent = Math.round(settings.volume * 100) + "%";
    }

    function applySetting(k) {
      if (k === "size") layout();
      if (k === "restMinutes") restAnchor = Date.now();
      if (k === "chatter") scheduleChatter();
      if (k === "aiChatter") scheduleAiChatter();
      if (k === "watchApps" && !settings.watchApps) appKind = null;
      if (k === "autoWander" && !settings.autoWander && mode === "walk") setMode("idle");
      if (k === "character") setCharacter(settings.character);
      if (k === "buddy") setCompanion(companions[0], settings.buddy);
      if (k === "buddy2") setCompanion(companions[1], settings.buddy2);
      if (k === "outfit") {
        delete settings.outfits;
        saveSettings(settings);
        applyOutfit();
      }
      if (k === "voice" && !settings.voice) stopVoice();
      if (k === "effects" && !settings.effects) idleAction = null;
      if (k === "volume" && gainNode) gainNode.gain.value = settings.volume;
    }

    panel.addEventListener("click", (e) => {
      const h = e.target.closest && e.target.closest("[data-hold]");
      if (h) {
        if (hold && hold.kind === h.dataset.hold) endHold();
        else startHold(h.dataset.hold);
        return;
      }
      if (e.target.closest && e.target.closest(".hold-end")) {
        endHold();
        return;
      }
      const b = e.target.closest && e.target.closest("[data-act]");
      if (b) doAction(b.dataset.act);
    });

    panel.addEventListener("input", (e) => {
      const el = e.target;
      const k = el.dataset && el.dataset.k;
      if (!k) return;
      let v = el.value;
      if (el.type === "checkbox") v = el.checked;
      else if (k === "size" || k === "restMinutes" || k === "volume") v = Number(v);
      settings[k] = v;
      saveSettings(settings);
      applySetting(k);
      renderPanel();
    });

    dom.resetBtn.addEventListener("click", () => {
      settings = Object.assign({}, DEFAULTS);
      saveSettings(settings);
      Object.keys(settings).forEach(applySetting);
      renderPanel();
    });

    dom.settingsBtn.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        dom.chatBox.hidden = true;
        renderBond();
        renderReminders();
      }
      if (!panel.hidden) renderPanel();
    });
    dom.panelClose.addEventListener("click", () => {
      panel.hidden = true;
    });

    // -----------------------------------------------------------------
    // Minimize / close / API
    // -----------------------------------------------------------------
    function setMinimized(v) {
      containerEl.classList.toggle("minimized", v);
      dom.restoreTab.hidden = !v;
      if (v) stopVoice();
      else setTimeout(() => react("restore"), 300);
    }
    function setClosed(v) {
      containerEl.classList.toggle("closed", v);
      if (v) stopVoice();
    }

    dom.minBtn.addEventListener("click", () => setMinimized(true));
    dom.restoreTab.addEventListener("click", () => setMinimized(false));
    if (config.desktop) dom.closeBtn.title = "退出看板娘";
    dom.closeBtn.addEventListener("click", () => {
      if (config.desktop) config.desktop.onClose();
      else setClosed(true);
    });

    function destroy() {
      clearInterval(schedulerTimer);
      window.removeEventListener("resize", layout);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerover", onPageHover);
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
      window.removeEventListener("pointermove", onPointerMoveCapture, true);
      window.removeEventListener("pointerup", onPointerUpCapture, true);
      window.removeEventListener("pointercancel", onPointerUpCapture, true);
      window.removeEventListener("pointermove", onCompanionDragMove, true);
      window.removeEventListener("pointerup", onCompanionDragUp, true);
      ACTIVITY_EVENTS.forEach((t) => window.removeEventListener(t, noteActivity));
      stopVoice();
      for (const c of companions) {
        stopCompanionVoice(c);
        if (c.r) c.r.destroy();
      }
      if (audioCtx) audioCtx.close().catch(() => {});
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      dom.hostEl.remove();
      window.__live2dMascotLoaded = false;
      window.Live2DMascot = undefined;
    }

    window.Live2DMascot = {
      show: () => setClosed(false),
      hide: () => setClosed(true),
      minimize: () => setMinimized(true),
      restore: () => setMinimized(false),
      setMode,
      say: (text, moodName) => say(text, { priority: 3, mood: moodName }),
      react: (event, vars) => react(event, vars),
      // an action from the settings buttons: wave, drink, act, stretch, lookAround, yawn, hum
      act: (name) => doAction(name),
      // Companion: setBuddy("deepseek") / setBuddy("") and a banter right now.
      setBuddy: (id) => setCompanion(companions[0], id),
      // slot 0 or 1; "" sends her home (not saved in settings)
      setCompanion: (slot, id) => companions[slot] && setCompanion(companions[slot], id),
      // Who is at a page point: "main", "companion0", "companion1" or null.
      whoAt: (x, y) => (regionAt(x, y) ? "main" : (companionAt(x, y) || {}).slot !== undefined ? "companion" + companionAt(x, y).slot : null),
      // Animations "wave" | "drink" | "act"; outfit "pajamas" | "winter" | null (undefined = back to the clock).
      anim: (kind) => playAnim(kind),
      // keep a state until cancelled: sit, sleep, focus, act, sulk, happy, shy, angry, surprised, sleepy; null ends it
      hold: (kind) => (kind ? startHold(kind) : endHold()),
      setOutfit: (name) => {
        outfitOverride = name;
        applyOutfit();
      },
      getOutfit: () => (character && character.getOutfit ? character.getOutfit() : { outfit: null, poses: [], pose: null }),
      banter: () => runBanter(),
      // Treat text as if typed into the chat box; true when handled without the AI.
      command: (text) => handleLocal(String(text)),
      // What part of her is at a page point: "head", "hand", "tail", "body"... or null.
      partAt: (x, y) => regionAt(x, y),
      // Desktop pet with AI chat: she starts a conversation right now.
      talkToMe: () => (canChat ? aiChatter() : Promise.resolve()),
      // { points, level, name, days } for the current character
      getAffection: () => {
        if (!character) return null;
        const b = bond();
        const lv = levelOf(b.points);
        return { points: b.points, level: lv, name: AFFECTION_LEVELS[lv].name, days: b.days };
      },
      setState,
      setCharacter: async (id) => {
        const ok = await setCharacter(id);
        if (ok) {
          settings.character = id;
          saveSettings(settings);
        }
        return ok;
      },
      getCharacters: () => roster.list.map((id) => ({ id, name: roster.defs[id].name || id })),
      openSettings: () => {
        panel.hidden = false;
        renderPanel();
      },
      destroy,
    };

    // First character: greet instead of the switch-in line.
    // remembered before the first character is set (switching characters forgets it)
    let keptHold = null;
    try {
      keptHold = localStorage.getItem(HOLD_KEY);
    } catch {
      // fine
    }
    await setCharacter(settings.character, false);
    for (const c of companions) setCompanion(c, settings[c.key]);
    try {
      if (keptHold) localStorage.setItem(HOLD_KEY, keptHold);
    } catch {
      // fine
    }
    const resumed = restoreHold();
    if (resumed !== "sleep") setTimeout(() => react("greeting." + greetingSlot(new Date().getHours())), 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
