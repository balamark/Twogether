// 語音輸入：speech-to-text for the 🎤 button next to the app's text boxes.
//
// The browser records a short clip (≤ MAX_CLIP_MS), the server forwards it to
// OpenAI's transcription API and hands back plain text that the user edits
// before sending. The audio is never written to disk or stored, and the
// transcript is never logged — only duration / size / cost (voice_usage).
//
// Why a server-side STT instead of the browser's Web Speech API: users mix
// 繁中 and English mid-sentence, and Web Speech only takes one language per
// session (and is missing in LINE's in-app browser). gpt-4o-mini-transcribe
// detects the language itself and handles code-switching.
//
// Without OPENAI_API_KEY: dev/test get a fixed demo transcript so the flow can
// be exercised end-to-end; production answers VOICE_UNAVAILABLE.

const OpenCC = require('opencc-js');
const { logInfo, logWarn } = require('./logger');

const API_URL = process.env.OPENAI_TRANSCRIBE_URL || 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const TIMEOUT_MS = Number(process.env.OPENAI_TRANSCRIBE_TIMEOUT_MS || 45000);

// List prices (USD) for cost accounting only — never used to bill users.
// Overridable so a price change doesn't need a deploy.
const PRICE = {
  audioInPerMTok: Number(process.env.TRANSCRIBE_AUDIO_USD_PER_MTOK || 3),
  textInPerMTok: Number(process.env.TRANSCRIBE_TEXT_IN_USD_PER_MTOK || 1.25),
  textOutPerMTok: Number(process.env.TRANSCRIBE_TEXT_OUT_USD_PER_MTOK || 5),
  // Fallback when the response has no token usage (e.g. whisper-1 → seconds).
  perMinute: Number(process.env.TRANSCRIBE_USD_PER_MIN || 0.003),
};

const MAX_CLIP_MS = 60_000;
// 60s of opus/AAC at the bitrate we ask the recorder for is ~200–500KB; this
// leaves room for browsers that ignore audioBitsPerSecond, and rejects anything
// that can't be a ≤60s voice clip.
const MAX_BYTES = 2 * 1024 * 1024;

// Prompting in the target script biases the model toward 繁體 and toward
// keeping English words as spoken instead of translating them.
const PROMPT =
  '以下是台灣使用者對伴侶說的話，請用繁體中文（台灣用語）逐字轉寫，加上標點。' +
  '句子中夾雜的英文單字或句子請保留英文原文，不要翻譯。' +
  'The speaker may mix Traditional Chinese (Taiwan) and English; keep each language as spoken.';

// Safety net: the model occasionally answers in 簡體 anyway. cn→tw only swaps
// characters (no phrase rewriting), so text that's already 繁體 passes through.
const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

const EXT_BY_MIME = [
  [/webm/, 'webm'],
  [/ogg/, 'ogg'],
  [/mp4|m4a|aac/, 'm4a'],
  [/mpeg|mp3/, 'mp3'],
  [/wav/, 'wav'],
];
const extFor = (mime) => (EXT_BY_MIME.find(([re]) => re.test(mime || '')) || [null, 'webm'])[1];

const isAudioMime = (mime) => /^(audio|video)\//.test(mime || '');

function isConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

function isAvailable() {
  return isConfigured() || process.env.NODE_ENV !== 'production';
}

function estimateCostUSD(usage, audioMs) {
  if (usage && usage.type === 'tokens') {
    const details = usage.input_token_details || {};
    const audioIn = details.audio_tokens ?? usage.input_tokens ?? 0;
    const textIn = details.text_tokens ?? 0;
    const out = usage.output_tokens ?? 0;
    return (audioIn * PRICE.audioInPerMTok + textIn * PRICE.textInPerMTok + out * PRICE.textOutPerMTok) / 1e6;
  }
  const seconds = usage && usage.type === 'duration' ? usage.seconds : audioMs / 1000;
  return (seconds / 60) * PRICE.perMinute;
}

// Rough script mix of the transcript, for logs only (the text itself is never
// logged) — lets Cloud Logging show how often people mix 中文 and English.
function scriptMix(text) {
  const cjk = /[㐀-鿿]/.test(text);
  const latin = /[A-Za-z]{2,}/.test(text);
  return cjk && latin ? 'mixed' : cjk ? 'zh' : latin ? 'latin' : text ? 'other' : 'empty';
}

/**
 * Transcribe one clip.
 * @returns {Promise<{ text: string, meta: { provider, model, latencyMs, costUsd, mix } }>}
 * Throws an Error with .code = 'VOICE_UNAVAILABLE' | 'VOICE_PROVIDER_ERROR'.
 */
async function transcribe({ buffer, mimetype, audioMs }) {
  const started = Date.now();
  if (!isConfigured()) {
    if (!isAvailable()) {
      const err = new Error('OPENAI_API_KEY is not set');
      err.code = 'VOICE_UNAVAILABLE';
      throw err;
    }
    const text = '（測試模式）這是語音轉文字的示範結果，mixed with English。';
    return { text, meta: { provider: 'mock', model: 'mock', latencyMs: 0, costUsd: 0, mix: scriptMix(text) } };
  }

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimetype }), `clip.${extFor(mimetype)}`);
  form.append('model', MODEL);
  form.append('response_format', 'json');
  form.append('prompt', PROMPT);
  // No `language`: leaving it unset is what lets the model follow a speaker who
  // switches between 中文 and English mid-sentence.

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const err = new Error(`transcription request failed: ${e.name === 'TimeoutError' ? 'timeout' : e.message}`);
    err.code = 'VOICE_PROVIDER_ERROR';
    throw err;
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* non-JSON */ }
    logWarn('voice.provider_error', { status: res.status, model: MODEL, detail: detail.slice(0, 300) });
    const err = new Error(`transcription failed with ${res.status}`);
    err.code = 'VOICE_PROVIDER_ERROR';
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const text = toTraditional(String(body.text || '').trim());
  const meta = {
    provider: 'openai',
    model: MODEL,
    latencyMs: Date.now() - started,
    costUsd: estimateCostUSD(body.usage, audioMs),
    mix: scriptMix(text),
  };
  logInfo('voice.transcribed', { model: MODEL, audioMs, latencyMs: meta.latencyMs, costUsd: meta.costUsd, chars: text.length, mix: meta.mix });
  return { text, meta };
}

module.exports = {
  transcribe,
  isAvailable,
  isAudioMime,
  MAX_CLIP_MS,
  MAX_BYTES,
  _internals: { estimateCostUSD, scriptMix, extFor, toTraditional },
};
