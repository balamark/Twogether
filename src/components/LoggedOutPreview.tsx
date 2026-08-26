import React, { useState, useEffect } from 'react';
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
  Compass,
  NotebookPen,
  Gauge,
  ClipboardCheck,
  Crown,
  Check,
  Lock,
  Bell,
  ShieldCheck,
  MessageSquare,
  Eye,
  ThumbsUp,
  ThumbsDown,
  type LucideIcon,
} from 'lucide-react';
import { daysSinceLastNudge } from './AchievementsView';
import { isVideoUrl } from '../utils/script';
import ParticipantAvatar from './ParticipantAvatar';
import MarkdownContent from './MarkdownContent';
import {
  POSITIONING_ONE_LINER,
  POSITIONING_SUBLINE,
  NOT_A_SUBSTITUTE,
} from '../content/positioning';
import { COMMUNICATION_PRINCIPLES } from '../content/communicationPrinciples';
import { trackAction } from '../utils/track';
import { PairingInviteShare } from './PairingInviteShare';
import PairingReminderBanner from './PairingReminderBanner';

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
  /** Navigates to another view id — lets a preview link out to a dedicated
   * real/bespoke preview (roleplay, therapists, wall, stories) that's no
   * longer its own bottom-nav tab. */
  onNavigate?: (view: string) => void;
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

// Read-only「通知中心」sample: every action your partner takes shows up here, so
// you always know what TA just did (愛的記錄、劇本、禮物、婚姻健檢…). Static 範例 data.
const NotificationCenterSample: React.FC = () => {
  const rows = [
    { emoji: '💝', title: '小晴新增了一則愛的記錄', body: '昨晚的約會好浪漫', dot: 'bg-blue-500', unread: true },
    { emoji: '🎁', title: '小晴新增了一個客製禮物', body: '🎁 一起看電影的夜晚', dot: 'bg-blue-500', unread: true },
    { emoji: '💑', title: '小晴發起了一次婚姻健檢', body: '打開 App 一起完成健檢', dot: 'bg-yellow-500', unread: false },
  ];
  return (
    <div className="rounded-md border border-petal-rule bg-petal-cream overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-petal-rule bg-petal-cream-2">
        <div className="flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
          <span className="font-body text-xs font-medium text-petal-ink">通知中心</span>
        </div>
        <SampleTag />
      </div>
      <ul className="divide-y divide-petal-rule">
        {rows.map((r, i) => (
          <li key={i} className={`flex items-start gap-2.5 px-3 py-2.5 ${r.unread ? 'bg-petal-rose-soft/10' : ''}`}>
            <span className={`mt-1.5 h-2 w-2 rounded-full ${r.dot}`} />
            <div className="min-w-0">
              <p className="font-body text-sm text-petal-ink">{r.emoji} {r.title}</p>
              <p className="font-body text-xs text-petal-muted mt-0.5 truncate">{r.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

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

// Sample of the 親密記錄 history list, showing the「距上次相隔 N 天」gap badge
// beside each record's date and the 快速回應 line below it — one tap or one
// short sentence, so a record isn't a row nobody can answer.
const SampleRecordList: React.FC = () => {
  const rows = [
    {
      date: '6月28日', mood: '😊', note: '一起看了場電影', gap: 5,
      response: { who: '小美', text: '那天真的好放鬆' } as { who: string; text: string } | null,
    },
    { date: '6月23日', mood: '🥰', note: '週末小旅行', gap: 12, response: null },
    { date: '6月11日', mood: '😌', note: null as string | null, gap: null as number | null, response: null },
  ];
  // Static mirror of MOMENT_REACTIONS (src/components/MomentResponseBar.tsx).
  const chips = ['愛你', '意猶未盡', '想再抱一次', '很難忘'];
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
            <div className="min-w-0 flex-1">
              <div className="font-display italic font-light text-xs text-petal-muted">
                {r.date}
                {r.gap !== null && (
                  <span className="text-petal-rose-deep"> · 距上次相隔 {r.gap} 天</span>
                )}
              </div>
              {r.note && (
                <p className="font-body text-[13px] text-petal-ink leading-snug mt-0.5">{r.note}</p>
              )}
              {r.response && (
                <div className="mt-2 inline-flex items-baseline gap-1.5 rounded-full bg-petal-rose-soft/50 px-2.5 py-1 max-w-full">
                  <span className="font-body text-[11px] text-petal-rose-deep truncate">
                    {r.response.who}：{r.response.text}
                  </span>
                </div>
              )}
              {i === 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3">
                  {chips.map((label, ci) => (
                    <span
                      key={label}
                      className={`font-body text-[11px] ${
                        ci === 0
                          ? 'text-petal-rose-deep border-b border-petal-rose-deep pb-0.5'
                          : 'text-petal-ink-soft'
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
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
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-display italic text-base text-petal-ink">你們的節奏</span>
          <p className="font-body text-[11px] text-petal-muted mt-0.5">點月曆任一天新增或查看紀錄</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-petal-ink text-petal-cream rounded-md font-display italic text-xs">
            ＋ 記錄今天
          </span>
          <SampleTag />
        </div>
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
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-1">② AI 整理對話＋翻成不傷人的話</div>
        <div className="rounded bg-petal-cream-2 px-2 py-1.5 mb-1.5">
          <div className="font-body text-[10px] text-petal-muted">對話簡介（中性紀錄）</div>
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

// Batch 1 一起收尾 read-only sample. Shows the closure summary card as it
// appears after both partners have written and reviewed — commitments in the
// couple's own words, the shared decision, and the AI's short 見解. Static, no
// fetches, mirrors ClosureSummaryCard layout.
const CloseTogetherSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <NotebookPen className="w-3.5 h-3.5 text-petal-sage-deep" />
        一起收尾：各自寫下「下次我願意做的一件小事」
      </span>
      <SampleTag />
    </div>
    <div className="space-y-2">
      <div className="bg-petal-cream-2 border border-petal-rule rounded-xl p-2.5">
        <div className="font-body text-[11px] text-petal-muted mb-0.5">小晴的約定</div>
        <div className="font-body text-sm text-petal-ink">即使很生氣，也不在孩子面前說你</div>
      </div>
      <div className="bg-petal-cream-2 border border-petal-rule rounded-xl p-2.5">
        <div className="font-body text-[11px] text-petal-muted mb-0.5">阿哲的約定</div>
        <div className="font-body text-sm text-petal-ink">要動孩子之前，我會先問你一聲</div>
      </div>
      <div className="bg-petal-cream-2 border border-petal-rule rounded-xl p-2.5">
        <div className="font-body text-[11px] text-petal-muted mb-0.5">我們一起決定</div>
        <div className="font-body text-sm text-petal-ink">孩子睡著後若沒有立即危險，就不移動</div>
      </div>
      <div className="rounded-md bg-petal-sage/15 border border-petal-sage/40 px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">小小的觀察</div>
        <p className="font-body text-sm text-petal-ink">你們都選擇「當著孩子面的克制」，聽起來共同關心的是孩子看到的畫面。</p>
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

// Therapist Mode ("引導模式") read-only sample: the AI runs a turn-based
// exercise (a "card") instead of an advice essay, then scores it — with a
// 今日練習 scoreboard so therapy feels measurable.
const TherapistModeSample: React.FC = () => (
  <SampleCard>
    {/* 引導是 Luma 的第二種 mode，不是第四個角色 —— 靠 🧭 與版型分辨，不靠顏色。
        真實 app 裡這一整段會抽離到全螢幕專注層（GuideSessionView）。 */}
    <div className="flex items-center justify-between mb-3">
      <span className="inline-flex items-center gap-1.5 font-body text-xs text-petal-rose-deep">
        <ParticipantAvatar size="xs" role="ai" companionId="luma" name="Luma" />
        <Compass className="w-3.5 h-3.5" strokeWidth={1.5} />
        Luma・引導
      </span>
      <SampleTag />
    </div>
    <div className="rounded-2xl border border-petal-rule bg-white shadow-sm p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-petal-sage bg-petal-sage/20 text-petal-sage-deep px-2 py-0.5 font-body text-[11px] font-medium">🪞 鏡映</span>
        <span className="rounded-full border border-petal-sage bg-petal-sage/20 text-petal-sage-deep px-2 py-0.5 font-body text-[11px] font-medium">✅ 做到了</span>
      </div>
      <p className="font-body text-sm text-petal-ink leading-relaxed">我們一次只做一小步。先不要解釋，只重複你聽到的。</p>
      <div className="rounded-xl border border-petal-rose-deep bg-petal-rose-soft/20 px-3 py-2">
        <div className="font-body text-[11px] font-medium text-petal-rose-deep mb-0.5">換你了</div>
        <p className="font-body text-sm text-petal-ink">用「我聽到你說的是…」開頭，說出你聽到的。</p>
      </div>
    </div>
    <div className="mt-3 rounded-xl border border-petal-rule bg-petal-cream-2 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="font-display italic text-sm text-petal-ink">今日練習</span>
        <span className="font-body text-xs text-petal-muted">關係技巧分數 <span className="font-display italic text-petal-rose-deep">78%</span></span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 font-body text-xs text-petal-ink">
        <span>✓ 🎯 情緒標記</span>
        <span>✓ 🪞 鏡映</span>
        <span className="text-petal-muted">… 🫶 肯定</span>
      </div>
    </div>
  </SampleCard>
);

// 三方對話的空間規則：左邊是對方、右邊是我、中間是諮商師。多人對話難讀的地方不是
// 顏色不夠，而是不知道規則 —— 講一次，之後空間本身就會替我們說話。
const ThreeSeatSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted">誰在說話，看位置就知道</span>
      <SampleTag />
    </div>
    <div className="space-y-2">
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl px-3.5 py-2 bg-white border border-petal-rule">
          <div className="flex items-center gap-1.5 mb-0.5">
            <ParticipantAvatar size="xs" name="小晴" colorKey="小晴" />
            <span className="font-body text-[11px] text-petal-muted">小晴</span>
          </div>
          <p className="font-body text-sm text-petal-ink">我覺得你根本沒有在聽我說話。</p>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl px-3.5 py-2 bg-petal-cream-2 border border-petal-rule-soft">
          <div className="flex items-center gap-1.5 mb-0.5 justify-end">
            <span className="font-body text-[11px] text-petal-muted">我</span>
          </div>
          <p className="font-body text-sm text-petal-ink">我其實有在聽。</p>
        </div>
      </div>
      <div className="flex justify-center">
        <div className="max-w-[92%] w-full rounded-2xl px-3.5 py-2 bg-petal-rose-soft/25 border border-petal-rose-soft">
          <div className="flex items-center gap-1.5 mb-0.5">
            <ParticipantAvatar size="xs" role="ai" companionId="luma" name="Luma" />
            <span className="font-body text-[11px] font-medium text-petal-rose-deep">Luma・AI 諮商師</span>
          </div>
          <p className="font-body text-sm text-petal-ink">
            我想在這裡停一下。你們現在都在描述「對方做了什麼」。
          </p>
          {/* 每則 AI 回應都能一秒回饋；不通順就按 👎，我們會把它變得更準。範例僅展示。 */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <ThumbsUp className="w-3.5 h-3.5 text-petal-muted" strokeWidth={1.5} />
            <ThumbsDown className="w-3.5 h-3.5 text-petal-muted" strokeWidth={1.5} />
            <span className="font-body text-[10px] text-petal-muted">這則回應如何？</span>
          </div>
        </div>
      </div>
    </div>
    <p className="font-body text-[11px] text-petal-muted mt-2.5 leading-relaxed">
      左邊是對方、右邊是你、中間是 Luma —— 諮商師不站在任何一方，所以坐在你們兩個中間。
    </p>
  </SampleCard>
);

const ConflictFlywheelSample: React.FC = () => (
  <div className="space-y-4">
    <SafetyBannerSample />

    <ThreeSeatSample />

    <EmotionMeterSample />

    <TherapistModeSample />

    <EmotionAcceptanceSample />

    <TherapyNoteSample />

    <CloseTogetherSample />

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

// Pairing is the gateway to every shared feature, so the showroom previews it
// too: invite by email, then hand the partner the same link over LINE if the
// mail is slow. Non-interactive here (sample), like every other sample.
const PairingInviteSample: React.FC = () => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="font-body text-xs text-petal-muted">邀請伴侶加入</span>
      <SampleTag />
    </div>
    <PairingInviteShare
      sample
      link="https://twogether.fun/pairing/accept?token=example"
      recipientEmail="partner@example.com"
    />
  </div>
);

// Until you're paired, the app keeps a standing reminder (with the invite
// button) at the top of every page instead of asking once and going quiet.
// Shown here in its "還沒邀請" state; non-interactive like every other sample.
const PairingReminderSample: React.FC = () => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="font-body text-xs text-petal-muted">未配對時的常駐提醒</span>
      <SampleTag />
    </div>
    <PairingReminderBanner
      sample
      invite={null}
      onInvite={() => {}}
      onUseCode={() => {}}
      onResend={async () => {}}
    />
  </div>
);

// Read-only「情緒深潛」sample: hint at the journey from a present feeling down to
// a familiar one, and the private-letter promise. Static 範例 data.
const DeepDiveSample: React.FC = () => (
  <div className="rounded-md border border-petal-rule bg-petal-cream overflow-hidden">
    <div className="flex items-center justify-between px-3 py-2 border-b border-petal-rule bg-petal-cream-2">
      <div className="flex items-center gap-1.5">
        <Compass className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
        <span className="font-body text-xs font-medium text-petal-ink">情緒深潛</span>
      </div>
      <SampleTag />
    </div>
    <div className="p-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {['不被重視', '孤單', '委屈'].map((e) => (
          <span key={e} className="rounded-full bg-white border border-petal-rule px-2.5 py-0.5 font-body text-[11px] text-petal-ink">{e}</span>
        ))}
      </div>
      <SampleCard>
        <p className="font-body text-xs text-petal-ink-soft leading-relaxed">
          「聽起來，生氣底下還有一種<span className="text-petal-ink">『我的感受沒被重視』</span>的委屈。這種感覺，對你來說熟悉嗎？」
        </p>
      </SampleCard>
      <div className="flex items-center gap-1 font-body text-[11px] text-petal-muted">
        <Lock className="w-3 h-3" strokeWidth={1.5} />
        寫給過去的信永遠只留給你自己，只有寫給另一半的信會分享
      </div>
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
    description:
      '看見你們的節奏：親密時光與生理期都在一張月曆上。記下的每段時光都能互相回應——點一下表情，或留一句短短的話。太久沒親密時，App 會溫柔提醒另一半多關心你。另一半的每個操作也會出現在通知中心，讓你隨時知道 TA 做了什麼。',
    sample: (
      <>
        <CalendarMock />
        <div className="mt-4">
          <SampleStats />
        </div>
        <SampleRecordList />
        <div className="mt-4">
          <NotificationCenterSample />
        </div>
        <div className="mt-4">
          <PairingReminderSample />
        </div>
        <div className="mt-4">
          <PairingInviteSample />
        </div>
      </>
    ),
  },
  conflict: {
    icon: MessageCircle,
    eyebrow: '接住情緒',
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
      '這是 Twogether 的核心，也是「用寫的，把話說對」的地方。先讓情緒被接住：一方寫下感受，AI 幫你說得不傷人，另一方收到後 AI 也教他怎麼接住你。被接住了，再一起看你們反覆卡住的溝通模式、學會怎麼說，真的卡住就請 AI 或真人諮商師陪你們。想更深一點，還能走一趟「情緒深潛」，看看現在的痛是不是碰到了心裡更早的感受。',
    sample: (
      <div className="space-y-3">
        <ConflictFlywheelSample />
        <DeepDiveSample />
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
    description: '在牆上貼下想對彼此說的話，你選的 AI 諮商師（例如 Luma）也會適時給予溫柔的建議。貼文看得到「TA 已讀」，對方也能一鍵回你一個「抱抱」，不用硬擠出一段話。開啟「情緒翻譯」後，AI 還會把每句指責翻成底層的需求，讓對方聽到的不是攻擊，而是需要。',
    sample: (
      <div className="space-y-2.5">
        {/* 已讀 + 一鍵心意回應 — the answer to 「TA 看了卻什麼都沒說」. */}
        <SampleCard>
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <ParticipantAvatar size="xs" name="小晴" colorKey="小晴" />
            <span className="font-body text-xs text-petal-ink">小晴</span>
            <span className="font-body text-[11px] text-petal-muted">· 想被抱抱</span>
            <SampleTag />
          </div>
          <p className="font-body text-sm text-petal-ink">今天真的好累，可是又說不上為什麼。</p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-petal-rose-soft/50 px-3 py-1">
            <span aria-hidden>🫂</span>
            <span className="font-body text-xs text-petal-rose-deep">小宇給了你一個「抱抱」</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-petal-sage-deep">
            <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="font-body text-xs">已讀 · 3 小時前</span>
          </div>
        </SampleCard>
        {/* 從範本開始 — short starter templates so a blank page never stops you.
            Read-only strip mirroring the composer's template chips. */}
        <div className="bg-petal-cream-2 border border-petal-rule rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-petal-rose-deep" strokeWidth={1.5} />
            <span className="font-body text-xs text-petal-ink">不知道怎麼開頭？從範本開始</span>
            <SampleTag />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['謝謝你今天…', '我需要一點空間', '今天想被抱抱'].map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-full border border-petal-rule bg-petal-cream text-petal-ink-soft font-body text-[11px] px-2.5 py-1"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
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
          <div className="flex items-center gap-1.5 mt-1.5">
            <ParticipantAvatar size="xs" name="小晴" colorKey="小晴" />
            <span className="font-body text-[11px] text-petal-muted">小晴</span>
          </div>
          {/* 情緒翻譯不是發言者，是掛在上面那句話底下的註解 —— 所以沒有填色，
              只有一條虛線把它接回原句（同 MessageTranslationCard）。 */}
          <div className="mt-1.5 border-l-2 border-dashed border-petal-rose-deep/35 pl-3 py-0.5">
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
        <SampleCard>
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-petal-cream-2 text-petal-ink-soft font-body text-[9px] uppercase tracking-[0.1em]">
              <Lock className="w-2.5 h-2.5 mr-0.5" strokeWidth={1.5} />
              只有我看得到
            </span>
            <ParticipantAvatar size="xs" name="小宇" colorKey="小宇" />
            <span className="font-body text-xs text-petal-ink">小宇</span>
            {/* custom mood tag (自訂輸入) */}
            <span className="font-body text-[11px] text-petal-muted">· 加班中</span>
            <SampleTag />
          </div>
          {/* Wall posts now render Markdown — show bold + a list in the sample. */}
          <MarkdownContent
            content={'今天的約會**超棒** 📷\n\n- 一起去看了海\n- 吃了想吃很久的那家餐廳'}
            className="font-body text-sm text-petal-ink"
          />
          {/* Photo shown at its own aspect ratio (no forced crop / heavy border). */}
          <div className="mt-2 rounded-md border border-petal-rule bg-petal-cream-2 overflow-hidden">
            <img
              src="/images/roleplay/reunion-love.png"
              alt="範例貼文照片"
              loading="lazy"
              className="w-full h-auto max-h-56 object-contain"
            />
          </div>
        </SampleCard>
      </div>
    ),
  },
  // 心理諮商 tab: leads with the Therapy Companion positioning — Twogether sits
  // beside therapists, not against them. Static sample of the "between-sessions"
  // loop + the honest "not a substitute" note (src/content/positioning.ts).
  therapists: {
    icon: HeartHandshake,
    eyebrow: '心理諮商 · 延伸，而非取代',
    title: (
      <>
        把心理師教的方法，<em className="not-italic font-light italic text-pink-600">帶回每一天</em>
      </>
    ),
    description:
      `${POSITIONING_ONE_LINER}${POSITIONING_SUBLINE}記錄事件、練習溝通、修復連結，下次進諮商室不用再花 30 分鐘回想發生了什麼；卡住時也能預約真人諮商師。`,
    sample: (
      <div className="space-y-4">
        <SampleCard>
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
              <HeartHandshake className="w-3.5 h-3.5 text-petal-rose-deep" />
              一週諮商一次，剩下的 167 小時交給練習
            </span>
            <SampleTag />
          </div>
          <ol className="space-y-2.5">
            {[
              { n: '1', t: '好好說（事件記錄）', d: '把這週發生的事寫下來，下次諮商不用再花 30 分鐘回想。' },
              { n: '2', t: 'AI 示範引導', d: '不是給答案，而是示範心理師可能會怎麼帶你們一步步練習。' },
              { n: '3', t: '諮商摘要', d: '把最近兩週整理成一份摘要，帶進諮商室更快進入重點。舊摘要會保存下來，隨時點開回顧，不用重新產生、不扣 AI 次數。' },
              { n: '4', t: '預約真人諮商師', d: '真的卡住了，挑一位受過專業訓練的人好好談。' },
            ].map((s) => (
              <li key={s.n} className="flex items-start gap-3 text-left">
                <span className="shrink-0 w-6 h-6 rounded-full bg-petal-cream-2 text-pink-600 font-body text-xs flex items-center justify-center">
                  {s.n}
                </span>
                <div className="min-w-0">
                  <div className="font-body text-sm font-medium text-petal-ink">{s.t}</div>
                  <div className="font-body text-xs text-petal-muted leading-relaxed">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>
        </SampleCard>

        {/* 專屬心理師 — a couple can grant one approved therapist read (and
            optionally comment) access to their wall + 好好說話, private items
            excluded. */}
        <SampleCard>
          <div className="flex items-center justify-between mb-2">
            <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-pink-500" />
              專屬心理師
            </span>
            <SampleTag />
          </div>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
            把一位諮商師設為你們的<strong className="text-petal-ink">專屬心理師</strong>，
            他就能唯讀檢視你們的<strong className="text-petal-ink">牆</strong>與
            <strong className="text-petal-ink">好好說話</strong>，更了解你們的關係脈絡。
          </p>
          <ul className="mt-2.5 space-y-1.5 font-body text-xs text-petal-muted">
            <li className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-petal-sage-deep" /> 私密內容不會被看到</li>
            <li className="flex items-center gap-1.5"><MessageSquare className="w-3 h-3 text-pink-500" /> 可選擇是否開放心理師留言</li>
            <li className="flex items-center gap-1.5"><HeartHandshake className="w-3 h-3 text-pink-500" /> 隨時可以解除</li>
          </ul>
        </SampleCard>

        <p className="font-body text-xs text-petal-muted leading-relaxed text-center px-2">
          {NOT_A_SUBSTITUTE}
        </p>
      </div>
    ),
  },
  // 今天：the dashboard tab. Previews the "single most-urgent nudge" idea
  // (the real RelationshipDashboard) rather than a data-heavy sample.
  home: {
    icon: Sparkles,
    eyebrow: '今天',
    title: (
      <>
        今天，最值得做的<em className="not-italic font-light italic text-pink-600">一件事</em>
      </>
    ),
    description:
      '不是所有資料的總覽，而是「現在你們最需要知道什麼」：一個最急的提醒、AI 發現的溝通模式、還有最近發生了什麼，一次只給一件事，不會同時塞一堆通知給你。',
    sample: (
      <div className="space-y-2.5">
        <SampleCard>
          <div className="flex items-center justify-between mb-1">
            <span className="font-body text-xs text-petal-muted">💗 已經 5 天沒有親密了</span>
            <SampleTag />
          </div>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">找個時間靠近一下，重新連結彼此。</p>
        </SampleCard>
        <SampleCard>
          <div className="flex items-center justify-between mb-1">
            <span className="font-body text-xs text-petal-muted">💡 Twogether 發現</span>
            <SampleTag />
          </div>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">你們最近幾次衝突，都和同一件事有關。</p>
        </SampleCard>
      </div>
    ),
  },
  // 成長：stats + AI pattern + milestones.
  grow: {
    icon: TrendingUp,
    eyebrow: '成長',
    title: (
      <>
        你們有沒有<em className="not-italic font-light italic text-pink-600">變得更好</em>
      </>
    ),
    description:
      '統計數字、AI 讀過你們最近的對話後觀察到的反覆溝通模式，還有一起達成的里程碑——記錄不是目的，看見自己在變好才是。',
    sample: (
      <SampleCard>
        <div className="flex items-center justify-between mb-3">
          <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-petal-sage-deep" />
            本月
          </span>
          <SampleTag />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="font-display italic text-lg text-petal-ink">12</div>
            <div className="font-body text-[11px] text-petal-muted">深度對話</div>
          </div>
          <div>
            <div className="font-display italic text-lg text-petal-ink">8</div>
            <div className="font-body text-[11px] text-petal-muted">成功理解</div>
          </div>
          <div>
            <div className="font-display italic text-lg text-petal-ink">4</div>
            <div className="font-body text-[11px] text-petal-muted">修復衝突</div>
          </div>
        </div>
      </SampleCard>
    ),
  },
};

// Small "explore more" links shown under some previews, letting a logged-out
// visitor reach a dedicated real/bespoke preview that's no longer its own
// bottom-nav tab (roleplay/therapists nest inside 對話, wall/journey inside
// 我們, stories inside 成長).
// The testids intentionally match the authenticated entry cards
// (TalkEntryCards / UsEntryCards / GrowView), so "the way into 真實故事 from
// 成長" is one addressable thing whether you're signed in or not.
const ExploreLinks: React.FC<{ view: string; onNavigate?: (view: string) => void }> = ({ view, onNavigate }) => {
  if (!onNavigate) return null;
  const links: { label: string; target: string; testId: string }[] =
    view === 'talk' || view === 'communicate' ? [
      { label: '看看角色扮演', target: 'roleplay', testId: 'talk-roleplay-entry' },
      { label: '看看心理諮商', target: 'therapists', testId: 'talk-therapists-entry' },
    ] :
    view === 'us' || view === 'record' ? [
      { label: '看看我們的牆', target: 'wall', testId: 'us-wall-entry' },
    ] :
    view === 'grow' ? [
      { label: '看看真實故事', target: 'stories', testId: 'grow-stories-entry' },
    ] : [];
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mb-6">
      {links.map((l) => (
        <button
          key={l.target}
          type="button"
          onClick={() => onNavigate(l.target)}
          data-testid={l.testId}
          className="font-body text-xs text-petal-muted hover:text-petal-ink underline underline-offset-2"
        >
          {l.label} →
        </button>
      ))}
    </div>
  );
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
const LoggedOutPreview: React.FC<LoggedOutPreviewProps> = ({ view, onSignUp, scripts = [], onNavigate }) => {
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
  // heart of the product and covers both sub-tabs' value. 對話/我們 are the new
  // 4-tab IA's ids — they reuse the same underlying preview content.
  const config =
    view === 'communicate' || view === 'talk' ? PREVIEWS.events :
    view === 'us' ? PREVIEWS.record :
    PREVIEWS[view];

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
          <p className="font-display italic font-light text-base text-petal-ink-soft mb-2 leading-relaxed">
            {POSITIONING_ONE_LINER}
          </p>
          <p className="font-display italic font-light text-base text-petal-muted mb-8">
            {POSITIONING_SUBLINE}
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

      <ExploreLinks view={view} onNavigate={onNavigate} />

      {/* Sign-up CTA */}
      <SignUpCta onSignUp={onSignUp} />
    </div>
  );
};

// A small read-only "冰山" visual for the iceberg principle: the spoken words
// sit above a waterline, the real feelings/needs below it. Pure CSS, no image
// (so nothing to crop). Marked 範例.
const IcebergVisual: React.FC = () => (
  <div className="rounded-md border border-petal-rule bg-petal-cream overflow-hidden">
    <div className="px-3 py-2 bg-white">
      <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-0.5">
        說出口的
      </div>
      <p className="font-body text-sm text-petal-ink">「你都不在乎。」</p>
    </div>
    <div className="flex items-center gap-2 px-3 py-1 bg-petal-cream-2 border-y border-petal-rule">
      <span className="h-px flex-1 bg-petal-rose-deep/40" />
      <span className="font-body text-[10px] text-petal-rose-deep">水面下</span>
      <span className="h-px flex-1 bg-petal-rose-deep/40" />
    </div>
    <div className="px-3 py-2 bg-petal-rose-soft/20">
      <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-0.5">
        底下真正想說的
      </div>
      <p className="font-body text-sm text-petal-ink">「我需要被重視。」</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-[11px] px-2 py-0.5">
          需要被重視
        </span>
        <span className="inline-flex items-center rounded-full border border-petal-rule text-petal-muted font-body text-[11px] px-2 py-0.5">
          不安
        </span>
      </div>
    </div>
  </div>
);

// A tiny read-only "溝通模式" loop for the pattern principle.
const PatternLoopVisual: React.FC = () => (
  <div className="rounded-md border border-petal-rule bg-petal-cream px-3 py-2.5">
    <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-1.5">
      你們反覆卡住的循環
    </div>
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-body text-[13px] text-petal-ink">
      <span className="rounded-full bg-white border border-petal-rule px-2 py-0.5">追問</span>
      <span className="text-petal-rose-deep">→</span>
      <span className="rounded-full bg-white border border-petal-rule px-2 py-0.5">退縮</span>
      <span className="text-petal-rose-deep">→</span>
      <span className="rounded-full bg-white border border-petal-rule px-2 py-0.5">追得更急</span>
      <span className="text-petal-rose-deep">→</span>
      <span className="rounded-full bg-white border border-petal-rule px-2 py-0.5">更加沉默</span>
    </div>
    <p className="mt-1.5 font-body text-[11px] text-petal-rose-deep">看見它，才有機會不再重複它。</p>
  </div>
);

// A tiny read-only "書寫" before/after for the writing principle.
const WritingVisual: React.FC = () => (
  <div className="rounded-md border border-petal-rule bg-petal-cream overflow-hidden">
    <div className="px-3 py-2">
      <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-0.5">
        你寫下的（只有你看得到）
      </div>
      <p className="font-body text-sm text-petal-ink">「你每次都這樣，很煩耶。」</p>
    </div>
    <div className="px-3 py-2 bg-petal-sage/15 border-t border-petal-rule">
      <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">
        AI 整理成對方聽得進去的版本
      </div>
      <p className="font-body text-sm text-petal-ink">「這件事一直重複發生，我有點累了，想跟你一起想個辦法。」</p>
      <div className="font-body text-[10px] text-petal-muted mt-1">✎ 送出前都可以再改</div>
    </div>
  </div>
);

const PRINCIPLE_VISUALS: Record<string, React.FC> = {
  iceberg: IcebergVisual,
  pattern: PatternLoopVisual,
  writing: WritingVisual,
};

/**
 * The three communication principles (設計理念), shown to logged-out visitors on
 * every tab so they can anticipate HOW Twogether helps them talk, and recognise
 * their own struggle before signing up. Copy source: communicationPrinciples.ts
 * (same source as HelpView + README). Static read-only samples marked 範例.
 */
export const CommunicationPrinciples: React.FC<{ onSignUp: () => void }> = ({ onSignUp }) => {
  // R5 量測：記錄未登入訪客看到三原則區塊的曝光（一次）。
  useEffect(() => {
    trackAction('onboarding.principles.showroom_view');
  }, []);
  return (
  <section
    className="max-w-md mx-auto px-4 py-10 border-t border-petal-rule mt-8"
    data-testid="communication-principles"
  >
    <div className="text-center mb-6">
      <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
        — 我們怎麼幫你溝通
      </div>
      <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight text-petal-ink leading-[1.15]">
        三個貫穿整個 App 的<em className="not-italic font-light italic text-pink-600">溝通原則</em>
      </h2>
      <p className="font-body text-sm text-petal-ink-soft mt-2 max-w-sm mx-auto">
        如果你也有下面這些困境，Twogether 就是為你們設計的。
      </p>
    </div>
    <div className="space-y-5">
      {COMMUNICATION_PRINCIPLES.map((p) => {
        const Icon = p.icon;
        const Visual = PRINCIPLE_VISUALS[p.id];
        return (
          <div
            key={p.id}
            data-testid={`principle-${p.id}`}
            className="bg-petal-cream border border-petal-rule rounded-2xl p-4 shadow-petal/40"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-petal-cream-2 text-petal-rose-deep">
                <Icon className="w-4 h-4" strokeWidth={1.5} />
              </span>
              <span className="font-display italic text-lg text-petal-ink flex-1 leading-tight">
                {p.title}
              </span>
              <span className="font-body text-[10px] uppercase tracking-[0.16em] text-petal-rose-deep border border-petal-rose-soft bg-petal-rose-soft/20 rounded-full px-2 py-0.5">
                {p.conceptTag}
              </span>
            </div>
            <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
              <span className="text-petal-muted">如果你也常常：</span>
              {p.struggle}
            </p>
            <p className="font-body text-sm text-petal-ink leading-relaxed mt-1.5 mb-2">{p.help}</p>
            {Visual && (
              <div>
                <div className="flex justify-end mb-1">
                  <SampleTag />
                </div>
                <Visual />
              </div>
            )}
          </div>
        );
      })}
    </div>
    <div className="mt-8">
      <SignUpCta onSignUp={onSignUp} />
    </div>
  </section>
  );
};

export default LoggedOutPreview;
