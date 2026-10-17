import type { TherapySummary } from '../services/api';
import { NOT_A_SUBSTITUTE_SHORT } from '../content/positioning';
import { tr } from '../i18n/tr';

// Build a plain-text version of a 諮商摘要 the couple can paste into notes or hand
// to their therapist — the whole point of the feature is to carry it into the
// session. Shared so any surface that shows a summary can offer the same copy.
export function summaryToText(s: TherapySummary, periodLabel: string): string {
  const lines: string[] = [];
  lines.push(tr(`【Twogether 諮商摘要 · ${periodLabel}】`, `[Twogether counseling summary · ${periodLabel}]`), '');
  if (s.overview) lines.push(s.overview, '');
  if (s.themes.length) lines.push(tr('最常出現的衝突主題：', 'Most common conflict topics: ') + s.themes.join(tr('、', ', ')));
  if (s.emotions.length) lines.push(tr('雙方最常感受到的情緒：', 'Feelings you both felt most often: ') + s.emotions.join(tr('、', ', ')));
  if (s.repaired.length) {
    lines.push('', tr('已經成功修復的事件：', 'Issues you\'ve repaired:'));
    s.repaired.forEach((r) => lines.push(`・${r.title} — ${r.insight}`));
  }
  if (s.unresolved.length) {
    lines.push('', tr('還沒解決的事件：', 'Issues not yet resolved:'));
    s.unresolved.forEach((r) => lines.push(`・${r.title} — ${r.note}`));
  }
  if (s.questions.length) {
    lines.push('', tr('想帶去和心理師討論的問題：', 'Questions to discuss with your therapist:'));
    s.questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  }
  lines.push('', NOT_A_SUBSTITUTE_SHORT);
  return lines.join('\n');
}
