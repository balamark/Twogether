import React, { useState } from 'react';
import {
  Calendar,
  MessageCircle,
  MessageSquareHeart,
  Play,
  StickyNote,
  Heart,
  X,
  Pencil,
  TrendingUp,
  Sparkles,
  HeartHandshake,
  type LucideIcon,
} from 'lucide-react';

interface PreviewScript {
  id: string;
  title: string;
  scenario: string;
  image?: string;
  script: string;
  duration?: string;
}

interface LoggedOutPreviewProps {
  /** Current nav view id (record | conflict | events | roleplay | wall). */
  view: string;
  /** Opens the auth modal. */
  onSignUp: () => void;
  /** Default (public) roleplay scripts, shown read-only on the roleplay tab. */
  scripts?: PreviewScript[];
}

interface PreviewConfig {
  icon: LucideIcon;
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  /** Read-only sample visual that hints at what the feature looks like. */
  sample: React.ReactNode;
}

// A small read-only "範例" chip used across samples so visitors clearly
// understand these are illustrations, not their own data.
const SampleTag: React.FC = () => (
  <span className="font-body text-[10px] font-medium uppercase tracking-[0.16em] text-petal-muted border border-petal-rule rounded-full px-2 py-0.5">
    範例
  </span>
);

const SampleCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-petal-cream border border-petal-rule rounded-md px-4 py-3 text-left shadow-petal/40">
    {children}
  </div>
);

// A read-only month calendar mockup for the 記錄時光 preview — closer to what a
// real signed-in user sees than a plain list. Static "範例" data.
const MARKED: Record<number, string> = {
  3: 'sage', // 心情
  9: 'rose', // 生理期
  10: 'rose',
  14: 'pink', // 親密時光
  18: 'sage',
  21: 'pink',
  26: 'rose',
};
const DOT_CLS: Record<string, string> = {
  pink: 'bg-pink-500',
  rose: 'bg-petal-rose-deep',
  sage: 'bg-petal-sage-deep',
};

const CalendarMock: React.FC = () => {
  // June-like month: starts on Wednesday (3 leading blanks), 30 days.
  const leading = 3;
  const days = 30;
  const cells: (number | null)[] = [
    ...Array(leading).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-petal-cream border border-petal-rule rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-display italic text-base text-petal-ink">六月</span>
        <SampleTag />
      </div>
      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
          <div key={d} className="font-body text-[10px] text-petal-muted">
            {d}
          </div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className="flex flex-col items-center justify-start h-8">
            {day !== null && (
              <>
                <span className="font-body text-xs text-petal-ink leading-none">{day}</span>
                {MARKED[day] && (
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full ${DOT_CLS[MARKED[day]]}`} />
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-petal-rule">
        <span className="flex items-center gap-1 font-body text-[11px] text-petal-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-pink-500" /> 親密時光
        </span>
        <span className="flex items-center gap-1 font-body text-[11px] text-petal-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-petal-rose-deep" /> 生理期
        </span>
        <span className="flex items-center gap-1 font-body text-[11px] text-petal-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-petal-sage-deep" /> 心情
        </span>
      </div>
    </div>
  );
};

// The 衝突事件 "repair flywheel" — the heart of the product. Four connected
// steps, escalating to an AI / human counselor when the couple gets stuck.
const FLYWHEEL: { icon: LucideIcon; step: string; title: string; desc: string }[] = [
  { icon: Pencil, step: '1', title: '記錄衝突', desc: '把這次的經過與委屈寫下來，當下不必急著送出。' },
  { icon: TrendingUp, step: '2', title: '分析走勢', desc: '看見過往衝突大多來自哪些原因，掌握你們的相處模式。' },
  { icon: Sparkles, step: '3', title: '學習開口', desc: 'AI 幫你把話說得更中性、更容易和好。' },
  { icon: HeartHandshake, step: '4', title: '請諮商師協助', desc: '真的卡住了，AI 諮商師陪你聊，或預約真人諮商師。' },
];

// Sample "過往衝突主因" mini-analysis shown read-only in the preview.
const CAUSE_BARS: { label: string; pct: number }[] = [
  { label: '家務分配', pct: 45 },
  { label: '溝通方式', pct: 30 },
  { label: '作息差異', pct: 25 },
];

const ConflictFlywheelSample: React.FC = () => (
  <div className="space-y-4">
    {/* Mini trend analysis */}
    <SampleCard>
      <div className="flex items-center justify-between mb-3">
        <span className="font-body text-xs text-petal-muted">過往衝突主因（近 90 天）</span>
        <SampleTag />
      </div>
      <div className="space-y-2">
        {CAUSE_BARS.map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <span className="font-body text-xs text-petal-ink w-16 shrink-0">{c.label}</span>
            <div className="flex-1 h-2 rounded-full bg-petal-cream-2 overflow-hidden">
              <div className="h-full rounded-full bg-petal-rose-deep" style={{ width: `${c.pct}%` }} />
            </div>
            <span className="font-body text-[11px] text-petal-muted w-8 text-right">{c.pct}%</span>
          </div>
        ))}
      </div>
    </SampleCard>

    {/* The four-step repair flywheel */}
    <div className="space-y-2.5">
      {FLYWHEEL.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.step} className="flex items-start gap-3 text-left">
            <div className="shrink-0 w-9 h-9 rounded-full bg-petal-cream-2 text-pink-600 flex items-center justify-center">
              <Icon className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <div className="font-body text-sm font-medium text-petal-ink">
                <span className="text-petal-muted mr-1">{s.step}.</span>
                {s.title}
              </div>
              <div className="font-body text-xs text-petal-muted leading-relaxed">{s.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const PREVIEWS: Record<string, PreviewConfig> = {
  record: {
    icon: Calendar,
    eyebrow: '記錄時光',
    title: (
      <>
        記下你們的<em className="not-italic font-light italic text-pink-600">每一段時光</em>
      </>
    ),
    description: '親密時光、生理期與心情，一張月曆全部看得見。回顧你們走過的每一天。',
    sample: <CalendarMock />,
  },
  conflict: {
    icon: MessageCircle,
    eyebrow: '和諧相處',
    title: (
      <>
        吵架了？AI 幫你<em className="not-italic font-light italic text-pink-600">先開口</em>
      </>
    ),
    description: '說不出口的時候，AI 諮商師幫你寫出不傷和氣、保留面子的和解開場白，先跨出第一步。',
    sample: (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-body text-xs text-petal-muted">AI 和解開場白</span>
          <SampleTag />
        </div>
        <SampleCard>
          <p className="font-display italic font-light text-sm text-petal-ink leading-relaxed">
            「剛剛那樣讓你不舒服，我很抱歉。我其實很在乎你的感受，可以等你願意的時候，我們再好好聊聊嗎？」
          </p>
        </SampleCard>
      </div>
    ),
  },
  events: {
    icon: MessageSquareHeart,
    eyebrow: '衝突事件 · 關係修復的核心',
    title: (
      <>
        讓每次衝突，成為<em className="not-italic font-light italic text-pink-600">修復的起點</em>
      </>
    ),
    description:
      '這是 Twogether 的核心。記錄衝突、看見走勢、學會怎麼說，真的卡住了，就請 AI 諮商師陪你們聊，或預約真人諮商師。',
    sample: <ConflictFlywheelSample />,
  },
  wall: {
    icon: StickyNote,
    eyebrow: '我們的牆',
    title: (
      <>
        留下你們的<em className="not-italic font-light italic text-pink-600">悄悄話</em>
      </>
    ),
    description: '在牆上貼下想對彼此說的話，AI 諮商師也會適時給予溫柔的建議。',
    sample: (
      <div className="grid grid-cols-2 gap-2.5">
        <SampleCard>
          <p className="font-body text-sm text-petal-ink">謝謝你昨天陪我加班到那麼晚 🫶</p>
          <div className="font-body text-[11px] text-petal-muted mt-1.5">— 小晴</div>
        </SampleCard>
        <SampleCard>
          <p className="font-body text-sm text-petal-ink">下次換我煮飯，你負責吃就好 😋</p>
          <div className="font-body text-[11px] text-petal-muted mt-1.5">— 阿哲</div>
        </SampleCard>
      </div>
    ),
  },
};

// Roleplay scripts mix [partner1]/[partner2] and [男]/[女] role tags. For the
// read-only preview we render them as readable role labels.
const prettyScript = (raw: string): string =>
  raw
    .replace(/\[partner1\]/g, '🅐')
    .replace(/\[partner2\]/g, '🅑')
    .replace(/\[男\]/g, '🅐')
    .replace(/\[女\]/g, '🅑');

const SignUpCta: React.FC<{ onSignUp: () => void; compact?: boolean }> = ({ onSignUp, compact }) => (
  <div className="text-center">
    <button
      onClick={onSignUp}
      data-testid="preview-signup-cta"
      className="inline-flex items-center gap-2 bg-petal-ink text-petal-cream px-7 py-3 rounded-md hover:bg-pink-700 transition-colors font-display italic text-base"
    >
      <Heart className="w-4 h-4" strokeWidth={1.5} />
      註冊免費開始 →
    </button>
    {!compact && (
      <p className="font-body text-xs text-petal-muted mt-3">
        已有帳號？
        <button
          onClick={onSignUp}
          className="text-pink-600 hover:text-pink-700 underline underline-offset-2 ml-1"
        >
          登入
        </button>
      </p>
    )}
  </div>
);

/**
 * Logged-out "showroom" content. Instead of every nav tab falling through to a
 * single generic login wall, each tab previews its own feature (read-only) so a
 * visitor understands the product, then funnels to sign-up.
 */
const LoggedOutPreview: React.FC<LoggedOutPreviewProps> = ({ view, onSignUp, scripts = [] }) => {
  const [openScript, setOpenScript] = useState<PreviewScript | null>(null);

  // Roleplay gets a dedicated layout: real public scripts the visitor can open.
  if (view === 'roleplay') {
    const previewScripts = scripts.slice(0, 4);
    return (
      <div className="max-w-md mx-auto py-6" data-testid="logged-out-preview-roleplay">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-petal-cream-2 text-pink-600 mb-4">
            <Play className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
            — 角色扮演
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
            為你們的夜晚<em className="not-italic font-light italic text-pink-600">增添新鮮感</em>
          </h2>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed max-w-sm mx-auto">
            精選情境劇本，點開看看內容。登入後可以照著演、自由發揮，也能自訂專屬你們的劇本。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {previewScripts.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenScript(s)}
              data-testid={`preview-script-${s.id}`}
              className="text-left bg-petal-cream border border-petal-rule rounded-md overflow-hidden hover:border-petal-ink transition-colors"
            >
              <div className="aspect-video bg-petal-cream-2 flex items-center justify-center">
                {s.image ? (
                  <img src={s.image} alt={s.title} className="w-full h-full object-contain" />
                ) : (
                  <Play className="w-6 h-6 text-petal-muted" strokeWidth={1.5} />
                )}
              </div>
              <div className="p-3">
                <div className="font-body text-sm font-medium text-petal-ink leading-snug line-clamp-2">
                  {s.title}
                </div>
                <div className="font-body text-[11px] text-petal-muted mt-1 line-clamp-2">{s.scenario}</div>
              </div>
            </button>
          ))}
        </div>

        <SignUpCta onSignUp={onSignUp} />

        {/* Read-only script viewer */}
        {openScript && (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setOpenScript(null)}
          >
            <div
              className="bg-petal-cream w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-md shadow-petal flex flex-col"
              onClick={(e) => e.stopPropagation()}
              data-testid="preview-script-modal"
            >
              <div className="flex items-start justify-between gap-3 p-4 border-b border-petal-rule">
                <div className="min-w-0">
                  <h3 className="font-display text-lg text-petal-ink leading-snug">{openScript.title}</h3>
                  <p className="font-body text-xs text-petal-muted mt-0.5">{openScript.scenario}</p>
                </div>
                <button
                  onClick={() => setOpenScript(null)}
                  className="shrink-0 p-1.5 text-petal-muted hover:text-petal-ink rounded-full hover:bg-petal-cream-2"
                  aria-label="關閉"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
              <div className="overflow-y-auto p-4">
                {openScript.image && (
                  <div className="aspect-video bg-petal-cream-2 rounded-md overflow-hidden mb-3">
                    <img src={openScript.image} alt={openScript.title} className="w-full h-full object-contain" />
                  </div>
                )}
                <pre className="font-body text-sm text-petal-ink whitespace-pre-wrap leading-relaxed">
                  {prettyScript(openScript.script)}
                </pre>
              </div>
              <div className="p-4 border-t border-petal-rule">
                <SignUpCta onSignUp={onSignUp} compact />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const config = PREVIEWS[view];

  // Unknown view → friendly generic welcome (keeps old behaviour as a fallback).
  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-4">
            — 歡迎
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-4">
            歡迎使用 <em className="not-italic font-light italic text-pink-600">Twogether</em>
          </h2>
          <p className="font-display italic font-light text-base text-petal-muted mb-8">
            登入以開始記錄你們的愛情時光。
          </p>
          <button
            onClick={onSignUp}
            className="bg-petal-ink text-petal-cream px-8 py-3 rounded-md hover:bg-pink-700 transition-colors font-display italic text-lg"
            data-testid="login-button"
          >
            立即登入 →
          </button>
        </div>
      </div>
    );
  }

  const Icon = config.icon;

  return (
    <div className="max-w-md mx-auto py-6" data-testid={`logged-out-preview-${view}`}>
      {/* Hero */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-petal-cream-2 text-pink-600 mb-4">
          <Icon className="w-5 h-5" strokeWidth={1.5} />
        </div>
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — {config.eyebrow}
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
          {config.title}
        </h2>
        <p className="font-body text-sm text-petal-ink-soft leading-relaxed max-w-sm mx-auto">
          {config.description}
        </p>
      </div>

      {/* Read-only sample */}
      <div className="mb-8">{config.sample}</div>

      {/* Sign-up CTA */}
      <SignUpCta onSignUp={onSignUp} />
    </div>
  );
};

export default LoggedOutPreview;
