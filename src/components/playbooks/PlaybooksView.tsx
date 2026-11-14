import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Clock, Bookmark, ChevronRight, X } from 'lucide-react';
import apiService from '../../services/api';
import type { MyPlaybooks, PlaybookApplyTarget, PlaybookSummary } from '../../services/api';
import { useCachedQuery, userKey } from '../../services/queryCache';
import { useHistoryState } from '../../hooks/useHistoryState';
import type { AuthState } from '../../App';
import { tr, getLocale } from '../../i18n/tr';
import PlaybookDetail from './PlaybookDetail';
import { PLAYBOOK_NAME, isPlaybooksPath, loadErrorMessage, playbookPath, trackPlaybook, type NotificationInput } from './playbookShared';

// 關係解方手冊 Relationship Playbook — the public library + detail pages.
//
// Discover → Apply → Reflect Together: anyone (signed out, guest, member) can
// read every Playbook in full; saving and writing "我的經驗" need an account
// (guests keep them in the tab). The URL follows the page (/playbooks,
// /playbooks/<slug>) so a link shared from here opens the same Playbook, and
// the server renders those URLs with per-page SEO/OG tags (lib/playbooks/render.js).

interface PlaybooksViewProps {
  authState: AuthState;
  showNotification: (n: NotificationInput) => void;
  setShowAuthModal: (open: boolean) => void;
  /** Slug from the URL the app was opened on (/playbooks/<slug>). */
  initialSlug?: string | null;
  /** "Start a conversation": open the matching in-app flow. */
  onApply: (target: PlaybookApplyTarget) => void;
}

const PlaybookCard: React.FC<{ p: PlaybookSummary; saved: boolean; onOpen: () => void }> = ({ p, saved, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    data-testid={`playbook-card-${p.slug}`}
    className="group w-full text-left bg-white border border-petal-rule rounded-2xl p-4 md:p-5 hover:border-petal-ink transition-colors flex flex-col gap-2"
  >
    <div className="flex items-center gap-2 font-body text-[11px] text-petal-muted">
      <span className="text-lg leading-none" aria-hidden>{p.emoji}</span>
      <span className="uppercase tracking-[0.12em]">{p.categoryLabel}</span>
      {saved && (
        <span className="ml-auto inline-flex items-center gap-1 text-petal-rose-deep">
          <Bookmark className="w-3 h-3 fill-current" strokeWidth={1.5} />
          {tr('已收藏', 'Saved')}
        </span>
      )}
    </div>
    <h3 className="font-display text-lg text-petal-ink leading-snug">{p.title}</h3>
    <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{p.hook}</p>
    <div className="mt-auto pt-1 flex items-center gap-1 font-body text-xs text-petal-muted">
      <Clock className="w-3 h-3" strokeWidth={1.5} />
      {tr(`${p.estimatedReadingMinutes} 分鐘閱讀`, `${p.estimatedReadingMinutes} min read`)}
      <ChevronRight className="w-4 h-4 ml-auto text-petal-muted group-hover:text-petal-ink" strokeWidth={1.5} />
    </div>
  </button>
);

const PlaybooksView: React.FC<PlaybooksViewProps> = ({ authState, showNotification, setShowAuthModal, initialSlug, onApply }) => {
  const [slug, setSlug] = useHistoryState<string | null>('playbooks:slug', initialSlug ?? null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const signedIn = authState.isAuthenticated;
  const library = useCachedQuery(`playbooks|list|${getLocale()}`, () => apiService.getPlaybooks(), { staleMs: 5 * 60_000 });
  const mine = useCachedQuery<MyPlaybooks>(signedIn ? userKey('playbooks', 'me') : null, () => apiService.getMyPlaybooks());
  const savedSlugs = useMemo(() => new Set((mine.data?.saved || []).map((s) => s.slug)), [mine.data]);

  // Keep the address bar on the page being read, so copy-paste / share works
  // and a reload lands here again. Leaving the view returns the bar to "/".
  // Re-synced after popstate too: useHistoryState turns an in-app 返回 into
  // history.back(), which lands on an entry whose URL was recorded earlier.
  const slugRef = useRef(slug);
  slugRef.current = slug;
  useEffect(() => {
    const sync = () => {
      try {
        const want = playbookPath(slugRef.current).split('?')[0];
        if (isPlaybooksPath() && window.location.pathname !== want) {
          window.history.replaceState(window.history.state, '', want + window.location.search);
        }
      } catch { /* sandboxed frame */ }
    };
    sync();
    const onPop = () => setTimeout(sync, 0);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [slug]);
  useEffect(() => {
    // First paint: the app may have been opened on "/" with a saved view.
    try {
      if (!isPlaybooksPath()) window.history.replaceState(window.history.state, '', playbookPath(slugRef.current).split('?')[0] + window.location.search);
    } catch { /* ignore */ }
    return () => {
      try {
        if (isPlaybooksPath()) window.history.replaceState(window.history.state, '', '/' + window.location.search);
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    if (!slug) trackPlaybook('library_viewed');
  }, [slug]);

  const items = library.data?.playbooks || [];
  const categories = library.data?.categories || [];
  const q = query.trim().toLowerCase();
  const filtered = items.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q) return true;
    return [p.title, p.subtitle, p.hook, p.categoryLabel, ...p.tags].some((s) => s.toLowerCase().includes(q));
  });
  const savedItems = items.filter((p) => savedSlugs.has(p.slug));

  if (slug) {
    return (
      <PlaybookDetail
        slug={slug}
        authState={authState}
        showNotification={showNotification}
        setShowAuthModal={setShowAuthModal}
        saved={savedSlugs.has(slug)}
        onSavedChange={(next) => mine.mutate((prev) => {
          const base = prev || { saved: [], reflections: [] };
          const rest = base.saved.filter((s) => s.slug !== slug);
          return { ...base, saved: next ? [{ slug, savedAt: new Date().toISOString() }, ...rest] : rest };
        })}
        onReflectionCountChange={() => void mine.refetch()}
        onBack={() => setSlug(null)}
        onOpen={(s) => setSlug(s)}
        onApply={onApply}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8" data-testid="playbooks-library">
      <header className="border-b border-petal-rule pb-6 mb-6">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          {tr('— 關係解方手冊 · Relationship Playbook', '— Relationship Playbook')}
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-tight mb-3">
          {tr('每對伴侶都有卡住的循環，', 'Every couple has patterns. ')}
          <em className="not-italic italic text-pink-600">{tr('每個循環都有更好的出路。', 'Every pattern can change.')}</em>
        </h1>
        <p className="font-body text-sm md:text-base text-petal-ink-soft leading-relaxed max-w-2xl">
          {tr(
            '這些是伴侶之間最常反覆上演的情境。每一份手冊都用同樣的七個步驟：看懂發生了什麼、雙方真正的感受、為什麼一直重複，再給你可以直接說出口的話、替代方案和共同約定。',
            'These are the situations couples replay most often. Every playbook follows the same seven steps: what is happening, what each of you really feels, why it keeps repeating, then words you can actually say, alternatives, and a shared agreement.',
          )}
        </p>
      </header>

      {savedItems.length > 0 && (
        <section className="mb-6" data-testid="playbooks-saved">
          <h2 className="font-body text-xs font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">
            {tr('我收藏的手冊', 'My saved playbooks')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {savedItems.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => setSlug(p.slug)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-petal-rose-deep/40 bg-petal-rose-soft/30 font-body text-[13px] text-petal-ink hover:border-petal-ink"
              >
                <span aria-hidden>{p.emoji}</span>{p.title}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mb-4">
        <label className="relative block">
          <span className="sr-only">{tr('搜尋手冊', 'Search playbooks')}</span>
          <Search className="w-4 h-4 text-petal-muted absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('你們常為什麼吵？例如：冷戰、家事、婆家', 'What do you keep fighting about? e.g. silence, chores, in-laws')}
            data-testid="playbooks-search"
            className="w-full pl-9 pr-9 py-2.5 rounded-full border border-petal-rule bg-white font-body text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-ink"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={tr('清除搜尋', 'Clear search')} className="absolute right-3 top-1/2 -translate-y-1/2 text-petal-muted hover:text-petal-ink">
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </label>
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label={tr('依主題篩選', 'Filter by topic')}>
          {[{ key: null as string | null, label: tr('全部', 'All') }, ...categories].map((c) => (
            <button
              key={c.key ?? 'all'}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              onClick={() => setCategory(c.key)}
              data-testid={`playbooks-category-${c.key ?? 'all'}`}
              className={`shrink-0 px-3.5 py-1.5 rounded-full border font-body text-[13px] transition-colors ${
                category === c.key
                  ? 'bg-petal-ink text-petal-cream border-petal-ink'
                  : 'bg-transparent text-petal-ink-soft border-petal-rule hover:border-petal-ink hover:text-petal-ink'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {library.loading && (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 rounded-2xl bg-petal-cream-2 animate-pulse" />)}
        </div>
      )}

      {library.error && !library.data && (
        <div className="rounded-2xl border border-petal-rule bg-white p-5 text-center" data-testid="playbooks-load-error">
          <p className="font-body text-sm text-petal-ink-soft mb-3">{loadErrorMessage(library.error)}</p>
          <button type="button" onClick={() => void library.refetch()} className="px-4 py-2 rounded-full bg-petal-ink text-petal-cream font-body text-sm">
            {tr('再試一次', 'Try again')}
          </button>
        </div>
      )}

      {library.data && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-petal-rule bg-white p-6 text-center" data-testid="playbooks-no-match">
          <p className="font-display text-lg text-petal-ink mb-1">{tr('還沒有完全符合的手冊', 'No playbook matches that yet')}</p>
          <p className="font-body text-sm text-petal-ink-soft mb-4">
            {tr('換個說法試試，或先看看全部的主題。很多卡關其實是同一種循環換了樣子。', 'Try other words, or browse all topics. Many struggles are the same cycle in a different outfit.')}
          </p>
          <button type="button" onClick={() => { setQuery(''); setCategory(null); }} className="px-4 py-2 rounded-full bg-petal-ink text-petal-cream font-body text-sm">
            {tr('看全部手冊', 'See all playbooks')}
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((p) => (
            <PlaybookCard
              key={p.slug}
              p={p}
              saved={savedSlugs.has(p.slug)}
              onOpen={() => { trackPlaybook('card_opened', p.slug); setSlug(p.slug); }}
            />
          ))}
        </div>
      )}

      <section className="mt-8 rounded-2xl bg-petal-cream-2 border border-petal-rule p-5 md:p-6 text-center">
        <h2 className="font-display text-xl text-petal-ink mb-2">{tr('你們不需要每次都自己摸索', 'You don\'t have to figure it out alone')}</h2>
        <p className="font-body text-sm text-petal-ink-soft mb-4 max-w-xl mx-auto">
          {tr(
            '挑一份手冊讀完，試一段對話，再把你們的經驗記下來。Twogether 陪你們把方法變成日常。',
            'Pick a playbook, try one conversation, then note how it went. Twogether helps you turn the method into everyday habits.',
          )}
        </p>
        {!signedIn || authState.isGuest ? (
          <button
            type="button"
            onClick={() => { trackPlaybook('library_signup_cta'); setShowAuthModal(true); }}
            data-testid="playbooks-library-signup"
            className="px-5 py-2.5 rounded-full bg-petal-sage-deeper text-white font-body text-sm font-medium"
          >
            {tr('免費建立帳號', 'Create a free account')}
          </button>
        ) : (
          <p className="font-body text-xs text-petal-muted">{tr(`${PLAYBOOK_NAME}會持續增加新主題。`, `New topics are added to the ${PLAYBOOK_NAME} over time.`)}</p>
        )}
      </section>
    </div>
  );
};

export default PlaybooksView;
