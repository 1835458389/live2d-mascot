// =====================================================================
// 角色包：Hiyori（日和）
// Live2D 官方免费示例角色，来自 Live2D/CubismWebSamples，Free Material License。
// 注意：Live2D 规定 Hiyori 的角色设计不能做任何修改。
// =====================================================================
(window.Live2DMascotCharacters = window.Live2DMascotCharacters || {}).hiyori = {
  id: "hiyori",
  name: "日和（Hiyori）",
  type: "live2d",
  model: "models/hiyori/Hiyori.model3.json",

  // 语音：MiniMax 系统音色「少女音色」。改了以后要重新运行"生成语音.bat"。
  voice: { id: "female-shaonv", speed: 1, pitch: 0 },

  // 页面角落必须显示的版权说明（Live2D 示例素材的使用条件）
  credit: {
    text: "Hiyori © Live2D Inc.",
    title:
      "This content uses sample data owned and copyrighted by Live2D Inc. The sample data are utilized in accordance with terms and conditions set by Live2D Inc. This content itself is created at the author's sole discretion.",
  },

  // 程序里的动作名 -> 模型里的动作组名
  motions: { tap: "TapBody", walk: "TapBody" },
  mouthParam: "ParamMouthOpenY",

  // 神态：在她自带的参数上叠加的目标值。她的刘海挡住了大部分眉毛，
  // 所以主要靠嘴巴、眼睛和脸红表现。这些数值是逐个放大看过之后调的。
  moods: {
    happy: { ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamEyeLOpen: 0.5, ParamEyeROpen: 0.5, ParamMouthForm: 1 },
    shy: {
      ParamCheek: 1, ParamEyeLSmile: 0.8, ParamEyeRSmile: 0.8, ParamEyeLOpen: 0.6, ParamEyeROpen: 0.6,
      ParamMouthForm: 0.6,
    },
    angry: {
      ParamBrowLAngle: 1, ParamBrowRAngle: 1, ParamBrowLY: -1, ParamBrowRY: -1, ParamEyeLOpen: 0.7,
      ParamEyeROpen: 0.7, ParamMouthForm: -1, ParamMouthOpenY: 0, ParamCheek: 1,
    },
    dizzy: {
      ParamEyeLOpen: 0.35, ParamEyeROpen: 0.35, ParamBrowLY: -0.6, ParamBrowRY: -0.6, ParamMouthForm: -0.6,
      ParamAngleZ: 12,
    },
    surprised: {
      ParamEyeLOpen: 1.3, ParamEyeROpen: 1.3, ParamBrowLY: 1, ParamBrowRY: 1, ParamMouthForm: -0.4,
      ParamMouthOpenY: 0.6,
    },
    sleepy: { ParamEyeLOpen: 0.3, ParamEyeROpen: 0.3, ParamBrowLY: -0.3, ParamBrowRY: -0.3 },
  },

  // 状态：会一直保持，直到被取消。外部用 Live2DMascot.setState("thinking") 触发。
  states: {
    thinking: {
      ParamAngleZ: 25, ParamAngleY: 15, ParamAngleX: -15, ParamEyeBallX: 0.8, ParamEyeBallY: 0.9,
      ParamBodyAngleZ: 6, ParamMouthForm: -0.2,
    },
  },

  // 专属台词：这里写了的组会代替公共台词，没写的组用 characters/default-lines.js。
  lines: {},
};
