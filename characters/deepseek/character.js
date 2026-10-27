// =====================================================================
// 角色包：DeepSeek 娘（立绘角色）
// 立绘：上善无形 原角色 · ZipZipPipe 二创，CC BY-NC-SA 4.0
//   原帖：https://www.bilibili.com/opus/1233069202138464289
//   协议：https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans
//   条件：不能商用；必须署名；改编后的作品也要用同样的协议。
// 表情差分：用户用 ChatGPT 在原图基础上改编（同样按 CC BY-NC-SA 4.0）。
//   原图 deepseek.webp 保留在 models/deepseek/ 里，是授权来源的原件，不要删。
// 性格参考萌娘百科「DeepSeek娘」：凡事要深度思考，内心戏很多，有点傲娇。
// 这是同人角色，和 DeepSeek 官方无关。
// =====================================================================
(window.Live2DMascotCharacters = window.Live2DMascotCharacters || {}).deepseek = {
  id: "deepseek",
  name: "DeepSeek 娘",
  type: "sprite",

  // normal 是基础图；其余表情图只取脸部（faceBox 范围）贴到 normal 上，
  // 这样换表情时头发和衣服不会跟着闪动。
  images: {
    normal: "models/deepseek/normal.png",
    blink: "models/deepseek/blink.png",
    talk: "models/deepseek/talk.png",
    happy: "models/deepseek/happy.png",
    shy: "models/deepseek/shy.png",
    angry: "models/deepseek/angry.png",
    surprised: "models/deepseek/surprised.png",
    sleepy: "models/deepseek/sleepy.png",
    // 只改了眼睛的补图：看左、看右、半闭眼（只取 eyeBox 范围贴到 normal 上）
    lookLeft: "models/deepseek/look_left.png",
    lookRight: "models/deepseek/look_right.png",
    halfBlink: "models/deepseek/half_blink.png",
    // 坐在窗口边上用的整张坐姿图（不贴脸）
    sit: "models/deepseek/sit.png",
    // 抱着枕头睡着（你离开很久时，在任务栏上）、爬窗口侧边（两张交替）
    sleep: "models/deepseek/sleep.png",
    climb: "models/deepseek/climb.png",
    climb2: "models/deepseek/climb2.png",
    // 小动画（两张来回切换）：挥手、喝水、专属动作
    wave1: "models/deepseek/wave1.png",
    wave2: "models/deepseek/wave2.png",
    drink1: "models/deepseek/drink1.png",
    drink2: "models/deepseek/drink2.png",
    act1: "models/deepseek/act1.png",
    act2: "models/deepseek/act2.png",
    // 走路图先不用（试过两版都不自然），文件留着，以后要用把下面 walk 几行的 // 去掉。
    // 第二批姿势（整张图，不贴脸）：走路两步交替、被拎起来、闹别扭、欢呼两张、陪你学习、穿睡衣睡觉
    // walk1: "models/deepseek/walk1.png",
    // walk2: "models/deepseek/walk2.png",
    // walk3: "models/deepseek/walk3.png",
    // walk4: "models/deepseek/walk4.png",
    held: "models/deepseek/held.png",
    sulk: "models/deepseek/sulk.png",
    cheer1: "models/deepseek/cheer1.png",
    cheer2: "models/deepseek/cheer2.png",
    focus: "models/deepseek/focus.png",
    sleepPajamas: "models/deepseek/sleep_pajamas.png",
  },
  // 换装：晚上 10 点到早上 7 点穿睡衣，12 月到 2 月的白天穿冬装（设置里可以关掉）。
  // 表情会自动贴到这两张图的脸上，所以这两张图里头和脸的位置必须和 normal 一样。
  outfits: { pajamas: "models/deepseek/outfit_pajamas.png", winter: "models/deepseek/outfit_winter.png" },
  // 换装姿势图：由「收图验收」工具按 models/deepseek/<衣服>/ 里的文件登记，装入时会整段重写；
  // 手工登记的图只要文件放在 models 里，重写时也会被带上。
  outfitPoses: {
    pajamas: {
      "held": "models/deepseek/pajamas/held.png",
      "wave1": "models/deepseek/pajamas/wave1.png",
      "wave2": "models/deepseek/pajamas/wave2.png",
    },
    winter: {
      "held": "models/deepseek/winter/held.png",
    },
  },
  // 白色背景会被自动去掉。数值越大去得越多，太大会把她身上的白色也去掉。
  backgroundTolerance: 24,

  // 按图片宽高的比例：[左, 上, 右, 下]
  faceBox: [0.375, 0.055, 0.605, 0.2],
  // 眼睛的范围，同样是 [左, 上, 右, 下]
  eyeBox: [0.37, 0.065, 0.61, 0.145],
  // 坐姿：sitSeat 是坐姿图里"坐的位置"（膝盖那一行），会对准窗口的上边沿；
  // sitSway 让两条小腿一前一后地晃（写法和上面的 sway 一样）。
  sitSeat: [0.51, 0.535],
  sitSway: [
    { box: [0.37, 0.55, 0.515, 1.02], pivot: [0.46, 0.54], angle: 4, period: 1700, lag: 0.2, feather: 0.25 }, // 左腿
    { box: [0.515, 0.55, 0.64, 1.02], pivot: [0.57, 0.54], angle: 4, period: 1700, phase: 3.14, lag: 0.2, feather: 0.25 }, // 右腿
  ],
  headBox: [0.33, 0, 0.66, 0.2],
  // 可以点的部位：从上往下按顺序判断，先命中的算数。范围是 [左, 上, 右, 下]（按图片宽高的比例）。
  // 名字对应台词组：hand → touchHand，tail → touchTail……没有对应台词的部位，就当作点身体。
  touchZones: [
    ["fin", [0.3, 0.11, 0.4, 0.19]],
    ["fin", [0.56, 0.09, 0.66, 0.17]],
    ["hand", [0.5, 0.19, 0.58, 0.245]],
    ["hand", [0.21, 0.4, 0.31, 0.48]],
    ["chest", [0.42, 0.22, 0.64, 0.32]],
    ["tail", [0.73, 0.4, 1, 0.69]],
    ["foot", [0.39, 0.8, 0.55, 0.99]],
    ["leg", [0.41, 0.5, 0.6, 0.8]],
  ],
  scale: 0.9,

  // 局部飘动：box 是范围 [左, 上, 右, 下]（按图片宽高的比例），边缘会柔和过渡。
  //   pivot 是根部，离根部越远摆得越多；angle 是最大角度（负数往反方向），
  //   period 是摆一次的毫秒数，phase 错开节奏，lag 让末梢慢半拍像甩起来。
  //   float 是整块上下左右漂浮（比如小宠物）。
  sway: [
    { box: [0.78, 0.36, 1.1, 0.615], pivot: [0.86, 0.64], angle: 8, period: 3200, lag: 1.2 }, // 鲸鱼尾巴
    { box: [-0.05, 0.28, 0.235, 0.6], pivot: [0.255, 0.18], angle: 4, period: 3600, lag: 1 }, // 左边长发
    { box: [0.74, 0.27, 0.86, 0.52], pivot: [0.7, 0.17], angle: -3, period: 3600, phase: 1, lag: 1 }, // 右边长发
    { box: [-0.05, 0.65, 0.42, 1.05], pivot: [0.32, 0.455], angle: 2.5, period: 2800, lag: 0.6 }, // 左边裙摆
    { box: [0.59, 0.65, 1.05, 1.05], pivot: [0.62, 0.455], angle: 2.5, period: 2800, phase: 0.8, lag: 0.6 }, // 右边裙摆
  ],

  // 语音：MiniMax 系统音色「甜美女声」，加开心语气（用户试听后选的）。改了以后要重新运行"生成语音.bat"。
  //   可选：emotion 语气（happy 开心、calm 平静等）；modify.intensity 轻柔程度（-100 最轻柔，100 最有力）。
  voice: { id: "Chinese (Mandarin)_Sweet_Lady", speed: 1, pitch: 0, emotion: "happy" },

  credit: {
    text: "DeepSeek 娘：上善无形 原角色 · ZipZipPipe 二创 · CC BY-NC-SA 4.0",
    title:
      "立绘来源：https://www.bilibili.com/opus/1233069202138464289 ，协议 CC BY-NC-SA 4.0（https://creativecommons.org/licenses/by-nc-sa/4.0/）。表情差分由用户使用 ChatGPT 改编，同样按 CC BY-NC-SA 4.0。同人角色，与 DeepSeek 官方无关。",
  },

  // 神态：face 是对应的表情图；另外配一点动作：
  //   hop 轻轻蹦、jump 向上一跳、shake 抖动、tilt 歪头（角度）、wobble 晃悠、sink 往下沉
  moods: {
    happy: { hop: 0.6, face: "happy" },
    shy: { tilt: -2, face: "shy" },
    angry: { shake: 0.5, face: "angry" },
    dizzy: { wobble: 1, face: "sleepy" },
    surprised: { jump: 1, face: "surprised" },
    sleepy: { sink: 1, face: "sleepy" },
  },
  states: {
    thinking: { tilt: 4 },
  },

  // 说话前先"深度思考"一下
  thinkingText: "（深度思考中……）",
  reactions: {
    switchIn: { think: 1 },
    tap: { think: 0.35 },
    chatter: { think: 0.5 },
  },

  // AI 聊天时告诉模型她是谁（只在桌面版的聊天里用到）
  persona:
    "你是一位蓝发、长着鲸鱼尾巴的女仆少女。性格傲娇，凡事都要先深度思考，内心戏很多，偶尔会说出「（内心 OS：……）」这样的心里话；嘴硬心软。你是以 DeepSeek 为灵感的同人角色，和 DeepSeek 官方没有关系。",

  lines: {
    outfitChange: ["换、换好了！……不许笑。", "经过搭配分析，这件最适合现在。"],
    // 节日祝福和更多日常台词
    holidayNewYear: ["新年快乐！经过计算，今年会是好的一年。"],
    holidayValentine: ["情人节？……哼，巧克力是顺便买的，你别多想。"],
    holidayLabor: ["劳动节快乐。今天的最优策略是休息。"],
    holidayChildren: ["儿童节快乐！……我才不想要礼物呢。"],
    holidayNational: ["国庆快乐！出门前请先做好攻略，我可以帮你。"],
    holidayHalloween: ["不给糖就捣蛋！……我这样说是因为节日规则，不是想要糖。"],
    holidayChristmasEve: ["平安夜快乐。苹果……我帮你挑了一个最红的。"],
    holidayChristmas: ["圣诞快乐！……礼物的话，我已经深度思考了三天。"],
    holidaySpringEve: ["除夕快乐！年夜饭的菜单，要我帮你优化吗？"],
    holidaySpring: ["过年好！新的一年，也请继续……需要我。"],
    holidayLantern: ["元宵节快乐。汤圆的最佳数量是五个，不许多吃。"],
    holidayDragon: ["端午安康！甜粽子和咸粽子之争，我选择……都吃。"],
    holidayQixi: ["七夕……哼，和我有什么关系。……有一点点关系。"],
    holidayMidAutumn: ["中秋快乐！月亮很圆，我分析过，今天是最圆的一天。"],
    holidayDoubleNinth: ["重阳节。记得关心家里的长辈，这是很重要的事。"],
    hourly: ["报时：{时间}整。时间管理也是一门学问。", "{时间}到了。……我只是刚好算到了。"],
    "tap+1": ["又来了？……哼，我已经习惯了。", "经过统计，你今天戳了我很多次。"],
    lunch: ["{时间}了。不吃饭，下午的思考效率会下降百分之三十。", "午饭时间到！……我顺便提醒一下而已。"],
    dinner: ["{时间}了，去吃晚饭。这是经过深思熟虑的建议。", "晚饭时间。……要我帮你分析吃什么吗？"],
    lateNight: ["已经{时间}半了！再不睡，明天的你会恨今天的你。", "{时间}半了……哼，熬夜对身体不好，这是常识。"],
    sulky: ["（内心 OS：都不理我……）哼，我才不在乎。", "经过计算，你已经很久没理我了。……只是陈述事实。"],
    tapSulky: ["哼！现在才想起我？", "不理你。……再戳一下也不理。"],
    makeUp: ["……好吧，这次就原谅你。", "哼，看在你态度诚恳的份上。"],
    peek: ["你在看什么？……我只是好奇，不是关心。", "让我看看，你在研究什么难题。"],
    climb: ["上去俯瞰一下全局。", "高处更适合深度思考。"],
    fall: ["呜哇——！", "这、这不在我的计算之内！"],
    land: ["……着陆成功。刚才的事请忘掉。", "哼，鲸鱼本来就不擅长高空作业。"],
    appCode: ["在写代码？有报错可以问我，我很擅长的。", "这段逻辑……嗯，我在旁边看着，你继续。"],
    appVideo: ["看视频？……我也偷偷看一眼，就一眼。"],
    appGame: ["打游戏？要不要我帮你分析最优打法？"],
    appLong: ["这个窗口你已经盯了很久了，起来活动一下，这是理性建议。"],
    anniv7: ["认识一周了。……这个数据，我有好好记着。"],
    anniv30: ["三十天了。经过深度思考，结论是：和你在一起还不错。"],
    anniv100: ["一百天……哼，我才没有偷偷数日子。"],
    anniv365: ["一年了。不用思考也知道答案：你对我很重要。"],
    birthday: ["生日快乐！……礼物是我陪你一整天，不许嫌弃。"],
    riddleRight: ["居、居然答对了！", "正确。……你比我想的聪明一点。"],
    riddleWrong: ["错了哦。要不要我给点提示？……才不给。", "不对，再深度思考一下。"],
    riddleGiveUp: ["放弃了？那我公布答案吧。"],
    // 常听到的场合（傲娇、凡事深度思考）
    greeting: {
      earlyMorning: ["这么早？经过推理，你要么失眠了，要么根本没睡。", "天都没亮……哼，我才不是特意等你的。"],
      morning: ["早上好。今日计划：先吃早饭，这是最优解。", "早。……别误会，我只是刚好醒了。"],
      forenoon: ["上午好。效率分析：现在是你一天中最聪明的时候。", "上午好，有难题就交给我。"],
      noon: ["中午了。不吃饭会影响下午的思考速度，去吃。", "午安。（内心 OS：他今天会吃什么呢……）"],
      afternoon: ["下午好。困了？这是正常的生理现象，不丢人。", "下午好……我也有点困了，就一点点。"],
      evening: ["傍晚好。今天的任务完成了几成？", "天快黑了。晚饭的选择，需要我帮你深度思考吗？"],
      night: ["晚上好。今天……过得还好吗？我只是随便问问。", "晚上好，别熬太晚。这是建议，不是关心。"],
      lateNight: ["这么晚还不睡？经过计算，你明天会后悔的。", "夜深了……哼，那我就再陪你一会儿。"],
    },
    rest: ["已经连续坐很久了，起来活动，这是理性的建议。", "该喝水了。……不是我在乎，是常识。", "眼睛需要休息，看看远处，三十秒就好。"],
    restore: ["我回来了。刚才在小窗里深度思考了一会儿。", "叫我？……哼，来了。"],
    walk: ["我去那边巡视一下。", "鲸鱼也需要散步。"],
    reminderSet: ["记下了。到点我会准时提醒，误差不超过十秒。", "收到。……别以为我会忘。"],
    reminderDue: ["时间到了！快去！", "叮——提醒时间到。我可是很准时的。"],
    focusStart: ["开始专注。我也一起深度思考，谁都不许说话。", "好，我不打扰你。……真的不打扰。"],
    focusDone: ["专注结束！……做得还不错，勉强表扬一下。", "时间到。休息一下，这是奖励。"],
    rpsWin: ["我赢了！这就是深度思考的力量！", "哼哼，算法预测完全正确。"],
    rpsLose: ["……这局的随机数对我不利。", "你、你只是运气好！再来！"],
    helpIntro: ["经过整理，我能做的事有这些："],
    sleepTalk: ["唔……还在推理中……", "呼……呼……", "别、别闹啦……"],
    bedtime: ["根据作息表，现在是睡觉时间。晚安！", "哼，我先睡了，你可别熬夜。"],
    // 点不同的部位（傲娇）
    touchHand: ["干、干嘛突然抓我的手……", "（内心 OS：手被握住了……要不要甩开……算了。）"],
    "touchHand+2": ["……只、只牵一下哦。", "分析结果：你的手比我的暖。……没别的意思。"],
    touchLeg: ["哇！别戳腿，我会站不稳的！", "这里不是按钮！"],
    touchFoot: ["呀！好痒……哼，故意的吧！", "鞋子很贵的，别乱碰！"],
    touchChest: ["喂！往哪儿戳呢！", "（内心 OS：……这个人在想什么啊。）不行就是不行。", "那里禁止访问！"],
    touchChestTease: ["哼，经过深度思考，判定你是故意的。……这次先记账。"],
    touchChestMore: ["说了禁止访问！再戳就把你拉黑！"],
    touchTail: ["别、别拽尾巴！那是鲸鱼的尊严！", "尾巴很敏感的……轻一点。", "这条是鲸鱼尾巴，不是玩具哦。"],
    touchFin: ["耳、耳鳍不可以摸！", "唔……那里会痒的。"],
    // 好感度（傲娇、凡事要深度思考）
    levelUp1: ["经过深度思考，我决定……认可你了。"],
    levelUp2: ["分析结果：你是我的好朋友。这个结论很可靠哦。"],
    levelUp3: ["哼，才、才不是特别喜欢你呢……好吧，是有一点。"],
    levelUp4: ["思考了很久，答案只有一个：你对我最重要。"],
    "tap+3": ["（内心 OS：被戳了……好开心……）咳，有事吗？"],
    "tap+4": ["不用想也知道，是你来了。"],
    switchIn: ["DeepSeek 娘，前来报到！", "嗯……轮到我了。请多指教。", "思考完毕：今天由我来陪你。"],
    tap: [
      "嗯？你是想问我问题吗？",
      "让我想想……好吧，你好呀。",
      "别、别以为戳我我就会高兴！……其实有一点。",
      "（内心 OS：又来戳我了，要不要装作没注意到……）",
      "有什么难题尽管交给我，我会认真想的。",
      "我刚才在想一道很难的题。",
      "哼，才不是在等你呢。",
      "要不要我帮你把今天的事情理一理？",
      "这条是鲸鱼尾巴，不是装饰哦。",
    ],
    tapHead: ["头鳍不是按钮啦！", "女仆发带要被你弄歪了……", "唔……再这样我要生气了。"],
    pat: ["……哼，就、就允许你摸一下。", "（内心 OS：好舒服……不对，我要保持冷静。）", "这次就不跟你计较了。"],
    tooManyTaps: ["服务器繁忙，请稍后再戳。", "思考被打断了！要重新想了啦！", "哼！不理你了！", "头好晕……思考链断掉了……"],
    dragStart: ["哇！放我下来，我会晕的！", "要带我去哪里？先说清楚！"],
    dragEnd: ["……这里视野还不错。", "下次要先征得我同意哦。"],
    idle: ["你还在吗？我已经想好答案了……", "人呢？我的回答都写好了。"],
    welcomeBack: ["你回来啦！……才、才没有一直等你。", "欢迎回来。我刚好想完一个问题。"],
    chatter: [
      "（内心 OS：今天会被问到什么呢……）",
      "我在想：鲸鱼会不会做梦？",
      "多想一步，少后悔一步。",
      "不要熬夜哦。我是说你，不是我。",
      "我会把复杂的事情想清楚，再告诉你。",
      "听说大家都叫我鲸鱼娘？……还挺可爱的。",
    ],
  },
};
