import React, { useState } from 'react';
import {
  Calendar,
  MessageCircle,
  MessageSquareHeart,
  Play,
  StickyNote,
  Heart,
  X,
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
    sample: (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-body text-xs text-petal-muted">六月</span>
          <SampleTag />
        </div>
        {[
          { day: '14', emoji: '💗', label: '親密時光', note: '在家的安靜夜晚' },
          { day: '09', emoji: '🌙', label: '生理期', note: '第 2 天' },
          { day: '03', emoji: '☺️', label: '好心情', note: '一起看了場電影' },
        ].map((e) => (
          <SampleCard key={e.day}>
            <div className="flex items-center gap-3">
              <div className="font-display italic text-lg text-petal-ink w-7 shrink-0">{e.day}</div>
              <div className="min-w-0">
                <div className="font-body text-sm text-petal-ink">
                  {e.emoji} {e.label}
                </div>
                <div className="font-body text-xs text-petal-muted truncate">{e.note}</div>
              </div>
            </div>
          </SampleCard>
        ))}
      </div>
    ),
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
    eyebrow: '衝突事件',
    title: (
      <>
        把委屈<em className="not-italic font-light italic text-pink-600">好好說出口</em>
      </>
    ),
    description: '把這次的衝突與心裡的委屈寫下來，AI 幫你改寫成不指責、不示弱的中性語氣，再決定要不要送給對方。',
    sample: (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-body text-xs text-petal-muted">把感受寫下來 → AI 改寫</span>
          <SampleTag />
        </div>
        <SampleCard>
          <p className="font-body text-xs text-petal-muted mb-1">你寫的</p>
          <p className="font-body text-sm text-petal-ink leading-relaxed">
            今天他又忘記回我訊息，我覺得自己根本不被重視。
          </p>
        </SampleCard>
        <SampleCard>
          <p className="font-body text-xs text-petal-rose-deep mb-1">AI 改寫（堅定不攻擊版）</p>
          <p className="font-display italic font-light text-sm text-petal-ink leading-relaxed">
            「今天訊息沒有回覆讓我有點失落。對我來說，及時的回應會讓我更安心，我們可以聊聊怎麼配合嗎？」
          </p>
        </SampleCard>
      </div>
    ),
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
