import React, { useState } from 'react';
import { X, Heart, MessageCircle, ClipboardList } from 'lucide-react';
import type { DedicatedTherapist } from '../services/api';
import type { Notification } from './ErrorNotification';
import { useScrollLock } from '../hooks/useScrollLock';
import { DedicatedMessagesPane, DedicatedSessionPane } from './DedicatedSpace';
import { useDedicatedSpace } from '../hooks/useDedicatedSpace';
import { tr } from '../i18n/tr';

// The couple's entry to 專屬諮商空間: one sheet, two tabs over the same data.
// 訊息 for between sessions, 諮商頁 for the session itself.
export type DedicatedSpaceTab = 'messages' | 'session';

interface Props {
  dedicated: DedicatedTherapist;
  initialTab: DedicatedSpaceTab;
  onClose: () => void;
  showNotification: (n: Omit<Notification, 'id'>) => void;
}

const DedicatedSpaceModal: React.FC<Props> = ({ dedicated, initialTab, onClose, showNotification }) => {
  useScrollLock(true);
  const [tab, setTab] = useState<DedicatedSpaceTab>(initialTab);
  const state = useDedicatedSpace(undefined, showNotification);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        className={`bg-petal-cream w-full h-[94vh] sm:h-[88vh] flex flex-col rounded-t-2xl sm:rounded-lg border border-petal-rule shadow-petal transition-[max-width] ${
          tab === 'session' ? 'sm:max-w-5xl' : 'sm:max-w-2xl'
        }`}
        data-testid="dedicated-space-modal"
      >
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-petal-rule">
          <div className="w-9 h-9 shrink-0 rounded-full overflow-hidden bg-petal-cream-2 border border-petal-rule flex items-center justify-center">
            {dedicated.photoUrl ? (
              <img src={dedicated.photoUrl} alt={dedicated.displayName} className="w-full h-full object-contain" />
            ) : (
              <Heart className="w-4 h-4 text-pink-300" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg text-petal-ink truncate">{tr('專屬諮商', 'Dedicated counseling')}</h3>
            <p className="font-body text-[11px] text-petal-muted truncate">
              {tr(`你們兩個與 ${dedicated.displayName} 都看得到`, `Visible to you both and ${dedicated.displayName}`)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-petal-muted hover:text-petal-ink" aria-label={tr('關閉', 'Close')} data-testid="dedicated-space-close">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex border-b border-petal-rule">
          {([
            ['messages', tr('訊息', 'Messages'), MessageCircle],
            ['session', tr('諮商頁', 'Session page'), ClipboardList],
          ] as [DedicatedSpaceTab, string, typeof MessageCircle][]).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              data-testid={`dedicated-space-tab-${key}`}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 font-body text-sm font-medium transition-colors ${
                tab === key ? 'text-pink-600 border-b-2 border-pink-500' : 'text-petal-muted hover:text-petal-ink'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0">
          {tab === 'messages' ? (
            <DedicatedMessagesPane state={state} onOpenSession={() => setTab('session')} />
          ) : (
            <DedicatedSessionPane state={state} />
          )}
        </div>
      </div>
    </div>
  );
};

export default DedicatedSpaceModal;
