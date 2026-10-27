// =====================================================================
// 角色包：Mao（虹色まお）
// Live2D 官方免费示例角色，来自 Live2D/CubismWebSamples，Free Material License。
// 和 Hiyori 不同的地方：控制嘴巴的参数叫 ParamA，嘴角用 ParamMouthUp / ParamMouthAngry，
// 而且模型自带"头部"可点区域。正好用来检验换人物的地基是不是通用。
// =====================================================================
(window.Live2DMascotCharacters = window.Live2DMascotCharacters || {}).mao = {
  id: "mao",
  name: "Mao（虹色まお）",
  type: "live2d",
  model: "models/mao/Mao.model3.json",

  // 语音：MiniMax 系统音色「清脆少女」。改了以后要重新运行"生成语音.bat"。
  voice: { id: "Chinese (Mandarin)_Crisp_Girl", speed: 1, pitch: 0 },

  credit: {
    text: "Mao © Live2D Inc.",
    title:
      "This content uses sample data owned and copyrighted by Live2D Inc. The sample data are utilized in accordance with terms and conditions set by Live2D Inc. This content itself is created at the author's sole discretion.",
  },

  motions: { tap: "TapBody", walk: "TapBody" },
  mouthParam: "ParamA",

  // 神态：逐个放大看过之后调的数值
  moods: {
    happy: { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamEyeLOpen: 0.25, ParamEyeROpen: 0.25, ParamMouthUp: 1, ParamA: 0.35 },
    shy: {
      ParamCheek: 1, ParamEyeLSmile: 0.8, ParamEyeRSmile: 0.8, ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7,
      ParamMouthUp: 0.6,
    },
    angry: {
      ParamMouthAngry: 1, ParamMouthAngryLine: 1, ParamBrowLForm: -1, ParamBrowRForm: -1,
      ParamEyeLOpen: 0.8, ParamEyeROpen: 0.8, ParamCheek: 0.6, ParamA: 0,
    },
    dizzy: { ParamEyeLOpen: 0.35, ParamEyeROpen: 0.35, ParamMouthDown: 0.8, ParamAngleZ: 12 },
    surprised: { ParamEyeLOpen: 1.3, ParamEyeROpen: 1.3, ParamBrowLY: 1, ParamBrowRY: 1, ParamA: 0.6 },
    sleepy: { ParamEyeLOpen: 0.3, ParamEyeROpen: 0.3, ParamBrowLY: -0.3, ParamBrowRY: -0.3 },
  },

  states: {
    thinking: { ParamAngleZ: 25, ParamAngleY: 15, ParamAngleX: -15, ParamEyeBallX: 0.8, ParamEyeBallY: 0.9, ParamBodyAngleZ: 6 },
  },

  // 专属台词：她的性格比日和更活泼一些
  lines: {
    switchIn: ["Mao 登场！今天也请多指教～", "轮到我啦！", "嘿嘿，我来接班了！"],
    tap: [
      "嗯？叫我吗？",
      "嘿嘿，戳到我了～",
      "要不要我变个小魔术给你看？",
      "今天也要开开心心的！",
      "有什么想做的事吗？",
      "我在这儿呢！",
      "别看我这样，我可是很靠谱的哦。",
      "累了就歇一会儿吧～",
    ],
    tapHead: ["帽子要歪啦！", "头顶不能乱戳啦～", "唔，你在干嘛呀？"],
    pat: ["嘿嘿……被夸了吗？", "再摸摸也可以哦～", "唔……有点害羞。"],
  },
};
