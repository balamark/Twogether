import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { apiService, type DepositSummary, type DepositTransaction } from '../services/api';
import type { Notification } from '../App';
import { tr, dateLocale } from '../i18n/tr';
import { newIdemKey } from '../utils/idempotency';
import { loveBankCategoryLabel } from '../content/loveBankCategories';
import { parseDigits, digitsValue } from '../utils/digits';

type DepositKind = 'thanks' | 'request';

const QUICK_AMOUNTS = [50, 100, 200, 500];

interface DepositPanelProps {
  summary: DepositSummary | undefined;
  loading: boolean;
  /** Set when the summary couldn't be loaded and there's nothing to show. */
  error: Error | null;
  /** Re-load the summary after a change (server is the source of truth). */
  refresh: () => Promise<void>;
  onInvitePartner: () => void;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

// What the server said went wrong, keeping error_code so expected states
// (unpaired, not enough deposit, already handled) read as warnings, not errors.
const describeError = (error: unknown, fallback: string) => {
  const e = error as { message?: string; error_code?: string };
  const message = e?.message && !/^Request failed/.test(e.message) ? e.message : fallback;
  const expected = ['NOT_PAIRED', 'INSUFFICIENT_DEPOSIT', 'ALREADY_RESPONDED', 'TRANSACTION_NOT_FOUND', 'CANNOT_RESPOND_OWN'];
  return { message, type: (expected.includes(e?.error_code || '') ? 'warning' : 'error') as Notification['type'] };
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }) : '';

// One-line description of a row, from the caller's point of view.
const describe = (t: DepositTransaction) => {
  if (t.kind === 'redeem') {
    return t.is_mine
      ? tr(`你用感情存款兌換 ${t.gift_icon || '🎁'} ${t.note}`, `You redeem ${t.gift_icon || '🎁'} ${t.note}`)
      : tr(`TA 想用感情存款兌換 ${t.gift_icon || '🎁'} ${t.note}`, `Your partner wants to redeem ${t.gift_icon || '🎁'} ${t.note}`);
  }
  if (t.kind === 'auto') {
    const label = loveBankCategoryLabel(t.category);
    return t.is_mine
      ? tr(`TA 自動為你存入：${label}`, `Auto-deposit from your partner: ${label}`)
      : tr(`你自動為 TA 存入：${label}`, `Your auto-deposit for them: ${label}`);
  }
  if (t.kind === 'request') {
    return t.is_mine
      ? tr(`你申請存款：${t.note}`, `You asked for a deposit: ${t.note}`)
      : tr(`TA 申請存款：${t.note}`, `Your partner asked for a deposit: ${t.note}`);
  }
  return t.is_mine
    ? tr(`TA 為你感謝存款：${t.note}`, `Your partner thanked you: ${t.note}`)
    : tr(`你為 TA 感謝存款：${t.note}`, `You thanked your partner: ${t.note}`);
};

const STATUS_LABEL: Record<DepositTransaction['status'], string> = {
  pending: tr('等待確認', 'Pending'),
  confirmed: tr('已完成', 'Done'),
  declined: tr('已婉拒', 'Declined'),
  cancelled: tr('已取消', 'Cancelled'),
};

// Signed amount for a row in the caller's history: deposits into my account
// are +, my redemptions are −, rows on the partner's account are shown as-is.
const signedAmount = (t: DepositTransaction) => {
  if (!t.is_mine) return `${t.amount}`;
  return t.kind === 'redeem' ? `−${t.amount}` : `+${t.amount}`;
};

const DepositPanel = ({ summary, loading, error, refresh, onInvitePartner, showNotification }: DepositPanelProps) => {
  const [formKind, setFormKind] = useState<DepositKind | null>(null);
  useScrollLock(formKind !== null);
  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState('');
  const [idemKey, setIdemKey] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const paired = summary?.paired ?? false;

  const openForm = (kind: DepositKind) => {
    setFormKind(kind);
    setAmount(100);
    setNote('');
    setIdemKey(newIdemKey());
  };

  // Money moves → blocking (playbook §R7): the button spins until the server
  // confirms, and the idempotency key covers a double-submit or retry.
  const { run: submitDeposit, pending: submitting } = useAsyncAction(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formKind) return;
    try {
      await apiService.createDeposit({ kind: formKind, amount, note: note.trim() }, idemKey);
      showNotification({
        type: 'success',
        title: formKind === 'thanks' ? tr('感謝存款已存入 💝', 'Thank-you deposit made 💝') : tr('已送出存款申請', 'Deposit request sent'),
        message: formKind === 'thanks'
          ? tr(`已為 TA 存入 ${amount}，TA 會收到通知`, `${amount} went into your partner's account; they'll be notified`)
          : tr(`等 TA 確認後，${amount} 就會存入你的帳戶`, `Once your partner confirms, ${amount} goes into your account`),
        duration: 4000,
      });
      setFormKind(null);
      await refresh();
    } catch (error) {
      const { message, type } = describeError(error, tr('存入失敗，請稍後再試', 'Couldn\'t make the deposit. Please try again in a moment'));
      showNotification({ type, title: tr('沒有存入', 'Not deposited'), message, duration: 6000 });
    }
  });

  const { run: act } = useAsyncAction(async (t: DepositTransaction, action: 'confirm' | 'decline' | 'cancel') => {
    setBusyId(t.id);
    try {
      if (action === 'cancel') await apiService.cancelDeposit(t.id);
      else await apiService.respondToDeposit(t.id, action);
      const titles = {
        confirm: t.kind === 'redeem' ? tr('已同意兌換 🎁', 'Redemption agreed 🎁') : tr('已確認存款 ✅', 'Deposit confirmed ✅'),
        decline: tr('已婉拒', 'Declined'),
        cancel: tr('已取消', 'Cancelled'),
      };
      const messages = {
        confirm: t.kind === 'redeem'
          ? tr(`TA 的感情存款已扣除 ${t.amount}，記得一起兌現這份心意`, `${t.amount} was deducted from your partner's deposits. Enjoy the gift together`)
          : tr(`${t.amount} 已存入 TA 的帳戶`, `${t.amount} went into your partner's account`),
        decline: tr('感情存款沒有任何變動，TA 會收到通知', 'No deposits changed; your partner will be notified'),
        cancel: tr('這筆申請已撤回', 'This request was withdrawn'),
      };
      showNotification({ type: 'success', title: titles[action], message: messages[action], duration: 3500 });
    } catch (error) {
      const { message, type } = describeError(error, tr('處理失敗，請稍後再試', 'Couldn\'t process that. Please try again in a moment'));
      showNotification({ type, title: tr('沒有完成', 'Not done'), message, duration: 6000 });
    } finally {
      setBusyId(null);
      await refresh();
    }
  });

  const stat = (label: string, value: number | string, testId: string, hint?: string) => (
    <div className="bg-white rounded-2xl border border-petal-rule px-4 py-3.5" data-testid={testId}>
      <div className="font-body text-[11px] tracking-[0.08em] text-petal-muted">{label}</div>
      <div className="font-display text-3xl font-light text-petal-ink leading-tight mt-1">{value}</div>
      {hint && <div className="font-body text-[11px] text-petal-muted mt-1 leading-snug">{hint}</div>}
    </div>
  );

  // The two ways money comes in, styled like the 今天 action cards
  // (HomeView TodayActions): soft tint, emoji, title + one-line "what
  // happens". 感謝存款 takes the brand rose tint, 申請存款 stays neutral.
  const actionTile = (kind: DepositKind) => {
    const thanks = kind === 'thanks';
    return (
      <button
        type="button"
        onClick={() => openForm(kind)}
        data-testid={thanks ? 'open-thanks-deposit' : 'open-request-deposit'}
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors hover:border-petal-ink ${
          thanks ? 'bg-petal-rose-soft/25 border-petal-rose-soft' : 'bg-white border-petal-rule'
        }`}
      >
        <span className="text-lg shrink-0" aria-hidden>{thanks ? '💝' : '🙋'}</span>
        <span className="min-w-0">
          <span className="block font-display text-sm text-petal-ink">
            {thanks ? tr('感謝存款', 'Thank-you deposit') : tr('申請存款', 'Ask for a deposit')}
          </span>
          <span className="block font-body text-[12px] text-petal-muted leading-relaxed">
            {thanks ? tr('存一筆給 TA', 'Add to their account') : tr('請 TA 確認後入帳', 'They confirm, then it lands')}
          </span>
        </span>
      </button>
    );
  };

  if (loading && !summary) {
    return (
      <div className="flex justify-center py-8"><Spinner /></div>
    );
  }

  // A failed load is not "unpaired": without this, a paired user whose
  // summary request 500s/times out would see 0 balances and an 邀請另一半 gate.
  if (!summary) {
    return (
      <div className="bg-white rounded-2xl border border-petal-rule p-5" data-testid="deposit-load-error">
        <p className="font-display text-lg text-petal-ink mb-1">{tr('暫時讀不到感情存款', 'Couldn\'t load your Love Bank')}</p>
        <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-4">
          {error?.message || tr('請檢查網路連線後再試一次。', 'Check your connection and try again.')}
        </p>
        <button type="button" onClick={() => void refresh()} data-testid="deposit-load-retry" className="rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] font-medium text-petal-cream hover:bg-petal-ink/85 transition-colors">
          {tr('重新載入', 'Reload')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3">
        {stat(
          tr('我的感情存款', 'My Love Bank'),
          summary?.me.balance ?? 0,
          'deposit-mine',
          summary && summary.me.available < summary.me.balance
            ? tr(`可用 ${summary.me.available}（兌換申請中的已先保留）`, `${summary.me.available} available (pending redemptions are held)`)
            : undefined,
        )}
        {stat(tr('TA 的感情存款', 'Their Love Bank'), paired ? summary?.partner?.balance ?? 0 : '—', 'deposit-partner')}
      </div>

      {!paired ? (
        <div className="bg-petal-cream-2 border border-petal-rule rounded-2xl p-5" data-testid="deposit-unpaired-gate">
          <p className="font-display text-lg text-petal-ink mb-1">{tr('感情存款只能由另一半存入', 'Only your partner can add to your Love Bank')}</p>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-4">
            {tr('配對後，TA 每次想謝謝你，都能為你存一筆；你也能用感情存款兌換 TA 的心意。現在可以先把你們想要的禮品放進下方商店。', 'Once you\'re paired, your partner can make a deposit whenever they want to thank you, and you can redeem gifts from them. For now, you can fill the shop below with gifts you\'d both like.')}
          </p>
          <button type="button" onClick={onInvitePartner} className="rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] font-medium text-petal-cream hover:bg-petal-ink/85 transition-colors">{tr('邀請另一半', 'Invite your partner')}</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {actionTile('thanks')}
          {actionTile('request')}
        </div>
      )}

      {paired && summary && summary.awaitingMe.length > 0 && (
        <section data-testid="deposit-awaiting-me">
          <h3 className="font-display text-xl text-petal-ink mb-3">{tr('等你回應', 'Waiting on you')}</h3>
          <ul className="space-y-2">
            {summary.awaitingMe.map((t) => (
              <li key={t.id} className="bg-white rounded-2xl border border-petal-rose p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="deposit-awaiting-item">
                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm text-petal-ink break-words">{describe(t)}</div>
                  <div className="font-body text-xs text-petal-muted mt-0.5">
                    {t.kind === 'redeem'
                      ? tr(`同意後會從 TA 的感情存款扣除 ${t.amount}`, `Agreeing deducts ${t.amount} from their deposits`)
                      : tr(`確認後會存入 TA 的帳戶 ${t.amount}`, `Confirming adds ${t.amount} to their account`)}
                    {' · '}{formatDate(t.created_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => act(t, 'confirm')}
                    loading={busyId === t.id}
                    disabled={busyId !== null}
                    icon={<Check className="w-4 h-4" />}
                    className="px-4 py-2 text-sm"
                    data-testid="deposit-confirm"
                  >
                    {t.kind === 'redeem' ? tr('同意兌換', 'Agree') : tr('確認存入', 'Confirm')}
                  </Button>
                  <Button variant="ghost" onClick={() => act(t, 'decline')} disabled={busyId !== null} className="px-3 py-2 text-sm" data-testid="deposit-decline">
                    {tr('婉拒', 'Decline')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {paired && summary && summary.awaitingPartner.length > 0 && (
        <section data-testid="deposit-awaiting-partner">
          <h3 className="font-display text-xl text-petal-ink mb-3">{tr('等待 TA 回應', 'Waiting on your partner')}</h3>
          <ul className="space-y-2">
            {summary.awaitingPartner.map((t) => (
              <li key={t.id} className="bg-white rounded-2xl border border-petal-rule p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm text-petal-ink break-words">{describe(t)}</div>
                  <div className="font-body text-xs text-petal-muted mt-0.5">{t.amount} · {formatDate(t.created_at)}</div>
                </div>
                <Button variant="ghost" onClick={() => act(t, 'cancel')} loading={busyId === t.id} disabled={busyId !== null} className="px-3 py-2 text-sm">
                  {tr('取消', 'Cancel')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {paired && summary && (
        <section>
          <h3 className="font-display text-xl text-petal-ink mb-3">{tr('最近的感情存款', 'Recent Love Bank activity')}</h3>
          {summary.recent.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-petal-rule p-5" data-testid="deposit-history-empty">
              <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-2">
                {tr('把對方的付出記下來，讓「被在乎」看得見。TA 幫你做了一件重要的事，就為 TA 存一筆吧。', 'Write down what the other one does for you, so feeling cared for becomes visible. When they do something that matters to you, make a deposit for them.')}
              </p>
              <p className="font-body text-xs text-petal-muted mb-4">{tr('例：💝 100｜謝謝你幫我寫了一個劇本', 'e.g. 💝 100 | Thanks for writing a script for me')}</p>
              <button type="button" onClick={() => openForm('thanks')} className="rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] font-medium text-petal-cream hover:bg-petal-ink/85 transition-colors">
                {tr('存下第一筆感謝', 'Make your first thank-you deposit')}
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-petal-rule-soft bg-white rounded-2xl border border-petal-rule">
              {summary.recent.map((t) => (
                <li key={t.id} className="px-4 py-3 flex items-center gap-3" data-testid="deposit-history-item">
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm text-petal-ink break-words">{describe(t)}</div>
                    <div className="font-body text-xs text-petal-muted mt-0.5">{STATUS_LABEL[t.status]} · {formatDate(t.responded_at || t.created_at)}</div>
                  </div>
                  <div className={`font-display text-base ${t.status !== 'confirmed' ? 'text-petal-muted line-through' : 'text-petal-ink'}`}>
                    {signedAmount(t)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {formKind && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xl font-bold text-petal-ink">
                {formKind === 'thanks' ? tr('感謝存款', 'Thank-you deposit') : tr('申請存款', 'Ask for a deposit')}
              </h3>
              <button onClick={() => setFormKind(null)} aria-label={tr('關閉', 'Close')} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="font-body text-sm text-petal-ink-soft mb-4">
              {formKind === 'thanks'
                ? tr('TA 做了什麼讓你覺得被在乎？存一筆到 TA 的帳戶，馬上生效。', 'What did they do that made you feel cared for? It goes into their account right away.')
                : tr('你為 TA 做了一件事？寫下來請 TA 確認，確認後才會存入你的帳戶。', 'Did something for them? Write it down; it goes into your account once they confirm.')}
            </p>
            <form onSubmit={submitDeposit} className="space-y-4">
              <div>
                <label htmlFor="deposit-note" className="block text-sm font-medium text-gray-700 mb-2">
                  {formKind === 'thanks' ? tr('謝謝 TA 什麼', 'What you\'re thanking them for') : tr('你做了什麼', 'What you did')}
                </label>
                <input
                  id="deposit-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={100}
                  required
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-300"
                  placeholder={formKind === 'thanks' ? tr('例如：謝謝你幫我寫了一個劇本', 'e.g. Thanks for writing a script for me') : tr('例如：我幫你準備了早餐', 'e.g. I made you breakfast')}
                />
              </div>
              <div>
                <label htmlFor="deposit-amount" className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('金額（這件事對你們有多重要）', 'Amount (how much this matters to you)')}
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {QUICK_AMOUNTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(v)}
                      className={`px-3 min-h-[36px] rounded-full border text-sm font-body ${amount === v ? 'border-petal-ink bg-petal-ink text-petal-cream' : 'border-petal-rule text-petal-ink-soft hover:border-petal-ink'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <input
                  id="deposit-amount"
                  type="text"
                  inputMode="numeric"
                  pattern="[1-9][0-9]*"
                  value={digitsValue(amount)}
                  onChange={(e) => setAmount(parseDigits(e.target.value, 10000))}
                  required
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-300"
                />
              </div>
              <Button type="submit" loading={submitting} loadingText={tr('送出中…', 'Sending…')} className="w-full py-3 text-base" data-testid="submit-deposit">
                {formKind === 'thanks' ? tr(`存入 ${amount} 給 TA`, `Deposit ${amount} for them`) : tr(`申請 ${amount}`, `Ask for ${amount}`)}
              </Button>
              <button type="button" onClick={() => setFormKind(null)} className="w-full py-2 text-sm font-body text-petal-muted hover:text-petal-ink">
                {tr('稍後再說', 'Maybe later')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepositPanel;
