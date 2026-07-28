import { useEffect, useRef, useState } from 'react';
import { Users, MessageCircle, Loader2, Send, Flag, ChevronDown, ChevronUp } from 'lucide-react';
import { apiService, type CommunityPoll, type PollVoice } from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatRelativeOrDate } from '../utils/datetime';

// 真實情侶會怎麼做: open-ended scenario polls. Vote among options, see the
// split, and leave a short 心聲. Public read; write actions prompt sign-in.

interface NotificationInput {
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

function PollCard({
  poll: initial,
  isAuthenticated,
  onRequireLogin,
  showNotification,
}: {
  poll: CommunityPoll;
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  showNotification: (n: NotificationInput) => void;
}) {
  const [poll, setPoll] = useState<CommunityPoll>(initial);
  const [voting, setVoting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [voices, setVoices] = useState<PollVoice[] | null>(null);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [sendingVoice, setSendingVoice] = useState(false);
  const tz = useTimezone();

  // Show result bars once the viewer has voted, or when not logged in (they
  // can see the split but not participate).
  const showResults = !!poll.myOptionId || !isAuthenticated;

  const vote = async (optionId: string) => {
    if (!isAuthenticated) {
      showNotification({ type: 'info', title: '請先登入', message: '登入後就能投票、留下你的心聲' });
      onRequireLogin();
      return;
    }
    if (voting) return;
    setVoting(true);
    try {
      const updated = await apiService.votePoll(poll.id, optionId);
      setPoll({ ...updated, voiceCount: poll.voiceCount, voices: poll.voices });
    } catch (err) {
      showNotification({ type: 'error', title: '投票失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setVoting(false);
    }
  };

  const toggleVoices = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && voices === null) {
      setLoadingVoices(true);
      try {
        const full = await apiService.getPoll(poll.id);
        setVoices(full.voices || []);
      } catch {
        setVoices([]);
      } finally {
        setLoadingVoices(false);
      }
    }
  };

  const sendVoice = async () => {
    if (!isAuthenticated) {
      showNotification({ type: 'info', title: '請先登入', message: '登入後就能留下你的心聲' });
      onRequireLogin();
      return;
    }
    const body = voiceText.trim();
    if (!body) return;
    setSendingVoice(true);
    try {
      const v = await apiService.addPollVoice(poll.id, body, poll.myOptionId);
      setVoices((prev) => [v, ...(prev || [])]);
      setPoll((p) => ({ ...p, voiceCount: (p.voiceCount || 0) + 1 }));
      setVoiceText('');
    } catch (err) {
      showNotification({ type: 'error', title: '送出失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    } finally {
      setSendingVoice(false);
    }
  };

  // Report is fire-and-forget with no guard; lock per voice so a double-tap
  // doesn't file duplicate reports.
  const reportedRef = useRef<Set<string>>(new Set());
  const reportVoice = async (voiceId: string) => {
    if (!isAuthenticated) { onRequireLogin(); return; }
    if (reportedRef.current.has(voiceId)) return;
    reportedRef.current.add(voiceId);
    try {
      await apiService.reportPollVoice(voiceId, 'inappropriate');
      showNotification({ type: 'success', title: '已收到你的檢舉', message: '我們會盡快處理' });
    } catch (err) {
      reportedRef.current.delete(voiceId); // allow retry on failure
      showNotification({ type: 'error', title: '檢舉失敗', message: err instanceof Error ? err.message : '請稍後再試' });
    }
  };

  return (
    <div className="bg-white border border-petal-rule-soft rounded-2xl p-4" data-testid="poll-card">
      <h3 className="font-medium text-petal-ink leading-snug">{poll.question}</h3>
      {poll.scenario && <p className="text-sm text-petal-ink-soft mt-1 leading-relaxed">{poll.scenario}</p>}

      <div className="mt-3 space-y-2">
        {poll.options.map((o) => {
          const picked = poll.myOptionId === o.id;
          if (showResults) {
            return (
              <div key={o.id} data-testid="poll-option-result" className="relative">
                <div className={`relative overflow-hidden rounded-xl border ${picked ? 'border-petal-rose-deep' : 'border-petal-rule'}`}>
                  <div
                    className={`absolute inset-y-0 left-0 ${picked ? 'bg-petal-rose/30' : 'bg-petal-sage/20'}`}
                    style={{ width: `${o.percent}%` }}
                  />
                  <div className="relative flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-petal-ink">{picked ? '✓ ' : ''}{o.label}</span>
                    <span className="text-xs text-petal-muted font-medium">{o.percent}%</span>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <button
              key={o.id}
              type="button"
              data-testid="poll-option-vote"
              onClick={() => vote(o.id)}
              disabled={voting}
              className="w-full text-left px-3 py-2 rounded-xl border border-petal-rule text-sm text-petal-ink hover:border-petal-rose-deep hover:bg-petal-rose/5 transition disabled:opacity-50"
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-3 text-[11px] text-petal-muted">
        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{poll.totalVotes} 人投票</span>
        <button
          type="button"
          data-testid="poll-voices-toggle"
          onClick={toggleVoices}
          className="inline-flex items-center gap-1 hover:text-petal-ink"
        >
          <MessageCircle className="w-3 h-3" />
          {poll.voiceCount || 0} 則心聲
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {!isAuthenticated && <span className="ml-auto">登入後也能投票、留言</span>}
      </div>

      {expanded && (
        <div className="mt-3 border-t border-petal-rule-soft pt-3 space-y-3" data-testid="poll-voices">
          <div className="flex gap-2">
            <input
              data-testid="poll-voice-input"
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              placeholder="說說你會怎麼做，或為什麼這樣選⋯"
              maxLength={500}
              className="flex-1 p-2.5 rounded-xl border border-petal-rule bg-white text-sm text-petal-ink placeholder:text-petal-muted focus:outline-none focus:border-petal-rose-deep"
            />
            <button
              type="button"
              data-testid="poll-voice-send"
              onClick={sendVoice}
              disabled={sendingVoice || voiceText.trim().length === 0}
              className="px-3 py-2 rounded-full bg-petal-ink text-petal-cream text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-1.5 disabled:opacity-40 disabled:shadow-none"
            >
              {sendingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>

          {loadingVoices ? (
            <div className="py-4 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin text-petal-rose-deep" /></div>
          ) : voices && voices.length > 0 ? (
            voices.map((v) => (
              <div key={v.id} className="bg-petal-cream border border-petal-rule-soft rounded-xl p-3">
                <div className="flex items-center gap-2 text-[11px] text-petal-muted">
                  <span className="font-medium text-petal-ink-soft">{v.authorName}</span>
                  {v.optionLabel && <span className="px-1.5 py-0.5 rounded-full bg-petal-sage/20 text-petal-ink">{v.optionLabel}</span>}
                  <span>{formatRelativeOrDate(v.createdAt, tz, { month: 'short', day: 'numeric' })}</span>
                  {!v.isMine && (
                    <button
                      type="button"
                      onClick={() => reportVoice(v.id)}
                      title="檢舉"
                      className="ml-auto text-petal-muted hover:text-petal-rose-deep"
                    >
                      <Flag className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-petal-ink mt-1 leading-relaxed whitespace-pre-wrap">{v.body}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-petal-ink-soft text-center py-2">還沒有人留下心聲，當第一個說出想法的人。</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PollsView({
  isAuthenticated,
  onRequireLogin,
  showNotification,
}: {
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  showNotification: (n: NotificationInput) => void;
}) {
  const [polls, setPolls] = useState<CommunityPoll[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getPolls()
      .then((p) => { if (!cancelled) setPolls(p); })
      .catch(() => { if (!cancelled) setPolls([]); });
    return () => { cancelled = true; };
  }, []);

  if (polls === null) {
    return <div className="py-10 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-petal-rose-deep" /></div>;
  }

  return (
    <div className="space-y-3" data-testid="polls-view">
      <p className="text-sm text-petal-ink-soft leading-relaxed">
        真實情侶會怎麼做？選一個你的答案，看看大家的選擇，也留下你的心聲。沒有標準答案，只有真實的聲音。
      </p>
      {polls.length === 0 ? (
        <div className="bg-white border border-petal-rule-soft rounded-2xl p-8 text-center text-petal-ink-soft">
          目前還沒有投票，晚點再來看看。
        </div>
      ) : (
        polls.map((p) => (
          <PollCard
            key={p.id}
            poll={p}
            isAuthenticated={isAuthenticated}
            onRequireLogin={onRequireLogin}
            showNotification={showNotification}
          />
        ))
      )}
    </div>
  );
}
