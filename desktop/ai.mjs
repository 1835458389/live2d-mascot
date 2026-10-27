// Talking to MiniMax for the chat feature. Runs in the main process only, so
// the key in voice/配置.json never reaches the page.
//   chat({ system, messages })  -> { text }        one reply from the chat model
//   speak({ text, voice })      -> { audio, ms }    the reply read aloud (mp3, base64)
// Errors come back as { error: "中文说明" } so she can say what went wrong.
import fs from "node:fs";
import path from "node:path";

const CHAT_MODEL = "MiniMax-M3.1-Flash-Preview";

function readConfig(root) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(root, "voice", "配置.json"), "utf8"));
    if (!c.apiKey) return null;
    return { ...c, host: String(c.host || "https://api.minimax.cn").trim().replace(/\/+$/, "").replace(/\/v1\/t2a_v2$/, "") };
  } catch {
    return null;
  }
}

async function post(url, headers, body, ms = 40000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

const NO_KEY = { error: "还没有填写 MiniMax 密钥（voice/配置.json）" };

function explain(err) {
  if (err && err.name === "AbortError") return { error: "网络太慢，等不到回复" };
  const cause = err && (err.cause ? err.cause.code || err.cause.message : err.message);
  return { error: "连不上网络" + (cause ? "：" + String(cause).slice(0, 60) : "") };
}

export function createAI(root) {
  return {
    async chat({ system, messages }) {
      const config = readConfig(root);
      if (!config) return NO_KEY;
      // The model wants turns to alternate and to start with the user; lines she
      // said on her own can break that, so merge neighbours and drop a leading reply.
      const clean = [];
      for (const m of (Array.isArray(messages) ? messages : []).slice(-24)) {
        if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
        const content = m.content.slice(0, 1000);
        const last = clean[clean.length - 1];
        if (last && last.role === m.role) last.content += "\n" + content;
        else if (clean.length || m.role === "user") clean.push({ role: m.role, content });
      }
      if (!clean.length || clean[clean.length - 1].role !== "user") return { error: "没有收到你的话" };
      try {
        const { status, json } = await post(
          config.host + "/anthropic/v1/messages",
          { "x-api-key": config.apiKey, Authorization: "Bearer " + config.apiKey, "anthropic-version": "2023-06-01" },
          { model: config.chatModel || CHAT_MODEL, max_tokens: 600, system: String(system || "").slice(0, 4000), messages: clean },
        );
        const text = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
        if (status === 200 && text) return { text };
        const msg = (json.error && json.error.message) || (json.base_resp && json.base_resp.status_msg) || "HTTP " + status;
        if (/quota|limit|额度|上限|2056/i.test(msg)) return { error: "MiniMax 套餐这一轮的额度用完了" };
        if (status === 401 || /auth|key|1004/i.test(msg)) return { error: "MiniMax 密钥不对" };
        return { error: "MiniMax 出错了：" + String(msg).slice(0, 60) };
      } catch (err) {
        return explain(err);
      }
    },

    async speak({ text, voice }) {
      const config = readConfig(root);
      if (!config) return NO_KEY;
      if (!voice || !voice.id || !text) return { error: "没有声音设置" };
      try {
        const { json } = await post(config.host + "/v1/t2a_v2", { Authorization: "Bearer " + config.apiKey }, {
          model: voice.model || config.model || "speech-2.8-hd",
          text: String(text).slice(0, 300),
          stream: false,
          output_format: "hex",
          language_boost: "Chinese",
          voice_setting: {
            voice_id: voice.id,
            speed: voice.speed ?? 1,
            vol: 1,
            pitch: voice.pitch ?? 0,
            ...(voice.emotion ? { emotion: voice.emotion } : {}),
          },
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
          ...(voice.modify ? { voice_modify: voice.modify } : {}),
        });
        const code = json.base_resp ? json.base_resp.status_code : -1;
        if (code === 0 && json.data && json.data.audio) {
          return { audio: Buffer.from(json.data.audio, "hex").toString("base64"), ms: (json.extra_info && json.extra_info.audio_length) || 0 };
        }
        if (code === 2056) return { error: "MiniMax 套餐这一轮的额度用完了" };
        return { error: "语音生成失败（" + code + "）" };
      } catch (err) {
        return explain(err);
      }
    },
  };
}
