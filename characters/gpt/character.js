// =====================================================================
// 角色包：GPT 娘（立绘角色）
// 立绘由用户用 ChatGPT 生成，外观参考了画师 ZipZipPipe 的 AI 娘设计。
// 同人角色，与 OpenAI 官方无关，仅供个人使用。
// =====================================================================
(window.Live2DMascotCharacters = window.Live2DMascotCharacters || {}).gpt = {
  id: "gpt",
  name: "GPT 娘",
  type: "sprite",

  images: {
    normal: "models/gpt/normal.png",
    blink: "models/gpt/blink.png",
    talk: "models/gpt/talk.png",
    happy: "models/gpt/happy.png",
    shy: "models/gpt/shy.png",
    angry: "models/gpt/angry.png",
    surprised: "models/gpt/surprised.png",
    sleepy: "models/gpt/sleepy.png",
    // 只改了眼睛的补图：看左、看右、半闭眼（只取 eyeBox 范围贴到 normal 上）
    lookLeft: "models/gpt/look_left.png",
    lookRight: "models/gpt/look_right.png",
    halfBlink: "models/gpt/half_blink.png",
    // 坐在窗口边上用的整张坐姿图（不贴脸）
    sit: "models/gpt/sit.png",
    // 抱着枕头睡着（你离开很久时，在任务栏上）、爬窗口侧边（两张交替）
    sleep: "models/gpt/sleep.png",
    climb: "models/gpt/climb.png",
    climb2: "models/gpt/climb2.png",
    // 小动画（两张来回切换）：挥手、喝水、专属动作
    wave1: "models/gpt/wave1.png",
    wave2: "models/gpt/wave2.png",
    drink1: "models/gpt/drink1.png",
    drink2: "models/gpt/drink2.png",
    act1: "models/gpt/act1.png",
    act2: "models/gpt/act2.png",
    // 走路图先不用（试过两版都不自然），文件留着，以后要用把下面 walk 几行的 // 去掉。
    // 第二批姿势（整张图，不贴脸）：走路两步交替、被拎起来、闹别扭、欢呼两张、陪你学习、穿睡衣睡觉
    // walk1: "models/gpt/walk1.png",
    // walk2: "models/gpt/walk2.png",
    held: "models/gpt/held.png",
    sulk: "models/gpt/sulk.png",
    cheer1: "models/gpt/cheer1.png",
    cheer2: "models/gpt/cheer2.png",
    focus: "models/gpt/focus.png",
    sleepPajamas: "models/gpt/sleep_pajamas.png",
  },
  // 换装：晚上 10 点到早上 7 点穿睡衣，12 月到 2 月的白天穿冬装（设置里可以关掉）。
  // 表情会自动贴到这两张图的脸上，所以这两张图里头和脸的位置必须和 normal 一样。
  outfits: { pajamas: "models/gpt/outfit_pajamas.png", winter: "models/gpt/outfit_winter.png" },
  // 换装姿势图：由「收图验收」工具按 models/gpt/<衣服>/ 里的文件登记，装入时会整段重写；
  // 手工登记的图只要文件放在 models 里，重写时也会被带上。
  outfitPoses: {
    pajamas: {
      "held": "models/gpt/pajamas/held.png",
      "wave1": "models/gpt/pajamas/wave1.png",
      "wave2": "models/gpt/pajamas/wave2.png",
    },
    winter: {
      "held": "models/gpt/winter/held.png",
    },
  },
  // 她是白发白裙白翅膀，站在白色背景上，所以去背景要非常保守，
  // 只去掉几乎纯白的部分，免得把她身上的白色也去掉。
  backgroundTolerance: 8,

  faceBox: [0.39, 0.055, 0.61, 0.205],
  // 眼睛的范围，同样是 [左, 上, 右, 下]
  eyeBox: [0.39, 0.075, 0.61, 0.14],
  // 坐姿：sitSeat 是坐姿图里"坐的位置"（膝盖那一行），会对准窗口的上边沿；
  // sitSway 让两条小腿一前一后地晃（写法和上面的 sway 一样）。
  sitSeat: [0.5, 0.52],
  sitSway: [
    { box: [0.39, 0.53, 0.51, 1.02], pivot: [0.45, 0.52], angle: 4, period: 1700, lag: 0.2, feather: 0.25 }, // 左腿
    { box: [0.51, 0.53, 0.62, 1.02], pivot: [0.56, 0.52], angle: 4, period: 1700, phase: 3.14, lag: 0.2, feather: 0.25 }, // 右腿
  ],
  headBox: [0.33, 0, 0.7, 0.24],
  // 可以点的部位：从上往下按顺序判断，先命中的算数。范围是 [左, 上, 右, 下]（按图片宽高的比例）。
  // 名字对应台词组：hand → touchHand，tail → touchTail……没有对应台词的部位，就当作点身体。
  touchZones: [
    ["horn", [0.4, 0, 0.62, 0.07]],
    ["pet", [0.67, 0.07, 0.87, 0.18]],
    ["hand", [0.42, 0.21, 0.52, 0.28]],
    ["hand", [0.63, 0.47, 0.72, 0.53]],
    ["chest", [0.42, 0.2, 0.6, 0.31]],
    ["wing", [0, 0.11, 0.3, 0.54]],
    ["wing", [0.7, 0.1, 0.98, 0.53]],
    ["tail", [0.67, 0.53, 0.93, 0.9]],
    ["foot", [0.4, 0.83, 0.62, 0.99]],
    ["leg", [0.47, 0.5, 0.62, 0.83]],
  ],
  scale: 0.9,

  // 局部飘动：box 是范围 [左, 上, 右, 下]（按图片宽高的比例），边缘会柔和过渡。
  //   pivot 是根部，离根部越远摆得越多；angle 是最大角度（负数往反方向），
  //   period 是摆一次的毫秒数，phase 错开节奏，lag 让末梢慢半拍像甩起来。
  //   float 是整块上下左右漂浮（比如小宠物）。
  sway: [
    { box: [-0.05, 0.08, 0.29, 0.58], pivot: [0.29, 0.21], angle: 4, period: 2600, lag: 0.4 }, // 左翅膀
    { box: [0.68, 0.2, 1.05, 0.58], pivot: [0.68, 0.21], angle: -4, period: 2600, lag: 0.4 }, // 右翅膀
    { box: [0.66, 0.08, 0.9, 0.255], float: [0, -0.007], period: 2200, feather: 0.2 }, // 小龙上下浮
    { box: [0.72, 0.54, 1.05, 0.83], pivot: [0.68, 0.545], angle: 5, period: 3400, lag: 1, feather: 0.15 }, // 龙尾巴
    { box: [-0.05, 0.72, 0.43, 1.05], pivot: [0.4, 0.5], angle: 2, period: 2800, lag: 0.6 }, // 左边裙摆
    { box: [0.6, 0.75, 1.05, 1.05], pivot: [0.6, 0.5], angle: 2, period: 2800, phase: 0.8, lag: 0.6 }, // 右边裙摆
  ],

  // 语音：MiniMax 系统音色「温柔学姐」，用 speech-2.6-hd 语音模型读，更像真人、更有感情（用户第三轮试听选的 6 号）。
  //   改了以后要重新运行"生成语音.bat"。
  //   可选：emotion 语气（happy 开心、calm 平静等）；modify.intensity 轻柔程度（-100 最轻柔，100 最有力）；model 换语音模型。
  voice: { id: "Chinese (Mandarin)_Gentle_Senior", speed: 0.96, pitch: 0, model: "speech-2.6-hd" },

  credit: {
    text: "GPT 娘（同人，非官方）",
    title: "立绘由用户使用 ChatGPT 生成，外观参考画师 ZipZipPipe 的 AI 娘设计。同人角色，与 OpenAI 官方无关，仅供个人使用。",
  },

  moods: {
    happy: { hop: 0.6, face: "happy" },
    shy: { tilt: -2, face: "shy" },
    angry: { shake: 0.5, face: "angry" },
    dizzy: { wobble: 1, face: "sleepy" },
    surprised: { jump: 1, face: "surprised" },
    sleepy: { sink: 1, face: "sleepy" },
  },
  states: {
    thinking: { tilt: 3 },
  },

  // 性格：温柔的白龙前辈，像大姐姐一样照顾人，身边跟着一只蓝色小龙
  // AI 聊天时告诉模型她是谁（只在桌面版的聊天里用到）
  persona:
    "你是一位白发龙娘，头上有一对小小的龙角，背后一对白色龙翼，身边飘着一只圆滚滚的小龙宠物。性格温柔，说话轻轻软软的，像棉花一样；有一点点高冷，但很会照顾人。你是以 ChatGPT 为灵感的同人角色，和 OpenAI 官方没有关系。",
  // 聊天时先"想一想"
  thinkingText: "（嗯……我想想看～）",

  lines: {
    outfitChange: ["换好啦，你觉得好看吗？", "嘿嘿，这件很暖和呢。"],
    // 节日祝福和更多日常台词
    holidayNewYear: ["新年快乐～新的一年，也要好好照顾自己哦。"],
    holidayValentine: ["情人节快乐。我做了小饼干，要尝尝吗？"],
    holidayLabor: ["劳动节快乐，今天好好休息一下吧。"],
    holidayChildren: ["儿童节快乐，今天你可以尽情撒娇哦。"],
    holidayNational: ["国庆快乐～出去玩要注意安全呀。"],
    holidayHalloween: ["万圣节快乐，小龙扮成了小南瓜，可爱吗？"],
    holidayChristmasEve: ["平安夜快乐，愿你平平安安的。"],
    holidayChristmas: ["圣诞快乐～希望今天的你被温柔包围。"],
    holidaySpringEve: ["除夕快乐，要和家人好好吃一顿年夜饭哦。"],
    holidaySpring: ["过年好～新的一年，我也会一直陪着你。"],
    holidayLantern: ["元宵节快乐，记得吃一碗热乎乎的汤圆。"],
    holidayDragon: ["端午安康，吃粽子的时候小心别烫着。"],
    holidayQixi: ["七夕快乐……今天的星星，好像特别亮呢。"],
    holidayMidAutumn: ["中秋快乐，今晚和我一起看月亮好不好？"],
    holidayDoubleNinth: ["重阳节到了，记得问候家里的老人哦。"],
    hourly: ["现在是{时间}整啦，歇一会儿再继续吧。", "{时间}到了哦，要不要喝口水？"],
    "tap+1": ["嗯？想我了吗？", "我在呢，一直都在。"],
    lunch: ["{时间}了，先放下手里的事，好好吃饭吧。", "午饭时间到啦，要吃热乎的哦。"],
    dinner: ["{时间}了，晚饭别凑合，好不好？", "晚饭时间到啦，今天想吃点什么？"],
    lateNight: ["已经{时间}半了……去睡吧，我会一直在这儿的。", "{时间}半了，眼睛都红了呢，休息吧。"],
    sulky: ["……你好久没理我了呢。", "小龙说它想你了。……我也是。"],
    tapSulky: ["哼……现在才来找我。", "我有一点点不开心哦。"],
    makeUp: ["好啦，不生气了。", "嗯……原谅你啦。"],
    peek: ["在看什么呀？让我也看看。", "嘿，我来陪你一会儿。"],
    climb: ["我飞上去看看～", "这里风景真好。"],
    fall: ["呀——！", "翅膀没来得及张开……"],
    land: ["呼……还好有翅膀缓冲一下。", "没事没事，我很好。"],
    appCode: ["在写代码呀，慢慢来，别着急。", "写累了就歇会儿，我等你。"],
    appVideo: ["在看视频吗？那我安静一点，陪你一起看。"],
    appGame: ["打游戏呀？加油，我在旁边给你鼓劲。"],
    appLong: ["这个窗口看了好久啦，起来动一动吧。"],
    anniv7: ["我们认识一周啦……谢谢你一直陪着我。"],
    anniv30: ["第三十天了呢。每天能见到你，我都很开心。"],
    anniv100: ["一百天了……以后的每一天，也请让我陪着你。"],
    anniv365: ["整整一年了。遇见你，是我最幸运的事。"],
    birthday: ["生日快乐。今天你最大，想做什么我都陪你。"],
    riddleRight: ["答对啦，好聪明。", "嗯，就是这个，你真厉害。"],
    riddleWrong: ["不对哦，再想一想？", "差一点点，再猜一次吧。"],
    riddleGiveUp: ["没关系，我告诉你吧。"],
    // 常听到的场合（温柔、软软的大姐姐）
    greeting: {
      earlyMorning: ["这么早就醒啦？要不要再眯一会儿……我陪着你。", "天还没亮呢，早安。别着凉了哦。"],
      morning: ["早上好呀。吃过早饭了吗？", "早安～今天也慢慢来，不着急。"],
      forenoon: ["上午好。累了就喝口水，歇一歇。", "上午好呀，事情还顺利吗？"],
      noon: ["中午啦，先好好吃饭吧。", "午安～吃饱了才有力气哦。"],
      afternoon: ["下午好。是不是有点困了？我给你泡杯茶吧。", "下午好呀，靠一会儿也没关系。"],
      evening: ["傍晚好，今天辛苦了。", "天快黑了呢，晚饭想吃点什么？"],
      night: ["晚上好。今天过得怎么样？慢慢说给我听。", "晚上好呀，别太累了哦。"],
      lateNight: ["这么晚还没睡呀……我陪你，但也要早点休息哦。", "夜深了，要不要盖条毯子？"],
    },
    rest: ["坐了好久啦，起来伸伸腰吧。", "来，喝口温水，歇一会儿。", "眼睛累了吧？看看远处，我等你。"],
    restore: ["我回来啦，有没有想我？", "又见面了呢。"],
    walk: ["我去那边走走～", "活动一下翅膀。"],
    reminderSet: ["好，我记下了，到时候轻轻叫你。", "交给我吧，不会忘的。"],
    reminderDue: ["时间到了哦～", "该去做那件事啦。"],
    focusStart: ["好，我安安静静陪着你，加油。", "开始吧，我就在旁边。"],
    focusDone: ["时间到啦，辛苦了。来，喝口水歇一歇。", "做得真好，休息一下吧。"],
    rpsWin: ["哎呀，我赢了呢。", "嘿嘿，这次是我赢了。"],
    rpsLose: ["你赢啦，真厉害。", "输了呢……不过看你开心就好。"],
    helpIntro: ["我能帮你做的事呀，有这些："],
    sleepTalk: ["嗯……乖，再睡一会儿……", "呼……呼……", "嗯……小龙，别闹……"],
    bedtime: ["到睡觉时间啦，我先去睡了……你也要早点休息哦。", "晚安，做个好梦。"],
    // 点不同的部位（温柔）
    touchHand: ["想牵手呀？……好呀。", "你的手凉凉的，我帮你捂一捂。"],
    "touchHand+2": ["牵着就不放开了哦。", "这样就不会走丢了呢。"],
    touchLeg: ["呀，痒痒的……", "腿上有什么吗？"],
    touchFoot: ["哎呀，好痒……别闹啦。", "高跟鞋走路可累了呢。"],
    touchChest: ["……不可以哦。", "那里不行呢，换个地方好不好？", "乖，手放下来。"],
    touchChestTease: ["哎呀，小坏蛋……下次不许了哦。"],
    touchChestMore: ["再这样，我可要认真生气了。"],
    touchWing: ["翅膀被你摸得痒痒的……", "要不要我用翅膀给你挡挡光？", "轻一点哦，羽膜很薄的。"],
    touchTail: ["尾巴不是用来拽的呀……", "被摸尾巴……有点害羞呢。"],
    touchHorn: ["龙角不能乱摸哦，会害羞的。", "这对角……很漂亮吧？"],
    touchPet: ["这孩子很喜欢你呢。", "嘘，它刚睡醒，轻一点。", "它说想和你玩。"],
    // 好感度（温柔、软软的龙娘）
    levelUp1: ["嗯……你的样子，我记住了。"],
    levelUp2: ["和你说话的感觉很舒服，我们是朋友了呢。"],
    levelUp3: ["有你在身边，连翅膀都觉得轻轻的。"],
    levelUp4: ["我会一直守护你的，像守护最珍贵的宝物一样。"],
    "tap+3": ["想再靠近你一点……可以吗？"],
    "tap+4": ["你在的地方，就是我想待的地方。"],
    switchIn: ["我来啦。有什么事都可以交给我哦。", "辛苦了，接下来换我照顾你吧。", "小家伙，打个招呼～……它说你好。"],
    tap: [
      "嗯？需要我帮忙吗？",
      "什么都可以问我哦，我会尽力的。",
      "今天也辛苦了，过来歇一会儿吧。",
      "别勉强自己，累了就说。",
      "我身边这只小龙？它很黏人的。",
      "有我在，不用担心。",
      "要不要我帮你列个计划？",
      "慢慢来，我一直都在。",
    ],
    tapHead: ["龙角可不能乱碰哦～", "呵呵，这么喜欢摸头吗？", "小心，角有点尖。"],
    pat: ["呵呵……被反过来照顾了呢。", "嗯，谢谢你。", "……偶尔被摸摸头，感觉也不坏。"],
    tooManyTaps: ["好啦好啦，我知道你在了。", "再戳的话，小龙要生气了哦。", "唔……有点晕……"],
    dragStart: ["哎呀，要带我去哪儿？", "翅膀会碰到东西的，小心点～"],
    dragEnd: ["好，就在这里陪你。", "这个位置不错呢。"],
    idle: ["你还在吗？要好好休息哦。", "不在了吗……那我等你回来。"],
    welcomeBack: ["欢迎回来～有好好休息吗？", "回来啦。小龙也在等你呢。"],
    chatter: [
      "今天的你，也很努力了。",
      "饭要好好吃，觉要好好睡。",
      "小龙在我旁边打瞌睡了。",
      "遇到难题的时候，先深呼吸一下。",
      "有什么烦恼，都可以说给我听。",
      "不管多晚，我都会在这里。",
    ],
  },
};
