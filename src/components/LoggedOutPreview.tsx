import React from 'react';
import {
  Calendar,
  MessageCircle,
  MessageSquareHeart,
  Play,
  StickyNote,
  Heart,
  type LucideIcon,
} from 'lucide-react';

interface LoggedOutPreviewProps {
  /** Current nav view id (record | conflict | events | roleplay | wall). */
  view: string;
  /** Opens the auth modal. */
  onSignUp: () => void;
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
    eyebrow: '事件',
    title: (
      <>
        把重要時刻變成<em className="not-italic font-light italic text-pink-600">專屬事件</em>
      </>
    ),
    description: '約會、紀念日、第一次旅行 —— 把你們的重要時刻收進事件牆，一起期待、一起回味。',
    sample: (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-body text-xs text-petal-muted">即將到來</span>
          <SampleTag />
        </div>
        {[
          { title: '交往一週年', date: '7 月 2 日', emoji: '🎉' },
          { title: '宜蘭小旅行', date: '7 月 19 日', emoji: '🧳' },
        ].map((e) => (
          <SampleCard key={e.title}>
            <div className="flex items-center justify-between gap-3">
              <div className="font-body text-sm text-petal-ink">
                {e.emoji} {e.title}
              </div>
              <div className="font-body text-xs text-petal-muted shrink-0">{e.date}</div>
            </div>
          </SampleCard>
        ))}
      </div>
    ),
  },
  roleplay: {
    icon: Play,
    eyebrow: '角色扮演',
    title: (
      <>
        為你們的夜晚<em className="not-italic font-light italic text-pink-600">增添新鮮感</em>
      </>
    ),
    description: '精選情境劇本，照著演、自由發揮都好。也能自訂專屬你們的劇本。',
    sample: (
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { title: '久別重逢', tag: '甜蜜' },
          { title: '雨夜的陌生人', tag: '微醺' },
          { title: '老師與學生', tag: '經典' },
          { title: '婚禮前夕', tag: '浪漫' },
        ].map((s) => (
          <SampleCard key={s.title}>
            <div className="font-body text-sm text-petal-ink">{s.title}</div>
            <div className="font-body text-[11px] text-petal-muted mt-0.5">#{s.tag}</div>
          </SampleCard>
        ))}
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

/**
 * Logged-out "showroom" content. Instead of every nav tab falling through to a
 * single generic login wall, each tab previews its own feature (read-only) so a
 * visitor understands the product, then funnels to sign-up.
 */
const LoggedOutPreview: React.FC<LoggedOutPreviewProps> = ({ view, onSignUp }) => {
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
      <div className="text-center">
        <button
          onClick={onSignUp}
          data-testid="preview-signup-cta"
          className="inline-flex items-center gap-2 bg-petal-ink text-petal-cream px-7 py-3 rounded-md hover:bg-pink-700 transition-colors font-display italic text-base"
        >
          <Heart className="w-4 h-4" strokeWidth={1.5} />
          註冊免費開始 →
        </button>
        <p className="font-body text-xs text-petal-muted mt-3">
          已有帳號？
          <button
            onClick={onSignUp}
            className="text-pink-600 hover:text-pink-700 underline underline-offset-2 ml-1"
          >
            登入
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoggedOutPreview;
