import { Sparkles } from 'lucide-react';
import type { AiUsageToday } from '../services/api';

// 「今日剩 N 次」hint next to AI buttons (docs/UX_PLAYBOOK.md P1-2 / §6 Q4).
// The quota is a slope, not a wall: exhausted state explains and points at
// the options instead of greying buttons out.
export default function AiQuotaHint({ quota }: { quota: AiUsageToday | null }) {
  if (!quota) return null;
  const exhausted = quota.remaining <= 0;
  return (
    <p
      data-testid="ai-quota-hint"
      className={`text-[11px] inline-flex items-center gap-1 ${exhausted ? 'text-amber-700' : 'text-petal-muted'}`}
    >
      <Sparkles className="w-3 h-3" />
      {exhausted
        ? '今日 AI 次數已用完：明天會自動補上，升級 Premium 可提高每日上限。'
        : `今日 AI 次數還剩 ${quota.remaining} 次`}
    </p>
  );
}
