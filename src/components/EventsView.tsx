import { useEffect, useState } from 'react';
import { Sparkles, BarChart3, ChevronLeft, Plus } from 'lucide-react';
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

  // Same consume-once pattern as initialEventId, so coming back to 說開一件事
  // later doesn't drop you into the composer again.
  useEffect(() => {
    if (initialSubView) {
      setView(initialSubView);
      onInitialSubViewConsumed?.();
    }
  }, [initialSubView, onInitialSubViewConsumed]);

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
        <h2 className="text-2xl font-serif text-petal-ink mb-2">說開一件事</h2>
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
      {/* Same editorial header pattern as ConflictView (eyebrow + font-display +
          italic sub-line) so the two halves of 好好說話 read as one feature
          rather than two apps. Title matches the sub-tab chip you tapped. */}
      <header className="border-b border-petal-rule pb-7 mb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 說開
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
          說開<em className="not-italic font-light italic text-pink-600">一件事</em>
          <span className="align-middle ml-2"><InfoHint viewId="events" /></span>
        </h1>
        <p className="font-display italic font-light text-base text-petal-muted">
          當下情緒不會直接送出 — AI 幫你整理成對方聽得進去的版本，由你決定要不要送。
        </p>
      </header>

      <div>
        {view === 'list' && (
          <>
            {/* The 歷史／開始對話／分析 row was a third row of pills before any
                content on a 390px screen. 開始對話 is the primary action, so it
                belongs in the list header; 分析 is rare enough to be an icon. */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-serif text-lg text-petal-ink">歷史對話</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="events-analytics-button"
                  aria-label="分析"
                  title="分析"
                  onClick={() => setView('analytics')}
                  className="p-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="events-compose-button"
                  onClick={() => setView('compose')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
                >
                  <Plus className="w-4 h-4" />
                  開始對話
                </button>
              </div>
            </div>
            <EventHistoryList
              key={refreshKey}
              onOpenEvent={openDetail}
              currentUserId={authState.user?.id || ''}
              onCompose={() => setView('compose')}
            />
          </>
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
        {view === 'analytics' && (
          <>
            {/* Without the tab row there is no other way back from 分析. */}
            <button
              type="button"
              data-testid="events-analytics-back"
              onClick={() => setView('list')}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-petal-ink-soft hover:text-petal-ink"
            >
              <ChevronLeft className="w-4 h-4" />
              回到歷史對話
            </button>
            <EventAnalytics />
          </>
        )}
      </div>
    </div>
  );
}

