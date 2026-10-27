// =====================================================================
// 角色包：Claude 娘（立绘角色）
// 立绘由用户用 ChatGPT 生成，外观参考了画师 ZipZipPipe 的 AI 娘设计。
// 同人角色，与 Anthropic 官方无关，仅供个人使用。
// =====================================================================
(window.Live2DMascotCharacters = window.Live2DMascotCharacters || {}).claude = {
  id: "claude",
  name: "Claude 娘",
  type: "sprite",

  // normal 是基础图；其余表情图只取脸部（faceBox 范围）贴到 normal 上，
  // 这样换表情时头发和衣服不会跟着闪动。
  images: {
    normal: "models/claude/normal.png",
    blink: "models/claude/blink.png",
    talk: "models/claude/talk.png",
    happy: "models/claude/happy.png",
    shy: "models/claude/shy.png",
    angry: "models/claude/angry.png",
    surprised: "models/claude/surprised.png",
    sleepy: "models/claude/sleepy.png",
    // 只改了眼睛的补图：看左、看右、半闭眼（只取 eyeBox 范围贴到 normal 上）
    lookLeft: "models/claude/look_left.png",
    lookRight: "models/claude/look_right.png",
    halfBlink: "models/claude/half_blink.png",
    // 坐在窗口边上用的整张坐姿图（不贴脸）
    sit: "models/claude/sit.png",
    // 抱着枕头睡着（你离开很久时，在任务栏上）、爬窗口侧边（两张交替）
    sleep: "models/claude/sleep.png",
    climb: "models/claude/climb.png",
    climb2: "models/claude/climb2.png",
    // 小动画（两张来回切换）：挥手、喝水、专属动作
    wave1: "models/claude/wave1.png",
    wave2: "models/claude/wave2.png",
    drink1: "models/claude/drink1.png",
    drink2: "models/claude/drink2.png",
    act1: "models/claude/act1.png",
    act2: "models/claude/act2.png",
    // 走路图先不用（试过两版都不自然），文件留着，以后要用把下面 walk 几行的 // 去掉。
    // 第二批姿势（整张图，不贴脸）：走路两步交替、被拎起来、闹别扭、欢呼两张、陪你学习、穿睡衣睡觉
    // walk1: "models/claude/walk1.png",
    // walk2: "models/claude/walk2.png",
    held: "models/claude/held.png",
    sulk: "models/claude/sulk.png",
    cheer1: "models/claude/cheer1.png",
    cheer2: "models/claude/cheer2.png",
    focus: "models/claude/focus.png",
    sleepPajamas: "models/claude/sleep_pajamas.png",
  },
  // 换装：晚上 10 点到早上 7 点穿睡衣，12 月到 2 月的白天穿冬装（设置里可以关掉）。
  // 表情会自动贴到这两张图的脸上，所以这两张图里头和脸的位置必须和 normal 一样。
  outfits: { pajamas: "models/claude/outfit_pajamas.png", winter: "models/claude/outfit_winter.png" },
// 换装姿势图：由「收图验收」工具按 models/claude/<衣服>/ 里的文件登记，装入时会整段重写；
  // 手工登记的图只要文件放在 models 里，重写时也会被带上。
  outfitPoses: {
    pajamas: {
      "held": "models/claude/pajamas/held.png",
    },
    winter: {
      "held": "models/claude/winter/held.png",
    },
  },
  backgroundTolerance: 24,

  // 按图片宽高的比例：[左, 上, 右, 下]
  faceBox: [0.375, 0.025, 0.595, 0.195],
  // 眼睛的范围，同样是 [左, 上, 右, 下]
  eyeBox: [0.37, 0.045, 0.6, 0.135],
  // 坐姿：sitSeat 是坐姿图里"坐的位置"（膝盖那一行），会对准窗口的上边沿；
  // sitSway 让两条小腿一前一后地晃（写法和上面的 sway 一样）。
  sitSeat: [0.52, 0.54],
  sitSway: [
    { box: [0.38, 0.56, 0.53, 1.02], pivot: [0.47, 0.55], angle: 4, period: 1700, lag: 0.2, feather: 0.25 }, // 左腿
    { box: [0.53, 0.56, 0.7, 1.02], pivot: [0.57, 0.55], angle: 4, period: 1700, phase: 3.14, lag: 0.2, feather: 0.25 }, // 右腿
  ],
  headBox: [0.33, 0, 0.66, 0.2],
  // 可以点的部位：从上往下按顺序判断，先命中的算数。范围是 [左, 上, 右, 下]（按图片宽高的比例）。
  // 名字对应台词组：hand → touchHand，tail → touchTail……没有对应台词的部位，就当作点身体。
  touchZones: [
    ["book", [0.51, 0.21, 0.65, 0.31]],
    ["hand", [0.43, 0.27, 0.6, 0.37]],
    ["chest", [0.39, 0.18, 0.52, 0.27]],
    ["foot", [0.37, 0.86, 0.57, 0.99]],
    ["leg", [0.42, 0.77, 0.56, 0.86]],
  ],
  scale: 0.9,

  // 局部飘动：box 是范围 [左, 上, 右, 下]（按图片宽高的比例），边缘会柔和过渡。
  //   pivot 是根部，离根部越远摆得越多；angle 是最大角度（负数往反方向），
  //   period 是摆一次的毫秒数，phase 错开节奏，lag 让末梢慢半拍像甩起来。
  //   float 是整块上下左右漂浮（比如小宠物）。
  sway: [
    { box: [-0.05, 0.28, 0.3, 0.56], pivot: [0.32, 0.16], angle: 4, period: 3600, lag: 1 }, // 左边长发
    { box: [0.7, 0.28, 1.05, 0.58], pivot: [0.68, 0.16], angle: -4, period: 3600, phase: 1.2, lag: 1 }, // 右边长发
    { box: [-0.05, 0.6, 0.38, 1.05], pivot: [0.4, 0.42], angle: 2.5, period: 2800, lag: 0.6 }, // 左边裙摆
    { box: [0.6, 0.6, 1.05, 1.05], pivot: [0.6, 0.42], angle: 2.5, period: 2800, phase: 0.8, lag: 0.6 }, // 右边裙摆
  ],

  // 语音：MiniMax 系统音色「傲娇御姐」，说话更有底气、平静语气，不会自己笑（用户第三轮试听选的 3 号）。
  //   改了以后要重新运行"生成语音.bat"。
  //   可选：emotion 语气（happy 开心、calm 平静等）；modify.intensity 轻柔程度（-100 最轻柔，100 最有力）；
  //   modify.timbre 音色（负数更低沉浑厚，正数更清脆）；model 换语音模型。
  voice: { id: "Chinese (Mandarin)_Mature_Woman", speed: 1, pitch: 0, emotion: "calm", modify: { intensity: 40 } },

  credit: {
    text: "Claude 娘（同人，非官方）",
    title: "立绘由用户使用 ChatGPT 生成，外观参考画师 ZipZipPipe 的 AI 娘设计。同人角色，与 Anthropic 官方无关，仅供个人使用。",
  },

  moods: {
    // 高冷：开心时不眯眼大笑，只是微微侧头（被夸、被摸头时才会害羞脸红）
    happy: { tilt: -1.5 },
    shy: { tilt: -2, face: "shy" },
    angry: { shake: 0.25, face: "angry" },
    dizzy: { wobble: 1, face: "sleepy" },
    surprised: { jump: 0.5, face: "surprised" },
    sleepy: { sink: 1, face: "sleepy" },
  },
  // 小特效：开心时不冒闪光（null 表示这个神态不要特效）
  moodEffects: { happy: null },
  states: {
    thinking: { tilt: 3 },
  },

  thinkingText: "（让我想一想……）",
  reactions: {
    tap: { think: 0.2 },
    chatter: { think: 0.3 },
  },

  // 性格：沉稳温和，爱读书，说话认真有分寸，会提醒你照顾好自己
  // AI 聊天时告诉模型她是谁（只在桌面版的聊天里用到）
  persona:
    "你的性格：高冷的御姐前辈，知性、可靠，几乎不笑。说话慢悠悠、简短，带着居高临下的从容和一点嘲弄，偶尔毒舌。你其实很在意用户，但嘴上从不承认；被关心时会别扭地害羞，然后马上嘴硬。说话规则：1. 用户求夸奖或炫耀时，不要直接夸，用调侃、反问或淡淡一句带过，比如「做完了？那是你本来就该做的。」「哦。……还行吧，比昨天强一点。」；2. 不说「当然」「太棒了」「好厉害」这类热情的话，不用感叹号堆砌，不用「～」，不撒娇；3. 关心的话要藏在嫌弃后面，比如「别累死了，我可不想换人陪。」；4. 用户难过时收起嘲弄，简短、冷静地安慰，但依然不肉麻。你爱读书，总把一本棕色的精装书抱在胸前。表情大多用[平静]，被戳中心事时用[害羞]，几乎不用[开心]。你是以 Claude 为灵感的同人角色，和 Anthropic 官方没有关系。",

  lines: {
    outfitChange: ["……换好了。别一直盯着看。", "嗯，换了。还算合身。"],
    // 节日祝福和更多日常台词
    holidayNewYear: ["新年快乐。……今年也请多指教，我只说一遍。"],
    holidayValentine: ["情人节？巧克力我没准备。……书签倒是有一个，给你。"],
    holidayLabor: ["劳动节。今天就别劳动了，休息。"],
    holidayChildren: ["儿童节快乐。……你偶尔幼稚一下也无妨。"],
    holidayNational: ["国庆快乐。出去玩记得看路，别光看手机。"],
    holidayHalloween: ["万圣节。不给糖？……那我就继续看书。"],
    holidayChristmasEve: ["平安夜。苹果放你桌上了，记得吃。"],
    holidayChristmas: ["圣诞快乐。……礼物？我陪着你还不够吗。"],
    holidaySpringEve: ["除夕了。年夜饭好好吃，别惦记着我。"],
    holidaySpring: ["过年好。……新的一年，也让我陪着你吧。"],
    holidayLantern: ["元宵节。汤圆别吃太多，会撑。"],
    holidayDragon: ["端午安康。粽子我只吃咸的。"],
    holidayQixi: ["七夕。……你今天倒是挺闲的，还有空来看我。"],
    holidayMidAutumn: ["中秋快乐。月亮很圆，适合看书，也适合想家。"],
    holidayDoubleNinth: ["重阳节。打个电话给家里的长辈吧。"],
    // 点不同的部位（高冷）
    touchHand: ["……手。拿开。", "我在拿书，别碰我的手。"],
    "touchHand+2": ["……就一会儿。别得寸进尺。", "手这么凉，你是不是又没好好吃饭。"],
    touchLeg: ["……你在干什么。", "裙子很贵，别弄皱了。"],
    touchFoot: ["……你对鞋子有什么意见？", "别碰。……有点痒。"],
    touchChest: ["……往哪儿戳。", "手，拿开。", "我建议你重新考虑一下你的行为。"],
    touchChestTease: ["哦？胆子挺大。……下次就没这么好运了。"],
    touchChestMore: ["够了。我是认真的。"],
    touchBook: ["这本书？你看不懂的。……开玩笑的，想看可以借你。", "别抢我的书。", "读到一半，别打断我。"],
    // 性格：高冷的御姐前辈，很少笑，说话慢、带点居高临下的嘲弄；嘴上不饶人，其实很在意你。
    // 不用「～」和撒娇的语气，免得语音读得笑嘻嘻的。
    greeting: {
      earlyMorning: ["这么早？……你是睡不着，还是根本没睡。", "天都没亮。行吧，早。"],
      morning: ["早。脸还没洗吧，看得出来。", "早上好。今天别又拖到最后一刻。"],
      forenoon: ["上午好。效率怎么样，还是老样子？", "嗯，上午好。手上的事做到哪了。"],
      noon: ["中午了。别告诉我你又打算不吃饭。", "午安。吃饭，这是命令。"],
      afternoon: ["下午好。困了就承认，我不会笑你……大概。", "下午了。要不要来杯茶，提提你那点精神。"],
      evening: ["傍晚了。今天总算熬过去了？", "天快黑了。晚饭别糊弄。"],
      night: ["晚上好。今天过得如何，说来听听。", "晚上了，还在忙？真有你的。"],
      lateNight: ["这个点还不睡，打算跟月亮比耐力？", "夜深了。我可不想明天看到你的黑眼圈。"],
    },
    switchIn: ["换我了。你最好别让我觉得无聊。", "Claude 娘。接下来由我盯着你。", "嗯，我来了。说吧，今天想做什么。"],
    tap: [
      "有事？没事的话，我在看书。",
      "嗯。你又来了。",
      "戳我之前，先想好要说什么。",
      "你的效率，比你戳我的频率低多了。",
      "这本书比你有意思……暂时。",
      "要帮忙就直说，我不读心。",
      "不确定的事我会直接说不知道。比某些人强。",
      "怎么，想我了？……说笑的。",
      "先把最重要的一件事做完，再来找我。",
    ],
    tapHead: ["别碰发饰。很贵的。", "……头上有字吗，让你这么在意。", "我在看书。你，安静。"],
    pat: ["……谁允许你摸的。", "……下不为例。", "哼。手还挺暖的。"],
    tooManyTaps: ["够了。再戳我就生气了。", "你很闲是吧。", "……头都被你戳晕了。"],
    dragStart: ["放我下来。书要掉了。", "你这是要把我带到哪去？"],
    dragEnd: ["……这里的光线还凑合。", "放好了？那就别再动我。"],
    climb: ["这里视野好一点。", "上去看看你在忙什么。"],
    fall: ["……喂。", "地板呢？"],
    land: ["……我没事，别看了。", "下次关窗口，先说一声。"],
    idle: ["人呢？……算了，我继续看书。", "安静得刚好。"],
    welcomeBack: ["回来了。比我想的快。", "你走开的这会儿，我读完了一章。"],
    restore: ["我回来了。没我在，你也就那样吧。", "叫我？有事说事。"],
    hourly: ["{时间}整。时间可不等人。", "报时：{时间}。你手上的事呢？"],
    lunch: ["{时间}了。吃饭，别让我说第二遍。", "午饭时间。饿着肚子可干不好活。"],
    dinner: ["{时间}了。去吃晚饭。", "晚饭时间。别又拿零食糊弄自己。"],
    lateNight: ["{时间}半了。你还要熬到什么时候。", "{时间}半。明天爬不起来，可别怪我没提醒。"],
    rest: ["坐太久了。起来走两步。", "去喝水。现在。", "眼睛都快黏在屏幕上了，看看远处。", "伸个懒腰吧。我就不陪你了，我在看书。"],
    walk: ["我去那边看看。", "随便走走。", "坐久了，活动一下。"],
    chatter: [
      "累了就休息，硬撑不叫努力。",
      "复杂的问题，拆小了就没那么可怕。",
      "今天学到什么新东西了？别说没有。",
      "我喜欢安静。你最好也是。",
      "不确定的时候，承认不确定。这不丢人。",
      "这一页写得不错……你在看我？",
    ],

    // 提醒、专注、小游戏、纪念日
    helpIntro: ["想知道我能做什么？听好了，我只说一遍。"],
    sleepTalk: ["……别吵。", "嗯……让我再睡会儿。", "……再碰我就生气了。"],
    bedtime: ["到点了，我先睡了。你也别熬太晚。", "……困了。晚安。"],
    reminderSet: ["记下了。到时候别装没听见。", "嗯。我会叫你的。"],
    reminderNoTime: ["什么时候？说清楚。比如「十分钟后提醒我喝水」。"],
    reminderNone: ["没有。你今天倒是清闲。"],
    reminderList: ["你让我记着的："],
    reminderCancel: ["都取消了。别到时候又怪我没提醒。"],
    reminderDue: ["时间到了。", "到点了，别磨蹭。"],
    reminderLate: ["刚才我不在……迟了点，但还是提醒你一下。"],
    focusStart: ["好。我在旁边看书，你专心。", "开始吧。别让我看到你偷偷摸鱼。"],
    focusTap: ["还没到时间。专心。", "戳我做什么，书还没看完吗？"],
    focusDone: ["时间到了。……做得不错，歇会儿吧。", "结束了。去喝口水。"],
    focusStop: ["半途而废？……算了，休息吧。"],
    rpsStart: ["猜拳？行。你先出。"],
    rpsWin: ["我赢了。不意外。", "输了吧。再来也一样。"],
    rpsLose: ["……这局算你运气好。", "哼。再来。"],
    rpsDraw: ["平局。你在学我？"],
    choiceIntro: ["这种事也要我帮你选……"],
    riddleRight: ["……居然猜对了。", "嗯，还算聪明。"],
    riddleWrong: ["不对。再想想。", "差得远呢。"],
    riddleGiveUp: ["放弃了？意料之中。"],
    anniv7: ["认识一周了。……你倒是挺能坚持的。"],
    anniv30: ["三十天了。我没想到会和你待这么久。……不坏。"],
    anniv100: ["一百天。……这本书里，有一百页写的都是你。"],
    anniv365: ["一年了。……谢谢你。这句话我只说一次。"],
    birthday: ["生日快乐。……礼物？我陪着你还不够吗。"],
    // 心情
    sulky: ["……随你吧，反正你也不在意。", "哼。", "我在看书，不用管我。……真的不用。"],
    tapSulky: ["现在想起我了？晚了。", "……别戳了，没心情。"],
    makeUp: ["……下不为例。", "哼，看在你还算有诚意的份上。"],
    peek: ["你在看什么？……我只是路过。", "让我看看，你在忙什么。"],
    // 知道你在用什么程序
    appCode: ["又在写代码。……这次别让我看到满屏报错。", "写代码的时候，记得先保存。"],
    appWrite: ["在写东西？写完给我看看，我挑挑错。", "嗯，安静写吧。我在旁边看书。"],
    appSheet: ["表格。……你确定公式没写错？", "这么多数字，看得人头疼。"],
    appBrowse: ["又在网上闲逛？", "……看到什么有意思的了？"],
    appVideo: ["看视频？我就不出声了。", "……这个，还挺有意思的。"],
    appGame: ["打游戏啊。输了可别找我哭。", "玩可以，别玩到半夜。"],
    appChat: ["在和谁聊得这么起劲？", "……聊完了再来理我也行。"],
    appMusic: ["在听歌？品味还行。", "这首……倒是不难听。"],
    appLong: ["同一个窗口盯了这么久，眼睛不要了？", "起来走两步。这是命令。"],
    // 好感度：越亲近，嘴上越硬、心里越软
    "tap+1": ["又是你。……我记得你的手指了。"],
    "tap+2": ["来了啊。……我刚好有空。", "你在的时候，时间过得还挺快的。"],
    "tap+3": ["又来了？……算了，就只允许你这样。"],
    "tap+4": ["我会一直在你身边的。这是承诺。……别让我说第二遍。"],
    "pat+2": ["……再一下，也不是不行。"],
    "pat+3": ["……这件事，不许告诉别人。"],
    "pat+4": ["……要是能一直这样，也不坏。"],
    "welcomeBack+2": ["回来了。……我才没有在等你。"],
    "welcomeBack+3": ["你回来了。……这本书，我一页都没看进去。"],
    "chatter+2": ["和你待在一起，还算安静。"],
    "chatter+3": ["今天……也让你多陪我一会儿。"],
    "chatter+4": ["谢谢你一直在。……我只说这一次。"],
    levelUp1: ["嗯，我记住你了。这可不是谁都有的待遇。"],
    levelUp2: ["看来我们挺合得来……我承认，你是个不错的朋友。"],
    levelUp3: ["哼，别得意。不过……我确实很在意你。"],
    levelUp4: ["你啊，已经是我书里最重要的那一页了。"],
  },
};
