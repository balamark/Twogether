import { useEffect, useState } from 'react';
import { Sparkles, Plus } from 'lucide-react';
import EventHistoryList from './EventHistoryList';
import ComposeEventFlow from './ComposeEventFlow';
import EventDetail from './EventDetail';
import SoloModeGate from './SoloModeGate';
import InfoHint from './InfoHint';
import { tr } from '../i18n/tr';
import { useHistoryState } from '../hooks/useHistoryState';

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
  // Lets a caller land on a specific sub-view — 接住情緒's CTA means "write one
  // now", and dropping the user on the list made them hunt for 開始對話.
  initialSubView?: EventsSubView | null;
  onInitialSubViewConsumed?: () => void;
  // Solo-mode gate wiring (unpaired users).
  onInvitePartner?: () => void;
  onNavigate?: (view: string) => void;
}

export default function EventsView({
  authState,
  showNotification,
  initialEventId,
  onInitialEventConsumed,
  initialSubView,
  onInitialSubViewConsumed,
  onInvitePartner,
  onNavigate,
}: EventsViewProps) {
  // History-backed so the browser's 上一頁 returns from a detail/compose to
  // the list (at the same scroll spot) instead of leaving the app.
  const [rawView, setViewState] = useHistoryState<EventsSubView>('events:view', 'list');
  // 分析 moved to 成長; an old history entry pointing at it just shows the list.
  const view: EventsSubView = rawView === 'analytics' ? 'list' : rawView;
  const [selectedEventId, setSelectedEventId] = useHistoryState<string | null>('events:id', null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Leaving detail also clears the id in the same history entry, so the
  // in-app 返回 matches the entry below and acts as a browser back.
  const setView = (next: EventsSubView, opts?: { replace?: boolean }) => {
    setViewState(next, opts);
    if (next !== 'detail') setSelectedEventId(null, opts);
  };

  // When the parent passes an initialEventId (e.g. from a notification tap),
  // jump straight to detail. Clear the parent's pending id so re-mounting the
  // view later doesn't reopen the same event.
  useEffect(() => {
    if (initialEventId) {
      setSelectedEventId(initialEventId);
      setViewState('detail');
      onInitialEventConsumed?.();
    }
  }, [initialEventId, onInitialEventConsumed, setSelectedEventId, setViewState]);

  // Same consume-once pattern as initialEventId, so coming back to 說開一件事
  // later doesn't drop you into the composer again.
  useEffect(() => {
    if (initialSubView) {
      setViewState(initialSubView);
      onInitialSubViewConsumed?.();
    }
  }, [initialSubView, onInitialSubViewConsumed, setViewState]);

  const openDetail = (id: string, opts?: { replace?: boolean }) => {
    setSelectedEventId(id, opts);
    setViewState('detail', opts);
  };

  // The finished composer is replaced by its result, so 上一頁 from the new
  // event goes to the list rather than back into a spent compose flow.
  const onEventCreated = (id: string | null) => {
    setRefreshKey((k) => k + 1);
    if (id) openDetail(id, { replace: true });
    else setView('list');
  };

  if (!authState.isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center text-petal-ink-soft">
        <h2 className="text-2xl font-serif text-petal-ink mb-2">{tr('說開一件事', 'Talk it through')}</h2>
        <p>{tr('請先登入才能使用此功能。', 'Please sign in to use this feature.')}</p>
      </div>
    );
  }

  if (!authState.partnerConnected) {
    return (
      <SoloModeGate
        icon={Sparkles}
        title={tr("吵架了？AI 幫你們把話說開", 'Had a fight? AI helps you talk it through')}
        valueLine={tr("配對之後，你可以把當下的委屈原封不動寫下來（可以罵、可以很火），AI 會整理成對方聽得進去的說法，讓對方先接住你的情緒，再一起把事情解決。", 'Once paired, you can write down what hurt exactly as you feel it (vent, be angry). The AI turns it into words your partner can hear, so they can hold your feelings first, and then you solve it together.')}
        onInvite={onInvitePartner ?? (() => {})}
        alternatives={[
          {
            label: tr('做愛的語言測驗', 'Take the love language quiz'),
            desc: tr('5 分鐘了解自己最需要被愛的方式，配對後可以看到彼此的結果。', 'Learn in 5 minutes how you most need to be loved. Once paired, you can see each other\'s results.'),
            onClick: () => onNavigate?.('love-language'),
          },
          {
            label: tr('逛逛公開問答', 'Browse public Q&A'),
            desc: tr('看看其他伴侶怎麼把衝突說開（匿名分享）。', 'See how other couples talked through conflicts (shared anonymously).'),
            onClick: () => onNavigate?.('therapists'),
          },
          {
            label: tr('瀏覽角色扮演劇本', 'Browse role-play scripts'),
            desc: tr('先收藏喜歡的劇本，配對後一起玩。', 'Save the scripts you like now and play together once you\'re paired.'),
            onClick: () => onNavigate?.('roleplay'),
          },
        ]}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {/* No page hero: the 對話 switcher above already names this page, so a
          second big title + rule only pushed the list below the fold. The
          heading stays for screen readers; the explanation lives in the (?)
          next to the filters and in the first-run empty state. */}
      <h1 className="sr-only">{tr('說開一件事', 'Talk it through')}</h1>

      <div>
        {/* Kept mounted (hidden) under an open event so going back returns
            to the same scroll spot without refetching the list. */}
        {(view === 'list' || view === 'detail') && (
          <div hidden={view !== 'list'}>
            {/* 開始對話 is the page's primary action, so it's a floating button
                (thumb reach, always visible while scrolling the history) rather
                than a pill tucked beside a section title. */}
            <button
              type="button"
              data-testid="events-compose-button"
              onClick={() => setView('compose')}
              className="fixed z-30 right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:right-8 md:bottom-8 inline-flex items-center gap-1.5 pl-4 pr-5 py-3 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-petal hover:opacity-90 active:scale-[0.98] transition"
            >
              <Plus className="w-5 h-5" strokeWidth={2} />
              {tr('開始對話', 'Start a conversation')}
            </button>
            <EventHistoryList
              key={refreshKey}
              onOpenEvent={openDetail}
              currentUserId={authState.user?.id || ''}
              onCompose={() => setView('compose')}
              onGoToInsights={onNavigate ? () => onNavigate('grow') : undefined}
              infoHint={<InfoHint viewId="events" />}
            />
          </div>
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
      </div>
    </div>
  );
}

