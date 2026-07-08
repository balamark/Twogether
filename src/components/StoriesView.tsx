import { useState } from 'react';
import { BookOpen, Globe, User as UserIcon } from 'lucide-react';
import StoryList from './StoryList';
import StoryDetail from './StoryDetail';
import StoryComposeFlow from './StoryComposeFlow';
import MyStories from './MyStories';
import PublicQaView from './PublicQaView';
import InfoHint from './InfoHint';

// 真實故事 main tab: the public-facing community surface. Sub-tabs:
// 智慧故事 (guided-template story archive, new) / 公開問答 (moved here from
// TherapistsView) / 我的故事 (author impact, signed-in only). Browsable
// logged-out like the therapists directory; write actions prompt sign-in.

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

interface StoriesViewProps {
  authState: {
    isAuthenticated: boolean;
    user: { id: string; nickname?: string; public_share_show_nickname?: boolean } | null;
  };
  showNotification: (n: NotificationInput) => void;
  setShowAuthModal: (show: boolean) => void;
  onFindTherapist: () => void;
}

type SubTab = 'wisdom' | 'qa' | 'mine';
type WisdomView = { kind: 'list' } | { kind: 'detail'; id: string } | { kind: 'compose' };

export default function StoriesView({
  authState,
  showNotification,
  setShowAuthModal,
  onFindTherapist,
}: StoriesViewProps) {
  const [tab, setTab] = useState<SubTab>('wisdom');
  const [wisdomView, setWisdomView] = useState<WisdomView>({ kind: 'list' });

  const requireLoginForCompose = () => {
    showNotification({
      type: 'info',
      title: '請先登入',
      message: '註冊或登入後就能分享你們的故事，單人（還沒配對）也可以發表',
    });
    setShowAuthModal(true);
  };

  const openCompose = () => {
    if (!authState.isAuthenticated) return requireLoginForCompose();
    setWisdomView({ kind: 'compose' });
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5" data-testid="stories-view">
      <header className="text-center">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 社群
        </div>
        <h2 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-[1.1] mb-2">
          真實<em className="not-italic italic text-pink-600">故事</em>
          <span className="align-middle ml-2"><InfoHint viewId="stories" /></span>
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          把你們最難的時刻，變成幫助其他伴侶的智慧。
        </p>
      </header>

      {/* Sub-tabs */}
      <div className="flex justify-center">
        <div className="inline-flex p-1 rounded-full bg-petal-cream-2 border border-petal-rule">
          <button
            type="button"
            data-testid="stories-tab-wisdom"
            onClick={() => { setTab('wisdom'); setWisdomView({ kind: 'list' }); }}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-body text-[13px] font-medium transition-colors ${
              tab === 'wisdom' ? 'bg-petal-ink text-petal-cream' : 'text-petal-ink-soft hover:text-petal-ink'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} /> 智慧故事
          </button>
          <button
            type="button"
            data-testid="stories-tab-qa"
            onClick={() => setTab('qa')}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-body text-[13px] font-medium transition-colors ${
              tab === 'qa' ? 'bg-petal-ink text-petal-cream' : 'text-petal-ink-soft hover:text-petal-ink'
            }`}
          >
            <Globe className="w-3.5 h-3.5" strokeWidth={1.5} /> 公開問答
          </button>
          {authState.isAuthenticated && (
            <button
              type="button"
              data-testid="stories-tab-mine"
              onClick={() => setTab('mine')}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-body text-[13px] font-medium transition-colors ${
                tab === 'mine' ? 'bg-petal-ink text-petal-cream' : 'text-petal-ink-soft hover:text-petal-ink'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5" strokeWidth={1.5} /> 我的故事
            </button>
          )}
        </div>
      </div>

      {tab === 'wisdom' && wisdomView.kind === 'list' && (
        <StoryList
          onOpenStory={(id) => setWisdomView({ kind: 'detail', id })}
          onCompose={openCompose}
        />
      )}

      {tab === 'wisdom' && wisdomView.kind === 'detail' && (
        <StoryDetail
          storyId={wisdomView.id}
          isAuthenticated={authState.isAuthenticated}
          onBack={() => setWisdomView({ kind: 'list' })}
          onRequireLogin={() => setShowAuthModal(true)}
          showNotification={showNotification}
        />
      )}

      {tab === 'wisdom' && wisdomView.kind === 'compose' && (
        <StoryComposeFlow
          showNickname={authState.user?.public_share_show_nickname !== false}
          onDone={(storyId) => setWisdomView({ kind: 'detail', id: storyId })}
          onCancel={() => setWisdomView({ kind: 'list' })}
          showNotification={showNotification}
        />
      )}

      {tab === 'qa' && (
        <PublicQaView
          isAuthenticated={authState.isAuthenticated}
          showNotification={showNotification}
          onFindTherapist={onFindTherapist}
        />
      )}

      {tab === 'mine' && (
        <MyStories
          onOpenStory={(id) => { setTab('wisdom'); setWisdomView({ kind: 'detail', id }); }}
          onCompose={() => { setTab('wisdom'); setWisdomView({ kind: 'compose' }); }}
          showNotification={showNotification}
        />
      )}
    </div>
  );
}
