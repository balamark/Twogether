import type { TherapySummary } from '../services/api';
import { NOT_A_SUBSTITUTE_SHORT } from '../content/positioning';

// Build a plain-text version of a 諮商摘要 the couple can paste into notes or hand
// to their therapist — the whole point of the feature is to carry it into the
// session. Shared so any surface that shows a summary can offer the same copy.
export function summaryToText(s: TherapySummary, periodLabel: string): string {
  const lines: string[] = [];
  lines.push(`【Twogether 諮商摘要 · ${periodLabel}】`, '');
  if (s.overview) lines.push(s.overview, '');
  if (s.themes.length) lines.push('最常出現的衝突主題：' + s.themes.join('、'));
  if (s.emotions.length) lines.push('雙方最常感受到的情緒：' + s.emotions.join('、'));
  if (s.repaired.length) {
    lines.push('', '已經成功修復的事件：');
    s.repaired.forEach((r) => lines.push(`・${r.title} — ${r.insight}`));
  }
  if (s.unresolved.length) {
    lines.push('', '還沒解決的事件：');
    s.unresolved.forEach((r) => lines.push(`・${r.title} — ${r.note}`));
  }
  if (s.questions.length) {
    lines.push('', '想帶去和心理師討論的問題：');
    s.questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  }
  lines.push('', NOT_A_SUBSTITUTE_SHORT);
  return lines.join('\n');
}
