import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, FileText, Globe, User as UserIcon, Vote } from 'lucide-react';
import StoryList from './StoryList';
import StoryDetail from './StoryDetail';
import StoryComposeFlow from './StoryComposeFlow';
import ArticleComposeFlow from './ArticleComposeFlow';
import MyStories from './MyStories';
import PublicQaView from './PublicQaView';
import PollsView from './PollsView';
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

type SubTab = 'wisdom' | 'polls' | 'qa' | 'mine';
// 'wisdom' is the internal id for the merged 好文 · 故事 sub-tab (kept stable so
// selectors/state don't churn); the visible label changed when 閱讀 merged in.
type WisdomView =
  | { kind: 'list' }
  | { kind: 'detail'; id: string }
  | { kind: 'compose-choose' } // pick: guided story vs share an article
  | { kind: 'compose' } // guided 6-section story
  | { kind: 'compose-article' }; // plain-text shared article

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
    setWisdomView({ kind: 'compose-choose' });
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
          把你們最難的時刻、讀過的好文，變成幫助其他伴侶的智慧。
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
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} /> 好文 · 故事
          </button>
          <button
            type="button"
            data-testid="stories-tab-polls"
            onClick={() => setTab('polls')}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-body text-[13px] font-medium transition-colors ${
              tab === 'polls' ? 'bg-petal-ink text-petal-cream' : 'text-petal-ink-soft hover:text-petal-ink'
            }`}
          >
            <Vote className="w-3.5 h-3.5" strokeWidth={1.5} /> 大家怎麼做
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

      {tab === 'wisdom' && wisdomView.kind === 'compose-choose' && (
        <div className="space-y-3" data-testid="stories-compose-choose">
          <p className="text-center text-sm text-petal-ink-soft">你想分享哪一種？</p>
          <button
            type="button"
            data-testid="compose-choose-story"
            onClick={() => setWisdomView({ kind: 'compose' })}
            className="w-full text-left rounded-2xl border border-petal-rule bg-white hover:border-petal-rose p-4 transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-petal-ink">分享你們的故事</span>
              <ArrowRight className="w-4 h-4 text-petal-muted" />
            </div>
            <p className="text-xs text-petal-ink-soft mt-1">依 6 個引導步驟，寫下你們走過的一段真實經歷。</p>
          </button>
          <button
            type="button"
            data-testid="compose-choose-article"
            onClick={() => setWisdomView({ kind: 'compose-article' })}
            className="w-full text-left rounded-2xl border border-petal-rose/60 bg-petal-rose/5 hover:border-petal-rose p-4 transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-petal-ink inline-flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-petal-rose-deep" />
                分享一篇好文章
              </span>
              <ArrowRight className="w-4 h-4 text-petal-muted" />
            </div>
            <p className="text-xs text-petal-ink-soft mt-1">看到對關係有幫助的好文？純文字貼上，分享給其他伴侶。</p>
          </button>
          <div className="flex justify-start pt-1">
            <button
              type="button"
              onClick={() => setWisdomView({ kind: 'list' })}
              className="px-4 py-2 rounded-full border border-petal-rule text-petal-ink hover:bg-petal-sage/20 inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </button>
          </div>
        </div>
      )}

      {tab === 'wisdom' && wisdomView.kind === 'compose' && (
        <StoryComposeFlow
          showNickname={authState.user?.public_share_show_nickname !== false}
          onDone={(storyId) => setWisdomView({ kind: 'detail', id: storyId })}
          onCancel={() => setWisdomView({ kind: 'compose-choose' })}
          showNotification={showNotification}
        />
      )}

      {tab === 'wisdom' && wisdomView.kind === 'compose-article' && (
        <ArticleComposeFlow
          showNickname={authState.user?.public_share_show_nickname !== false}
          onDone={(storyId) => setWisdomView({ kind: 'detail', id: storyId })}
          onCancel={() => setWisdomView({ kind: 'compose-choose' })}
          showNotification={showNotification}
        />
      )}

      {tab === 'polls' && (
        <PollsView
          isAuthenticated={authState.isAuthenticated}
          onRequireLogin={() => setShowAuthModal(true)}
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
          onCompose={() => { setTab('wisdom'); setWisdomView({ kind: 'compose-choose' }); }}
          showNotification={showNotification}
        />
      )}
    </div>
  );
}
