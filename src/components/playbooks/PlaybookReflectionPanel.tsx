import React, { useState } from 'react';
import { Lock, Trash2, ChevronDown, PenLine } from 'lucide-react';
import apiService from '../../services/api';
import type { Playbook, PlaybookReflection } from '../../services/api';
import { useCachedQuery, userKey } from '../../services/queryCache';
import type { AuthState } from '../../App';
import { tr, dateLocale } from '../../i18n/tr';
import AutoGrowTextarea from '../AutoGrowTextarea';
import { trackPlaybook, type NotificationInput } from './playbookShared';

// 我的經驗 — the private half of a Playbook (Reflect Together). A signed-in
// user writes what happened between them plus optional answers to the
// reflection questions; rows are owner-only (migration 115) and never shown on
// the public page or to the partner. Signed-out visitors get a three-part gate
// (why + what they can do now + CTA) instead of a dead end.

const EXPERIENCE_MAX = 4000;

interface Props {
  playbook: Playbook;
  authState: AuthState;
  pickedAlternatives: string[];
  showNotification: (n: NotificationInput) => void;
  setShowAuthModal: (open: boolean) => void;
  onCountChange: () => void;
}

type Item = PlaybookReflection & { pending?: boolean };

const ALT_QUESTION = tr('我們想試的替代方案', 'Alternatives we want to try');

const PlaybookReflectionPanel: React.FC<Props> = ({ playbook, authState, pickedAlternatives, showNotification, setShowAuthModal, onCountChange }) => {
  const slug = playbook.slug;
  const signedIn = authState.isAuthenticated;
  const list = useCachedQuery<Item[]>(signedIn ? userKey('playbooks', 'reflections', slug) : null, () => apiService.getPlaybookReflections(slug));
  const [experience, setExperience] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showQuestions, setShowQuestions] = useState(false);
  const [started, setStarted] = useState(false);

  if (!signedIn) {
    return (
      <div className="rounded-xl border border-dashed border-petal-rule bg-petal-cream p-4" data-testid="playbook-reflect-gate">
        <div className="flex items-start gap-2 mb-2">
          <PenLine className="w-4 h-4 text-petal-rose-deep mt-0.5 shrink-0" strokeWidth={1.5} />
          <div>
            <p className="font-display text-base text-petal-ink">{tr('把你們的經驗記下來', 'Keep a note of your own experience')}</p>
            <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
              {tr(
                '經驗紀錄只屬於你，所以需要一個帳號來保存。現在你也可以先在心裡或紙上回答上面的問題，或複製上面的說法傳給另一半。',
                'Your notes belong only to you, so they need an account to be kept. For now, you can answer the questions above on paper, or copy a script to send to your partner.',
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { trackPlaybook('reflection_gate', slug); setShowAuthModal(true); }}
          data-testid="playbook-reflect-signup"
          className="mt-1 px-4 py-2 rounded-full bg-petal-sage-deeper text-white font-body text-sm font-medium"
        >
          {tr('免費註冊，開始記錄', 'Sign up free to start your notes')}
        </button>
      </div>
    );
  }

  const items = list.data || [];
  const tooLong = experience.trim().length > EXPERIENCE_MAX;

  const save = async () => {
    const text = experience.trim();
    if (!text) {
      showNotification({ type: 'info', title: tr('還沒寫內容', 'Nothing written yet'), message: tr('先寫下一兩句你們發生的事，再按儲存', 'Write a sentence or two about what happened between you, then save.') });
      return;
    }
    if (tooLong) {
      showNotification({ type: 'warning', title: tr('內容有點長', 'That\'s a little long'), message: tr(`經驗紀錄最多 ${EXPERIENCE_MAX} 字，請精簡一些再儲存`, `Notes can be up to ${EXPERIENCE_MAX} characters. Please shorten it a little, then save.`) });
      return;
    }
    const payload = {
      experience: text,
      answers: [
        ...playbook.reflectionQuestions
          .map((question, i) => ({ question, answer: (answers[i] || '').trim() }))
          .filter((a) => a.answer),
        ...(pickedAlternatives.length ? [{ question: ALT_QUESTION, answer: pickedAlternatives.join(tr('、', ', ')) }] : []),
      ],
    };
    // R7: hand control back now; the save runs in the background.
    const tempId = `pending-${Date.now()}`;
    const at = new Date().toISOString();
    const draft = { experience, answers };
    list.mutate((prev) => [{ id: tempId, slug, ...payload, createdAt: at, updatedAt: at, pending: true }, ...(prev || [])]);
    setExperience('');
    setAnswers({});
    setShowQuestions(false);
    trackPlaybook('reflection_started', slug);
    try {
      const saved = await apiService.createPlaybookReflection(slug, payload);
      list.mutate((prev) => (prev || []).map((r) => (r.id === tempId ? saved : r)));
      trackPlaybook('reflection_completed', slug);
      onCountChange();
      showNotification({
        type: 'success',
        title: tr('已儲存', 'Saved'),
        message: authState.isGuest
          ? tr('訪客模式的紀錄只留在這個分頁；免費註冊就能永久保存。', 'In guest mode this note stays in this tab only. Sign up free to keep it.')
          : tr('只有你看得到這則經驗紀錄。', 'Only you can see this note.'),
      });
    } catch (e) {
      const err = e as Error & { error_code?: string };
      if (err.error_code === 'TIMEOUT') {
        // Maybe it landed: keep the row, re-sync instead of inviting a duplicate.
        void list.refetch();
        showNotification({ type: 'warning', title: tr('連線有點慢', 'The connection is slow'), message: tr('紀錄可能已經存好了，稍後重新整理確認一下，先不用再按一次。', 'Your note may already be saved. Refresh in a moment to check before saving again.') });
        return;
      }
      list.mutate((prev) => (prev || []).filter((r) => r.id !== tempId));
      setExperience(draft.experience);
      setAnswers(draft.answers);
      showNotification({ type: 'error', title: tr('沒有存成功', 'Didn\'t save'), message: err.message || tr('你寫的內容還在，請稍後再按一次儲存', 'What you wrote is still here. Please tap Save again in a moment.') });
    }
  };

  const remove = async (r: Item) => {
    if (r.pending) return;
    if (!window.confirm(tr('確定要刪除這則經驗紀錄嗎？刪除後無法復原。', 'Delete this note? This can\'t be undone.'))) return;
    const before = items;
    list.mutate((prev) => (prev || []).filter((x) => x.id !== r.id));
    try {
      await apiService.deletePlaybookReflection(r.id);
      onCountChange();
    } catch (e) {
      list.mutate(() => before);
      showNotification({ type: 'error', title: tr('刪除沒有成功', 'Couldn\'t delete'), message: (e as Error)?.message || tr('請稍後再試一次', 'Please try again in a moment.') });
    }
  };

  return (
    <div className="rounded-xl border border-petal-rule bg-petal-cream p-4" data-testid="playbook-reflection">
      <div className="flex items-center gap-2 mb-1">
        <PenLine className="w-4 h-4 text-petal-rose-deep" strokeWidth={1.5} />
        <h3 className="font-display text-base text-petal-ink">{tr('我的經驗', 'My experience')}</h3>
      </div>
      <p className="flex items-center gap-1 font-body text-xs text-petal-muted mb-3">
        <Lock className="w-3 h-3" strokeWidth={1.5} />
        {authState.isGuest
          ? tr('訪客模式：只存在這個分頁，關掉就不見了。', 'Guest mode: kept in this tab only, gone when you close it.')
          : tr('只有你看得到。不會出現在公開頁面，也不會分享給另一半。', 'Only you can see this. It never appears on public pages and isn\'t shared with your partner.')}
      </p>

      {!started && items.length === 0 ? (
        <button
          type="button"
          onClick={() => setStarted(true)}
          data-testid="playbook-reflection-start"
          className="w-full rounded-xl border border-dashed border-petal-rule bg-white px-4 py-3 text-left font-body text-sm text-petal-ink-soft hover:border-petal-ink"
        >
          {tr('你們最近一次發生是什麼時候？寫下來，下次就能看見改變。', 'When did this last happen to you? Write it down so you can see the change next time.')}
        </button>
      ) : (
        <div className="space-y-2">
          <AutoGrowTextarea
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder={tr('例如：上週我邀請 TA，TA 說太累了，我就整晚不想說話……', 'e.g. Last week I reached out, they said they were too tired, and I went quiet all evening…')}
            data-testid="playbook-reflection-input"
            className="w-full rounded-xl border border-petal-rule bg-white px-3 py-2.5 font-body text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-ink min-h-[88px]"
          />
          {tooLong && (
            <p className="font-body text-xs text-petal-rose-deep">{tr(`最多 ${EXPERIENCE_MAX} 字，目前 ${experience.trim().length} 字`, `Up to ${EXPERIENCE_MAX} characters, currently ${experience.trim().length}`)}</p>
          )}
          {pickedAlternatives.length > 0 && (
            <p className="font-body text-xs text-petal-ink-soft">
              <span className="text-petal-muted">{ALT_QUESTION}{tr('：', ': ')}</span>{pickedAlternatives.join(tr('、', ', '))}
            </p>
          )}
          <button type="button" onClick={() => setShowQuestions((v) => !v)} aria-expanded={showQuestions} className="inline-flex items-center gap-1 font-body text-xs text-petal-ink-soft hover:text-petal-ink">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showQuestions ? 'rotate-180' : ''}`} strokeWidth={1.5} />
            {tr('也回答回顧問題（選填）', 'Also answer the reflection questions (optional)')}
          </button>
          {showQuestions && (
            <div className="space-y-2">
              {playbook.reflectionQuestions.map((question, i) => (
                <label key={question} className="block">
                  <span className="block font-body text-xs text-petal-ink mb-1">{question}</span>
                  <AutoGrowTextarea
                    value={answers[i] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                    data-testid={`playbook-reflection-answer-${i}`}
                    className="w-full rounded-lg border border-petal-rule bg-white px-3 py-2 font-body text-sm text-petal-ink focus:outline-none focus:border-petal-ink"
                  />
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={!experience.trim() || tooLong}
              data-testid="playbook-reflection-save"
              className="px-4 py-2 rounded-full bg-petal-sage-deeper text-white font-body text-sm font-medium disabled:opacity-40"
            >
              {tr('儲存我的經驗', 'Save my note')}
            </button>
          </div>
        </div>
      )}

      {list.error && !list.data && (
        <p className="mt-3 font-body text-xs text-petal-rose-deep">
          {list.error.message || tr('暫時讀不到你的經驗紀錄，請稍後重新整理再試', 'We couldn\'t load your notes right now. Please refresh in a moment.')}
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2" data-testid="playbook-reflection-list">
          {items.map((r) => (
            <li key={r.id} className={`rounded-xl bg-white border border-petal-rule p-3 ${r.pending ? 'opacity-60' : ''}`} data-testid="playbook-reflection-item">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-body text-[11px] text-petal-muted">
                  {r.pending ? tr('儲存中…', 'Saving…') : new Date(r.createdAt).toLocaleDateString(dateLocale(), { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
                {!r.pending && (
                  <button type="button" onClick={() => void remove(r)} aria-label={tr('刪除這則紀錄', 'Delete this note')} data-testid="playbook-reflection-delete" className="text-petal-muted hover:text-petal-rose-deep">
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                )}
              </div>
              <p className="font-body text-sm text-petal-ink leading-relaxed whitespace-pre-line">{r.experience}</p>
              {r.answers.length > 0 && (
                <dl className="mt-2 space-y-1.5 border-t border-petal-rule-soft pt-2">
                  {r.answers.map((a, i) => (
                    <div key={i}>
                      <dt className="font-body text-[11px] text-petal-muted">{a.question}</dt>
                      <dd className="font-body text-sm text-petal-ink-soft whitespace-pre-line">{a.answer}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PlaybookReflectionPanel;
