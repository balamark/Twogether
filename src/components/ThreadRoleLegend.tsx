import React, { useState } from 'react';
import { X } from 'lucide-react';
import { tr } from '../i18n/tr';

// 第一次進入對話時出現一次的角色圖例。
//
// 三方（甚至四方）對話難讀的地方不是「顏色不夠」，是使用者不知道規則。與其在每一則
// 訊息上都下重手提示，不如把規則講一次：左邊是對方、右邊是我、中間是 Luma。之後
// 空間本身就會替我們說話。
//
// 只出現一次（localStorage），關掉就不再回來 —— playbook §R4：每個插斷都要有不再
// 打擾的出口。私密瀏覽模式寫入失敗時退化成「這個 session 內不再顯示」。
const STORAGE_KEY = 'threadRoleLegendSeen';

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

interface Props {
  // Luma 的名字（使用者選的 AI 夥伴）。
  companionName: string;
  partnerName?: string;
}

const ThreadRoleLegend: React.FC<Props> = ({ companionName, partnerName }) => {
  const [dismissed, setDismissed] = useState(alreadySeen);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch { /* private mode: session-only */ }
    setDismissed(true);
  };

  return (
    <div
      className="relative bg-petal-cream border border-petal-rule rounded-2xl px-4 py-3"
      data-testid="thread-role-legend"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={tr("知道了", 'Got it')}
        data-testid="thread-role-legend-dismiss"
        className="absolute top-2 right-2 p-1.5 text-petal-muted hover:text-petal-ink transition-colors"
      >
        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
      <p className="font-body text-[11px] uppercase tracking-[0.18em] text-petal-muted mb-2">{tr('這段對話怎麼看', 'How to read this conversation')}</p>
      <div className="flex items-start justify-between gap-2 text-center">
        <div className="flex-1 min-w-0">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-white border border-petal-rule" />
          <p className="font-body text-xs text-petal-ink mt-1 truncate">{partnerName || tr('對方', 'Partner')}</p>
          <p className="font-body text-[11px] text-petal-muted">{tr('靠左', 'Left')}</p>
        </div>
        <div className="flex-1 min-w-0">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-petal-rose-soft border border-petal-rose-soft" />
          <p className="font-body text-xs text-petal-rose-deep mt-1 truncate">{companionName}</p>
          <p className="font-body text-[11px] text-petal-muted">{tr('置中', 'Center')}</p>
        </div>
        <div className="flex-1 min-w-0">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-petal-cream-2 border border-petal-rule-soft" />
          <p className="font-body text-xs text-petal-ink mt-1">{tr('我', 'Me')}</p>
          <p className="font-body text-[11px] text-petal-muted">{tr('靠右', 'Right')}</p>
        </div>
      </div>
      <p className="font-body text-[11px] text-petal-muted mt-2 leading-relaxed">
        {companionName} {tr('不站在任何一方，所以坐在你們兩個中間。', 'They don\'t take sides, so they sit between you two.')}
      </p>
    </div>
  );
};

export default ThreadRoleLegend;
