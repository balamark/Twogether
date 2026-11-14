import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Share2, Copy, Check, Clock, RotateCcw, ChevronDown, ShieldAlert, MessageCircle } from 'lucide-react';
import apiService from '../../services/api';
import type { Playbook, PlaybookApplyTarget } from '../../services/api';
import { useCachedQuery } from '../../services/queryCache';
import type { AuthState } from '../../App';
import { tr, getLocale } from '../../i18n/tr';
import PlaybookReflectionPanel from './PlaybookReflectionPanel';
import {
  PLAYBOOK_NAME, copyText, loadErrorMessage, playbookUrl, trackPlaybook, type NotificationInput,
} from './playbookShared';

// One Playbook, in the fixed seven-section framework (PCS v1.0 §2):
// 1 發生了什麼 · 2 雙方真正的感受 · 3 為什麼一直重複 · 4 換個方式說 ·
// 5 替代方案 · 6 建立共同約定 · 7 一起回顧. Everything is readable without an
// account; only saving and 我的經驗 need one.

interface PlaybookDetailProps {
  slug: string;
  authState: AuthState;
  showNotification: (n: NotificationInput) => void;
  setShowAuthModal: (open: boolean) => void;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  onReflectionCountChange: () => void;
  onBack: () => void;
  onOpen: (slug: string) => void;
  onApply: (target: PlaybookApplyTarget) => void;
}

const SECTION_TITLES = [
  tr('發生了什麼', 'The situation'),
  tr('雙方真正的感受', 'The hidden feelings'),
  tr('為什麼一直重複', 'The negative cycle'),
  tr('換個方式說', 'The better conversation'),
  tr('替代方案', 'Alternative solutions'),
  tr('建立共同約定', 'Make an agreement'),
  tr('一起回顧', 'Reflect together'),
];

const Section: React.FC<{ n: number; slug: string; children: React.ReactNode; tone?: 'plain' | 'soft' }> = ({ n, slug, children, tone = 'plain' }) => {
  const ref = useRef<HTMLElement>(null);
  // R5: which sections people actually reach (once per section per visit).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let fired = false;
    const io = new IntersectionObserver((entries) => {
      if (!fired && entries.some((e) => e.isIntersecting)) {
        fired = true;
        trackPlaybook(`section_${n}`, slug);
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [n, slug]);
  return (
    <section
      ref={ref}
      id={`playbook-section-${n}`}
      data-testid={`playbook-section-${n}`}
      className={`scroll-mt-20 rounded-2xl border border-petal-rule p-4 md:p-6 ${tone === 'soft' ? 'bg-petal-cream-2' : 'bg-white'}`}
    >
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-body text-[11px] font-medium text-petal-rose-deep tabular-nums">{`0${n}`}</span>
        <h2 className="font-display text-xl md:text-2xl text-petal-ink">{SECTION_TITLES[n - 1]}</h2>
      </div>
      {children}
    </section>
  );
};

const CopyButton: React.FC<{ text: string; testId: string; label?: string; onCopied?: () => void }> = ({ text, testId, label, onCopied }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setDone(true);
          onCopied?.();
          setTimeout(() => setDone(false), 1800);
        }
      }}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-petal-rule font-body text-xs text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink"
    >
      {done ? <Check className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
      {done ? tr('已複製', 'Copied') : (label || tr('複製這段話', 'Copy these words'))}
    </button>
  );
};

/** Section 3: the cycle as a loop of numbered steps that visibly returns to step 1. */
const CycleFlow: React.FC<{ steps: string[] }> = ({ steps }) => (
  <div className="relative" data-testid="playbook-cycle">
    <ol className="relative space-y-2 pl-0">
      {steps.map((s, i) => (
        <li key={i} className="relative flex items-start gap-3">
          <span className={`shrink-0 w-7 h-7 rounded-full grid place-items-center font-body text-xs font-medium ${i % 2 === 0 ? 'bg-petal-rose-soft text-petal-rose-deep' : 'bg-purple-200 text-purple-700'}`}>
            {i + 1}
          </span>
          <span className="flex-1 rounded-xl border border-petal-rule bg-petal-cream px-3 py-2 font-body text-sm text-petal-ink leading-relaxed">{s}</span>
          {i < steps.length - 1 && (
            <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-12px)] w-px bg-petal-rule" />
          )}
        </li>
      ))}
    </ol>
    <div className="mt-2 flex items-center gap-2 pl-1 font-body text-xs text-petal-rose-deep">
      <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
      {tr('又回到第 1 步，循環再來一次', 'Back to step 1, and the cycle repeats')}
    </div>
  </div>
);

const PlaybookDetail: React.FC<PlaybookDetailProps> = ({
  slug, authState, showNotification, setShowAuthModal, saved, onSavedChange, onReflectionCountChange, onBack, onOpen, onApply,
}) => {
  const q = useCachedQuery<Playbook>(`playbooks|detail|${slug}|${getLocale()}`, () => apiService.getPlaybook(slug), { staleMs: 5 * 60_000 });
  const p = q.data;
  const [picked, setPicked] = useState<string[]>([]);
  const [agreed, setAgreed] = useState<number[]>([]);
  const [showSafety, setShowSafety] = useState(false);
  const signedIn = authState.isAuthenticated;
  const isVisitor = !signedIn || !!authState.isGuest;

  useEffect(() => {
    trackPlaybook('viewed', slug);
    setPicked([]);
    setAgreed([]);
  }, [slug]);

  useEffect(() => {
    if (!p) return;
    const prev = document.title;
    document.title = `${p.title} · ${PLAYBOOK_NAME} | Twogether`;
    return () => { document.title = prev; };
  }, [p]);

  const toggleSave = async () => {
    if (!signedIn) {
      trackPlaybook('save_gate', slug);
      showNotification({
        type: 'info',
        title: tr('收藏需要免費帳號', 'Saving needs a free account'),
        message: tr('你可以繼續讀完整份手冊、複製裡面的說法；註冊後就能收藏手冊、寫下你們的經驗。', 'You can keep reading and copy any of the scripts. Sign up to save playbooks and keep notes on your experience.'),
      });
      setShowAuthModal(true);
      return;
    }
    const next = !saved;
    onSavedChange(next); // optimistic (R7)
    trackPlaybook(next ? 'saved' : 'unsaved', slug);
    try {
      if (next) await apiService.savePlaybook(slug);
      else await apiService.unsavePlaybook(slug);
    } catch (e) {
      onSavedChange(!next);
      showNotification({
        type: 'error',
        title: next ? tr('收藏沒有成功', 'Couldn\'t save') : tr('取消收藏沒有成功', 'Couldn\'t remove it'),
        message: (e as Error)?.message || tr('請稍後再按一次', 'Please tap again in a moment.'),
      });
    }
  };

  const share = async () => {
    const url = playbookUrl(slug);
    trackPlaybook('shared', slug);
    try {
      if (navigator.share && p) {
        await navigator.share({ title: p.title, text: p.hook, url });
        return;
      }
    } catch { /* user dismissed the share sheet: fall through to copy */ }
    const ok = await copyText(url);
    showNotification(ok
      ? { type: 'success', title: tr('連結已複製', 'Link copied'), message: tr('貼給另一半，一起讀這份手冊。不用註冊也打得開。', 'Send it to your partner to read together. It opens without an account.') }
      : { type: 'warning', title: tr('沒辦法自動複製', 'Couldn\'t copy automatically'), message: tr(`請手動複製這個網址：${url}`, `Please copy this link by hand: ${url}`) });
  };

  const apply = () => {
    if (!p) return;
    trackPlaybook('apply_clicked', slug);
    if (!signedIn) {
      showNotification({
        type: 'info',
        title: tr('免費註冊，和另一半一起試', 'Sign up free to try it together'),
        message: tr('建立帳號後可以邀請另一半，在 Twogether 裡用這份手冊開始一段有引導的對話。', 'Create an account to invite your partner and start a guided conversation with this playbook.'),
      });
      setShowAuthModal(true);
      return;
    }
    onApply(p.apply);
  };

  if (q.error && !p) {
    const notFound = (q.error as Error & { error_code?: string }).error_code === 'PLAYBOOK_NOT_FOUND';
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center" data-testid="playbook-load-error">
        <p className="font-display text-xl text-petal-ink mb-2">{notFound ? tr('找不到這份手冊', 'Playbook not found') : tr('手冊暫時打不開', 'Couldn\'t open this playbook')}</p>
        <p className="font-body text-sm text-petal-ink-soft mb-5">{loadErrorMessage(q.error)}</p>
        <div className="flex justify-center gap-2">
          {!notFound && (
            <button type="button" onClick={() => void q.refetch()} className="px-4 py-2 rounded-full border border-petal-rule font-body text-sm">{tr('再試一次', 'Try again')}</button>
          )}
          <button type="button" onClick={onBack} className="px-4 py-2 rounded-full bg-petal-ink text-petal-cream font-body text-sm">{tr('看所有手冊', 'See all playbooks')}</button>
        </div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4" aria-busy="true">
        <div className="h-8 w-2/3 rounded bg-petal-cream-2 animate-pulse" />
        <div className="h-4 w-full rounded bg-petal-cream-2 animate-pulse" />
        <div className="h-48 rounded-2xl bg-petal-cream-2 animate-pulse" />
      </div>
    );
  }

  const bc = p.betterConversation;
  // Keep the content's order (PB-001 starts with the partner who declines).
  const scripts = (Object.keys(bc) as Array<keyof typeof bc>)
    .filter((k): k is 'partnerA' | 'partnerB' => k === 'partnerA' || k === 'partnerB')
    .map((k) => ({ key: k, ...bc[k] }));
  const agreementText = `${p.agreement.title}\n\n${p.agreement.statements.map((s) => `• ${s}`).join('\n')}`;
  const pickedTitles = p.alternativeSolutions.filter((a) => picked.includes(a.id)).map((a) => a.title);

  return (
    <article className="max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-8" data-testid="playbook-detail" data-slug={p.slug}>
      <button type="button" onClick={onBack} data-testid="playbook-back" className="inline-flex items-center gap-1 font-body text-sm text-petal-ink-soft hover:text-petal-ink mb-4">
        <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
        {tr('所有手冊', 'All playbooks')}
      </button>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-[11px] uppercase tracking-[0.14em] text-petal-muted mb-2">
          <span>{PLAYBOOK_NAME}</span><span aria-hidden>·</span><span>{p.categoryLabel}</span><span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1 normal-case tracking-normal"><Clock className="w-3 h-3" strokeWidth={1.5} />{tr(`${p.estimatedReadingMinutes} 分鐘閱讀`, `${p.estimatedReadingMinutes} min read`)}</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-light tracking-tight text-petal-ink leading-tight mb-2">
          <span className="mr-2" aria-hidden>{p.emoji}</span>{p.title}
        </h1>
        <p className="font-body text-base text-petal-ink-soft leading-relaxed mb-4">{p.subtitle}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleSave}
            data-testid="playbook-save"
            aria-pressed={saved}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border font-body text-sm transition-colors ${saved ? 'bg-petal-rose-soft/40 border-petal-rose-deep/50 text-petal-ink' : 'border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink'}`}
          >
            <Bookmark className={`w-4 h-4 ${saved ? 'fill-current text-petal-rose-deep' : ''}`} strokeWidth={1.5} />
            {saved ? tr('已收藏', 'Saved') : tr('收藏這份手冊', 'Save this playbook')}
          </button>
          <button type="button" onClick={share} data-testid="playbook-share" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-petal-rule font-body text-sm text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink">
            <Share2 className="w-4 h-4" strokeWidth={1.5} />
            {tr('分享給另一半', 'Share with your partner')}
          </button>
        </div>
        <nav className="mt-5 flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1" aria-label={tr('手冊段落', 'Playbook sections')}>
          {SECTION_TITLES.map((t, i) => (
            <a key={t} href={`#playbook-section-${i + 1}`} className="shrink-0 px-2.5 py-1 rounded-full bg-petal-cream-2 font-body text-xs text-petal-ink-soft hover:text-petal-ink">
              {i + 1}. {t}
            </a>
          ))}
        </nav>
      </header>

      <div className="space-y-4">
        <Section n={1} slug={p.slug}>
          <p className="font-body text-[15px] text-petal-ink leading-relaxed mb-3">{p.situation.summary}</p>
          <ul className="space-y-1.5">
            {p.situation.examples.map((x, i) => (
              <li key={i} className="flex gap-2 font-body text-sm text-petal-ink-soft leading-relaxed"><span className="text-petal-rose" aria-hidden>•</span>{x}</li>
            ))}
          </ul>
        </Section>

        <Section n={2} slug={p.slug}>
          <div className="grid gap-3 md:grid-cols-2">
            {[p.hiddenFeelings.partnerA, p.hiddenFeelings.partnerB].map((side, i) => (
              <div key={i} className={`rounded-xl border p-3.5 ${i === 0 ? 'border-petal-rose-soft bg-petal-rose-soft/15' : 'border-purple-200 bg-purple-50'}`} data-testid={`playbook-feelings-${i === 0 ? 'a' : 'b'}`}>
                <h3 className="font-display text-base text-petal-ink mb-2">{side.role}</h3>
                <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1">{tr('可能的感受', 'Possible feelings')}</div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {side.emotions.map((e) => <span key={e} className="px-2 py-0.5 rounded-full bg-white border border-petal-rule font-body text-xs text-petal-ink">{e}</span>)}
                </div>
                <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1">{tr('底下真正的需要', 'Underlying needs')}</div>
                <ul className="space-y-1">
                  {side.underlyingNeeds.map((n) => <li key={n} className="font-body text-sm text-petal-ink-soft">· {n}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-petal-cream-2 px-4 py-3">
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.12em] text-petal-rose-deep mb-1">{tr('關鍵洞察', 'Core insight')}</div>
            <p className="font-body text-sm text-petal-ink leading-relaxed">{p.hiddenFeelings.coreInsight}</p>
          </div>
          <p className="mt-2 font-body text-[11px] text-petal-muted">{tr('這些是可能的感受，不是診斷；每對伴侶的狀況都不一樣。', 'These are possible feelings, not a diagnosis. Every couple is different.')}</p>
        </Section>

        <Section n={3} slug={p.slug}>
          <CycleFlow steps={p.negativeCycle.steps} />
          <div className="mt-4">
            <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1.5">{tr('久了之後', 'Over time')}</div>
            <div className="flex flex-wrap gap-1.5">
              {p.negativeCycle.consequences.map((c) => <span key={c} className="px-2.5 py-1 rounded-full bg-petal-cream-2 font-body text-xs text-petal-ink-soft">{c}</span>)}
            </div>
          </div>
        </Section>

        <Section n={4} slug={p.slug}>
          <p className="font-body text-sm text-petal-ink-soft mb-3">{tr('可以直接說出口的話。照著唸也可以，換成你們習慣的語氣更好。', 'Words you can actually say. Read them as written, or better, put them in your own voice.')}</p>
          <div className="space-y-3">
            {scripts.map((s) => (
              <div key={s.key} className={`rounded-xl border p-4 ${s.key === 'partnerA' ? 'border-petal-rose-soft' : 'border-purple-200'}`} data-testid={`playbook-script-${s.key}`}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <h3 className="font-display text-base text-petal-ink">{s.label}</h3>
                  <CopyButton text={s.script} testId={`playbook-copy-${s.key}`} onCopied={() => trackPlaybook(`script_copied_${s.key === 'partnerA' ? 'a' : 'b'}`, p.slug)} />
                </div>
                <blockquote className="font-body text-[15px] text-petal-ink leading-relaxed whitespace-pre-line border-l-2 border-petal-rose pl-3">{tr('「', '“')}{s.script}{tr('」', '”')}</blockquote>
              </div>
            ))}
          </div>
          {bc.elements && bc.elements.length > 0 && (
            <div className="mt-4">
              <div className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-2">{tr('這段話包含的元素', 'What makes these words work')}</div>
              <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                {bc.elements.map((e, i) => (
                  <div key={e.name} className="rounded-xl bg-petal-cream-2 p-3">
                    <div className="font-body text-xs font-medium text-petal-rose-deep mb-0.5">{i + 1}. {e.name}</div>
                    <div className="font-body text-xs text-petal-ink-soft leading-relaxed">{e.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section n={5} slug={p.slug}>
          <p className="font-body text-sm text-petal-ink-soft mb-3">{tr('不是只有「答應」或「拒絕」。勾選你願意試的，寫經驗時會一起帶入。', 'It doesn\'t have to be yes or no. Tick the ones you\'d try; they\'ll carry into your notes.')}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {p.alternativeSolutions.map((a) => {
              const on = picked.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  data-testid={`playbook-alt-${a.id}`}
                  onClick={() => {
                    setPicked((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]));
                    if (!on) trackPlaybook('alternative_picked', p.slug);
                  }}
                  className={`text-left rounded-xl border p-3 transition-colors ${on ? 'border-petal-sage-deep bg-purple-50' : 'border-petal-rule bg-white hover:border-petal-ink'}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 w-4 h-4 rounded border grid place-items-center ${on ? 'bg-petal-sage-deeper border-petal-sage-deeper text-white' : 'border-petal-rule'}`}>
                      {on && <Check className="w-3 h-3" strokeWidth={2} />}
                    </span>
                    <span>
                      <span className="block font-body text-sm text-petal-ink">{a.title}</span>
                      <span className="block font-body text-xs text-petal-muted mt-0.5">{tr('回應的需要：', 'Meets the need for: ')}{a.emotionalNeedAddressed}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {p.alternativesNote && (
            <p className="mt-3 rounded-xl border border-petal-rose-soft bg-petal-rose-soft/15 px-3 py-2 font-body text-xs text-petal-ink-soft leading-relaxed" data-testid="playbook-alternatives-note">
              {p.alternativesNote}
            </p>
          )}
          {!p.alternativesNote && (
            <p className="mt-3 font-body text-xs text-petal-muted">{tr('替代方案是邀請，不是義務；兩個人都可以對任何一項說不。', 'Alternatives are invitations, not obligations. Either of you can say no to any of them.')}</p>
          )}
        </Section>

        <Section n={6} slug={p.slug} tone="soft">
          <div className="rounded-xl bg-white border border-petal-rule p-4" data-testid="playbook-agreement">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <h3 className="font-display text-lg text-petal-ink">{p.agreement.title}</h3>
              <CopyButton text={agreementText} testId="playbook-copy-agreement" label={tr('複製約定', 'Copy agreement')} onCopied={() => trackPlaybook('agreement_copied', p.slug)} />
            </div>
            <ul className="space-y-2">
              {p.agreement.statements.map((s, i) => {
                const on = agreed.includes(i);
                return (
                  <li key={i}>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setAgreed((prev) => (on ? prev.filter((x) => x !== i) : [...prev, i]))}
                        className="mt-1 accent-[#556B47]"
                      />
                      <span className={`font-body text-sm leading-relaxed ${on ? 'text-petal-ink' : 'text-petal-ink-soft'}`}>{s}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 font-body text-[11px] text-petal-muted">
              {tr('範例約定：兩個人都讀過、都自願同意才算數。可以刪改成你們自己的版本。', 'Example agreement: it only counts if you have both read it and both agree freely. Edit it into your own version.')}
            </p>
          </div>
        </Section>

        <Section n={7} slug={p.slug}>
          <p className="font-body text-sm text-petal-ink-soft mb-2">{tr('試了一週之後，兩個人各自回答，再交換聊聊：', 'After a week of trying, each answer these, then compare notes:')}</p>
          <ol className="space-y-1.5 mb-4 list-decimal pl-5">
            {p.reflectionQuestions.map((qq) => <li key={qq} className="font-body text-sm text-petal-ink leading-relaxed">{qq}</li>)}
          </ol>
          <PlaybookReflectionPanel
            playbook={p}
            authState={authState}
            pickedAlternatives={pickedTitles}
            showNotification={showNotification}
            setShowAuthModal={setShowAuthModal}
            onCountChange={onReflectionCountChange}
          />
        </Section>

        <section className="rounded-2xl bg-petal-ink text-petal-cream p-5 md:p-6" data-testid="playbook-apply">
          <h2 className="font-display text-xl mb-1">{tr('這聽起來像你們嗎？', 'Does this sound like your relationship?')}</h2>
          <p className="font-body text-sm text-petal-cream/80 mb-4 leading-relaxed">
            {p.apply === 'intimacy'
              ? tr('用「替代方案協商」邀請另一半：說出你的需要，附上你覺得可行的替代方案，讓對方在沒有壓力的情況下回應。', 'Use "Talk about alternatives" to invite your partner: share your need and the alternatives you\'d be happy with, so they can answer without pressure.')
              : tr('在「說開一件事」寫下你們的情況，AI 會幫你整理成對方聽得進去的版本，再由 AI 諮商師陪你們一起談。', 'Write your situation in "Talk it through". AI helps put it into words your partner can hear, and the AI counselor can guide you both.')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={apply} data-testid="playbook-apply-start" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-petal-cream text-petal-ink font-body text-sm font-medium">
              <MessageCircle className="w-4 h-4" strokeWidth={1.5} />
              {p.apply === 'intimacy' ? tr('用替代方案邀請另一半', 'Invite with alternatives') : tr('和另一半開始對話', 'Start a conversation together')}
            </button>
            {isVisitor && (
              <button type="button" onClick={() => { trackPlaybook('detail_signup_cta', p.slug); setShowAuthModal(true); }} data-testid="playbook-apply-signup" className="px-4 py-2.5 rounded-full border border-petal-cream/40 font-body text-sm">
                {tr('免費建立帳號', 'Create a free account')}
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-petal-rule bg-white p-4" data-testid="playbook-safety">
          <button type="button" onClick={() => setShowSafety((v) => !v)} aria-expanded={showSafety} className="w-full flex items-center gap-2 text-left">
            <ShieldAlert className="w-4 h-4 text-petal-rose-deep shrink-0" strokeWidth={1.5} />
            <span className="flex-1 font-body text-sm text-petal-ink">{tr('如果這不只是溝通的問題', 'If this is more than a communication problem')}</span>
            <ChevronDown className={`w-4 h-4 text-petal-muted transition-transform ${showSafety ? 'rotate-180' : ''}`} strokeWidth={1.5} />
          </button>
          {showSafety && (
            <div className="mt-3 space-y-2 font-body text-sm text-petal-ink-soft leading-relaxed">
              {p.safetyNotes.map((n) => <p key={n}>{n}</p>)}
              <p>
                {tr('如果你正在經歷暴力、威脅或被強迫，安全永遠排在溝通之前。台灣可撥 ', 'If you are experiencing violence, threats or coercion, safety always comes before communication. In Taiwan call ')}
                <a href="tel:113" className="underline text-petal-rose-deep">113</a>
                {tr(' 保護專線，或 ', ' (protection hotline) or ')}
                <a href="tel:1925" className="underline text-petal-rose-deep">1925</a>
                {tr(' 安心專線；在其他地區，請聯絡當地的緊急求助專線。', ' (mental-health support line); elsewhere, contact your local emergency number.')}
              </p>
              <p className="text-xs text-petal-muted">{tr('這份手冊是溝通練習的工具，不能取代專業諮商或危機協助。', 'This playbook is a communication tool, not a substitute for professional counseling or crisis support.')}</p>
            </div>
          )}
        </section>

        {p.related.length > 0 && (
          <section data-testid="playbook-related">
            <h2 className="font-body text-xs font-medium uppercase tracking-[0.14em] text-petal-muted mb-2">{tr('相關的手冊', 'Related playbooks')}</h2>
            <div className="grid gap-2 md:grid-cols-3">
              {p.related.map((r) => (
                <button
                  key={r.slug}
                  type="button"
                  onClick={() => { trackPlaybook('related_opened', r.slug); onOpen(r.slug); }}
                  data-testid={`playbook-related-${r.slug}`}
                  className="text-left rounded-xl border border-petal-rule bg-white p-3 hover:border-petal-ink"
                >
                  <div className="font-body text-[11px] text-petal-muted mb-0.5"><span aria-hidden>{r.emoji}</span> {r.categoryLabel}</div>
                  <div className="font-display text-sm text-petal-ink leading-snug">{r.title}</div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
};

export default PlaybookDetail;
