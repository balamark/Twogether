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
  Library,
  NotebookPen,
  Gauge,
  ClipboardCheck,
  ClipboardList,
  Crown,
  Check,
  Lock,
  Bell,
  ShieldCheck,
  MessageSquare,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Send,
  Globe,
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
import { getCommunicationPrinciples } from '../content/communicationPrinciples';
import { getLocale } from '../i18n/tr';
import { trackAction } from '../utils/track';
import { PairingInviteShare } from './PairingInviteShare';
import PairingReminderBanner from './PairingReminderBanner';
import { tr } from '../i18n/tr';
import { useAlternativePlanSamples } from '../data/alternativePlanSamples';
import { ReceiptDocument } from './PurchaseReceipts';

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
export const SampleTag: React.FC = () => (
  <span className="font-body text-[10px] font-medium uppercase tracking-[0.16em] text-petal-muted border border-petal-rule rounded-full px-2 py-0.5">
    {tr('範例', 'Example')}
  </span>
);

const SampleCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-petal-cream border border-petal-rule rounded-md px-4 py-3 text-left shadow-petal/40">
    {children}
  </div>
);

// Read-only 專屬諮商空間 sample: the shared couple + therapist thread, a
// message pinned into 下次要談, and the session page's checklist + notes.
// Static 範例 data only.
const DedicatedSpaceSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-2">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <MessageCircle className="w-3.5 h-3.5 text-pink-500" />
        {tr('專屬諮商：訊息 + 諮商頁', 'Dedicated counseling: messages + session page')}
      </span>
      <SampleTag />
    </div>
    <div className="space-y-1.5">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-petal-cream-2 border border-petal-rule-soft px-3 py-1.5">
          <p className="font-body text-xs text-petal-ink">{tr('這週又為了家事分工吵架，想下次談談怎麼分配。', 'We argued about chores again. I\'d like to talk about splitting them next time.')}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-petal-sage/15 px-1.5 font-body text-[10px] text-petal-sage-deep">📌 {tr('已排進下次要談', 'In "Next time"')}</span>
        </div>
      </div>
      <div className="flex justify-center">
        <div className="w-full rounded-lg bg-petal-cream-2 border border-petal-rule px-3 py-1.5">
          <span className="font-body text-[10px] text-petal-muted">🩺 {tr('林心理師（心理師）', 'Dr. Lin (therapist)')}</span>
          <p className="font-body text-xs text-petal-ink">{tr('謝謝分享，我們下次就從這裡開始。這週可以先各自記下一次「覺得不公平」的時刻。', 'Thanks for sharing; we\'ll start there next time. This week, each of you note one moment that felt unfair.')}</p>
        </div>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div className="rounded-md border border-petal-rule bg-white px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-pink-600 mb-1">{tr('這次要談', 'To talk about')}</div>
        <ul className="space-y-1 font-body text-xs">
          <li className="flex items-center gap-1.5 text-petal-muted line-through"><Check className="w-3 h-3 text-petal-sage-deep" /> {tr('家事分工', 'Splitting chores')}</li>
          <li className="flex items-center gap-1.5 text-petal-ink"><span className="w-3 h-3 rounded-sm border border-petal-rule" /> {tr('週末要不要回老家', 'Visiting family on weekends')}</li>
        </ul>
      </div>
      <div className="rounded-md border border-petal-rule bg-white px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-1">{tr('本次摘要', 'Session notes')}</div>
        <p className="font-body text-xs text-petal-ink-soft leading-relaxed whitespace-pre-line">{tr('• 家事不是誰做得多，而是「有沒有被看見」\n• 回家練習：每天說一次謝謝', '• Chores aren\'t about who does more, but feeling seen\n• Homework: say thank you once a day')}</p>
      </div>
    </div>
  </SampleCard>
);

// Read-only「通知中心」sample: every action your partner takes shows up here, so
// you always know what TA just did (愛的記錄、劇本、禮物、婚姻健檢…). Static 範例 data.
const NotificationCenterSample: React.FC = () => {
  const rows = [
    { emoji: '💝', title: tr('小晴新增了一則愛的記錄', 'Ching added a love record'), body: tr('昨晚的約會好浪漫', 'Last night\'s date was so romantic'), dot: 'bg-blue-500', unread: true },
    { emoji: '🎁', title: tr('小晴新增了一個客製禮物', 'Ching added a custom gift'), body: tr('🎁 一起看電影的夜晚', '🎁 A movie night together'), dot: 'bg-blue-500', unread: true },
    { emoji: '💑', title: tr('小晴發起了一次婚姻健檢', 'Ching started a relationship check-in'), body: tr('打開 App 一起完成健檢', 'Open the app to finish the check-in together'), dot: 'bg-yellow-500', unread: false },
  ];
  return (
    <div className="rounded-md border border-petal-rule bg-petal-cream overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-petal-rule bg-petal-cream-2">
        <div className="flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
          <span className="font-body text-xs font-medium text-petal-ink">{tr('通知中心', 'Notifications')}</span>
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
          <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-1">{tr('本週次數', 'This week')}</div>
          <div className="font-display italic font-light text-2xl text-petal-rose-deep">0</div>
        </div>
        <div className="bg-petal-cream border border-petal-rule rounded-md p-3">
          <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-1">{tr('本月次數', 'This month')}</div>
          <div className="font-display italic font-light text-2xl text-petal-sage-deep">1</div>
        </div>
        <div className="bg-petal-rose-soft/40 border border-petal-rose-soft rounded-md p-3 col-span-2">
          <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-1">{tr('已經幾天沒有親密了', 'Days since last intimacy')}</div>
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
            {tr('讓 Twogether 溫柔提醒另一半', 'Let Twogether gently remind your partner')}
          </span>
          <SampleTag />
        </div>
        <ul className="space-y-1.5">
          {[
            { label: tr('🫶 鼓勵連結', '🫶 Encourage connection'), text: tr('已經 16 天沒有記錄親密時光。一個擁抱、一場散步，或一段沒有打擾的聊天，都能讓彼此更靠近。', 'It\'s been 16 days since you recorded an intimate moment. A hug, a walk, or an uninterrupted chat can all bring you closer.'), recommended: true },
            { label: tr('🎮 遊戲任務', '🎮 Game quest'), text: tr('新任務解鎖：已經 16 天沒有親密紀錄！完成條件：一起度過 30 分鐘不看手機的時光。🏆', 'New quest unlocked: 16 days without an intimate moment! Goal: spend 30 phone-free minutes together. 🏆'), recommended: false },
            { label: tr('🌿 不只談性', '🌿 Not just about sex'), text: tr('已經有 16 天沒有記錄親密時光了。親密不一定只有性愛，也可以是一個擁抱、一句關心，或一起度過的一段時光。', 'It\'s been 16 days since you recorded an intimate moment. Intimacy isn\'t only sex; it can be a hug, a caring word, or time spent together.'), recommended: false },
          ].map((s, i) => (
            <li key={i} className={`bg-white rounded-md border p-2 ${s.recommended ? 'border-petal-rose-deep' : 'border-petal-rule'}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-body text-[9px] uppercase tracking-[0.12em] text-petal-rose-deep">{s.label}</span>
                {s.recommended && (
                  <span className="font-body text-[9px] px-1 py-0.5 rounded-full bg-petal-rose-soft/60 text-petal-rose-deep">{tr('推薦', 'Recommended')}</span>
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
      date: tr('6月28日', 'Jun 28'), mood: '😊', note: tr('一起看了場電影', 'Watched a movie together'), gap: 5,
      response: { who: tr('小美', 'May'), text: tr('那天真的好放鬆', 'That day was so relaxing') } as { who: string; text: string } | null,
    },
    { date: tr('6月23日', 'Jun 23'), mood: '🥰', note: tr('週末小旅行', 'Weekend getaway'), gap: 12, response: null },
    { date: tr('6月11日', 'Jun 11'), mood: '😌', note: null as string | null, gap: null as number | null, response: null },
  ];
  // Static mirror of MOMENT_REACTIONS (src/components/MomentResponseBar.tsx).
  const chips = [tr('愛你', 'Love you'), tr('意猶未盡', 'Can\'t get enough'), tr('想再抱一次', 'Want another hug'), tr('很難忘', 'Unforgettable')];
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display italic text-base text-petal-ink">{tr('親密記錄', 'Intimacy records')}</span>
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
                  <span className="text-petal-rose-deep"> {tr('· 距上次相隔', '·  ')} {r.gap} {tr('天', ' days since the last')}</span>
                )}
              </div>
              {r.note && (
                <p className="font-body text-[13px] text-petal-ink leading-snug mt-0.5">{r.note}</p>
              )}
              {r.response && (
                <div className="mt-2 inline-flex items-baseline gap-1.5 rounded-full bg-petal-rose-soft/50 px-2.5 py-1 max-w-full">
                  <span className="font-body text-[11px] text-petal-rose-deep truncate">
                    {r.response.who}{tr('：', ': ')}{r.response.text}
                  </span>
                </div>
              )}
              {i === 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {chips.map((label, ci) => (
                    <span
                      key={label}
                      className={`font-body text-[11px] px-2.5 py-1 rounded-full border ${
                        ci === 0
                          ? 'bg-petal-rose-deep border-petal-rose-deep text-white font-medium'
                          : 'bg-white border-petal-rule text-petal-ink-soft'
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
          <span className="font-display italic text-base text-petal-ink">{tr('你們的節奏', 'Your rhythm')}</span>
          <p className="font-body text-[11px] text-petal-muted mt-0.5">{tr('點月曆任一天新增或查看紀錄', 'Tap any day on the calendar to add or view a record')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-petal-ink text-petal-cream rounded-md font-display italic text-xs">
            {tr('＋ 記錄今天', '+ Record today')}
          </span>
          <SampleTag />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {[tr('日', 'Sun'), tr('一', 'Mon'), tr('二', 'Tue'), tr('三', 'Wed'), tr('四', 'Thu'), tr('五', 'Fri'), tr('六', 'Sat')].map((d) => (
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
          <span className="text-[11px] leading-none text-pink-500">♥</span> {tr('親密時光', 'Intimate moment')}
        </span>
        <span className="flex items-center gap-1 font-body text-[11px] text-petal-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-petal-rose-deep" /> {tr('生理期', 'Period')}
        </span>
      </div>
    </div>
  );
};

// The 衝突事件 "repair flywheel" — the heart of the product. Four connected
// steps, escalating to an AI / human counselor when the couple gets stuck.
const FLYWHEEL: { icon: LucideIcon; step: string; title: string; desc: string }[] = [
  { icon: Pencil, step: '1', title: tr('記錄衝突', 'Record a conflict'), desc: tr('把這次的經過與委屈寫下來，當下不必急著送出。', 'Write down what happened and what hurt. No need to send it right away.') },
  { icon: TrendingUp, step: '2', title: tr('分析走勢', 'See the trends'), desc: tr('看見過往衝突大多來自哪些原因，掌握你們的相處模式。', 'See what your past conflicts usually came from, and understand how you two relate.') },
  { icon: Sparkles, step: '3', title: tr('學習開口', 'Learn how to speak up'), desc: tr('AI 幫你把話說得更中性、更容易和好。', 'AI helps you say it more neutrally, so it\'s easier to make up.') },
  { icon: HeartHandshake, step: '4', title: tr('請諮商師協助', 'Get a counselor\'s help'), desc: tr('真的卡住了，你挑選的 AI 諮商師（Luma、Sophie、Kai⋯共 9 位個性不同的陪伴者）陪你聊，或預約真人諮商師。', 'When you\'re truly stuck, the AI counselor you chose (Luma, Sophie, Kai… 9 companions with different personalities) talks with you, or book a real counselor.') },
];

// Sample "過往衝突主因" mini-analysis shown read-only in the preview.
const CAUSE_BARS: { label: string; pct: number }[] = [
  { label: tr('家務分配', 'Chores'), pct: 45 },
  { label: tr('溝通方式', 'Communication'), pct: 30 },
  { label: tr('作息差異', 'Different schedules'), pct: 25 },
];

// The new "情緒接住" lead — a three-beat example of the emotion-acceptance flow:
// one partner writes a feeling, AI softens it, the other receives an AI-suggested
// way to "catch" it. Shown read-only to logged-out visitors.
const EmotionAcceptanceSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <HandHeart className="w-3.5 h-3.5 text-petal-rose-deep" />
        {tr('先接住情緒，溝通才開始', 'Feelings need to be held before communication can begin')}
      </span>
      <SampleTag />
    </div>
    <div className="space-y-2.5">
      <div className="rounded-md bg-petal-cream-2 px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-1">{tr('① 小晴寫下情緒', '① Ching writes down her feelings')}</div>
        <p className="font-body text-sm text-petal-ink">{tr('「你又忘記了，我覺得自己一點都不重要。」', '"You forgot again. I feel like I don\'t matter at all."')}</p>
      </div>
      <div className="rounded-md bg-white border border-petal-rule px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-1">{tr('② AI 整理對話＋翻成不傷人的話', '② AI summarizes + translates it into words that don\'t hurt')}</div>
        <div className="rounded bg-petal-cream-2 px-2 py-1.5 mb-1.5">
          <div className="font-body text-[10px] text-petal-muted">{tr('對話簡介（中性紀錄）', 'Conversation summary (neutral record)')}</div>
          <p className="font-body text-xs text-petal-ink-soft">{tr('兩人約好的紀念日晚餐，其中一方因加班忘記赴約。', 'The two had planned an anniversary dinner, and one forgot to show up because of overtime.')}</p>
        </div>
        <p className="font-body text-sm text-petal-ink">{tr('「當約定被忘記時，我會覺得失落，因為我很在乎我們的相處。」', '"When a plan is forgotten, I feel let down, because I really care about our time together."')}</p>
        <div className="font-body text-[10px] text-petal-muted mt-1">{tr('✎ 送出前後都可以再修改', '✎ You can edit before and after sending')}</div>
      </div>
      <div className="rounded-md bg-petal-rose-soft/30 border border-petal-rose-soft px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-1">{tr('③ AI 教阿哲怎麼接住', '③ AI shows Jay how to hold it')}</div>
        <p className="font-body text-sm text-petal-ink">{tr('「我聽到你很失落，這對你來說很重要，謝謝你願意告訴我。」', '"I hear that you\'re really let down. This matters a lot to you, and thank you for telling me."')}</p>
      </div>
    </div>
  </SampleCard>
);

// "婚姻檢查" read-only sample — each partner rates a few dimensions, then both
// reveal side-by-side with an AI neutral summary.
const CHECKUP_ROWS: { label: string; a: number; b: number }[] = [
  { label: tr('💬 溝通', '💬 Communication'), a: 4, b: 4 },
  { label: tr('💗 親密', '💗 Intimacy'), a: 2, b: 4 },
  { label: tr('🏠 家務分工', '🏠 Chores'), a: 3, b: 2 },
];

// Sophie 衝突即時介入 read-only sample: the held-message loop — your original
// words are saved (never rewritten), then released alongside Sophie's read of
// the need underneath. Static 範例 data.
const SophieMediatorSample: React.FC = () => (
  <div className="space-y-2.5">
    <div className="flex items-center justify-between">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-petal-rose-deep" strokeWidth={1.5} />
        {tr('Sophie 即時介入', 'Sophie steps in live')}
      </span>
      <SampleTag />
    </div>
    {/* The Conflict Intervention card: translation first, the heated original
        blurred behind a reveal. Static illustration of the real UI. */}
    <SampleCard>
      <div className="font-body text-[11px] font-medium text-petal-rose-deep inline-flex items-center gap-1.5 mb-1">
        <HeartHandshake className="w-3.5 h-3.5" strokeWidth={1.5} />
        {tr('Sophie 協助表達', 'Sophie helped phrase it')}
      </div>
      <p className="font-body text-sm text-petal-ink leading-relaxed">
        {tr('「我現在心裡真的很痛，剛才那件事讓我覺得自己不被尊重，我希望我們可以坐下來好好談。」', '"I\'m really hurting right now. What just happened made me feel disrespected, and I hope we can sit down and talk properly."')}
      </p>
      <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60 font-body text-[11px] font-medium px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />
        {tr('TA需要被尊重', 'They need to feel respected')}
      </span>
      <div className="mt-3 pt-3 border-t border-dashed border-petal-rose-deep/30">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-1">{tr('原本的訊息', 'Original message')}</div>
        <p aria-hidden className="font-body text-sm text-petal-ink/70 leading-relaxed select-none blur-[6px]">
          {tr('你欺人太甚，要離婚就來啊！', 'You\'re impossible. If you want a divorce, just say it!')}
        </p>
        <span className="mt-1.5 inline-flex items-center gap-1 font-body text-xs text-slate-500">
          {tr('查看原本的訊息 ›', 'See the original message ›')}
        </span>
      </div>
    </SampleCard>
  </div>
);

const MarriageCheckupSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <ClipboardCheck className="w-3.5 h-3.5 text-petal-rose-deep" />
        {tr('婚姻檢查・各自打分後一起揭曉', 'Relationship check-in · rate separately, reveal together')}
      </span>
      <SampleTag />
    </div>
    <div className="rounded-md border border-petal-rule overflow-hidden mb-2.5">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 bg-petal-cream-2 text-[10px] font-body text-petal-muted uppercase tracking-wide">
        <span>{tr('面向', 'Area')}</span>
        <span className="w-8 text-center">{tr('你', 'You')}</span>
        <span className="w-8 text-center">{tr('對方', 'Partner')}</span>
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
      <span className="text-petal-sage-deep font-medium">{tr('AI 中立總結：', 'AI neutral summary: ')}</span>
      {tr('你們在「溝通」上感受一致，是你們的基礎；「親密」的落差比較大，這通常就是最值得一起聊的地方。', 'You feel the same about "communication", which is your foundation. The gap is bigger on "intimacy", and that\'s usually the most worthwhile thing to talk about together.')}
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
        {tr('吵完之後，AI 留下一份治療摘要', 'After a fight, AI leaves session notes')}
      </span>
      <SampleTag />
    </div>
    <div className="space-y-2.5">
      <div>
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">{tr('這次最大的觸發點', 'The biggest trigger this time')}</div>
        <p className="font-body text-sm text-petal-ink">{tr('沒有回訊息', 'Not replying to messages')}</p>
      </div>
      <div>
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">{tr('真正的需求', 'The real need')}</div>
        <p className="font-body text-sm text-petal-ink">{tr('小晴 需要', 'Ching needs ')}<span className="text-petal-rose-deep">{tr('安全感', 'safety')}</span>{tr('・阿哲 需要', ' · Jay needs ')}<span className="text-petal-rose-deep">{tr('被信任', 'to be trusted')}</span></p>
      </div>
      <div>
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">{tr('負向循環', 'Negative cycle')}</div>
        <p className="font-body text-xs text-petal-ink-soft">{tr('小晴 追 → 阿哲 逃 → 小晴 追更兇 → 阿哲 更沉默', 'Ching pursues → Jay withdraws → Ching pursues harder → Jay goes quieter')}</p>
      </div>
      <div className="rounded-md bg-petal-rose-soft/30 border border-petal-rose-soft px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-0.5">{tr('下次可以先說', 'Next time, try opening with')}</div>
        <p className="font-body text-sm text-petal-ink">{tr('「我現在不是生氣，我只是有點害怕。」', '"I\'m not angry right now. I\'m just a little scared."')}</p>
      </div>
    </div>
  </SampleCard>
);

// 話題建議 read-only sample: AI proactively suggests topics for the NEXT
// session even without a fresh conflict, plus a always-available 話題庫 for
// starting right away — and a note the couple typed themselves.
const TherapyTopicsSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <Compass className="w-3.5 h-3.5 text-petal-sage-deep" />
        {tr('AI 主動建議下次諮商可以聊的話題', 'AI suggests topics for your next counseling session')}
      </span>
      <SampleTag />
    </div>
    <div className="rounded-md bg-petal-cream-2 px-3 py-2 mb-2.5">
      <p className="font-body text-xs text-petal-ink-soft leading-relaxed">
        {tr('最近很平靜，這是好事——但平靜不代表沒有話題可聊。', 'Things have been calm lately, which is good. But calm doesn\'t mean there\'s nothing to talk about.')}
      </p>
    </div>
    <div className="rounded-md border border-petal-rule bg-white px-3 py-2.5 mb-2">
      <div className="font-body text-sm font-medium text-petal-ink">{tr('家務分工的期待落差', 'Different expectations about chores')}</div>
      <p className="font-body text-xs text-petal-ink-soft leading-relaxed mt-0.5">
        {tr('這兩週「家務」出現了 3 次，這通常代表期待落差，很適合找時間聊聊。', '"Chores" came up 3 times in the past two weeks. That usually signals a gap in expectations, and it\'s a good time to talk.')}
      </p>
      <div className="mt-2 rounded-md bg-pink-50 border border-pink-200 px-2.5 py-1.5">
        <div className="font-body text-[10px] uppercase tracking-[0.1em] text-pink-700 mb-0.5">{tr('想延伸聊的點', 'Things to explore further')}</div>
        <p className="font-body text-xs text-petal-ink">{tr('想聊聊假日的家務怎麼分才公平。', 'I\'d like to talk about how to split weekend chores fairly.')}</p>
      </div>
    </div>
    <div className="rounded-md border border-petal-rule bg-white px-3 py-2.5">
      <div className="flex items-center gap-1 mb-0.5">
        <Library className="w-3 h-3 text-petal-sage-deep" />
        <span className="font-body text-[10px] uppercase tracking-[0.1em] text-petal-sage-deep">{tr('話題庫 · 不用等 AI，隨時可以挑一個開始', 'Topic library · no need to wait for AI, pick one any time')}</span>
      </div>
      <div className="font-body text-sm font-medium text-petal-ink">{tr('孩子之外，我們還是伴侶嗎？', 'Beyond the kids, are we still partners?')}</div>
    </div>
  </SampleCard>
);

// Batch 1 一起收尾 read-only sample. Shows the closure summary card as it
// appears after both partners have written — commitments in the
// couple's own words, the shared decision, and the AI's short 見解. Static, no
// fetches, mirrors ClosureSummaryCard layout.
const CloseTogetherSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
        <NotebookPen className="w-3.5 h-3.5 text-petal-sage-deep" />
        {tr('一起收尾：各自寫下「下次我願意做的一件小事」', 'Wrap up together: each write one small thing you\'re willing to do next time')}
      </span>
      <SampleTag />
    </div>
    <div className="space-y-2">
      <div className="bg-petal-cream-2 border border-petal-rule rounded-xl p-2.5">
        <div className="font-body text-[11px] text-petal-muted mb-0.5">{tr('小晴的約定', 'Ching\'s commitment')}</div>
        <div className="font-body text-sm text-petal-ink">{tr('即使很生氣，也不在孩子面前說你', 'Even when I\'m angry, I won\'t criticize you in front of the kids')}</div>
      </div>
      <div className="bg-petal-cream-2 border border-petal-rule rounded-xl p-2.5">
        <div className="font-body text-[11px] text-petal-muted mb-0.5">{tr('阿哲的約定', 'Jay\'s commitment')}</div>
        <div className="font-body text-sm text-petal-ink">{tr('要動孩子之前，我會先問你一聲', 'Before moving the kids, I\'ll check with you first')}</div>
      </div>
      <div className="bg-petal-cream-2 border border-petal-rule rounded-xl p-2.5">
        <div className="font-body text-[11px] text-petal-muted mb-0.5">{tr('我們一起決定', 'We decided together')}</div>
        <div className="font-body text-sm text-petal-ink">{tr('孩子睡著後若沒有立即危險，就不移動', 'If there\'s no immediate danger, we don\'t move the kids once they\'re asleep')}</div>
      </div>
      <div className="rounded-md bg-petal-sage/15 border border-petal-sage/40 px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">{tr('小小的觀察', 'A small observation')}</div>
        <p className="font-body text-sm text-petal-ink">{tr('你們都選擇「當著孩子面的克制」，聽起來共同關心的是孩子看到的畫面。', 'You both chose "holding back in front of the kids". It sounds like what you both care about is what the kids see.')}</p>
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
        <p className="font-body text-sm font-medium text-orange-900">{tr('先暫停一下', 'Let\'s pause for a moment')}</p>
        <SampleTag />
      </div>
      <p className="font-body text-[13px] leading-relaxed mt-0.5 text-orange-900/90">
        {tr('我注意到你們現在比較像是在保護自己，而不是理解彼此。要不要先暫停十分鐘、深呼吸一下， 等平靜一點再繼續？', 'It looks like you\'re both protecting yourselves more than trying to understand each other right now. How about a ten-minute break and a few deep breaths, then continue once you\'re calmer?')}
      </p>
    </div>
  </div>
);

// Per-message emotion meter read-only sample: before a charged reply is sent,
// AI shows the emotions, how the partner may mishear it vs the real worry, the
// need, and a rewrite.
const EmotionMeterSample: React.FC = () => {
  const bars = [
    { emoji: '😢', label: tr('傷心', 'Sad'), pct: 70 },
    { emoji: '😰', label: tr('焦慮', 'Anxious'), pct: 80 },
    { emoji: '😠', label: tr('生氣', 'Angry'), pct: 50 },
  ];
  return (
    <SampleCard>
      <div className="flex items-center justify-between mb-3">
        <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-petal-rose-deep" />
          {tr('送出前，先看看這句話', 'Before sending, take a look at this')}
        </span>
        <SampleTag />
      </div>
      <div className="rounded-md bg-petal-cream-2 px-3 py-2 mb-2.5">
        <p className="font-body text-sm text-petal-ink">{tr('你到底要不要回家？', 'Are you coming home or not?')}</p>
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
        <p><span className="text-red-500 mr-1">✕</span>{tr('對方可能聽成：你很爛。', 'They might hear: you\'re terrible.')}</p>
        <p><span className="text-petal-sage-deep mr-1">✓</span>{tr('其實想說：你是不是不要這個家了？', 'What you really mean: do you not want this family anymore?')}</p>
      </div>
      <div className="rounded-md bg-petal-rose-soft/30 border border-petal-rose-soft px-3 py-2">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-0.5">{tr('試著這樣說', 'Try saying it like this')}</div>
        <p className="font-body text-sm text-petal-ink">{tr('「我今天很想你，不知道你今晚會不會回來？」', '"I really missed you today. Will you be home tonight?"')}</p>
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
        {tr('Luma・引導', 'Luma · guide')}
      </span>
      <SampleTag />
    </div>
    <div className="rounded-2xl border border-petal-rule bg-white shadow-sm p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-petal-sage bg-petal-sage/20 text-petal-sage-deep px-2 py-0.5 font-body text-[11px] font-medium">{tr('🪞 鏡映', '🪞 Mirroring')}</span>
        <span className="rounded-full border border-petal-sage bg-petal-sage/20 text-petal-sage-deep px-2 py-0.5 font-body text-[11px] font-medium">{tr('✅ 做到了', '✅ Nailed it')}</span>
      </div>
      <p className="font-body text-sm text-petal-ink leading-relaxed">{tr('我們一次只做一小步。先不要解釋，只重複你聽到的。', 'We\'ll take one small step at a time. Don\'t explain yet; just repeat what you heard.')}</p>
      <div className="rounded-xl border border-petal-rose-deep bg-petal-rose-soft/20 px-3 py-2">
        <div className="font-body text-[11px] font-medium text-petal-rose-deep mb-0.5">{tr('換你了', 'Your turn')}</div>
        <p className="font-body text-sm text-petal-ink">{tr('用「我聽到你說的是…」開頭，說出你聽到的。', 'Start with "What I heard you say is…" and say what you heard.')}</p>
      </div>
    </div>
    <div className="mt-3 rounded-xl border border-petal-rule bg-petal-cream-2 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="font-display italic text-sm text-petal-ink">{tr('今日練習', 'Today\'s practice')}</span>
        <span className="font-body text-xs text-petal-muted">{tr('關係技巧分數', 'Relationship skill score')} <span className="font-display italic text-petal-rose-deep">78%</span></span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 font-body text-xs text-petal-ink">
        <span>{tr('✓ 🎯 情緒標記', '✓ 🎯 Naming feelings')}</span>
        <span>{tr('✓ 🪞 鏡映', '✓ 🪞 Mirroring')}</span>
        <span className="text-petal-muted">{tr('… 🫶 肯定', '… 🫶 Affirmation')}</span>
      </div>
    </div>
  </SampleCard>
);

// 三方對話的空間規則：左邊是對方、右邊是我、中間是諮商師。多人對話難讀的地方不是
// 顏色不夠，而是不知道規則 —— 講一次，之後空間本身就會替我們說話。
const ThreeSeatSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-3">
      <span className="font-body text-xs text-petal-muted">{tr('誰在說話，看位置就知道', 'Who\'s talking? Just look at the position')}</span>
      <SampleTag />
    </div>
    <div className="space-y-2">
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl px-3.5 py-2 bg-white border border-petal-rule">
          <div className="flex items-center gap-1.5 mb-0.5">
            <ParticipantAvatar size="xs" name={tr("小晴", 'Ching')} colorKey={tr("小晴", 'Ching')} />
            <span className="font-body text-[11px] text-petal-muted">{tr('小晴', 'Ching')}</span>
          </div>
          <p className="font-body text-sm text-petal-ink">{tr('我覺得你根本沒有在聽我說話。', 'I feel like you\'re not listening to me at all.')}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl px-3.5 py-2 bg-petal-cream-2 border border-petal-rule-soft">
          <div className="flex items-center gap-1.5 mb-0.5 justify-end">
            <span className="font-body text-[11px] text-petal-muted">{tr('我', 'Me')}</span>
          </div>
          <p className="font-body text-sm text-petal-ink">{tr('我其實有在聽。', 'I am listening, actually.')}</p>
        </div>
      </div>
      <div className="flex justify-center">
        <div className="max-w-[92%] w-full rounded-2xl px-3.5 py-2 bg-petal-rose-soft/25 border border-petal-rose-soft">
          <div className="flex items-center gap-1.5 mb-0.5">
            <ParticipantAvatar size="xs" role="ai" companionId="luma" name="Luma" />
            <span className="font-body text-[11px] font-medium text-petal-rose-deep">{tr('Luma・AI 諮商師', 'Luma · AI counselor')}</span>
          </div>
          <p className="font-body text-sm text-petal-ink">
            {tr('我想在這裡停一下。你們現在都在描述「對方做了什麼」。', 'I\'d like to pause here. You\'re both describing "what the other person did".')}
          </p>
          {/* 每則 AI 回應都能一秒回饋；不通順就按 👎，我們會把它變得更準。範例僅展示。 */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <ThumbsUp className="w-3.5 h-3.5 text-petal-muted" strokeWidth={1.5} />
            <ThumbsDown className="w-3.5 h-3.5 text-petal-muted" strokeWidth={1.5} />
            <span className="font-body text-[10px] text-petal-muted">{tr('這則回應如何？', 'How was this response?')}</span>
          </div>
        </div>
      </div>
    </div>
    <p className="font-body text-[11px] text-petal-muted mt-2.5 leading-relaxed">
      {tr('左邊是對方、右邊是你、中間是 Luma —— 諮商師不站在任何一方，所以坐在你們兩個中間。', 'Your partner is on the left, you\'re on the right, and Luma is in the middle: the counselor doesn\'t take sides, so they sit between you.')}
    </p>
  </SampleCard>
);

// 長文不會被縮成一小段：短摘要給對方一眼看懂，「完整經過」保留原文所有內容。
// 順帶說明私人對話一個人也能繼續寫、找 AI 討論。
const LongDraftSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-2">
      <span className="font-body text-xs text-petal-muted">{tr('寫了很長也不會被縮掉', 'Long messages never get cut off')}</span>
      <SampleTag />
    </div>
    <div className="rounded-md border border-petal-rule bg-white px-3 py-2">
      <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-0.5">
        {tr('事件紀錄（雙方都看得到的中性摘要）', 'Event record (a neutral summary you both see)')}
      </div>
      <p className="font-body text-sm text-petal-ink">{tr('晚餐時，兩人就育兒的分工談到後來沒有結論。', 'At dinner, the two talked about splitting childcare and didn\'t reach a conclusion.')}</p>
    </div>
    <div className="mt-2 rounded-md border border-petal-rule bg-petal-cream-2 px-3 py-2">
      <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-0.5">
        {tr('完整經過 ▾（原文全部保留，只拿掉攻擊性字眼）', 'The full story ▾ (all the original text kept, only hurtful words removed)')}
      </div>
      <p className="font-body text-sm text-petal-ink leading-relaxed">
        {tr('我想把這件事完整說清楚。第一件事是上週三的接送⋯⋯另外，昨天的午睡時間⋯⋯還有我一直沒說出口的是⋯⋯', 'I want to explain this fully. First, the pickup last Wednesday…… Also, yesterday\'s nap time…… And what I\'ve never said is……')}
      </p>
    </div>
    <div className="mt-2 flex items-start gap-1.5 font-body text-[11px] text-petal-muted">
      <Lock className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={1.5} />
      <span>{tr('也可以先存成只有你看得到的私人對話，一個人慢慢補充、先找 AI 討論，想清楚再決定要不要讓另一半看到。', 'You can also save it as a private conversation only you can see: add to it slowly on your own, talk it over with AI first, and decide later whether your partner should see it.')}</span>
    </div>
  </SampleCard>
);

// Read-only sample of the redesigned chat input — the split at the heart of the
// UI overhaul. Public mediation (請 Sophie 加入) lives in the shared thread and
// is clearly marked «兩人都看得到»; private coaching (讓 Sophie 私下幫你想) sits
// on the input box, marked «只有你看得到» and never posts. The only high-contrast
// fill in the whole bar is 送出 — the true primary action.
const PublicPrivateSophieSample: React.FC = () => (
  <SampleCard>
    <div className="flex items-center justify-between mb-2.5">
      <span className="font-body text-xs text-petal-muted">{tr('好好說話・輸入區', 'Talk it through · message box')}</span>
      <SampleTag />
    </div>

    {/* Public mediator — anchored in the shared feed */}
    <div className="flex flex-col items-center gap-1.5 pb-3 mb-3 border-b border-petal-rule-soft">
      <span className="inline-flex items-center gap-2 rounded-full border border-petal-sage-deep/40 bg-petal-sage/15 px-4 py-2 font-body text-sm font-medium text-petal-sage-deep">
        <HeartHandshake className="w-4 h-4" strokeWidth={1.75} />
        {tr('請 Sophie 加入', 'Invite Sophie')}
      </span>
      <span className="inline-flex items-center gap-1 font-body text-[11px] text-petal-muted">
        <Globe className="w-3 h-3" strokeWidth={1.75} />
        {tr('回應會出現在對話裡，兩人都看得到', 'The response appears in the conversation for both of you to see')}
      </span>
    </div>

    {/* Private coach chip + input box */}
    <div className="rounded-2xl border border-petal-rule bg-petal-cream p-2.5 space-y-2">
      <div className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-petal-rule text-petal-ink-soft">
        <span aria-hidden className="text-base leading-none">💡</span>
        <span className="flex-1 min-w-0 font-body text-sm">{tr('不知道怎麼開口？讓 Sophie 私下幫你想', 'Don\'t know how to start? Let Sophie help you privately')}</span>
        <span className="shrink-0 inline-flex items-center gap-1 font-body text-[11px] text-petal-muted">
          <Lock className="w-3 h-3" strokeWidth={1.75} />
          {tr('只有你看得到', 'Only you can see this')}
        </span>
      </div>
      <div className="w-full rounded-xl border border-petal-rule bg-white px-3 py-2 font-body text-sm text-petal-muted">
        {tr('把心裡的話，好好說出來…', 'Say what\'s in your heart, well…')}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-petal-rule-soft pt-2">
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-body text-xs text-petal-ink-soft">
            <Gauge className="w-4 h-4" strokeWidth={1.75} />
            {tr('情緒檢測', 'Emotion check')}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-body text-xs text-petal-ink-soft">
            <Sparkles className="w-4 h-4" strokeWidth={1.75} />
            {tr('緩和語氣', 'Soften the tone')}
          </span>
        </div>
        <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-petal-ink text-petal-cream font-body text-sm font-medium">
          <Send className="w-4 h-4" strokeWidth={1.75} />
          {tr('送出', 'Send')}
        </span>
      </div>
    </div>
  </SampleCard>
);

const ConflictFlywheelSample: React.FC = () => (
  <div className="space-y-4">
    <SafetyBannerSample />

    <ThreeSeatSample />

    <PublicPrivateSophieSample />

    <EmotionMeterSample />

    <TherapistModeSample />

    <EmotionAcceptanceSample />

    <LongDraftSample />

    <TherapyNoteSample />

    <CloseTogetherSample />

    {/* Mini trend analysis */}
    <SampleCard>
      <div className="flex items-center justify-between mb-3">
        <span className="font-body text-xs text-petal-muted">{tr('過往衝突主因（近 90 天）', 'Main causes of past conflicts (last 90 days)')}</span>
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
  { days: 30, amount: 90, perDay: tr('約每天 NT$3', 'About NT$3 a day') },
  { days: 90, amount: 240, perDay: tr('約每天 NT$2.7', 'About NT$2.7 a day'), featured: true },
  { days: 365, amount: 790, perDay: tr('約每天 NT$2.2', 'About NT$2.2 a day') },
];

// Every payment issues a numbered electronic receipt (lib/receipts.js). The
// showroom previews the actual document so visitors can see what they'd get for
// expense claims before signing up. Static sample — no auth'd fetch.
const SAMPLE_RECEIPT = {
  receiptNo: 'TG-20260801-A1B2C3',
  itemLabel: tr('Twogether Premium 90 天', 'Twogether Premium 90 days'),
  amount: 240,
  currency: 'TWD',
  provider: 'newebpay' as const,
  tradeNo: '26080110134567',
  invoiceNo: null,
  buyerEmail: 'sample@twogether.fun',
  buyerName: tr('範例使用者', 'Sample user'),
  buyerTitle: null,
  buyerTaxId: null,
  issuedAt: '2026-08-01T10:13:00+08:00',
  sellerName: tr('Twogether（個人賣家）', 'Twogether (individual seller)'),
  sellerTaxId: null,
  sellerContact: 'support@twogether.fun',
};

const PRICING_PERKS = [
  tr('每日 AI 整理／改寫次數大幅提升', 'Many more AI rewrites and summaries per day'),
  tr('無限建立自訂角色扮演劇本', 'Unlimited custom role-play scripts'),
  tr('無限上傳照片', 'Unlimited photo uploads'),
  tr('購買天數可累加堆疊，已付費時間不流失', 'Days you buy stack up, so paid time is never lost'),
  tr('情侶雙方同步享有，無須各自付費', 'Shared by both partners, no need to pay separately'),
];

// Pairing is the gateway to every shared feature, so the showroom previews it
// too: invite by email, then hand the partner the same link over LINE if the
// mail is slow. Non-interactive here (sample), like every other sample.
const PairingInviteSample: React.FC = () => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="font-body text-xs text-petal-muted">{tr('邀請伴侶加入', 'Invite your partner to join')}</span>
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
      <span className="font-body text-xs text-petal-muted">{tr('未配對時的常駐提醒', 'A standing reminder while you\'re unpaired')}</span>
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
        <span className="font-body text-xs font-medium text-petal-ink">{tr('情緒深潛', 'Emotion deep dive')}</span>
      </div>
      <SampleTag />
    </div>
    <div className="p-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[tr('不被重視', 'Not valued'), tr('孤單', 'Lonely'), tr('委屈', 'Wronged')].map((e) => (
          <span key={e} className="rounded-full bg-white border border-petal-rule px-2.5 py-0.5 font-body text-[11px] text-petal-ink">{e}</span>
        ))}
      </div>
      <SampleCard>
        <p className="font-body text-xs text-petal-ink-soft leading-relaxed">
          {tr('「聽起來，生氣底下還有一種', '"It sounds like beneath the anger there\'s a hurt of ')}<span className="text-petal-ink">{tr('『我的感受沒被重視』', '\'my feelings weren\'t valued\'')}</span>{tr('的委屈。這種感覺，對你來說熟悉嗎？」', '. Does this feeling feel familiar to you?"')}
        </p>
      </SampleCard>
      <div className="flex items-center gap-1 font-body text-[11px] text-petal-muted">
        <Lock className="w-3 h-3" strokeWidth={1.5} />
        {tr('寫給過去的信永遠只留給你自己，只有寫給另一半的信會分享', 'Letters to your past always stay with you alone; only the letter to your partner is shared')}
      </div>
    </div>
  </div>
);

// Read-only 替代方案協商 sample: the invite type plus the two 示範方案 with
// both-partner approval chips. 範例 data only: the admin-managed samples
// (public endpoint, no auth) with the built-in copy as fallback.
const AlternativePlansSample: React.FC = () => {
  const samples = useAlternativePlanSamples();
  return (
  <div className="bg-petal-cream border border-petal-rule rounded-md p-4 text-left space-y-3" data-testid="preview-alt-plans">
    <div className="flex items-center justify-between">
      <span className="font-body text-xs font-medium text-petal-rose-deep">{tr('💬 替代方案協商', '💬 Talk about alternatives')}</span>
      <SampleTag />
    </div>
    <p className="font-body text-xs text-petal-ink-soft leading-relaxed">
      {tr('原本期待的親密暫時無法實現時，一起討論其他雙方都喜歡的方式。接受討論不代表同意任何特定行為；雙方都認可的方案才會加入共同清單。', 'When the intimacy you hoped for can\'t happen right now, talk about other ways you\'d both enjoy. Agreeing to talk never means agreeing to any act; only plans you both approve join your shared list.')}
    </p>
    {samples.map((p, i) => (
      <div key={p.id} className="bg-white rounded-md border border-petal-rule p-3">
        <div className="font-body text-sm font-medium text-petal-ink">{p.title}</div>
        {p.scriptTitle && (
          <div className="font-body text-xs text-petal-rose-deep mt-1">{tr('🎭 劇本《', '🎭 Script “')}{p.scriptTitle}{tr('》', '”')}</div>
        )}
        {p.interaction && <p className="font-body text-xs text-petal-ink-soft leading-snug mt-1">{p.interaction}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="font-body text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">{tr('✓ 你已認可', '✓ You approved')}</span>
          <span className={`font-body text-[10px] px-2 py-0.5 rounded-full ${i === 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {i === 0 ? tr('✓ 另一半已認可', '✓ Partner approved') : tr('另一半待認可', 'Partner to approve')}
          </span>
        </div>
      </div>
    ))}
  </div>
);
};

const PREVIEWS: Record<string, PreviewConfig> = {
  us: {
    icon: Heart,
    eyebrow: tr('我們', 'Us'),
    title: (
      <>
        {tr('愛與成長，', 'Love and growth ')}<em className="not-italic font-light italic text-pink-600">{tr('一樣重要', 'matter equally')}</em>
      </>
    ),
    description:
      tr('我們的關係本身：一邊是「我們正在愛」，留下讓你覺得「還好是你」的時刻；一邊是「我們正在成長」，一起面對需要被理解、被修復的事。愛不是問題的附屬品，成長也不是愛的替代品。', 'Your relationship itself. One side is "we are loving": moments that make you think "glad it\'s you". The other is "we are growing": facing together what needs to be understood and repaired. Love isn\'t an add-on to problems, and growth isn\'t a substitute for love.'),
    sample: (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <SampleTag />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-petal-rose-soft bg-petal-rose-soft/25 p-4 text-left">
            <div className="text-lg mb-1" aria-hidden>❤️</div>
            <div className="font-display text-sm text-petal-ink mb-1">{tr('我們正在愛', 'We are loving')}</div>
            <div className="font-body text-[11px] text-petal-muted leading-relaxed">
              {tr('今天你還喜歡他什麼 · 我看見你 · 他不知道的事 · 重新認識你', 'What do you still love about them today · I see you · Things they don\'t know · Rediscover you')}
            </div>
          </div>
          <div className="rounded-2xl border border-petal-sage/40 bg-petal-sage/10 p-4 text-left">
            <div className="text-lg mb-1" aria-hidden>🌱</div>
            <div className="font-display text-sm text-petal-ink mb-1">{tr('我們正在成長', 'We are growing')}</div>
            <div className="font-body text-[11px] text-petal-muted leading-relaxed">
              {tr('說開一件事 · 情緒檢查 · 專業諮商師', 'Talk it through · Emotion check · Professional counselors')}
            </div>
          </div>
        </div>
        <SampleCard>
          <div className="text-center">
            <div className="text-lg" aria-hidden>❤️</div>
            <div className="font-body text-[10px] uppercase tracking-[0.16em] text-petal-muted">{tr('我們正在愛', 'We are loving')}</div>
            <div className="font-display text-3xl font-light text-petal-rose-deep leading-none my-0.5">10</div>
            <p className="font-body text-[11px] text-petal-ink-soft leading-relaxed">
              {tr('每次留言、記錄美好、化解衝突都', 'Every note, good moment and resolved conflict adds ')} <span className="font-medium text-petal-rose-deep">+1</span>{tr('，美好存款越存越厚。', ', and your savings of good moments keep growing.')}
            </p>
          </div>
        </SampleCard>
        <SampleCard>
          <div className="font-body text-[11px] text-petal-muted mb-1">{tr('💌 我們曾經這樣愛過', '💌 How we once loved')}</div>
          <p className="font-display italic font-light text-sm text-petal-ink leading-relaxed">
            {tr('「還記得第一次注意到他的時候，是他笑起來眼睛會彎的樣子。」', '"I remember the first time I noticed him: the way his eyes curved when he smiled."')}
          </p>
        </SampleCard>
      </div>
    ),
  },
  record: {
    icon: Calendar,
    eyebrow: tr('記錄時光', 'Calendar'),
    title: (
      <>
        {tr('記下你們的', 'Record ')}<em className="not-italic font-light italic text-pink-600">{tr('每一段時光', 'every moment together')}</em>
      </>
    ),
    description:
      tr('看見你們的節奏：親密時光與生理期都在一張月曆上。記下的每段時光都能互相回應——點一下表情，或留一句短短的話。太久沒親密時，App 會溫柔提醒另一半多關心你。另一半的每個操作也會出現在通知中心，讓你隨時知道 TA 做了什麼。', 'See your rhythm: intimate moments and your cycle on one calendar. You can respond to each other\'s moments with a tap of an emoji or a short note. If it\'s been a while, the app gently reminds your partner to check in on you. Your partner\'s actions also appear in your notifications, so you always know what they\'ve done.'),
    sample: (
      <>
        <CalendarMock />
        <div className="mt-4">
          <SampleStats />
        </div>
        <SampleRecordList />
        <div className="mt-4">
          <AlternativePlansSample />
        </div>
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
    eyebrow: tr('接住情緒', 'Hold feelings'),
    title: (
      <>
        {tr('吵架了？AI 幫你', 'Had a fight? AI helps you ')}<em className="not-italic font-light italic text-pink-600">{tr('先開口', 'speak first')}</em>
      </>
    ),
    description:
      tr('說不出口的時候，AI 諮商師幫你寫出不傷和氣的和解開場白；也能定期做「婚姻檢查」，各自打分後一起揭曉，AI 當中立第三方幫你們把話攤開來看。', 'When the words won\'t come, your AI counselor helps you write a make-up opener that keeps the peace. You can also run regular "relationship check-ins": rate separately, reveal together, and let AI act as a neutral third party to lay it all out.'),
    sample: (
      <div className="space-y-4">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-body text-xs text-petal-muted">{tr('AI 和解開場白', 'AI make-up opener')}</span>
            <SampleTag />
          </div>
          <SampleCard>
            <p className="font-display italic font-light text-sm text-petal-ink leading-relaxed">
              {tr('「剛剛那樣讓你不舒服，我很抱歉。我其實很在乎你的感受，可以等你願意的時候，我們再好好聊聊嗎？」', '"I\'m sorry that made you uncomfortable. I really care about how you feel. Could we talk properly whenever you\'re ready?"')}
            </p>
          </SampleCard>
        </div>
        <MarriageCheckupSample />
      </div>
    ),
  },
  events: {
    icon: MessageSquareHeart,
    eyebrow: tr('衝突事件 · 關係修復的核心', 'Conflicts · the heart of repair'),
    title: (
      <>
        {tr('讓每次衝突，成為', 'Make every conflict ')}<em className="not-italic font-light italic text-pink-600">{tr('修復的起點', 'a starting point for repair')}</em>
      </>
    ),
    description:
      tr('這是 Twogether 的核心，也是「用寫的，把話說對」的地方。先讓情緒被接住：一方寫下感受，AI 幫你說得不傷人，另一方收到後 AI 也教他怎麼接住你。被接住了，再一起看你們反覆卡住的溝通模式、學會怎麼說，真的卡住就請 AI 或真人諮商師陪你們。想更深一點，還能走一趟「情緒深潛」，看看現在的痛是不是碰到了心裡更早的感受。', 'This is the heart of Twogether, and the place to "write it, so it comes out right". First, let feelings be held: one of you writes how you feel, AI helps you say it without hurting, and when your partner receives it, AI shows them how to hold your feelings. Once you feel heard, look together at the communication patterns you keep getting stuck in, learn how to say things, and when you\'re truly stuck, have an AI or human counselor help. To go deeper, take an "emotion deep dive" and see whether today\'s pain touches older feelings.'),
    sample: (
      <div className="space-y-3">
        <ConflictFlywheelSample />
        <SophieMediatorSample />
        <DeepDiveSample />
      </div>
    ),
  },
  wall: {
    icon: StickyNote,
    eyebrow: tr('我們的牆', 'Our wall'),
    title: (
      <>
        {tr('留下你們的', 'Leave each other ')}<em className="not-italic font-light italic text-pink-600">{tr('悄悄話', 'quiet notes')}</em>
      </>
    ),
    description: tr('在牆上貼下想對彼此說的話，你選的 AI 諮商師（例如 Luma）也會適時給予溫柔的建議。貼文看得到「TA 已讀」，對方也能一鍵回你一個「抱抱」，不用硬擠出一段話。開啟「情緒翻譯」後，AI 還會把每句指責翻成底層的需求，讓對方聽到的不是攻擊，而是需要。', 'Post what you want to say to each other on the wall, and the AI counselor you chose (like Luma) offers gentle suggestions when it helps. You\'ll see when they\'ve read it, and they can reply with a one-tap "Hug" instead of forcing out a paragraph. Turn on "emotion translation" and AI translates each accusation into the need beneath it, so your partner hears a need, not an attack.'),
    sample: (
      <div className="space-y-2.5">
        {/* 已讀 + 一鍵心意回應 — the answer to 「TA 看了卻什麼都沒說」. */}
        <SampleCard>
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <ParticipantAvatar size="xs" name={tr("小晴", 'Ching')} colorKey={tr("小晴", 'Ching')} />
            <span className="font-body text-xs text-petal-ink">{tr('小晴', 'Ching')}</span>
            <span className="font-body text-[11px] text-petal-muted">{tr('· 想被抱抱', ' · Wants a hug')}</span>
            <SampleTag />
          </div>
          <p className="font-body text-sm text-petal-ink">{tr('今天真的好累，可是又說不上為什麼。', 'Today was so exhausting, and I can\'t even say why.')}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-petal-rose-soft/50 px-3 py-1">
            <span aria-hidden>🫂</span>
            <span className="font-body text-xs text-petal-rose-deep">{tr('小宇給了你一個「抱抱」', 'Yu sent you a "Hug"')}</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-petal-sage-deep">
            <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="font-body text-xs">{tr('已讀 · 3 小時前', 'Read · 3 hours ago')}</span>
          </div>
        </SampleCard>
        {/* 從範本開始 — short starter templates so a blank page never stops you.
            Read-only strip mirroring the composer's template chips. */}
        <div className="bg-petal-cream-2 border border-petal-rule rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-petal-rose-deep" strokeWidth={1.5} />
            <span className="font-body text-xs text-petal-ink">{tr('不知道怎麼開頭？從範本開始', 'Don\'t know how to start? Begin with a template')}</span>
            <SampleTag />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[tr('謝謝你今天…', 'Thank you for today…'), tr('我需要一點空間', 'I need a little space'), tr('今天想被抱抱', 'I want a hug today')].map((t) => (
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
            <span className="font-body text-xs text-petal-ink">{tr('情緒翻譯', 'Emotion translation')}</span>
            <SampleTag />
          </div>
          <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-petal-rose-deep">
            <span className="inline-block h-4 w-4 translate-x-4 rounded-full bg-white" />
          </span>
        </div>
        <SampleCard>
          <p className="font-body text-sm text-petal-ink">{tr('你根本沒有把家庭放第一。', 'You never put our family first.')}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <ParticipantAvatar size="xs" name={tr("小晴", 'Ching')} colorKey={tr("小晴", 'Ching')} />
            <span className="font-body text-[11px] text-petal-muted">{tr('小晴', 'Ching')}</span>
          </div>
          {/* 情緒翻譯不是發言者，是掛在上面那句話底下的註解 —— 所以沒有填色，
              只有一條虛線把它接回原句（同 MessageTranslationCard）。 */}
          <div className="mt-1.5 border-l-2 border-dashed border-petal-rose-deep/35 pl-3 py-0.5">
            <div className="flex items-center gap-1.5 text-petal-rose-deep">
              <HeartHandshake className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="font-body text-[11px] font-medium">{tr('可能真正想表達的是', 'What they may really mean')}</span>
            </div>
            <p className="mt-1 font-body text-sm text-petal-ink leading-relaxed">{tr('「我最近很沒有安全感，希望家庭能被放在更重要的位置。」', '"I\'ve been feeling really insecure lately, and I need our family to feel like a priority."')}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-[11px] px-2 py-0.5">{tr('需要安全感', 'Needs security')}</span>
              <span className="inline-flex items-center rounded-full border border-petal-rule text-petal-muted font-body text-[11px] px-2 py-0.5">{tr('孤單', 'Lonely')}</span>
            </div>
          </div>
        </SampleCard>
        <SampleCard>
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-petal-cream-2 text-petal-ink-soft font-body text-[9px] uppercase tracking-[0.1em]">
              <Lock className="w-2.5 h-2.5 mr-0.5" strokeWidth={1.5} />
              {tr('只有我看得到', 'Only I can see this')}
            </span>
            <ParticipantAvatar size="xs" name={tr("小宇", 'Yu')} colorKey={tr("小宇", 'Yu')} />
            <span className="font-body text-xs text-petal-ink">{tr('小宇', 'Yu')}</span>
            {/* custom mood tag (自訂輸入) */}
            <span className="font-body text-[11px] text-petal-muted">{tr('· 加班中', ' · Working late')}</span>
            <SampleTag />
          </div>
          {/* Wall posts now render Markdown — show bold + a list in the sample. */}
          <MarkdownContent
            content={tr('今天的約會**超棒** 📷\n\n- 一起去看了海\n- 吃了想吃很久的那家餐廳', 'Today\'s date was **amazing** 📷\n\n- Went to see the ocean together\n- Ate at the restaurant we\'d wanted to try for ages')}
            className="font-body text-sm text-petal-ink"
          />
          {/* Photo shown at its own aspect ratio (no forced crop / heavy border). */}
          <div className="mt-2 rounded-md border border-petal-rule bg-petal-cream-2 overflow-hidden">
            <img
              src="/images/roleplay/reunion-love.png"
              alt={tr("範例貼文照片", 'Example post photo')}
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
    eyebrow: tr('心理諮商 · 延伸，而非取代', 'Counseling · an extension, not a replacement'),
    title: (
      <>
        {tr('把心理師教的方法，', 'Bring what your therapist teaches ')}<em className="not-italic font-light italic text-pink-600">{tr('帶回每一天', 'into every day')}</em>
      </>
    ),
    description:
      tr(`${POSITIONING_ONE_LINER}${POSITIONING_SUBLINE}記錄事件、練習溝通、修復連結，下次進諮商室不用再花 30 分鐘回想發生了什麼；卡住時也能預約真人諮商師。`, `${POSITIONING_ONE_LINER} ${POSITIONING_SUBLINE} Record events, practice communicating, repair your connection, and you won't spend 30 minutes of your next session remembering what happened. When you're stuck, you can book a real counselor too.`),
    sample: (
      <div className="space-y-4">
        <SampleCard>
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
              <HeartHandshake className="w-3.5 h-3.5 text-petal-rose-deep" />
              {tr('一週諮商一次，剩下的 167 小時交給練習', 'Counseling once a week; practice for the other 167 hours')}
            </span>
            <SampleTag />
          </div>
          <ol className="space-y-2.5">
            {[
              { n: '1', t: tr('好好說（事件記錄）', 'Talk it out (event records)'), d: tr('把這週發生的事寫下來，下次諮商不用再花 30 分鐘回想。', 'Write down what happened this week so you don\'t spend 30 minutes recalling it at your next session.') },
              { n: '2', t: tr('AI 示範引導', 'AI-modeled guidance'), d: tr('不是給答案，而是示範心理師可能會怎麼帶你們一步步練習。', 'Not answers, but a demonstration of how a therapist might guide you through practice step by step.') },
              { n: '3', t: tr('諮商摘要', 'Counseling summary'), d: tr('把最近兩週整理成一份摘要，帶進諮商室更快進入重點。舊摘要會保存下來，隨時點開回顧，不用重新產生、不扣 AI 次數。', 'Turn the last two weeks into a summary to get to the point faster in session. Old summaries are saved, so you can reopen them any time without regenerating or using AI credits.') },
              { n: '4', t: tr('話題建議', 'Topic suggestions'), d: tr('AI 主動整理下次諮商可以聊的方向，就算最近很平靜也一樣有話題，還能寫下自己想延伸聊的點。', 'AI suggests directions for your next session, even when things are calm, and you can add the points you want to explore.') },
              { n: '5', t: tr('預約真人諮商師', 'Book a real counselor'), d: tr('真的卡住了，挑一位受過專業訓練的人好好談。', 'When you\'re truly stuck, talk it through with a professionally trained person.') },
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

        <TherapyTopicsSample />

        {/* 專屬心理師 — a couple can grant one approved therapist read (and
            optionally comment) access to their wall + 好好說話, private items
            excluded. */}
        <SampleCard>
          <div className="flex items-center justify-between mb-2">
            <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-pink-500" />
              {tr('專屬心理師', 'Dedicated therapist')}
            </span>
            <SampleTag />
          </div>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
            {tr('把一位諮商師設為你們的', 'Make a counselor your ')}<strong className="text-petal-ink">{tr('專屬心理師', 'dedicated therapist')}</strong>{tr('， 他就能唯讀檢視你們的', ', and they can view (read-only) your ')}<strong className="text-petal-ink">{tr('牆', 'wall')}</strong>{tr('與', ' and ')}
            <strong className="text-petal-ink">{tr('好好說話', 'Talk it through')}</strong>{tr('，更了解你們的關係脈絡。', ', to understand your relationship\'s context.')}
          </p>
          <ul className="mt-2.5 space-y-1.5 font-body text-xs text-petal-muted">
            <li className="flex items-center gap-1.5"><ClipboardList className="w-3 h-3 text-petal-sage-deep" /> {tr('你們整理的', 'The ')}<strong className="text-petal-ink font-normal">{tr('諮商摘要', 'counseling summaries')}</strong>{tr('會直接出現在他的頁面', ' you create appear right on their page')}</li>
            <li className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-petal-sage-deep" /> {tr('私密內容不會被看到', 'Private content is never visible')}</li>
            <li className="flex items-center gap-1.5"><MessageSquare className="w-3 h-3 text-pink-500" /> {tr('可選擇是否開放心理師留言', 'You choose whether the therapist can comment')}</li>
            <li className="flex items-center gap-1.5"><HeartHandshake className="w-3 h-3 text-pink-500" /> {tr('隨時可以解除', 'Remove them any time')}</li>
          </ul>
        </SampleCard>

        <DedicatedSpaceSample />

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
    eyebrow: tr('今天', 'Today'),
    title: (
      <>
        {tr('今天，最值得做的', 'Today, the one thing most ')}<em className="not-italic font-light italic text-pink-600">{tr('一件事', 'worth doing')}</em>
      </>
    ),
    description:
      tr('不是所有資料的總覽，而是「現在你們最需要知道什麼」：一個最急的提醒、AI 發現的溝通模式、還有最近發生了什麼，一次只給一件事，不會同時塞一堆通知給你。', 'Not an overview of all your data, but "what you most need to know right now": the most urgent reminder, communication patterns AI noticed, and what happened recently. One thing at a time, never a pile of notifications.'),
    sample: (
      <div className="space-y-2.5">
        <SampleCard>
          <div className="flex items-center justify-between mb-1">
            <span className="font-body text-xs text-petal-muted">{tr('💗 已經 5 天沒有親密了', '💗 It\'s been 5 days without intimacy')}</span>
            <SampleTag />
          </div>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{tr('找個時間靠近一下，重新連結彼此。', 'Find a moment to be close and reconnect.')}</p>
        </SampleCard>
        <SampleCard>
          <div className="flex items-center justify-between mb-1">
            <span className="font-body text-xs text-petal-muted">{tr('💡 Twogether 發現', '💡 Twogether noticed')}</span>
            <SampleTag />
          </div>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{tr('你們最近幾次衝突，都和同一件事有關。', 'Your last few conflicts were all about the same thing.')}</p>
        </SampleCard>
      </div>
    ),
  },
  // 成長：stats + AI pattern + milestones.
  grow: {
    icon: TrendingUp,
    eyebrow: tr('成長', 'Grow'),
    title: (
      <>
        {tr('你們有沒有', 'Are you ')}<em className="not-italic font-light italic text-pink-600">{tr('變得更好', 'getting better together?')}</em>
      </>
    ),
    description:
      tr('統計數字、AI 讀過你們最近的對話後觀察到的反覆溝通模式，還有一起達成的里程碑——記錄不是目的，看見自己在變好才是。', 'Stats, the recurring communication patterns AI noticed after reading your recent conversations, and milestones you reached together. Recording isn\'t the goal; seeing yourselves get better is.'),
    sample: (
      <SampleCard>
        <div className="flex items-center justify-between mb-3">
          <span className="font-body text-xs text-petal-muted inline-flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-petal-sage-deep" />
            {tr('本月', 'This month')}
          </span>
          <SampleTag />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="font-display italic text-lg text-petal-ink">12</div>
            <div className="font-body text-[11px] text-petal-muted">{tr('深度對話', 'Deep conversations')}</div>
          </div>
          <div>
            <div className="font-display italic text-lg text-petal-ink">8</div>
            <div className="font-body text-[11px] text-petal-muted">{tr('成功理解', 'Understood')}</div>
          </div>
          <div>
            <div className="font-display italic text-lg text-petal-ink">4</div>
            <div className="font-body text-[11px] text-petal-muted">{tr('修復衝突', 'Conflicts repaired')}</div>
          </div>
        </div>
      </SampleCard>
    ),
  },
};

// Small "explore more" links shown under some previews, letting a logged-out
// visitor reach a dedicated real/bespoke preview that's no longer its own
// bottom-nav tab (roleplay/therapists nest inside 對話, wall inside 我們, stories
// inside 成長).
// The testids intentionally match the authenticated entry points (the
// TalkSwitcher chips / GrowView), so "the way into 真實故事 from 成長" is one
// addressable thing whether you're signed in or not.
const ExploreLinks: React.FC<{ view: string; onNavigate?: (view: string) => void }> = ({ view, onNavigate }) => {
  if (!onNavigate) return null;
  const links: { label: string; target: string; testId: string }[] =
    view === 'talk' || view === 'communicate' ? [
      { label: tr('看看角色扮演', 'See role play'), target: 'roleplay', testId: 'talk-roleplay-entry' },
      { label: tr('看看專業諮商師', 'See professional counselors'), target: 'therapists', testId: 'talk-therapists-entry' },
    ] :
    // 我們的牆 now lives as a card on 我們, so its preview link does too.
    view === 'us' ? [
      { label: tr('看看我們的牆', 'See our wall'), target: 'wall', testId: 'us-wall-card' },
    ] :
    view === 'grow' ? [
      { label: tr('看看真實故事', 'See real stories'), target: 'stories', testId: 'grow-stories-entry' },
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
const SAMPLE_MALE_NICKNAME = tr('小宇', 'Yu');
const SAMPLE_FEMALE_NICKNAME = tr('小甜', 'Tina');
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
      {tr('註冊免費開始 →', 'Sign up free →')}
    </button>
    {!compact && (
      <p className="font-body text-xs text-petal-muted mt-3">
        {tr('已有帳號？', 'Already have an account? ')}
        <button
          onClick={onSignUp}
          className="text-pink-600 hover:text-pink-700 underline underline-offset-2 ml-1"
        >
          {tr('登入', 'Sign in')}
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
            {tr('— 角色扮演', '— Role play')}
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
            {tr('為你們的夜晚', 'Add something new ')}<em className="not-italic font-light italic text-pink-600">{tr('增添新鮮感', 'to your nights')}</em>
          </h2>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed max-w-sm mx-auto">
            {tr('精選情境劇本，點開看看內容。登入後劇本會依你們的性別自動帶入雙方暱稱，可從 Google 文件一鍵匯入劇本，Premium 還能讓 AI 自動辨識角色性別。', 'Curated scenario scripts; tap to see what\'s inside. Once you sign in, scripts fill in both your nicknames by gender. You can import scripts from Google Docs in one tap, and Premium lets AI detect character genders automatically.')}
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
                  aria-label={tr("關閉", 'Close')}
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
                    {tr('「', '“')}{SAMPLE_MALE_NICKNAME}{tr('」「', '” “')}{SAMPLE_FEMALE_NICKNAME}{tr('」為範例暱稱 — 登入後會依性別自動帶入你們的暱稱', '” are sample nicknames. Once you sign in, your own nicknames are filled in by gender')}
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
            {tr('— Premium 方案', '— Premium plans')}
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-3">
            {tr('解鎖', 'Unlock')} <em className="not-italic font-light italic text-pink-600">Twogether Premium</em>
          </h2>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed max-w-sm mx-auto">
            {tr('免費方案即可使用核心功能。升級 Premium 一次付費、買斷天數，情侶雙方共享，無自動續扣。', 'The core features are free. Premium is a one-time purchase of days, shared by both partners, with no auto-renewal.')}
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
                    {tr('最受歡迎', 'Most popular')}
                  </span>
                )}
                <div className="font-display text-lg font-light text-petal-ink mb-1">{p.days} {tr('天', ' days')}</div>
                <div className="font-display text-3xl font-light text-petal-ink mb-1">NT${p.amount}</div>
                <div className="font-body text-xs text-petal-muted mb-1">{tr('約 NT$', 'About NT$')}{monthly}{tr('／月', '/month')}</div>
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
                  {tr('註冊解鎖', 'Sign up to unlock')}
                </button>
              </div>
            );
          })}
        </div>

        {/* Perks */}
        <div className="mb-8 rounded-md border border-petal-rule bg-petal-cream p-5">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted mb-3">
            {tr('Premium 包含', 'Premium includes')}
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

        {/* Receipt sample: what every paid transaction produces. */}
        <div className="mb-8" data-testid="pricing-receipt-sample">
          <div className="flex items-center justify-between mb-2">
            <span className="font-body text-xs text-petal-muted">
              {tr('每筆付款都會開立電子收據', 'Every payment issues an electronic receipt')}
            </span>
            <SampleTag />
          </div>
          <div className="rounded-md border border-petal-rule bg-petal-cream overflow-hidden">
            <ReceiptDocument receipt={SAMPLE_RECEIPT} />
          </div>
          <p className="mt-2 font-body text-xs text-petal-muted text-center">
            {tr(
              '收據會寄到你的信箱，也能在 App 內「購買紀錄與收據」隨時查看、列印報帳。',
              'The receipt is emailed to you, and stays in "Purchases & receipts" inside the app to view or print for expenses.'
            )}
          </p>
        </div>

        <SignUpCta onSignUp={onSignUp} />

        <p className="mt-6 text-center font-body text-xs text-petal-muted flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>{tr('支援信用卡、LINE Pay、ATM 與超商 · 由綠界 ECPay 或藍新金流安全付款', 'Credit card, LINE Pay, ATM and convenience stores · Secure payment by ECPay or NewebPay')}</span>
        </p>
        <p className="mt-3 text-center font-body text-xs text-petal-muted">
          {tr('想了解更多？', 'Want to know more?')}
          <a
            href="/pricing"
            className="text-pink-600 hover:text-pink-700 underline underline-offset-2 ml-1"
            data-testid="pricing-full-page-link"
          >
            {tr('查看完整方案與退費政策', 'See full plans and refund policy')}
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
    view === 'rediscover' || view === 'see-you' || view === 'secret' || view === 'journey' || view === 'daily-love' ? PREVIEWS.us :
    PREVIEWS[view];

  // Unknown view → friendly generic welcome (keeps old behaviour as a fallback).
  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-4">
            {tr('— 歡迎', '— Welcome')}
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-4">
            {tr('歡迎使用', 'Welcome to')} <em className="not-italic font-light italic text-pink-600">Twogether</em>
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
            {tr('立即登入 →', 'Sign in now →')}
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
        {tr('說出口的', 'What\'s said')}
      </div>
      <p className="font-body text-sm text-petal-ink">{tr('「你都不在乎。」', '"You don\'t care at all."')}</p>
    </div>
    <div className="flex items-center gap-2 px-3 py-1 bg-petal-cream-2 border-y border-petal-rule">
      <span className="h-px flex-1 bg-petal-rose-deep/40" />
      <span className="font-body text-[10px] text-petal-rose-deep">{tr('水面下', 'Beneath the surface')}</span>
      <span className="h-px flex-1 bg-petal-rose-deep/40" />
    </div>
    <div className="px-3 py-2 bg-petal-rose-soft/20">
      <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-rose-deep mb-0.5">
        {tr('底下真正想說的', 'What they really mean')}
      </div>
      <p className="font-body text-sm text-petal-ink">{tr('「我需要被重視。」', '"I need to feel valued."')}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep font-body text-[11px] px-2 py-0.5">
          {tr('需要被重視', 'Needs to feel valued')}
        </span>
        <span className="inline-flex items-center rounded-full border border-petal-rule text-petal-muted font-body text-[11px] px-2 py-0.5">
          {tr('不安', 'Uneasy')}
        </span>
      </div>
    </div>
  </div>
);

// A tiny read-only "溝通模式" loop for the pattern principle.
const PatternLoopVisual: React.FC = () => (
  <div className="rounded-md border border-petal-rule bg-petal-cream px-3 py-2.5">
    <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-1.5">
      {tr('你們反覆卡住的循環', 'The cycle you keep getting stuck in')}
    </div>
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-body text-[13px] text-petal-ink">
      <span className="rounded-full bg-white border border-petal-rule px-2 py-0.5">{tr('追問', 'Pursue')}</span>
      <span className="text-petal-rose-deep">→</span>
      <span className="rounded-full bg-white border border-petal-rule px-2 py-0.5">{tr('退縮', 'Withdraw')}</span>
      <span className="text-petal-rose-deep">→</span>
      <span className="rounded-full bg-white border border-petal-rule px-2 py-0.5">{tr('追得更急', 'Pursue harder')}</span>
      <span className="text-petal-rose-deep">→</span>
      <span className="rounded-full bg-white border border-petal-rule px-2 py-0.5">{tr('更加沉默', 'Go quieter')}</span>
    </div>
    <p className="mt-1.5 font-body text-[11px] text-petal-rose-deep">{tr('看見它，才有機會不再重複它。', 'Seeing it is the first step to not repeating it.')}</p>
  </div>
);

// A tiny read-only "書寫" before/after for the writing principle.
const WritingVisual: React.FC = () => (
  <div className="rounded-md border border-petal-rule bg-petal-cream overflow-hidden">
    <div className="px-3 py-2">
      <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-muted mb-0.5">
        {tr('你寫下的（只有你看得到）', 'What you wrote (only you can see)')}
      </div>
      <p className="font-body text-sm text-petal-ink">{tr('「你每次都這樣，很煩耶。」', '"You always do this. It\'s so annoying."')}</p>
    </div>
    <div className="px-3 py-2 bg-petal-sage/15 border-t border-petal-rule">
      <div className="font-body text-[10px] uppercase tracking-[0.12em] text-petal-sage-deep mb-0.5">
        {tr('AI 整理成對方聽得進去的版本', 'AI turns it into a version your partner can hear')}
      </div>
      <p className="font-body text-sm text-petal-ink">{tr('「這件事一直重複發生，我有點累了，想跟你一起想個辦法。」', '"This keeps happening and I\'m a bit worn out. I\'d like to figure out a way together with you."')}</p>
      <div className="font-body text-[10px] text-petal-muted mt-1">{tr('✎ 送出前都可以再改', '✎ You can edit before sending')}</div>
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
        {tr('— 我們怎麼幫你溝通', '— How we help you talk')}
      </div>
      <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight text-petal-ink leading-[1.15]">
        {tr('三個貫穿整個 App 的', 'Three ')}<em className="not-italic font-light italic text-pink-600">{tr('溝通原則', 'communication principles throughout the app')}</em>
      </h2>
      <p className="font-body text-sm text-petal-ink-soft mt-2 max-w-sm mx-auto">
        {tr('如果你也有下面這些困境，Twogether 就是為你們設計的。', 'If you face any of these struggles, Twogether was designed for you.')}
      </p>
    </div>
    <div className="space-y-5">
      {getCommunicationPrinciples(getLocale()).map((p) => {
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
              <span className="text-petal-muted">{tr('如果你也常常：', 'If you often find that ')}</span>
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
