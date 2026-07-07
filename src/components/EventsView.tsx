import { useEffect, useState } from 'react';
import { Sparkles, BarChart3, ListChecks, Plus } from 'lucide-react';
import EventHistoryList from './EventHistoryList';
import ComposeEventFlow from './ComposeEventFlow';
import EventDetail from './EventDetail';
import EventAnalytics from './EventAnalytics';
import SoloModeGate from './SoloModeGate';
import InfoHint from './InfoHint';

type EventsSubView = 'list' | 'compose' | 'detail' | 'analytics';

interface AuthState {
  isAuthenticated: boolean;
  user: {
    id: string;
    nickname?: string;
    email?: string;
    selected_therapist?: string | null;
    partnerNickname?: string;
  } | null;
  partnerConnected: boolean;
}

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface EventsViewProps {
  authState: AuthState;
  showNotification: (notification: NotificationInput) => void;
  initialEventId?: string | null;
  onInitialEventConsumed?: () => void;
  // Solo-mode gate wiring (unpaired users).
  onInvitePartner?: () => void;
  onNavigate?: (view: string) => void;
}

export default function EventsView({
  authState,
  showNotification,
  initialEventId,
  onInitialEventConsumed,
  onInvitePartner,
  onNavigate,
}: EventsViewProps) {
  const [view, setView] = useState<EventsSubView>('list');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (view !== 'detail') setSelectedEventId(null);
  }, [view]);

  // When the parent passes an initialEventId (e.g. from a notification tap),
  // jump straight to detail. Clear the parent's pending id so re-mounting the
  // view later doesn't reopen the same event.
  useEffect(() => {
    if (initialEventId) {
      setSelectedEventId(initialEventId);
      setView('detail');
      onInitialEventConsumed?.();
    }
  }, [initialEventId, onInitialEventConsumed]);

  const openDetail = (id: string) => {
    setSelectedEventId(id);
    setView('detail');
  };

  const onEventCreated = (id: string | null) => {
    setRefreshKey((k) => k + 1);
    if (id) openDetail(id);
    else setView('list');
  };

  if (!authState.isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center text-petal-ink-soft">
        <h2 className="text-2xl font-serif text-petal-ink mb-2">事件 × 由 AI 替你說</h2>
        <p>請先登入才能使用此功能。</p>
      </div>
    );
  }

  if (!authState.partnerConnected) {
    return (
      <SoloModeGate
        icon={Sparkles}
        title="吵架了？AI 幫你們把話說開"
        valueLine="配對之後，你可以把當下的委屈原封不動寫下來（可以罵、可以很火），AI 會整理成對方聽得進去的說法，讓對方先接住你的情緒，再一起把事情解決。"
        onInvite={onInvitePartner ?? (() => {})}
        alternatives={[
          {
            label: '做愛的語言測驗',
            desc: '5 分鐘了解自己最需要被愛的方式，配對後可以看到彼此的結果。',
            onClick: () => onNavigate?.('love-language'),
          },
          {
            label: '逛逛公開問答',
            desc: '看看其他伴侶怎麼把衝突說開（匿名分享）。',
            onClick: () => onNavigate?.('therapists'),
          },
          {
            label: '瀏覽角色扮演劇本',
            desc: '先收藏喜歡的劇本，配對後一起玩。',
            onClick: () => onNavigate?.('roleplay'),
          },
        ]}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <header className="mb-5">
        <h1 className="text-2xl md:text-3xl font-serif text-petal-ink mb-1 inline-flex items-center gap-1.5">
          事件 × 由 AI 替你說
          <InfoHint viewId="events" />
        </h1>
        <p className="hidden sm:block text-sm text-petal-ink-soft">
          當下情緒不會直接送出。AI 會協助你把感受整理成三種「由 AI 替你說」的版本，由你選擇要不要送出。
        </p>
        <p className="sm:hidden text-sm text-petal-ink-soft">
          AI 會幫你把當下情緒整理成幾種可送出的版本。
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 mb-5 border-b border-petal-rule pb-3">
        <TabButton active={view === 'list'} onClick={() => setView('list')} icon={ListChecks} label="歷史" />
        <TabButton
          active={view === 'compose'}
          onClick={() => setView('compose')}
          icon={Plus}
          label="建立事件"
          primary
        />
        <TabButton active={view === 'analytics'} onClick={() => setView('analytics')} icon={BarChart3} label="分析" />
      </nav>

      <div>
        {view === 'list' && (
          <EventHistoryList
            key={refreshKey}
            onOpenEvent={openDetail}
            currentUserId={authState.user?.id || ''}
            onCompose={() => setView('compose')}
          />
        )}
        {view === 'compose' && (
          <ComposeEventFlow
            onCreated={onEventCreated}
            onCancel={() => setView('list')}
            showNotification={showNotification}
          />
        )}
        {view === 'detail' && selectedEventId && (
          <EventDetail
            eventId={selectedEventId}
            currentUserId={authState.user?.id || ''}
            companionId={authState.user?.selected_therapist ?? null}
            myNickname={authState.user?.nickname}
            partnerNickname={authState.user?.partnerNickname}
            onBack={() => setView('list')}
            showNotification={showNotification}
          />
        )}
        {view === 'analytics' && <EventAnalytics />}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkles;
  label: string;
  primary?: boolean;
}

function TabButton({ active, onClick, icon: Icon, label, primary }: TabButtonProps) {
  const base = 'flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-colors border';
  const cls = active
    ? 'bg-petal-ink text-petal-cream border-petal-ink'
    : primary
      ? 'bg-petal-rose-soft text-petal-ink border-petal-rose'
      : 'bg-transparent text-petal-ink border-petal-rule hover:bg-petal-sage/20';
  return (
    <button type="button" onClick={onClick} className={`${base} ${cls}`}>
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}
