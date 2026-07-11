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
  HandHeart,
  Hand,
  NotebookPen,
  Gauge,
  ClipboardCheck,
  Crown,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { daysSinceLastNudge } from './AchievementsView';
import { isVideoUrl } from '../utils/script';

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
  9: 'rose', // 生理期
  10: 'rose',
  14: 'pink', // 親密時光
  21: 'pink',
  26: 'rose',
};
// 'pink' (親密時光) renders as a ♥ to match the real CalendarHeatmap; 'rose'
// (生理期) renders as a dot.
const DOT_CLS: Record<string, string> = {
  rose: 'bg-petal-rose-deep',
};

// Sample of the real intimacy-stats cards, leading with the「已經幾天沒有親密了」
// hook (16 days, escalated) — reuses the same tier styling as the live view.
const SampleStats: React.FC = () => {
  const nudge = daysSinceLastNudge(16);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-end mb-2">
        <SampleTag />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-petal-cream border border-petal-rule rounded-md p-3">
          <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-1">本週次數</div>
          <div className="font-display italic font-light text-2xl text-petal-rose-deep">0</div>
        </div>
        <div className="bg-petal-cream border border-petal-rule rounded-md p-3">
          <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-1">本月次數</div>
          <div className="font-display italic font-light text-2xl text-petal-sage-deep">1</div>
        </div>
        <div className="bg-petal-rose-soft/40 border border-petal-rose-soft rounded-md p-3 col-span-2">
          <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-1">已經幾天沒有親密了</div>
          <div className={`font-display italic font-light leading-none ${nudge.numberClass}`}>16</div>
        </div>
      </div>
      {nudge.hint && (
        <p className="mt-2 font-body text-xs text-petal-rose-deep text-center leading-snug">{nudge.hint}</p>
      )}

      {/* Read-only preview of the「讓 Twogether 溫柔提醒」quick action: the platform
          phrases the gap neutrally and offers three options to send. */}
      <div className="mt-3 rounded-md border border-petal-rose-soft bg-petal-rose-soft/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1.5 font-body text-xs font-medium text-petal-rose-deep">
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
            讓 Twogether 溫柔提醒另一半
          </span>
          <SampleTag />
        </div>
        <ul className="space-y-1.5">
          {[
            { label: '🫶 鼓勵連結', text: '已經 16 天沒有記錄親密時光。一個擁抱、一場散步，或一段沒有打擾的聊天，都能讓彼此更靠近。', recommended: true },
            { label: '💛 溫柔關心', text: 'Twogether 注意到，你們已經 16 天沒有記錄親密時光了。如果最近生活比較忙，不妨找個舒服的時間，好好陪伴彼此。', recommended: false },
            { label: '🌿 不只談性', text: '已經有 16 天沒有記錄親密時光了。親密不一定只有性愛，也可以是一個擁抱、一句關心，或一起度過的一段時光。', recommended: false },
          ].map((s, i) => (
            <li key={i} className={`bg-white rounded-md border p-2 ${s.recommended ? 'border-petal-rose-deep' : 'border-petal-rule'}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-body text-[9px] uppercase tracking-[0.12em] text-petal-rose-deep">{s.label}</span>
                {s.recommended && (
                  <span className="font-body text-[9px] px-1 py-0.5 rounded-full bg-petal-rose-soft/60 text-petal-rose-deep">推薦</span>
                )}
              </div>
              <p className="font-body text-xs text-petal-ink leading-snug">{s.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// Sample of the 親密記錄 history list, showing the new「距上次相隔 N 天」gap
// badge that now sits beside each record's date in the real view.
const SampleRecordList: React.FC = () => {
  const rows = [
    { date: '6月28日', mood: '😊', note: '一起看了場電影', gap: 5 },
    { date: '6月23日', mood: '🥰', note: '週末小旅行', gap: 12 },
    { date: '6月11日', mood: '😌', note: null as string | null, gap: null as number | null },
  ];
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display italic text-base text-petal-ink">親密記錄</span>
        <SampleTag />
      </div>
      <div className="bg-petal-cream border border-petal-rule rounded-md divide-y divide-petal-rule-soft">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-3 p-3">
            <span className="text-base leading-none opacity-70 mt-0.5">{r.mood}</span>
            <div className="min-w-0">
              <div className="font-display italic font-light text-xs text-petal-muted">
                {r.date}
                {r.gap !== null && (
                  <span className="text-petal-rose-deep"> · 距上次相隔 {r.gap} 天</span>
                )}
              </div>
              {r.note && (
                <p className="font-body text-[13px] text-petal-ink leading-snug mt-0.5">{r.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
                {MARKED[day] === 'pink' ? (
                  <span className="mt-0.5 text-[10px] leading-none text-pink-500">♥</span>
                ) : MARKED[day] ? (
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full ${DOT_CLS[MARKED[day]]}`} />
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-petal-rule">
        <span className="flex items-center gap-1 font-body text-[11px] text-petal-muted">
          <span className="text-[11px] leading-none text-pink-500">♥</span> 親密時光
        </span>
        <span className="flex items-center gap-1 font-body text-[11px] text-petal-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-petal-rose-deep" /> 生理期
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
  { icon: HeartHandshake, step: '4', title: '請諮商師協助', desc: '真的卡住了，你挑選的 AI 諮商師（Luma、Sophie、Kai⋯共 9 位個性不同的陪伴者）陪你聊，或預約真人諮商師。' },
];

// Sample "過往衝突主因" mini-analysis shown read-only in the preview.
const CAUSE_BARS: { label: string; pct: number }[] = [
  { label: '家務分配', pct: 45 },
  { label: '溝通方式', pct: 30 },
  { label: '作息差異', pct: 25 },
];

// The new "情緒接住" lead — a three-beat example of the emotion-acceptance flow:
// one partner writes a feeling, AI softens it, the other receives an AI-suggested
// way to "catch" it. Shown read-only to logged-out visitors.
const EmotionAcceptanceSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <HandHeart className="w-3.5 h-3.5 text-petal-rose-deep" />
        先接住情緒，溝通才開始
      </span>
      <SampleTag />
    </div>
    <div className="space-y-2.5">
      <div className="rounded-md bg-petal-cream-2 px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-1">① 小晴寫下情緒</div>
        <p className="font-body text-sm text-petal-ink">「你又忘記了，我覺得自己一點都不重要。」</p>
      </div>
      <div className="rounded-md bg-white border border-petal-rule px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-1">② AI 整理事件＋翻成不傷人的話</div>
        <div className="rounded bg-petal-cream-2 px-2 py-1.5 mb-1.5">
          <div className="font-body text-[10px] text-petal-muted">事件簡介（中性紀錄）</div>
          <p className="font-body text-xs text-petal-ink-soft">兩人約好的紀念日晚餐，其中一方因加班忘記赴約。</p>
        </div>
        <p className="font-body text-sm text-petal-ink">「當約定被忘記時，我會覺得失落，因為我很在乎我們的相處。」</p>
        <div className="font-body text-[10px] text-petal-muted mt-1">✎ 送出前後都可以再修改</div>
      </div>
      <div className="rounded-md bg-petal-rose-soft/30 border border-petal-rose-soft px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-1">③ AI 教阿哲怎麼接住</div>
        <p className="font-body text-sm text-petal-ink">「我聽到你很失落，這對你來說很重要，謝謝你願意告訴我。」</p>
      </div>
    </div>
  </SampleCard>
);

// "婚姻檢查" read-only sample — each partner rates a few dimensions, then both
// reveal side-by-side with an AI neutral summary.
const CHECKUP_ROWS: { label: string; a: number; b: number }[] = [
  { label: '💬 溝通', a: 4, b: 4 },
  { label: '💗 親密', a: 2, b: 4 },
  { label: '🏠 家務分工', a: 3, b: 2 },
];

const MarriageCheckupSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <ClipboardCheck className="w-3.5 h-3.5 text-petal-rose-deep" />
        婚姻檢查・各自打分後一起揭曉
      </span>
      <SampleTag />
    </div>
    <div className="rounded-md border border-petal-rule overflow-hidden mb-2.5">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 bg-petal-cream-2 text-[10px] font-body text-petal-muted uppercase tracking-wide">
        <span>面向</span>
        <span className="w-8 text-center">你</span>
        <span className="w-8 text-center">對方</span>
      </div>
      {CHECKUP_ROWS.map((r) => (
        <div
          key={r.label}
          className={`grid grid-cols-[1fr_auto_auto] gap-x-3 items-center px-3 py-1.5 border-t border-petal-rule ${
            Math.abs(r.a - r.b) >= 2 ? 'bg-amber-50/60' : ''
          }`}
        >
          <span className="font-body text-sm text-petal-ink">{r.label}</span>
          <span className="w-8 text-center font-display text-base text-petal-ink">{r.a}</span>
          <span className="w-8 text-center font-display text-base text-petal-rose-deep">{r.b}</span>
        </div>
      ))}
    </div>
    <p className="font-body text-xs text-petal-ink-soft leading-relaxed">
      <span className="text-petal-sage-deep font-medium">AI 中立總結：</span>
      你們在「溝通」上感受一致，是你們的基礎；「親密」的落差比較大，這通常就是最值得一起聊的地方。
    </p>
  </SampleCard>
);

// Post-conflict 治療摘要 read-only sample: after a fight is resolved, AI leaves
// a structured therapy note (trigger, real needs, the negative cycle, a
// next-time line) instead of a plain summary.
const TherapyNoteSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <NotebookPen className="w-3.5 h-3.5 text-petal-sage-deep" />
        吵完之後，AI 留下一份治療摘要
      </span>
      <SampleTag />
    </div>
    <div className="space-y-2.5">
      <div>
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">這次最大的觸發點</div>
        <p className="font-body text-sm text-petal-ink">沒有回訊息</p>
      </div>
      <div>
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">真正的需求</div>
        <p className="font-body text-sm text-petal-ink">小晴 需要<span className="text-petal-rose-deep">安全感</span>・阿哲 需要<span className="text-petal-rose-deep">被信任</span></p>
      </div>
      <div>
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">負向循環</div>
        <p className="font-body text-xs text-petal-ink-soft">小晴 追 → 阿哲 逃 → 小晴 追更兇 → 阿哲 更沉默</p>
      </div>
      <div className="rounded-md bg-petal-rose-soft/30 border border-petal-rose-soft px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-0.5">下次可以先說</div>
        <p className="font-body text-sm text-petal-ink">「我現在不是生氣，我只是有點害怕。」</p>
      </div>
    </div>
  </SampleCard>
);

// Stage 0 safety-check read-only sample: when a thread heats up, AI names what
// is happening and offers a pause instead of taking sides.
const SafetyBannerSample: React.FC = () => (
  <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-2.5">
    <Hand className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" strokeWidth={1.5} />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="font-body text-sm font-medium text-orange-900">先暫停一下</p>
        <SampleTag />
      </div>
      <p className="font-body text-[13px] leading-relaxed mt-0.5 text-orange-900/90">
        我注意到你們現在比較像是在保護自己，而不是理解彼此。要不要先暫停十分鐘、深呼吸一下，
        等平靜一點再繼續？
      </p>
    </div>
  </div>
);

// Per-message emotion meter read-only sample: before a charged reply is sent,
// AI shows the emotions, how the partner may mishear it vs the real worry, the
// need, and a rewrite.
const EmotionMeterSample: React.FC = () => {
  const bars = [
    { emoji: '😢', label: '傷心', pct: 70 },
    { emoji: '😰', label: '焦慮', pct: 80 },
    { emoji: '😠', label: '生氣', pct: 50 },
  ];
  return (
    <SampleCard>
      <div className="flex items-center justify-between mb-3">
        <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-petal-rose-deep" />
          送出前，先看看這句話
        </span>
        <SampleTag />
      </div>
      <div className="rounded-md bg-petal-cream-2 px-3 py-2 mb-2.5">
        <p className="font-body text-sm text-petal-ink">你到底要不要回家？</p>
      </div>
      <div className="space-y-1.5 mb-2.5">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-2">
            <span className="w-14 shrink-0 font-body text-xs text-petal-ink">{b.emoji} {b.label}</span>
            <div className="flex-1 h-2 rounded-full bg-white overflow-hidden">
              <div className="h-full rounded-full bg-petal-rose-deep" style={{ width: `${b.pct}%` }} />
            </div>
            <span className="w-8 text-right font-body text-[11px] text-petal-muted">{b.pct}%</span>
          </div>
        ))}
      </div>
      <div className="font-body text-[13px] text-petal-ink space-y-0.5 mb-2.5">
        <p><span className="text-red-500 mr-1">✕</span>對方可能聽成：你很爛。</p>
        <p><span className="text-petal-sage-deep mr-1">✓</span>其實想說：你是不是不要這個家了？</p>
      </div>
      <div className="rounded-md bg-petal-rose-soft/30 border border-petal-rose-soft px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-0.5">試著這樣說</div>
        <p className="font-body text-sm text-petal-ink">「我今天很想你，不知道你今晚會不會回來？」</p>
      </div>
    </SampleCard>
  );
};

const ConflictFlywheelSample: React.FC = () => (
  <div className="space-y-4">
    <SafetyBannerSample />

    <EmotionMeterSample />

    <EmotionAcceptanceSample />

    <TherapyNoteSample />

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

// Static Premium pricing shown to logged-out visitors. Kept in sync with the
// server catalog (routes/billing.js PLANS) and public/pricing.html. Visitors
// can't fetch /billing/status (no auth), so these are hardcoded; the live,
// authoritative prices come from the server once signed in.
const PRICING_PLANS: { days: number; amount: number; perDay: string; featured?: boolean }[] = [
  { days: 30, amount: 90, perDay: '約每天 NT$3' },
  { days: 90, amount: 240, perDay: '約每天 NT$2.7', featured: true },
  { days: 365, amount: 790, perDay: '約每天 NT$2.2' },
];

const PRICING_PERKS = [
  '每日 AI 整理／改寫次數大幅提升',
  '無限建立自訂角色扮演劇本',
  '無限上傳照片',
  '購買天數可累加堆疊，已付費時間不流失',
  '情侶雙方同步享有，無須各自付費',
];

const PREVIEWS: Record<string, PreviewConfig> = {
  record: {
    icon: Calendar,
    eyebrow: '記錄時光',
    title: (
      <>
        記下你們的<em className="not-italic font-light italic text-pink-600">每一段時光</em>
      </>
    ),
    description:
      '看見你們的節奏：親密時光與生理期都在一張月曆上。太久沒親密時，App 會溫柔提醒另一半多關心你。',
    sample: (
      <>
        <SampleStats />
        <SampleRecordList />
        <CalendarMock />
      </>
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
    description:
      '說不出口的時候，AI 諮商師幫你寫出不傷和氣的和解開場白；也能定期做「婚姻檢查」，各自打分後一起揭曉，AI 當中立第三方幫你們把話攤開來看。',
    sample: (
      <div className="space-y-4">
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
        <MarriageCheckupSample />
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
      '這是 Twogether 的核心。先讓情緒被接住——一方寫下感受，AI 幫你說得不傷人，另一方收到後 AI 也教他怎麼接住你。被接住了，再一起看走勢、學會怎麼說，真的卡住就請 AI 或真人諮商師陪你們。',
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
    description: '在牆上貼下想對彼此說的話，你選的 AI 諮商師（例如 Luma）也會適時給予溫柔的建議。開啟「情緒翻譯」後，AI 還會把每句指責翻成底層的需求，讓對方聽到的不是攻擊，而是需要。',
    sample: (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 bg-petal-cream-2 border border-petal-rule rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5">
            <HeartHandshake className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
            <span className="font-body text-xs text-petal-ink">情緒翻譯</span>
            <SampleTag />
          </div>
          <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-petal-rose-deep">
            <span className="inline-block h-4 w-4 translate-x-4 rounded-full bg-white" />
          </span>
        </div>
        <SampleCard>
          <p className="font-body text-sm text-petal-ink">你根本沒有把家庭放第一。</p>
          <div className="font-body text-[11px] text-petal-muted mt-1.5">— 小晴</div>
          <div className="mt-1.5 rounded-xl border border-petal-rose-deep/25 bg-petal-cream-2 px-3 py-2">
            <div className="flex items-center gap-1.5 text-petal-rose-deep">
              <HeartHandshake className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="font-body text-[11px] font-medium">可能真正想表達的是</span>
            </div>
            <p className="mt-1 font-body text-sm text-petal-ink leading-relaxed">「我最近很沒有安全感，希望家庭能被放在更重要的位置。」</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-[11px] px-2 py-0.5">需要安全感</span>
              <span className="inline-flex items-center rounded-full border border-petal-rule text-petal-muted font-body text-[11px] px-2 py-0.5">孤單</span>
            </div>
          </div>
        </SampleCard>
      </div>
    ),
  },
};

// Roleplay scripts mix [partner1]/[partner2] and [男]/[女]/[他]/[她] role
// tags. The preview substitutes sample nicknames the same way the app swaps
// in the couple's real nicknames by gender after login.
const SAMPLE_MALE_NICKNAME = '小宇';
const SAMPLE_FEMALE_NICKNAME = '小甜';
const prettyScript = (raw: string): string =>
  raw
    .replace(/\[partner1\]|\[男\]|\[他\]/g, SAMPLE_MALE_NICKNAME)
    .replace(/\[partner2\]|\[女\]|\[她\]/g, SAMPLE_FEMALE_NICKNAME);

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
            精選情境劇本，點開看看內容。登入後劇本會依你們的性別自動帶入雙方暱稱，可從 Google 文件一鍵匯入劇本，Premium 還能讓 AI 自動辨識角色性別。
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
                  isVideoUrl(s.image) ? (
                    <video src={s.image} className="w-full h-full object-contain" autoPlay muted loop playsInline />
                  ) : (
                    <img src={s.image} alt={s.title} className="w-full h-full object-contain" />
                  )
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
                <div className="flex items-center gap-2 mb-2">
                  <SampleTag />
                  <span className="font-body text-[11px] text-petal-muted">
                    「{SAMPLE_MALE_NICKNAME}」「{SAMPLE_FEMALE_NICKNAME}」為範例暱稱 — 登入後會依性別自動帶入你們的暱稱
                  </span>
                </div>
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

  // Premium / pricing gets a dedicated layout: plan cards, perks and payment
  // info, funneling to sign-up. Mirrors public/pricing.html for visitors who
  // browse pricing inside the app before creating an account.
  if (view === 'pricing') {
    return (
      <div className="max-w-2xl mx-auto py-6" data-testid="logged-out-preview-pricing">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-petal-cream-2 text-pink-600 mb-4">
            <Crown className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
            — Premium 方案
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
            解鎖 <em className="not-italic font-light italic text-pink-600">Twogether Premium</em>
          </h2>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed max-w-sm mx-auto">
            免費方案即可使用核心功能。升級 Premium 一次付費、買斷天數，情侶雙方共享，無自動續扣。
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid gap-3 sm:grid-cols-3 mb-8">
          {PRICING_PLANS.map((p) => {
            const monthly = Math.round(p.amount / (p.days / 30));
            return (
              <div
                key={p.days}
                data-testid={`pricing-plan-${p.days}`}
                className={`relative rounded-md border bg-petal-cream p-5 flex flex-col text-center ${
                  p.featured ? 'border-petal-rose-deep shadow-petal' : 'border-petal-rule'
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-petal-rose-deep text-petal-cream font-body text-[10px] font-medium tracking-wide px-3 py-0.5 rounded-full whitespace-nowrap">
                    最受歡迎
                  </span>
                )}
                <div className="font-display text-lg font-light text-petal-ink mb-1">{p.days} 天</div>
                <div className="font-display text-3xl font-light text-petal-ink mb-1">NT${p.amount}</div>
                <div className="font-body text-xs text-petal-muted mb-1">約 NT${monthly}／月</div>
                <div className="font-body text-[11px] text-petal-sage-deep mb-5">{p.perDay}</div>
                <button
                  onClick={onSignUp}
                  data-testid={`pricing-signup-${p.days}`}
                  className={`mt-auto w-full py-2.5 rounded-md font-display italic text-base transition-colors ${
                    p.featured
                      ? 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                      : 'bg-petal-cream-2 text-petal-ink border border-petal-rule hover:border-petal-ink'
                  }`}
                >
                  註冊解鎖
                </button>
              </div>
            );
          })}
        </div>

        {/* Perks */}
        <div className="mb-8 rounded-md border border-petal-rule bg-petal-cream p-5">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
            Premium 包含
          </div>
          <ul className="space-y-2">
            {PRICING_PERKS.map((perk) => (
              <li key={perk} className="flex items-start space-x-2">
                <Check className="w-4 h-4 mt-0.5 text-petal-sage-deep shrink-0" strokeWidth={1.75} />
                <span className="font-body text-sm text-petal-ink-soft">{perk}</span>
              </li>
            ))}
          </ul>
        </div>

        <SignUpCta onSignUp={onSignUp} />

        <p className="mt-6 text-center font-body text-xs text-petal-muted flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>支援信用卡、LINE Pay、ATM 與超商 · 由綠界 ECPay 或藍新金流安全付款</span>
        </p>
        <p className="mt-3 text-center font-body text-xs text-petal-muted">
          想了解更多？
          <a
            href="/pricing"
            className="text-pink-600 hover:text-pink-700 underline underline-offset-2 ml-1"
            data-testid="pricing-full-page-link"
          >
            查看完整方案與退費政策
          </a>
        </p>
      </div>
    );
  }

  // 好好說話 (merged tab) previews the conflict-repair flywheel: it's the
  // heart of the product and covers both sub-tabs' value.
  const config = view === 'communicate' ? PREVIEWS.events : PREVIEWS[view];

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
