import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { useCachedQuery, userKey } from '../services/queryCache';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { LOVE_BANK_CATEGORIES } from '../content/loveBankCategories';
import { tr } from '../i18n/tr';

interface LoveBankRatesSettingsProps {
  partnerConnected: boolean;
  showNotification: (n: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message: string; duration?: number }) => void;
}

const MAX_RATE = 10000;

// 設定 → 感情存款：自動存入. For each positive interaction, how much I
// automatically deposit into my partner's 感情存款 when THEY do it. Money
// still only comes from the partner — this is me deciding what each of their
// gestures is worth to me. Default 1; 0 turns a category off.
const LoveBankRatesSettings: React.FC<LoveBankRatesSettingsProps> = ({ partnerConnected, showNotification }) => {
  const ratesQuery = useCachedQuery(userKey('/coins/rates'), () => apiService.getLoveBankRates());
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Seed the editable fields once the saved rates arrive (or change).
  useEffect(() => {
    if (!ratesQuery.data) return;
    setDraft(Object.fromEntries(LOVE_BANK_CATEGORIES.map((c) => [c.key, String(ratesQuery.data![c.key] ?? 1)])));
  }, [ratesQuery.data]);

  const invalid = LOVE_BANK_CATEGORIES.some((c) => {
    const v = draft[c.key];
    return v === undefined || v === '' || !/^\d+$/.test(v) || Number(v) > MAX_RATE;
  });

  // Saving settings is blocking (a quick write the user waits to confirm).
  const { run: save, pending: saving } = useAsyncAction(async () => {
    try {
      const rates = Object.fromEntries(LOVE_BANK_CATEGORIES.map((c) => [c.key, Number(draft[c.key])]));
      await apiService.updateLoveBankRates(rates);
      await ratesQuery.refetch();
      showNotification({ type: 'success', title: tr('已儲存', 'Saved'), message: tr('之後 TA 做這些事時，會照新的金額自動存入', 'From now on, their gestures are deposited at the new amounts'), duration: 3000 });
    } catch (error) {
      const e = error as { message?: string };
      showNotification({
        type: 'error',
        title: tr('自動存入設定沒有儲存', 'Auto-deposit settings not saved'),
        message: e?.message && !/^Request failed/.test(e.message) ? e.message : tr('請稍後再試一次', 'Please try again in a moment'),
        duration: 5000,
      });
    }
  });

  return (
    <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6" data-testid="settings-love-bank-rates">
      <h3 className="text-lg font-bold text-gray-800 mb-1">{tr('感情存款：自動存入', 'Love Bank: auto-deposits')}</h3>
      <p className="text-xs text-gray-500 mb-4">
        {partnerConnected
          ? tr('另一半做這些事時，你自動為 TA 存入多少感情存款。0 代表不自動存入。', 'How much you automatically add to your partner\'s Love Bank when they do each of these. 0 turns it off.')
          : tr('配對後，另一半做這些事時，會照這裡的金額自動為 TA 存入。0 代表不自動存入。', 'Once you\'re paired, your partner gets these amounts automatically when they do each of these. 0 turns it off.')}
      </p>

      {!ratesQuery.data ? (
        ratesQuery.error ? (
          <div className="text-sm text-petal-ink-soft">
            {tr('暫時讀不到設定。', 'Couldn\'t load your settings.')}{' '}
            <button type="button" onClick={() => void ratesQuery.refetch()} className="underline underline-offset-2">{tr('重新載入', 'Reload')}</button>
          </div>
        ) : (
          <div className="flex justify-center py-4"><Spinner /></div>
        )
      ) : (
        <>
          <ul className="divide-y divide-petal-rule-soft">
            {LOVE_BANK_CATEGORIES.map((c) => (
              <li key={c.key} className="flex items-center gap-3 py-2.5">
                <span className="text-lg shrink-0" aria-hidden>{c.emoji}</span>
                <label htmlFor={`love-bank-rate-${c.key}`} className="flex-1 font-body text-sm text-petal-ink">{c.label}</label>
                <input
                  id={`love-bank-rate-${c.key}`}
                  data-testid={`love-bank-rate-${c.key}`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={MAX_RATE}
                  step="1"
                  value={draft[c.key] ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  className="w-24 p-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-pink-300"
                />
              </li>
            ))}
          </ul>
          {invalid && (
            <p className="mt-2 text-xs text-petal-rose-deep">{tr(`每一項請填 0 到 ${MAX_RATE} 的整數`, `Use a whole number from 0 to ${MAX_RATE} for each`)}</p>
          )}
          <Button
            onClick={() => save()}
            loading={saving}
            loadingText={tr('儲存中…', 'Saving…')}
            disabled={invalid}
            className="mt-4 px-5 py-2.5 text-sm"
            data-testid="love-bank-rates-save"
          >
            {tr('儲存', 'Save')}
          </Button>
        </>
      )}
    </div>
  );
};

export default LoveBankRatesSettings;
