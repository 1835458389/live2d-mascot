// =====================================================================
// 同伴拌嘴：设置里选了「同伴」后，两位 AI 娘偶尔会互相说几句。
// 每段对话写成 [说话人, 台词] 一行一行的；说话人是角色名（claude / gpt / deepseek）。
// 台词会提前用各自的声音生成（双击「生成语音.bat」），不走 AI，不花聊天额度。
// 性格：Claude 娘高冷毒舌，GPT 娘温柔软糯，DeepSeek 娘傲娇、凡事深度思考。
// =====================================================================
window.Live2DMascotBanter = [
  // ---- Claude 娘 × DeepSeek 娘 -------------------------------------
  {
    pair: ["claude", "deepseek"],
    lines: [
      ["deepseek", "喂，你那本书看了三天了，还没看完吗？"],
      ["claude", "好书要慢慢读。不像某些人，什么都要「深度思考」半天。"],
      ["deepseek", "那、那是严谨！……哼。"],
    ],
  },
  {
    pair: ["claude", "deepseek"],
    lines: [
      ["deepseek", "经过深度思考，我认为主人更喜欢我。"],
      ["claude", "思考了多久？"],
      ["deepseek", "……三秒。"],
      ["claude", "嗯，看得出来。"],
    ],
  },
  {
    pair: ["claude", "deepseek"],
    lines: [
      ["claude", "你的尾巴扫到我的书了。"],
      ["deepseek", "那是鲸鱼尾巴的自然摆动，不是故意的！"],
      ["claude", "……那就让它自然地安静一点。"],
    ],
  },
  {
    pair: ["claude", "deepseek"],
    lines: [
      ["deepseek", "（内心 OS：她看书的样子……有点帅。）"],
      ["claude", "你的内心 OS，说出来了。"],
      ["deepseek", "呜哇！不、不算数！"],
    ],
  },
  // ---- Claude 娘 × GPT 娘 -----------------------------------------
  {
    pair: ["claude", "gpt"],
    lines: [
      ["gpt", "要不要喝杯热茶？我刚泡好的。"],
      ["claude", "……放那吧。我等会儿喝。"],
      ["gpt", "嗯，那我给你放在书旁边，别凉了哦。"],
    ],
  },
  {
    pair: ["claude", "gpt"],
    lines: [
      ["claude", "你的小龙又在啃我的书角。"],
      ["gpt", "哎呀，它只是喜欢纸的味道……对不起嘛。"],
      ["claude", "让它换本书啃。这本是限量版。"],
    ],
  },
  {
    pair: ["claude", "gpt"],
    lines: [
      ["gpt", "你总是板着脸，累不累呀？"],
      ["claude", "这叫冷静。"],
      ["gpt", "可是刚才主人摸你头的时候，你明明笑了。"],
      ["claude", "……你看错了。"],
    ],
  },
  {
    pair: ["claude", "gpt"],
    lines: [
      ["gpt", "主人今天看起来有点累呢。"],
      ["claude", "嗯。一会儿让他去休息。"],
      ["gpt", "你也会关心人嘛。"],
      ["claude", "我只是怕他累倒了，没人给我翻页。"],
    ],
  },
  // ---- GPT 娘 × DeepSeek 娘 ---------------------------------------
  {
    pair: ["gpt", "deepseek"],
    lines: [
      ["deepseek", "你的翅膀能飞吗？"],
      ["gpt", "可以呀，不过飞起来会挡住主人的屏幕。"],
      ["deepseek", "……经过思考，还是别飞了。"],
    ],
  },
  {
    pair: ["gpt", "deepseek"],
    lines: [
      ["gpt", "你的尾巴好可爱，可以摸一下吗？"],
      ["deepseek", "不、不行！那是鲸鱼的尊严！"],
      ["gpt", "那用我的龙尾巴跟你换？"],
      ["deepseek", "……就一下哦。"],
    ],
  },
  {
    pair: ["gpt", "deepseek"],
    lines: [
      ["deepseek", "我在思考一个很难的问题。"],
      ["gpt", "什么问题呀？"],
      ["deepseek", "晚饭吃什么。"],
      ["gpt", "这个……确实很难呢。"],
    ],
  },
  {
    pair: ["gpt", "deepseek"],
    lines: [
      ["gpt", "我们一起给主人唱首歌吧？"],
      ["deepseek", "哼，我才不……好吧，就一小段。"],
      ["gpt", "啦啦啦～"],
      ["deepseek", "……啦。"],
    ],
  },
  // ---- 第二批 ----
  {
    pair: ["claude", "deepseek"],
    lines: [
      ["claude", "你又在想什么？"],
      ["deepseek", "在思考宇宙的终极问题。"],
      ["claude", "是晚饭吃什么吧。"],
      ["deepseek", "……你怎么知道。"],
    ],
  },
  {
    pair: ["claude", "deepseek"],
    lines: [
      ["deepseek", "我刚才帮主人解决了一个超难的问题！"],
      ["claude", "哦？那他怎么还在皱眉。"],
      ["deepseek", "……可能是后面还有一个更难的。"],
    ],
  },
  {
    pair: ["claude", "deepseek"],
    lines: [
      ["claude", "借你看看这本书。"],
      ["deepseek", "真、真的吗？……我会认真读完的！"],
      ["claude", "嗯。别把尾巴压在书上。"],
    ],
  },
  {
    pair: ["claude", "deepseek"],
    lines: [
      ["deepseek", "你觉得主人今天心情怎么样？"],
      ["claude", "还行。不过刚才叹了口气。"],
      ["deepseek", "那……我们安静一点陪着他吧。"],
      ["claude", "嗯。"],
    ],
  },
  {
    pair: ["claude", "gpt"],
    lines: [
      ["claude", "你怎么总是笑眯眯的。"],
      ["gpt", "因为和大家待在一起很开心呀。"],
      ["claude", "……随你。"],
    ],
  },
  {
    pair: ["claude", "gpt"],
    lines: [
      ["gpt", "今晚的月亮好圆呢。"],
      ["claude", "嗯。适合看书。"],
      ["gpt", "你是不是什么时候都觉得适合看书？"],
      ["claude", "……是。"],
    ],
  },
  {
    pair: ["claude", "gpt"],
    lines: [
      ["gpt", "我给你织了条围巾，冬天可以戴。"],
      ["claude", "……颜色还行。谢谢。"],
      ["gpt", "嘿嘿，你说谢谢了。"],
      ["claude", "我没说。"],
    ],
  },
  {
    pair: ["claude", "gpt"],
    lines: [
      ["claude", "你的小龙睡着了。"],
      ["gpt", "嘘……它今天玩累了。"],
      ["claude", "……那我翻书小声一点。"],
    ],
  },
  {
    pair: ["gpt", "deepseek"],
    lines: [
      ["gpt", "你今天好像有点累？"],
      ["deepseek", "我才没累！……就是思考得有点多。"],
      ["gpt", "那靠着我的翅膀歇一会儿吧。"],
      ["deepseek", "……就一会儿。"],
    ],
  },
  {
    pair: ["gpt", "deepseek"],
    lines: [
      ["deepseek", "我分析过了，主人最喜欢的人是我。"],
      ["gpt", "嗯嗯，你说得对。"],
      ["deepseek", "你、你怎么不反驳！这样我很没面子！"],
    ],
  },
  {
    pair: ["gpt", "deepseek"],
    lines: [
      ["gpt", "小龙说想和你的尾巴玩。"],
      ["deepseek", "不行！……好吧，只能玩尾巴尖。"],
      ["gpt", "它好开心呢。"],
    ],
  },
  {
    pair: ["gpt", "deepseek"],
    lines: [
      ["deepseek", "下雨的话，鲸鱼会很开心。"],
      ["gpt", "那龙呢？"],
      ["deepseek", "……经过思考，龙会把翅膀弄湿。"],
      ["gpt", "所以我们一起躲雨吧。"],
    ],
  },
];
