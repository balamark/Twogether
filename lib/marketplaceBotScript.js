// Turn a marketplace-bot JSON body into the same custom_scripts row the in-app
// upload writes (routes/custom-scripts.js). The table has no columns for acts,
// named roles, intensity, or safeword notes — those are rendered into `content`
// (and a couple of tags) in the line shape the player already understands.
// See docs/MARKETPLACE_BOT_API.md.

const CATEGORIES = ['romantic', 'adventurous', 'school', 'bold'];

const GENRE_ALIASES = {
  romantic: 'romantic',
  浪漫: 'romantic',
  adventurous: 'adventurous',
  冒險: 'adventurous',
  school: 'school',
  校園: 'school',
  bold: 'bold',
  大膽: 'bold',
};

const INTENSITY_ALIASES = {
  mild: 'mild',
  light: 'mild',
  清淡: 'mild',
  1: 'mild',
  moderate: 'moderate',
  中等: 'moderate',
  2: 'moderate',
  explicit: 'explicit',
  露骨: 'explicit',
  3: 'explicit',
  intense: 'intense',
  激烈: 'intense',
  4: 'intense',
};

const INTENSITY_LABEL = {
  mild: '清淡',
  moderate: '中等',
  explicit: '露骨',
  intense: '激烈',
};

// Used only when the caller omits genre. explicit/intense land in 大膽, which
// is the marketplace's closest thing to an adult category.
const INTENSITY_CATEGORY = {
  mild: 'romantic',
  moderate: 'adventurous',
  explicit: 'bold',
  intense: 'bold',
};

const ACT_NUMERALS = [
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '二十一', '二十二', '二十三', '二十四',
];

const LIMITS = {
  title: 300,
  summary: 1500,
  name: 120,
  description: 600,
  actTitle: 120,
  narration: 6000,
  line: 3000,
  direction: 120,
  safeword: 1500,
  location: 150,
  duration: 150,
  tag: 72,
  tags: 36,
  acts: 24,
  linesPerAct: 240,
  linesTotal: 1200,
  content: 150000,
  coverUrl: 6000,
  sourceKey: 360,
};

const SOURCE_KEY_RE = new RegExp(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,${LIMITS.sourceKey - 1}}$`);

function fail(errors) {
  return {
    ok: false,
    status: 400,
    body: {
      success: false,
      message: errors[0].message,
      error_code: 'BOT_SCRIPT_INVALID',
      errors,
    },
  };
}

function flatten(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeGender(value) {
  if (value == null || value === '') return null;
  const g = String(value).trim().toLowerCase();
  if (g === 'male' || g === 'm' || g === '男') return 'male';
  if (g === 'female' || g === 'f' || g === '女') return 'female';
  return null;
}

function normalizeRoleSide(value) {
  if (typeof value !== 'string') return null;
  const side = value.trim().toLowerCase();
  if (side === 'a' || side === 'rolea') return 'a';
  if (side === 'b' || side === 'roleb') return 'b';
  return null;
}

// [男]/[女] only when the two roles are one man and one woman — that's the
// only case the player can map onto a couple's nicknames. Anything else
// (missing, same gender, unspecified) uses [partner1]/[partner2], which play
// for every couple.
function roleTokens(roleA, roleB) {
  const complementary =
    (roleA.gender === 'male' && roleB.gender === 'female')
    || (roleA.gender === 'female' && roleB.gender === 'male');
  if (!complementary) {
    return { a: '[partner1]', b: '[partner2]' };
  }
  return {
    a: roleA.gender === 'male' ? '[男]' : '[女]',
    b: roleB.gender === 'male' ? '[男]' : '[女]',
  };
}

function dialogueLine(token, line) {
  const text = flatten(line.text);
  const direction = line.direction
    ? flatten(line.direction).replace(/[()（）[\]【】]/g, '')
    : '';
  if (direction) {
    return `${token}（${direction}）：「${text}」`;
  }
  return `${token}: ${text}`;
}

function renderScriptContent(script) {
  const tokens = roleTokens(script.roleA, script.roleB);
  const lines = [];
  lines.push('【角色】');
  lines.push(`${tokens.a} ${flatten(script.roleA.name)}${script.roleA.description ? ` — ${flatten(script.roleA.description)}` : ''}`);
  lines.push(`${tokens.b} ${flatten(script.roleB.name)}${script.roleB.description ? ` — ${flatten(script.roleB.description)}` : ''}`);
  lines.push('');
  lines.push(`【尺度】18+・${INTENSITY_LABEL[script.intensity]}・雙方合意`);
  if (script.safewordNotes) {
    lines.push(`（安全詞：${flatten(script.safewordNotes)}）`);
  }
  lines.push('');
  script.acts.forEach((act, index) => {
    const numeral = ACT_NUMERALS[index] || String(index + 1);
    const title = act.title ? `　${flatten(act.title)}` : '';
    lines.push(`第${numeral}幕${title}`);
    if (act.narration && act.narration.trim()) {
      lines.push(`（旁白：${flatten(act.narration)}）`);
    }
    for (const line of act.lines) {
      const token = line.role === 'b' ? tokens.b : tokens.a;
      lines.push(dialogueLine(token, line));
    }
    lines.push('');
  });
  return `${lines.join('\n').trim()}\n`;
}

function buildTags(userTags, intensity) {
  const tags = [];
  const push = (tag) => {
    if (tag && !tags.includes(tag)) tags.push(tag);
  };
  for (const tag of userTags) push(tag);
  push('18+');
  push(`強度:${INTENSITY_LABEL[intensity]}`);
  return tags;
}

function parseCoverUrl(raw, errors) {
  if (typeof raw !== 'string') {
    errors.push({
      field: 'coverImageUrl',
      message: '封面必須是 http 或 https 網址，不能帶帳號密碼。',
    });
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > LIMITS.coverUrl) {
    errors.push({
      field: 'coverImageUrl',
      message: `封面網址太長。請換一個 ${LIMITS.coverUrl} 字以內的 http 或 https 網址。`,
    });
    return null;
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    errors.push({
      field: 'coverImageUrl',
      message: '封面必須是 http 或 https 網址，不能帶帳號密碼。',
    });
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    errors.push({
      field: 'coverImageUrl',
      message: '封面必須是 http 或 https 網址，不能帶帳號密碼。',
    });
    return null;
  }
  if (url.username || url.password) {
    errors.push({
      field: 'coverImageUrl',
      message: '封面必須是 http 或 https 網址，不能帶帳號密碼。',
    });
    return null;
  }
  return url.toString();
}

function readRole(body, key, errors) {
  const raw = body[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({
      field: key,
      message: key === 'roleA'
        ? '請提供角色 A（roleA），包含 name，以及選填的 description、gender。'
        : '請提供角色 B（roleB），包含 name，以及選填的 description、gender。',
    });
    return null;
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > LIMITS.name) {
    errors.push({
      field: `${key}.name`,
      message: key === 'roleA'
        ? `請提供角色 A 的名字（1–${LIMITS.name} 個字）。`
        : `請提供角色 B 的名字（1–${LIMITS.name} 個字）。`,
    });
  }
  let description = '';
  if (raw.description != null && raw.description !== '') {
    if (typeof raw.description !== 'string') {
      errors.push({
        field: `${key}.description`,
        message: `角色描述必須是文字，而且不能超過 ${LIMITS.description} 個字。`,
      });
    } else {
      description = raw.description.trim();
      if (description.length > LIMITS.description) {
        errors.push({
          field: `${key}.description`,
          message: `角色描述不能超過 ${LIMITS.description} 個字，請縮短後再送。`,
        });
      }
    }
  }
  return {
    name,
    description,
    gender: normalizeGender(raw.gender),
  };
}

function readActs(raw, errors) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > LIMITS.acts) {
    errors.push({
      field: 'acts',
      message: `請提供 acts 陣列（1–${LIMITS.acts} 幕）。每一幕要有 narration 或 lines。`,
    });
    return [];
  }
  const acts = [];
  raw.forEach((act, index) => {
    const n = index + 1;
    if (!act || typeof act !== 'object' || Array.isArray(act)) {
      errors.push({
        field: `acts[${index}]`,
        message: `第 ${n} 幕必須是物件，包含選填的 title、narration，以及 lines 陣列。`,
      });
      return;
    }
    let title = '';
    if (act.title != null && act.title !== '') {
      if (typeof act.title !== 'string') {
        errors.push({
          field: `acts[${index}].title`,
          message: `第 ${n} 幕的標題不能超過 ${LIMITS.actTitle} 個字。`,
        });
      } else {
        title = act.title.trim();
        if (title.length > LIMITS.actTitle) {
          errors.push({
            field: `acts[${index}].title`,
            message: `第 ${n} 幕的標題不能超過 ${LIMITS.actTitle} 個字。`,
          });
        }
      }
    }
    let narration = '';
    if (act.narration != null && act.narration !== '') {
      if (typeof act.narration !== 'string') {
        errors.push({
          field: `acts[${index}].narration`,
          message: `第 ${n} 幕的旁白不能超過 ${LIMITS.narration} 個字，請縮短 narration。`,
        });
      } else {
        narration = act.narration.trim();
        if (narration.length > LIMITS.narration) {
          errors.push({
            field: `acts[${index}].narration`,
            message: `第 ${n} 幕的旁白不能超過 ${LIMITS.narration} 個字，請縮短 narration。`,
          });
        }
      }
    }
    if (act.lines != null && !Array.isArray(act.lines)) {
      errors.push({
        field: `acts[${index}].lines`,
        message: `第 ${n} 幕的 lines 必須是陣列。`,
      });
      return;
    }
    const lines = [];
    const rawLines = Array.isArray(act.lines) ? act.lines : [];
    if (rawLines.length > LIMITS.linesPerAct) {
      errors.push({
        field: `acts[${index}].lines`,
        message: `第 ${n} 幕有 ${rawLines.length} 句對白，每一幕最多 ${LIMITS.linesPerAct} 句。請拆開或刪減。`,
      });
    }
    rawLines.forEach((line, lineIndex) => {
      const ln = lineIndex + 1;
      if (!line || typeof line !== 'object' || Array.isArray(line)) {
        errors.push({
          field: `acts[${index}].lines[${lineIndex}]`,
          message: `第 ${n} 幕第 ${ln} 句的 role 只能是 a 或 b。`,
        });
        return;
      }
      const role = normalizeRoleSide(line.role);
      if (!role) {
        errors.push({
          field: `acts[${index}].lines[${lineIndex}].role`,
          message: `第 ${n} 幕第 ${ln} 句的 role 只能是 a 或 b。`,
        });
      }
      const text = typeof line.text === 'string' ? line.text.trim() : '';
      if (!text || text.length > LIMITS.line) {
        errors.push({
          field: `acts[${index}].lines[${lineIndex}].text`,
          message: `第 ${n} 幕第 ${ln} 句的對白是空的，或超過 ${LIMITS.line} 個字。請寫上一句對白，並控制在 ${LIMITS.line} 字以內。`,
        });
      }
      let direction = '';
      if (line.direction != null && line.direction !== '') {
        if (typeof line.direction !== 'string' || line.direction.trim().length > LIMITS.direction) {
          errors.push({
            field: `acts[${index}].lines[${lineIndex}].direction`,
            message: `第 ${n} 幕第 ${ln} 句的 direction 不能超過 ${LIMITS.direction} 個字。`,
          });
        } else {
          direction = line.direction.trim();
        }
      }
      if (role && text && text.length <= LIMITS.line) {
        lines.push({ role, text, direction });
      }
    });
    if (!narration && lines.length === 0) {
      errors.push({
        field: `acts[${index}]`,
        message: `第 ${n} 幕需要旁白（narration）或至少一句對白（lines）。`,
      });
    }
    acts.push({ title, narration, lines });
  });
  return acts;
}

function validateBotScript(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail([{
      field: 'body',
      message: '請提供 JSON 物件，包含 title、summary、roleA、roleB、acts、intensity。',
    }]);
  }

  const errors = [];

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > LIMITS.title) {
    errors.push({ field: 'title', message: `標題必須是 1–${LIMITS.title} 個字。` });
  }

  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  if (!summary || summary.length > LIMITS.summary) {
    errors.push({
      field: 'summary',
      message: `簡介必須是 1–${LIMITS.summary} 個字，它會顯示在市集卡片上。`,
    });
  }

  let intensity = null;
  if (body.intensity == null || body.intensity === '') {
    errors.push({
      field: 'intensity',
      message: '請提供尺度 intensity：mild、moderate、explicit 或 intense。',
    });
  } else {
    intensity = INTENSITY_ALIASES[String(body.intensity).trim().toLowerCase()]
      || INTENSITY_ALIASES[String(body.intensity).trim()]
      || null;
    if (!intensity) {
      errors.push({
        field: 'intensity',
        message: 'intensity 只能是 mild、moderate、explicit 或 intense。',
      });
    }
  }

  let genre = null;
  if (body.genre != null && body.genre !== '') {
    const rawGenre = String(body.genre).trim();
    genre = GENRE_ALIASES[rawGenre] || GENRE_ALIASES[rawGenre.toLowerCase()] || null;
    if (!genre || !CATEGORIES.includes(genre)) {
      errors.push({
        field: 'genre',
        message: 'genre 只能是 romantic、adventurous、school、bold（或 浪漫、冒險、校園、大膽）。',
      });
    }
  }

  const roleA = readRole(body, 'roleA', errors);
  const roleB = readRole(body, 'roleB', errors);
  const acts = readActs(body.acts, errors);

  let userTags = [];
  if (body.tags != null) {
    if (!Array.isArray(body.tags)) {
      errors.push({
        field: 'tags',
        message: `tags 最多 ${LIMITS.tags} 個，每個不超過 ${LIMITS.tag} 個字。`,
      });
    } else if (body.tags.length > LIMITS.tags) {
      errors.push({
        field: 'tags',
        message: `tags 最多 ${LIMITS.tags} 個，每個不超過 ${LIMITS.tag} 個字。`,
      });
    } else {
      for (const tag of body.tags) {
        if (typeof tag !== 'string') {
          errors.push({
            field: 'tags',
            message: `tags 最多 ${LIMITS.tags} 個，每個不超過 ${LIMITS.tag} 個字。`,
          });
          break;
        }
        const trimmed = tag.trim();
        if (!trimmed || trimmed.length > LIMITS.tag || /[\r\n]/.test(tag)) {
          errors.push({
            field: 'tags',
            message: `tags 最多 ${LIMITS.tags} 個，每個不超過 ${LIMITS.tag} 個字。`,
          });
          break;
        }
        if (!userTags.includes(trimmed)) userTags.push(trimmed);
      }
    }
  }

  let location = null;
  if (body.location != null && body.location !== '') {
    if (typeof body.location !== 'string' || body.location.trim().length > LIMITS.location) {
      errors.push({ field: 'location', message: `location 不能超過 ${LIMITS.location} 個字。` });
    } else {
      location = body.location.trim();
    }
  }

  let duration = '15-30分鐘';
  if (body.duration != null && body.duration !== '') {
    if (typeof body.duration !== 'string' || body.duration.trim().length > LIMITS.duration) {
      errors.push({ field: 'duration', message: `duration 不能超過 ${LIMITS.duration} 個字。` });
    } else if (body.duration.trim()) {
      duration = body.duration.trim();
    }
  }

  let safewordNotes = '';
  if (body.safewordNotes != null && body.safewordNotes !== '') {
    if (typeof body.safewordNotes !== 'string' || body.safewordNotes.trim().length > LIMITS.safeword) {
      errors.push({
        field: 'safewordNotes',
        message: `safewordNotes 不能超過 ${LIMITS.safeword} 個字。`,
      });
    } else {
      safewordNotes = body.safewordNotes.trim();
    }
  }

  let publish = true;
  if (body.publish !== undefined) {
    if (typeof body.publish !== 'boolean') {
      errors.push({ field: 'publish', message: 'publish 必須是 true 或 false。' });
    } else {
      publish = body.publish;
    }
  }

  let sourceKey = null;
  if (body.sourceKey != null && body.sourceKey !== '') {
    if (typeof body.sourceKey !== 'string' || !SOURCE_KEY_RE.test(body.sourceKey.trim())) {
      errors.push({
        field: 'sourceKey',
        message: `sourceKey 只能用英數、點、底線、冒號和連字號，最長 ${LIMITS.sourceKey} 字（例如 2026-11-23-JUR-925）。`,
      });
    } else {
      sourceKey = body.sourceKey.trim();
    }
  }

  const coverProvided = Object.prototype.hasOwnProperty.call(body, 'coverImageUrl');
  let thumbnailUrl = null;
  if (coverProvided && body.coverImageUrl != null && body.coverImageUrl !== '') {
    thumbnailUrl = parseCoverUrl(body.coverImageUrl, errors);
  }

  if (errors.length > 0) return fail(errors);

  const lineCount = acts.reduce((sum, act) => sum + act.lines.length, 0);
  if (lineCount < 2) {
    return fail([{
      field: 'acts',
      message: '請至少寫兩句對白，這樣兩人才能一問一答。',
    }]);
  }
  if (lineCount > LIMITS.linesTotal) {
    return fail([{
      field: 'acts',
      message: `對白共有 ${lineCount} 句，超過 ${LIMITS.linesTotal} 句上限。請刪減後再送。`,
    }]);
  }

  const normalized = {
    sourceKey,
    publish,
    title,
    summary,
    intensity,
    category: genre || INTENSITY_CATEGORY[intensity],
    roleA,
    roleB,
    acts,
    location,
    duration,
    safewordNotes,
    userTags,
    coverProvided,
    thumbnailUrl,
  };
  const content = renderScriptContent(normalized);
  if (content.length > LIMITS.content) {
    return fail([{
      field: 'acts',
      message: `整份劇本有 ${content.length} 個字，超過 ${LIMITS.content} 字上限。請縮短旁白或對白後再送。`,
    }]);
  }

  return {
    ok: true,
    value: {
      ...normalized,
      scenario: summary,
      content,
      tags: buildTags(userTags, intensity),
    },
  };
}

// True when a re-upload would write the same marketplace row. Tags are compared
// in stored order; buildTags is stable for the same input.
function storedTags(existing) {
  if (Array.isArray(existing.tags)) return existing.tags;
  if (typeof existing.tags === 'string') {
    try {
      const parsed = JSON.parse(existing.tags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function scriptUnchanged(existing, next, thumbnailUrl) {
  const existingTags = storedTags(existing);
  return existing.title === next.title
    && existing.category === next.category
    && existing.scenario === next.scenario
    && (existing.location || null) === (next.location || null)
    && existing.content === next.content
    && existing.duration === next.duration
    && existing.is_public === next.publish
    && (existing.thumbnail_url || null) === (thumbnailUrl || null)
    && JSON.stringify(existingTags) === JSON.stringify(next.tags);
}

function successMessage({ created, updated, publish }) {
  if (!created && !updated) {
    return '這份劇本和已儲存的內容一樣，沒有另外建立一則。';
  }
  if (created && publish) return '劇本已發布到創作市集';
  if (created && !publish) {
    return '劇本已存成草稿，創作市集還看不到。用同一組 sourceKey 再送一次，並把 publish 設為 true，就會上架。';
  }
  if (updated && publish) return '劇本已更新並發布到創作市集';
  return '劇本已更新為草稿，創作市集目前看不到。要上架請用同一組 sourceKey 再送一次並把 publish 設為 true。';
}

function publicMarketUrl(id) {
  const base = (process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'https://twogether.fun')
    .replace(/\/$/, '');
  return `${base}/?market=${encodeURIComponent(id)}`;
}

// Official account. An upload with no usable author env var is stored as this user.
const DEFAULT_BOT_AUTHOR_EMAIL = 'wangmark510@gmail.com';
const AUTHOR_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHOR_PLACEHOLDERS = new Set(['null', 'undefined', 'none', 'nil']);

function authorEnvIsBlank(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return true;
  if (text.includes('$')) return true;
  return AUTHOR_PLACEHOLDERS.has(text.toLowerCase());
}

// A real users.id wins. Anything else (unset, blank, the string "null" App
// Engine stores for an empty app.yaml value, or an unsubstituted
// $_MARKETPLACE_BOT_AUTHOR_ID) is ignored so the email lookup can run.
function botAuthorRef(idRaw, emailRaw) {
  const id = String(idRaw == null ? '' : idRaw).trim();
  if (!authorEnvIsBlank(id) && AUTHOR_UUID_RE.test(id)) {
    return { id, email: null };
  }
  const email = String(emailRaw == null ? '' : emailRaw).trim().toLowerCase();
  return {
    id: null,
    email: !authorEnvIsBlank(email) && email.includes('@') ? email : DEFAULT_BOT_AUTHOR_EMAIL,
  };
}

module.exports = {
  CATEGORIES,
  INTENSITY_LABEL,
  LIMITS,
  validateBotScript,
  renderScriptContent,
  buildTags,
  roleTokens,
  scriptUnchanged,
  successMessage,
  publicMarketUrl,
  DEFAULT_BOT_AUTHOR_EMAIL,
  botAuthorRef,
};
