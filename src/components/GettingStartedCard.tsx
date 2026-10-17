import { useState } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, HeartHandshake, Users, CalendarPlus, MessageSquareHeart, X } from 'lucide-react';
import { tr } from '../i18n/tr';

// 「開始三步驟」first-run checklist (docs/UX_PLAYBOOK.md P0-1). Shown at the
// top of 記錄時光 until all steps are done or the user dismisses it. Steps
// auto-check from real state; completion/dismissal persist in localStorage.

const DISMISS_KEY = 'gettingStartedDismissed';

interface GettingStartedCardProps {
  companionPicked: boolean;
  paired: boolean;
  hasFirstEntry: boolean;
  onPickCompanion: () => void;
  onInvitePartner: () => void;
  onAddRecord: () => void;
  onOpenEvents: () => void;
}

export default function GettingStartedCard({
  companionPicked,
  paired,
  hasFirstEntry,
  onPickCompanion,
  onInvitePartner,
  onAddRecord,
  onOpenEvents,
}: GettingStartedCardProps) {
  const [dismissed, setDismissed] = useState(localStorage.getItem(DISMISS_KEY) === 'true');
  const [collapsed, setCollapsed] = useState(false);

  const steps = [companionPicked, paired, hasFirstEntry];
  const doneCount = steps.filter(Boolean).length;
  const allDone = doneCount === steps.length;

  if (dismissed || allDone) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  const StepIcon = ({ done }: { done: boolean }) =>
    done ? (
      <CheckCircle2 className="w-5 h-5 text-petal-sage-deep flex-shrink-0" />
    ) : (
      <Circle className="w-5 h-5 text-petal-rule flex-shrink-0" />
    );

  return (
    <div
      className="bg-petal-cream border border-petal-rose/40 rounded-2xl p-4 shadow-petal"
      data-testid="getting-started-card"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-left"
          data-testid="getting-started-toggle"
        >
          <span className="font-display text-base text-petal-ink">{tr('開始三步驟', 'Three steps to start')}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-petal-rose/20 text-petal-ink">
            {doneCount} / {steps.length}
          </span>
          {collapsed ? <ChevronDown className="w-4 h-4 text-petal-muted" /> : <ChevronUp className="w-4 h-4 text-petal-muted" />}
        </button>
        <button
          type="button"
          onClick={dismiss}
          title={tr("不再顯示", 'Don\'t show again')}
          aria-label={tr("不再顯示", 'Don\'t show again')}
          data-testid="getting-started-dismiss"
          className="p-1 rounded text-petal-muted hover:text-petal-ink"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="mt-3 space-y-2.5">
          {/* Step 1: AI companion */}
          <div className="flex items-center gap-2.5">
            <StepIcon done={companionPicked} />
            <span className={`text-sm flex-1 ${companionPicked ? 'text-petal-muted line-through' : 'text-petal-ink'}`}>
              {tr('選擇你的 AI 諮商師', 'Choose your AI counselor')}
            </span>
            {!companionPicked && (
              <button
                type="button"
                onClick={onPickCompanion}
                data-testid="getting-started-pick-companion"
                className="text-xs px-3 py-1.5 rounded-full bg-petal-sage-deeper text-white font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-1.5"
              >
                <HeartHandshake className="w-3.5 h-3.5" />
                {tr('去選擇', 'Choose')}
              </button>
            )}
          </div>

          {/* Step 2: pair */}
          <div className="flex items-center gap-2.5">
            <StepIcon done={paired} />
            <span className={`text-sm flex-1 ${paired ? 'text-petal-muted line-through' : 'text-petal-ink'}`}>
              {tr('邀請另一半配對（日曆與紀錄會自動同步）', 'Invite your partner to pair (calendar and records sync automatically)')}
            </span>
            {!paired && (
              <button
                type="button"
                onClick={onInvitePartner}
                data-testid="getting-started-invite"
                className="text-xs px-3 py-1.5 rounded-full bg-petal-rose-deep text-white font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5" />
                {tr('邀請', 'Invite')}
              </button>
            )}
          </div>

          {/* Step 3: first entry */}
          <div className="flex items-center gap-2.5">
            <StepIcon done={hasFirstEntry} />
            <span className={`text-sm flex-1 ${hasFirstEntry ? 'text-petal-muted line-through' : 'text-petal-ink'}`}>
              {tr('記下第一筆，或把想說的事說開', 'Record your first moment, or talk something through')}
            </span>
          </div>
          {!hasFirstEntry && (
            <div className="flex flex-wrap gap-2 pl-7">
              <button
                type="button"
                onClick={onAddRecord}
                data-testid="getting-started-add-record"
                className="text-xs px-3 py-1.5 rounded-full bg-petal-ink text-petal-cream font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-1.5"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                {tr('記下第一筆時光', 'Record your first moment')}
              </button>
              <button
                type="button"
                onClick={onOpenEvents}
                data-testid="getting-started-open-events"
                className="text-xs px-3 py-1.5 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-1.5"
              >
                <MessageSquareHeart className="w-3.5 h-3.5" />
                {tr('開始第一段對話', 'Start your first conversation')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
