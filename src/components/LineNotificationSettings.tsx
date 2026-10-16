import { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { tr } from '../i18n/tr';

// 設定 → LINE 通知. Binding-code flow: request a code, add the official account
// as a friend, send the code to bind. Then a toggle + unlink. Console-logged
// for diagnosis (see memory: log every new feature).

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

export default function LineNotificationSettings({
  showNotification,
}: {
  showNotification: (n: NotificationInput) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [linked, setLinked] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [addUrl, setAddUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setLoading(true);
    apiService
      .getLineStatus()
      .then((s) => {
        setConfigured(s.configured);
        setLinked(s.linked);
        setEnabled(s.notificationsEnabled);
      })
      .catch((err) => console.error('[LINE] status load failed', err))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const getCode = async () => {
    setBusy(true);
    try {
      const r = await apiService.requestLineLinkCode();
      setCode(r.code);
      setAddUrl(r.addFriendUrl);
    } catch (err) {
      showNotification({ type: 'error', title: tr('無法產生綁定碼', 'Couldn\'t create a link code'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment') });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (next: boolean) => {
    setEnabled(next);
    try {
      await apiService.setLineNotifications(next);
    } catch (err) {
      setEnabled(!next);
      showNotification({ type: 'error', title: tr('更新失敗', 'Couldn\'t update'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment') });
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await apiService.unlinkLine();
      setLinked(false);
      setCode(null);
      showNotification({ type: 'success', title: tr('已解除綁定', 'Unlinked'), message: tr('LINE 通知已關閉', 'LINE notifications are off') });
    } catch (err) {
      showNotification({ type: 'error', title: tr('解除失敗', 'Couldn\'t unlink'), message: err instanceof Error ? err.message : tr('請稍後再試', 'Please try again in a moment') });
    } finally {
      setBusy(false);
    }
  };

  if (loading || !configured) return null; // hide entirely if LINE isn't set up

  return (
    <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6" data-testid="settings-line">
      <h3 className="text-lg font-bold text-gray-800 mb-1">{tr('LINE 通知', 'LINE notifications')}</h3>
      <p className="text-xs text-gray-500 mb-4">
        {tr('把伴侶的重要通知（對話回覆、親密邀請等）同步推播到你的 LINE。綁定後隨時可關閉。', 'Get your partner\'s important updates (conversation replies, intimacy invitations and more) pushed to your LINE. You can turn it off any time after linking.')}
      </p>

      {linked ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm text-gray-800">
              <span className="w-2 h-2 rounded-full bg-green-500" /> {tr('已綁定 LINE', 'LINE linked')}
            </span>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-gray-600">{tr('接收通知', 'Receive notifications')}</span>
              <input
                type="checkbox"
                data-testid="line-notif-toggle"
                checked={enabled}
                onChange={(e) => toggle(e.target.checked)}
                className="w-4 h-4 accent-petal-rose-deep"
              />
            </label>
          </div>
          <button
            type="button"
            data-testid="line-unlink"
            onClick={unlink}
            disabled={busy}
            className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
          >
            {tr('解除綁定', 'Unlink')}
          </button>
        </div>
      ) : code ? (
        <div className="space-y-3" data-testid="line-link-code">
          <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
            <li>
              {addUrl ? (
                <>{tr('加入官方帳號好友：', 'Add the official account as a friend: ')}
                  <a href={addUrl} target="_blank" rel="noreferrer" className="text-petal-rose-deep underline ml-1">{tr('開啟 LINE 加好友', 'Open LINE to add friend')}</a>
                </>
              ) : tr('先加 Twogether 官方帳號為好友', 'First add the Twogether official account as a friend')}
            </li>
            <li>{tr('把下面這組綁定碼傳給官方帳號：', 'Send this link code to the official account:')}</li>
          </ol>
          <div className="flex items-center justify-center">
            <span className="font-mono text-2xl tracking-[0.3em] bg-petal-cream-2 border border-petal-rule rounded-xl px-5 py-3 text-petal-ink">
              {code}
            </span>
          </div>
          <p className="text-xs text-gray-500 text-center">{tr('綁定碼 15 分鐘內有效。傳送後這裡會自動變成「已綁定」。', 'The code is valid for 15 minutes. Once sent, this will switch to "Linked" automatically.')}</p>
          <div className="text-center">
            <button type="button" onClick={refresh} className="text-xs text-petal-rose-deep hover:underline">{tr('我已傳送，重新整理狀態', 'I\'ve sent it, refresh status')}</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="line-get-code"
          onClick={getCode}
          disabled={busy}
          className="px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
        >
          {tr('綁定 LINE 通知', 'Link LINE notifications')}
        </button>
      )}
    </div>
  );
}
