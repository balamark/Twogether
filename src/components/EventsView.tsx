import { useCallback, useEffect, useState } from 'react';
import { Sparkles, BarChart3, ChevronLeft, Plus } from 'lucide-react';
import EventHistoryList from './EventHistoryList';
import ComposeEventFlow from './ComposeEventFlow';
import EventDetail from './EventDetail';
import EventAnalytics from './EventAnalytics';
import SoloModeGate from './SoloModeGate';
import InfoHint from './InfoHint';
import { tr } from '../i18n/tr';
import { useHistoryState } from '../hooks/useHistoryState';

// Cached "this user has at least one conversation" flag for the hero size.
const EVENTS_HAS_HISTORY_KEY = 'eventsHasHistory';

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
  const [view, setViewState] = useHistoryState<EventsSubView>('events:view', 'list');
  const [selectedEventId, setSelectedEventId] = useHistoryState<string | null>('events:id', null);
  const [refreshKey, setRefreshKey] = useState(0);
  // First-timers get the full hero (what this is, why it's safe); anyone with
  // history gets a one-line title so the list starts higher on a phone. The
  // last answer is cached so returning users don't see the big hero flash.
  const [compactHero, setCompactHero] = useState<boolean>(() => {
    try { return localStorage.getItem(EVENTS_HAS_HISTORY_KEY) === '1'; } catch { return false; }
  });
  const onHistoryLoaded = useCallback((total: number) => {
    const has = total > 0;
    setCompactHero(has);
    try { localStorage.setItem(EVENTS_HAS_HISTORY_KEY, has ? '1' : '0'); } catch { /* storage unavailable */ }
  }, []);

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
      {/* Same editorial header pattern as ConflictView (eyebrow + font-display +
          italic sub-line) so the two halves of 好好說話 read as one feature
          rather than two apps. Title matches the sub-tab chip you tapped. */}
      {compactHero ? (
        // Once there's history, the list is what matters: the hero shrinks to a
        // single line and the explanation stays one tap away behind (?).
        <header className="border-b border-petal-rule pb-3 mb-5" data-testid="events-hero" data-compact="true">
          <h1 className="font-display text-2xl font-light tracking-tight text-petal-ink leading-tight flex items-center gap-2">
            <span>{tr('說開', 'Talk it')}<span className="text-pink-600">{tr('一件事', ' through')}</span></span>
            <InfoHint viewId="events" />
          </h1>
        </header>
      ) : (
        <header className="border-b border-petal-rule pb-7 mb-7" data-testid="events-hero" data-compact="false">
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
            {tr('— 說開', '— Talk')}
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
            {tr('說開', 'Talk it')}<em className="not-italic font-light italic text-pink-600">{tr('一件事', ' through')}</em>
            <span className="align-middle ml-2"><InfoHint viewId="events" /></span>
          </h1>
          <p className="font-display italic font-light text-base text-petal-muted">
            {tr('當下情緒不會直接送出 — AI 幫你整理成對方聽得進去的版本，由你決定要不要送。', 'Raw emotions are never sent directly. AI helps shape them into a version your partner can hear, and you decide whether to send it.')}
          </p>
        </header>
      )}

      <div>
        {/* Kept mounted (hidden) under an open event so going back returns
            to the same scroll spot without refetching the list. */}
        {(view === 'list' || view === 'detail') && (
          <div hidden={view !== 'list'}>
            {/* The 歷史／開始對話／分析 row was a third row of pills before any
                content on a 390px screen. 開始對話 is the primary action, so it
                belongs in the list header; 分析 is rare enough to be an icon. */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-serif text-lg text-petal-ink">{tr('歷史對話', 'Past conversations')}</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="events-analytics-button"
                  aria-label={tr("分析", 'Insights')}
                  title={tr("分析", 'Insights')}
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
                  {tr('開始對話', 'Start a conversation')}
                </button>
              </div>
            </div>
            <EventHistoryList
              key={refreshKey}
              onOpenEvent={openDetail}
              currentUserId={authState.user?.id || ''}
              onCompose={() => setView('compose')}
              onLoaded={onHistoryLoaded}
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
              {tr('回到歷史對話', 'Back to past conversations')}
            </button>
            <EventAnalytics />
          </>
        )}
      </div>
    </div>
  );
}

