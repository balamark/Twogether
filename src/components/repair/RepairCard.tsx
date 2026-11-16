import { useState } from 'react';
import type { ReactNode } from 'react';
import { AlarmClock, MessageCircle } from 'lucide-react';
import { apiService } from '../../services/api';
import type { RepairAttempt, RepairResponseKind } from '../../services/api';
import { useRepairOverview, patchRepairOverview as patch } from './repairData';
import { formatDateTime } from '../../utils/datetime';
import { useTimezone } from '../../contexts/TimezoneContext';
import { trackAction } from '../../utils/track';
import type { Notification } from '../../App';
import { tr } from '../../i18n/tr';
import RepairComposer from './RepairComposer';
import { REMIND_CHOICES, REPAIR_RESPONSES, repairResponseCopy } from './repairCopy';

// 🕊️ 回頭接住 on 今天. Shows the ONE thing that matters most right now:
//   1. a note from the partner waiting for an answer
//   2. my 冷靜後提醒我 reminder that came due
//   3. otherwise a compact entry (寫一句 / 冷靜後提醒我), plus the latest note's
//      status and a 30-day count of times the couple caught each other.
// Responses, reminders and cancels are optimistic (playbook §R7).

interface Props {
  paired: boolean;
  partnerName: string;
  showNotification: (n: Omit<Notification, 'id'>) => void;
  onInvitePartner: () => void;
  onGoToTalk: () => void;
}

const WEEK = 7 * 86400_000;

const errText = (err: unknown, fallback: string) =>
  (err as { message?: string })?.message || fallback;

export default function RepairCard({ paired, partnerName, showNotification, onInvitePartner, onGoToTalk }: Props) {
  const tz = useTimezone();
  const { data } = useRepairOverview();
  const [composer, setComposer] = useState<null | { reminderId?: string | null; source: 'home' | 'reminder' | 'reply' }>(null);
  const [choosingTime, setChoosingTime] = useState<null | { replacing?: string }>(null);
  const [expanded, setExpanded] = useState(false);
  const [justAnswered, setJustAnswered] = useState<RepairResponseKind | null>(null);

  const now = Date.now();
  const incoming = data?.notes.find((n) => n.direction === 'incoming' && !n.response) || null;
  const due = data?.reminders.find((r) => r.remind_at && Date.parse(r.remind_at) <= now) || null;
  const upcoming = data?.reminders.find((r) => r.remind_at && Date.parse(r.remind_at) > now) || null;
  const lastOutgoing = data?.notes.find((n) => n.direction === 'outgoing' && n.sent_at && now - Date.parse(n.sent_at) < WEEK) || null;
  const caught = data?.stats.caught ?? 0;

  const openComposer = (source: 'home' | 'reminder' | 'reply', reminderId?: string | null) => {
    trackAction(`repair.open.${source}`);
    setChoosingTime(null);
    setComposer({ source, reminderId });
  };

  const setReminder = (at: Date, replacing?: string) => {
    trackAction('repair.remind');
    setChoosingTime(null);
    setExpanded(false);
    const tempId = `pending-r-${Date.now()}`;
    const temp: RepairAttempt = {
      id: tempId, status: 'scheduled', direction: 'outgoing', kind: null, text: null,
      remind_at: at.toISOString(), reminded_at: null, sent_at: null, response: null,
      response_note: null, responded_at: null, created_at: new Date().toISOString(),
    };
    patch((prev) => ({ ...prev, reminders: [temp, ...prev.reminders.filter((r) => r.id !== replacing)] }));
    showNotification({
      type: 'success',
      title: tr('好，先冷靜一下', 'OK — take some time to cool down'),
      message: tr(
        `${formatDateTime(at, tz)} 會提醒你回頭接住${partnerName}。生氣的當下說不出好話很正常。`,
        `We'll remind you at ${formatDateTime(at, tz)} to circle back to ${partnerName}. It's normal not to find kind words in the heat of the moment.`,
      ),
    });
    const run = async () => {
      if (replacing) await apiService.cancelRepairReminder(replacing).catch(() => undefined);
      return apiService.setRepairReminder(at.toISOString());
    };
    run()
      .then((saved) => patch((prev) => ({ ...prev, reminders: prev.reminders.map((r) => (r.id === tempId ? saved : r)) })))
      .catch((err) => {
        patch((prev) => ({ ...prev, reminders: prev.reminders.filter((r) => r.id !== tempId) }));
        const limit = (err as { error_code?: string })?.error_code === 'REPAIR_REMINDER_LIMIT';
        showNotification({
          type: limit ? 'warning' : 'error',
          title: limit ? tr('提醒已經夠多了', 'You have enough reminders') : tr('提醒沒有設定成功', 'The reminder wasn\'t set'),
          message: errText(err, tr('請稍後再按一次「冷靜後提醒我」。', 'Please tap "Remind me later" again in a moment.')),
        });
      });
  };

  const cancelReminder = (r: RepairAttempt) => {
    trackAction('repair.reminder_cancel');
    patch((prev) => ({ ...prev, reminders: prev.reminders.filter((x) => x.id !== r.id) }));
    if (r.id.startsWith('pending-')) return;
    apiService.cancelRepairReminder(r.id).catch((err) => {
      patch((prev) => ({ ...prev, reminders: [r, ...prev.reminders] }));
      showNotification({
        type: 'error',
        title: tr('提醒沒有取消', 'The reminder wasn\'t cancelled'),
        message: errText(err, tr('請稍後再試一次。', 'Please try again in a moment.')),
      });
    });
  };

  const respond = (note: RepairAttempt, response: RepairResponseKind) => {
    trackAction(`repair.respond.${response}`);
    const answered = { ...note, response, responded_at: new Date().toISOString() };
    patch((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => (n.id === note.id ? answered : n)),
      stats: { ...prev.stats, caught: prev.stats.caught + (response === 'received' ? 1 : 0) },
    }));
    setJustAnswered(response);
    apiService.respondRepair(note.id, response).catch((err) => {
      patch((prev) => ({
        ...prev,
        notes: prev.notes.map((n) => (n.id === note.id ? note : n)),
        stats: { ...prev.stats, caught: Math.max(0, prev.stats.caught - (response === 'received' ? 1 : 0)) },
      }));
      setJustAnswered(null);
      showNotification({
        type: 'error',
        title: tr('回應沒有送出去', 'Your response wasn\'t sent'),
        message: errText(err, tr('請稍後再按一次。', 'Please tap again in a moment.')),
      });
    });
  };

  const timeChooser = (replacing?: string) => (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="repair-remind-choices">
      <span className="font-body text-[12px] text-petal-muted mr-1">{tr('什麼時候提醒你？', 'When should we remind you?')}</span>
      {REMIND_CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setReminder(c.at(), replacing)}
          data-testid={`repair-remind-${c.id}`}
          className="rounded-full border border-petal-rule bg-white px-3 py-1 font-body text-[12.5px] text-petal-ink hover:border-petal-ink"
        >
          {c.label}
        </button>
      ))}
    </div>
  );

  let body: ReactNode;

  if (incoming) {
    // 1 — the partner reached out; answering it is the whole point of their move.
    body = (
      <div className="space-y-3" data-testid="repair-incoming">
        <div className="font-display text-base text-petal-ink">
          💛 {tr(`${partnerName}回頭接住你`, `${partnerName} circled back to you`)}
        </div>
        <blockquote className="rounded-xl bg-white border border-petal-rule px-3.5 py-3 font-body text-[15px] text-petal-ink leading-relaxed whitespace-pre-wrap" data-testid="repair-incoming-text">
          {incoming.text}
        </blockquote>
        <div className="font-body text-[11px] text-petal-muted">
          {incoming.sent_at && formatDateTime(incoming.sent_at, tz)}
          {' · '}
          {tr('接住對方的修復，和主動修復一樣重要。', 'Accepting a repair matters as much as making one.')}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {REPAIR_RESPONSES.map((r) => (
            <button
              key={r.response}
              type="button"
              onClick={() => respond(incoming, r.response)}
              data-testid={`repair-respond-${r.response}`}
              className={`rounded-full px-4 py-2 font-body text-[13px] text-left sm:text-center transition-colors ${
                r.response === 'received'
                  ? 'bg-petal-ink text-petal-cream hover:bg-petal-ink/85'
                  : 'border border-petal-rule bg-white text-petal-ink hover:border-petal-ink'
              }`}
            >
              <span aria-hidden>{r.emoji}</span> {r.label}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (justAnswered) {
    body = (
      <div className="space-y-2.5" data-testid="repair-answered">
        <div className="font-display text-base text-petal-ink">
          {justAnswered === 'received' && tr(`${partnerName}會知道你被接住了 💛`, `${partnerName} will know you felt understood 💛`)}
          {justAnswered === 'talk' && tr('好，找個時間把你的感受也說出來', 'OK — find a time to share how you feel too')}
          {justAnswered === 'need_time' && tr('需要時間很正常', 'Needing time is completely normal')}
        </div>
        <p className="font-body text-[13px] text-petal-muted leading-relaxed">
          {justAnswered === 'received' && tr('要不要也回一句？修復是雙向的。', 'Want to send one back? Repair goes both ways.')}
          {justAnswered === 'talk' && tr('「說開一件事」可以先寫下你的委屈，AI 會幫你整理成對方聽得進去的版本。', 'In "Talk it through" you can write down what hurt, and AI helps turn it into words your partner can take in.')}
          {justAnswered === 'need_time' && tr(`${partnerName}會知道你收到了。等你準備好，再回頭說一句就好。`, `${partnerName} will know you got it. When you're ready, circle back with a line.`)}
        </p>
        <div className="flex flex-wrap gap-2">
          {justAnswered === 'received' && (
            <button type="button" onClick={() => { setJustAnswered(null); openComposer('reply'); }} data-testid="repair-reply-back" className="rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] text-petal-cream">
              {tr('回一句', 'Send one back')}
            </button>
          )}
          {justAnswered === 'talk' && (
            <button type="button" onClick={() => { trackAction('repair.to_talk'); onGoToTalk(); }} data-testid="repair-go-talk" className="inline-flex items-center gap-1.5 rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] text-petal-cream">
              <MessageCircle className="w-4 h-4" /> {tr('說開一件事', 'Talk it through')}
            </button>
          )}
          {justAnswered === 'need_time' && (
            <button type="button" onClick={() => setChoosingTime({})} data-testid="repair-need-time-remind" className="rounded-full border border-petal-rule bg-white px-4 py-1.5 font-body text-[13px] text-petal-ink">
              {tr('晚點提醒我', 'Remind me later')}
            </button>
          )}
          <button type="button" onClick={() => setJustAnswered(null)} className="rounded-full px-3 py-1.5 font-body text-[13px] text-petal-muted hover:text-petal-ink">
            {tr('好', 'OK')}
          </button>
        </div>
        {choosingTime && timeChooser()}
      </div>
    );
  } else if (due) {
    // 2 — the 冷靜後提醒我 reminder came due.
    body = (
      <div className="space-y-2.5" data-testid="repair-due">
        <div className="font-display text-base text-petal-ink">🕊️ {tr('冷靜一點了嗎？', 'Feeling calmer now?')}</div>
        <p className="font-body text-[13px] text-petal-muted leading-relaxed">
          {tr(
            `吵完架之後，事情過去了，情緒不一定。現在對${partnerName}說一句也還來得及——第二時間的同理，一樣有用。`,
            `After a fight the issue may pass, but the feelings don't always. It's not too late to say one thing to ${partnerName} — empathy that comes later still counts.`,
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openComposer('reminder', due.id)} data-testid="repair-due-write" className="rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] font-medium text-petal-cream">
            {tr('現在寫一句', 'Write a line now')}
          </button>
          <button type="button" onClick={() => setChoosingTime({ replacing: due.id })} data-testid="repair-due-later" className="rounded-full border border-petal-rule bg-white px-4 py-1.5 font-body text-[13px] text-petal-ink">
            {tr('再等一下', 'Not yet')}
          </button>
          <button type="button" onClick={() => cancelReminder(due)} data-testid="repair-due-dismiss" className="rounded-full px-3 py-1.5 font-body text-[13px] text-petal-muted hover:text-petal-ink">
            {tr('已經和好了', 'We\'ve already made up')}
          </button>
        </div>
        {choosingTime && timeChooser(choosingTime.replacing)}
      </div>
    );
  } else {
    // 3 — compact entry + status.
    const lastResp = lastOutgoing ? repairResponseCopy(lastOutgoing.response) : null;
    body = (
      <div className="space-y-2.5" data-testid="repair-entry">
        <div className="flex items-center gap-3">
          <span className="text-lg shrink-0" aria-hidden>🕊️</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-sm text-petal-ink">{tr('吵完了，但還沒和好？', 'Fought, but haven\'t made up yet?')}</span>
            <span className="block font-body text-[12px] text-petal-muted leading-relaxed">
              {tr('冷靜之後回頭說一句「你辛苦了」，就是重新靠近的開始。', 'Once you\'ve cooled down, circling back with "you\'ve had a lot on you" is where getting close again begins.')}
            </span>
          </span>
          {!expanded && (
            <button
              type="button"
              onClick={() => { trackAction('repair.expand'); setExpanded(true); }}
              data-testid="repair-entry-open"
              className="shrink-0 rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] font-medium text-petal-cream hover:bg-petal-ink/85"
            >
              {tr('回頭接住', 'Circle back')}
            </button>
          )}
        </div>
        {expanded && (
          <div className="flex flex-wrap gap-2 pl-8">
            <button type="button" onClick={() => openComposer('home')} data-testid="repair-write" className="rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] font-medium text-petal-cream">
              {tr('現在寫一句給 TA', 'Write them a line now')}
            </button>
            <button type="button" onClick={() => setChoosingTime({})} data-testid="repair-remind-me" className="inline-flex items-center gap-1.5 rounded-full border border-petal-rule bg-white px-4 py-1.5 font-body text-[13px] text-petal-ink">
              <AlarmClock className="w-4 h-4" /> {tr('還在氣頭上，冷靜後提醒我', 'Still upset — remind me later')}
            </button>
          </div>
        )}
        {choosingTime && <div className="pl-8">{timeChooser()}</div>}
        {upcoming && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-8 font-body text-[12px] text-petal-muted" data-testid="repair-upcoming">
            <AlarmClock className="w-3.5 h-3.5" />
            <span>{tr(`${formatDateTime(upcoming.remind_at!, tz)} 會提醒你回頭接住${partnerName}`, `We'll remind you at ${formatDateTime(upcoming.remind_at!, tz)} to circle back to ${partnerName}`)}</span>
            <button type="button" onClick={() => openComposer('reminder', upcoming.id)} className="underline underline-offset-2 hover:text-petal-ink">
              {tr('現在就寫', 'Write now')}
            </button>
            <button type="button" onClick={() => cancelReminder(upcoming)} data-testid="repair-upcoming-cancel" className="underline underline-offset-2 hover:text-petal-ink">
              {tr('取消', 'Cancel')}
            </button>
          </div>
        )}
        {lastOutgoing && (
          <div className="pl-8 font-body text-[12px] text-petal-muted leading-relaxed" data-testid="repair-last-outgoing">
            {tr('你傳了：「', 'You sent: "')}{(lastOutgoing.text || '').slice(0, 40)}{(lastOutgoing.text || '').length > 40 ? '…' : ''}{tr('」', '"')}
            {' — '}
            <span data-testid="repair-last-status" className={lastResp ? 'text-petal-ink' : ''}>
              {lastResp ? <>{lastResp.emoji} {lastResp.senderLine(partnerName)}</> : tr(`等${partnerName}讀`, `waiting for ${partnerName} to read it`)}
            </span>
          </div>
        )}
        {caught > 0 && (
          <div className="pl-8 font-body text-[12px] text-petal-sage-deep" data-testid="repair-stats">
            {tr(`最近 30 天，你們互相接住了 ${caught} 次`, `In the last 30 days you caught each other ${caught} time${caught === 1 ? '' : 's'}`)}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className={`rounded-2xl border px-4 py-3.5 ${incoming ? 'bg-petal-rose-soft/20 border-petal-rose-soft' : 'bg-white border-petal-rule'}`}
        data-testid="home-repair-card"
      >
        {body}
      </div>
      {composer && (
        <RepairComposer
          paired={paired}
          partnerName={partnerName}
          reminderId={composer.reminderId}
          source={composer.source}
          onClose={() => setComposer(null)}
          showNotification={showNotification}
          onInvitePartner={onInvitePartner}
        />
      )}
    </>
  );
}
