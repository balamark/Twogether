import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, PauseCircle, PlayCircle, Plus, X, Users, Play } from 'lucide-react';
import apiService from '../services/api';
import type { AlternativePlan, AlternativePlanInput } from '../services/api';
import { useAlternativePlanSamples } from '../data/alternativePlanSamples';
import type { AlternativePlanSample } from '../data/alternativePlanSamples';
import { SampleTag } from './LoggedOutPreview';
import { tr } from '../i18n/tr';

// 替代方案協商 — the couple's co-authored plans. Only plans BOTH partners
// approved (current wording) sit on the shared list; any edit sends a plan back
// to 待確認; either partner can pause one at any time. A plan's interaction can
// be one of the couple's roleplay scripts, deep-linked via「查看劇本」.

/** Minimal script shape — satisfied by built-in, custom and marketplace scripts. */
export interface PlanScript {
  id: string;
  title: string;
  scenario?: string;
}

interface AlternativePlansPanelProps {
  partnerNickname?: string;
  /** Invitation the plans came out of, linked on create when set. */
  requestId?: string;
  /** Open the invite form on the 替代方案協商 type (empty-state CTA). */
  onSendInvite?: () => void;
  /** The couple's scripts (built-in + custom); favorites load lazily. */
  scripts?: PlanScript[];
  /** Open the named script in 角色扮演. */
  onViewScript?: (title: string) => void;
}

type Feedback = { type: 'info' | 'error'; message: string };
type Draft = { title: string; interaction: string; timePrep: string; scriptId: string; scriptTitle: string; scriptScenario: string };

const EMPTY_DRAFT: Draft = { title: '', interaction: '', timePrep: '', scriptId: '', scriptTitle: '', scriptScenario: '' };

const errCode = (err: unknown) => (err as { error_code?: string })?.error_code;
const errMessage = (err: unknown, fallback: string) =>
  (err instanceof Error && err.message) || fallback;

const CONSENT_NOTE = tr(
  '事先認可不代表未來必須執行；每次實際互動前，仍要確認雙方當下的意願。',
  'Approving a plan never means you have to do it. Every time, check that you both still want to.',
);

const toDraft = (
  p: Pick<AlternativePlan, 'title' | 'interaction' | 'timePrep' | 'scriptId' | 'scriptTitle' | 'scriptScenario'> | AlternativePlanSample,
  scriptScenario?: string | null,
): Draft => ({
  title: p.title || '',
  interaction: p.interaction || '',
  timePrep: p.timePrep || '',
  scriptId: p.scriptId || '',
  scriptTitle: p.scriptTitle || '',
  scriptScenario: ('scriptScenario' in p ? p.scriptScenario : scriptScenario) || '',
});

const toInput = (d: Draft): AlternativePlanInput => ({
  title: d.title.trim(),
  interaction: d.interaction.trim(),
  timePrep: d.timePrep.trim(),
  scriptId: d.scriptTitle ? d.scriptId || null : null,
  scriptTitle: d.scriptTitle || null,
  scriptScenario: d.scriptTitle ? d.scriptScenario || null : null,
});

const AlternativePlansPanel: React.FC<AlternativePlansPanelProps> = ({ partnerNickname, requestId, onSendInvite, scripts = [], onViewScript }) => {
  const partner = partnerNickname || tr('另一半', 'your partner');
  const samples = useAlternativePlanSamples();
  const [favoriteScripts, setFavoriteScripts] = useState<PlanScript[]>([]);
  const [plans, setPlans] = useState<AlternativePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // null = closed; 'new' = proposing; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showDisabled, setShowDisabled] = useState(false);
  const tempSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setGate(null);
      setPlans(await apiService.getAlternativePlans());
    } catch (err) {
      if (errCode(err) === 'NO_COMPLETE_COUPLE') setGate(errMessage(err, ''));
      else setFeedback({ type: 'error', message: errMessage(err, tr('無法載入替代方案，請稍後重新整理再試', 'Couldn\'t load your plans. Please refresh in a moment')) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replacePlan = (id: string, next: AlternativePlan) =>
    setPlans((prev) => prev.map((p) => (p.id === id ? next : p)));

  const openEditor = (target: string, initial: Draft) => {
    setEditing(target);
    setDraft(initial);
    setFeedback(null);
  };

  // Lazily add marketplace favorites to the picker the first time it opens.
  const favoritesRequested = useRef(false);
  useEffect(() => {
    if (!editing || favoritesRequested.current) return;
    favoritesRequested.current = true;
    apiService.getFavoritedMarketplaceScripts()
      .then((favs) => setFavoriteScripts(favs.map((f) => ({ id: f.id, title: f.title, scenario: f.scenario }))))
      .catch(() => { /* non-fatal — built-in + custom scripts still listed */ });
  }, [editing]);

  const scriptOptions = useMemo(() => {
    const map = new Map<string, PlanScript>();
    for (const sc of [...scripts, ...favoriteScripts]) {
      if (sc?.title && !map.has(sc.title)) map.set(sc.title, sc);
    }
    return Array.from(map.values());
  }, [scripts, favoriteScripts]);

  const scenarioFor = (title?: string | null) =>
    (title && scriptOptions.find((sc) => sc.title === title)?.scenario) || null;

  // A plan needs something to do: a description, a script, or both.
  const canSave = draft.title.trim().length > 0 && (draft.interaction.trim().length > 0 || !!draft.scriptTitle);

  // Submit returns instantly (playbook §R7): close the editor, show the plan
  // right away, reconcile in the background. On failure reopen the draft; a
  // timeout may have succeeded, so refetch instead of inviting a duplicate.
  const save = () => {
    if (!canSave || !editing) return;
    const target = editing;
    const savedDraft = draft;
    const input = toInput(savedDraft);
    setEditing(null);

    if (target === 'new') {
      const tempId = `temp-${++tempSeq.current}`;
      const now = new Date().toISOString();
      setPlans((prev) => [{
        id: tempId, title: input.title, interaction: input.interaction || null, timePrep: input.timePrep || null,
        scriptId: input.scriptId, scriptTitle: input.scriptTitle, scriptScenario: input.scriptScenario,
        status: 'pending', revision: 1, approvedByMe: true, approvedByPartner: false,
        createdByMe: true, updatedByMe: true, disabledByMe: false, createdAt: now, updatedAt: now,
      }, ...prev]);
      apiService.createAlternativePlan({ ...input, requestId })
        .then((plan) => {
          replacePlan(tempId, plan);
          setFeedback({ type: 'info', message: tr(`方案已提出，等${partner}看過並認可後就會加入共同清單`, `Plan proposed. Once ${partner} reviews and approves it, it joins your shared list`) });
        })
        .catch((err) => {
          setPlans((prev) => prev.filter((p) => p.id !== tempId));
          if (errCode(err) === 'TIMEOUT') {
            setFeedback({ type: 'info', message: tr('連線較慢，方案可能已送出，已重新整理清單確認', 'The connection was slow and the plan may have been sent. We refreshed the list to check') });
            load();
            return;
          }
          openEditor('new', savedDraft);
          setFeedback({ type: errCode(err) === 'PLAN_LIMIT' ? 'info' : 'error', message: errMessage(err, tr('方案沒有送出，請稍後再試；你寫的內容仍保留著', 'The plan wasn\'t sent. Please try again; your text is still here')) });
        });
      return;
    }

    const before = plans.find((p) => p.id === target);
    if (!before) return;
    // An edit is new wording: only the editor has approved it now.
    replacePlan(target, {
      ...before, ...input,
      interaction: input.interaction || null, timePrep: input.timePrep || null,
      status: 'pending', approvedByMe: true, approvedByPartner: false, updatedByMe: true,
    });
    apiService.updateAlternativePlan(target, input)
      .then((plan) => {
        replacePlan(target, plan);
        setFeedback({ type: 'info', message: tr(`方案已更新，需要${partner}重新認可`, `Plan updated. ${partner} needs to approve it again`) });
      })
      .catch((err) => {
        replacePlan(target, before);
        if (errCode(err) === 'TIMEOUT') {
          setFeedback({ type: 'info', message: tr('連線較慢，修改可能已送出，已重新整理清單確認', 'The connection was slow and your edit may have been saved. We refreshed the list to check') });
          load();
          return;
        }
        openEditor(target, savedDraft);
        setFeedback({ type: 'error', message: errMessage(err, tr('方案沒有更新，請稍後再試；你修改的內容仍保留著', 'The plan wasn\'t updated. Please try again; your edits are still here')) });
      });
  };

  // Optimistic approve; the revision guard rejects approving wording the
  // partner just changed, in which case show them the new version.
  const approve = (plan: AlternativePlan) => {
    replacePlan(plan.id, { ...plan, approvedByMe: true, status: plan.approvedByPartner ? 'approved' : 'pending' });
    apiService.approveAlternativePlan(plan.id, plan.revision)
      .then((next) => {
        replacePlan(plan.id, next);
        setFeedback({
          type: 'info',
          message: next.status === 'approved'
            ? tr('雙方都認可了，方案已加入共同清單', 'You both approved it. It\'s on your shared list now')
            : tr(`已記下你的認可，等${partner}也認可後就會加入共同清單`, `Your approval is saved. It joins the shared list once ${partner} approves too`),
        });
      })
      .catch((err) => {
        replacePlan(plan.id, plan);
        if (errCode(err) === 'PLAN_CHANGED') {
          setFeedback({ type: 'info', message: errMessage(err, tr(`${partner}剛修改了這個方案，請先看過新內容再決定是否認可`, `${partner} just changed this plan. Read the new version before deciding`)) });
          load();
          return;
        }
        setFeedback({ type: 'error', message: errMessage(err, tr('認可沒有送出，請稍後再試', 'Your approval wasn\'t sent. Please try again in a moment')) });
      });
  };

  const setActive = (plan: AlternativePlan, active: boolean) => {
    replacePlan(plan.id, active
      ? { ...plan, status: 'pending', approvedByMe: true, approvedByPartner: false, disabledAt: null }
      : { ...plan, status: 'disabled', disabledByMe: true, disabledAt: new Date().toISOString() });
    apiService.setAlternativePlanActive(plan.id, active)
      .then((next) => {
        replacePlan(plan.id, next);
        setFeedback({
          type: 'info',
          message: active
            ? tr(`方案已重新啟用，等${partner}再次認可後會回到共同清單`, `Plan reactivated. It returns to the shared list once ${partner} approves again`)
            : tr('方案已停用，不再出現在共同清單；之後想再討論可以重新啟用', 'Plan paused and off the shared list. Reactivate it whenever you want to talk again'),
        });
      })
      .catch((err) => {
        replacePlan(plan.id, plan);
        setFeedback({ type: 'error', message: errMessage(err, active ? tr('重新啟用沒有成功，請稍後再試', 'Couldn\'t reactivate the plan. Please try again') : tr('停用沒有成功，請稍後再試', 'Couldn\'t pause the plan. Please try again')) });
      });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-petal-rule border-t-petal-rose-deep"></div>
      </div>
    );
  }

  const approved = plans.filter((p) => p.status === 'approved');
  const pending = plans.filter((p) => p.status === 'pending');
  const disabled = plans.filter((p) => p.status === 'disabled');

  const samplesBlock = (
    <div className="space-y-3" data-testid="alt-plan-samples">
      {samples.map((s, i) => (
        <div key={s.id} className="rounded-xl border border-petal-rule-soft bg-petal-cream-2/30 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="font-medium text-sm text-petal-ink">{s.title}</div>
            <SampleTag />
          </div>
          <PlanFields plan={s} onViewScript={onViewScript} />
          {!gate && (
            <button
              type="button"
              data-testid={`alt-plan-use-${i}`}
              onClick={() => openEditor('new', toDraft(s, scenarioFor(s.scriptTitle)))}
              className="mt-3 text-sm text-petal-rose-deep hover:text-pink-700 underline underline-offset-2"
            >
              {tr('用這個範例開始', 'Start from this example')}
            </button>
          )}
        </div>
      ))}
    </div>
  );

  // Unpaired: why blocked + what you can do (read the samples) + CTA.
  if (gate) {
    return (
      <div className="space-y-4" data-testid="alt-plans-gate">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">{gate}</p>
          {onSendInvite && (
            <button type="button" onClick={onSendInvite} className="mt-3 px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm">
              {tr('先看看怎麼發起討論', 'See how to start a conversation')}
            </button>
          )}
        </div>
        {samplesBlock}
      </div>
    );
  }

  const renderPlan = (plan: AlternativePlan) => (
    <PlanCard
      key={plan.id}
      plan={plan}
      partner={partner}
      busy={plan.id.startsWith('temp-')}
      onApprove={() => approve(plan)}
      onEdit={() => openEditor(plan.id, toDraft(plan))}
      onToggleActive={() => setActive(plan, plan.status === 'disabled')}
      onViewScript={onViewScript}
    />
  );

  const editor = (opts: { key?: string; isNew?: boolean; willResetApproval?: boolean }) => (
    <PlanEditor
      key={opts.key}
      draft={draft}
      onChange={setDraft}
      onCancel={() => setEditing(null)}
      onSave={save}
      canSave={canSave}
      isNew={opts.isNew}
      willResetApproval={opts.willResetApproval}
      scripts={scriptOptions}
      onViewScript={onViewScript}
    />
  );

  return (
    <div className="space-y-6" data-testid="alt-plans-panel">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="font-display text-xl text-petal-ink">{tr('共同方案', 'Shared plans')}</h3>
          <p className="text-sm text-petal-ink-soft mt-1 leading-relaxed">
            {tr('當原本期待的親密暫時無法實現，把你們都喜歡的方式寫下來。雙方都認可的方案才會加入共同清單。', 'When the intimacy you hoped for can\'t happen right now, write down the ways you\'d both enjoy. Only plans you both approve join the shared list.')}
          </p>
        </div>
        {editing !== 'new' && (
          <button
            type="button"
            data-testid="alt-plan-new"
            onClick={() => openEditor('new', EMPTY_DRAFT)}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            {tr('提出方案', 'Propose a plan')}
          </button>
        )}
      </div>

      <p className="text-xs text-petal-muted border-l-2 border-petal-rose-soft pl-3">{CONSENT_NOTE}</p>

      {feedback && (
        <div
          role="status"
          className={`rounded-md border p-3 text-sm flex items-start justify-between gap-2 ${
            feedback.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-petal-cream-2/50 border-petal-rule text-petal-ink'
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label={tr('關閉', 'Close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {editing === 'new' && (
        editor({ isNew: true })
      )}

      {plans.length === 0 && editing !== 'new' && (
        // Empty state = mini-onboarding: value line + CTA + samples.
        <div className="space-y-4" data-testid="alt-plans-empty">
          <div className="rounded-xl border border-petal-rule-soft p-4 text-center">
            <p className="text-sm text-petal-ink leading-relaxed">
              {tr('難以開口的需要，寫成一份兩人都點頭的方案，就變成可以一起期待的事。', 'A need that\'s hard to say out loud becomes something to look forward to once it\'s a plan you both said yes to.')}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => openEditor('new', EMPTY_DRAFT)}
                className="px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium"
              >
                {tr('提出第一個方案', 'Propose your first plan')}
              </button>
              {onSendInvite && (
                <button type="button" onClick={onSendInvite} className="px-4 py-2 rounded-full border border-petal-rule text-sm text-petal-ink">
                  {tr('先邀請對方討論', 'Invite them to talk first')}
                </button>
              )}
            </div>
          </div>
          <div className="text-xs uppercase tracking-[0.12em] text-petal-muted">{tr('示範方案', 'Example plans')}</div>
          {samplesBlock}
        </div>
      )}

      {approved.length > 0 && (
        <section className="space-y-3" data-testid="alt-plans-approved">
          <h4 className="text-sm font-medium text-petal-sage-deep">{tr('✅ 共同方案清單', '✅ Shared list')}</h4>
          {approved.map((p) => (editing === p.id ? editor({ key: p.id, willResetApproval: true }) : renderPlan(p)))}
        </section>
      )}

      {pending.length > 0 && (
        <section className="space-y-3" data-testid="alt-plans-pending">
          <h4 className="text-sm font-medium text-amber-700">{tr('⏳ 待確認', '⏳ Awaiting approval')}</h4>
          {pending.map((p) => (editing === p.id ? editor({ key: p.id }) : renderPlan(p)))}
        </section>
      )}

      {disabled.length > 0 && (
        <section className="space-y-3">
          <button type="button" onClick={() => setShowDisabled((v) => !v)} className="text-sm text-petal-muted underline underline-offset-2">
            {showDisabled ? tr('收起已停用的方案', 'Hide paused plans') : tr(`已停用（${disabled.length}）`, `Paused (${disabled.length})`)}
          </button>
          {showDisabled && disabled.map(renderPlan)}
        </section>
      )}
    </div>
  );
};

// The script a plan is built on, with a jump into 角色扮演 to read it.
const ScriptLink: React.FC<{ title: string; scenario?: string | null; onViewScript?: (title: string) => void }> = ({ title, scenario, onViewScript }) => (
  <div className="rounded-lg border border-petal-rule-soft bg-petal-rose-soft/30 px-3 py-2 space-y-1" data-testid="alt-plan-script">
    <div className="text-sm text-petal-ink">
      {tr('🎭 劇本', '🎭 Script')} <span className="font-medium">{tr('《', '“')}{title}{tr('》', '”')}</span>
    </div>
    {scenario && <p className="text-xs text-petal-muted leading-relaxed">{scenario}</p>}
    {onViewScript && (
      <button
        type="button"
        data-testid="alt-plan-view-script"
        onClick={() => onViewScript(title)}
        className="inline-flex items-center gap-1 text-sm text-petal-rose-deep hover:text-pink-700 underline underline-offset-2"
      >
        <Play className="w-3.5 h-3.5" />
        {tr('查看劇本', 'View script')}
      </button>
    )}
  </div>
);

const PlanFields: React.FC<{
  plan: { interaction?: string | null; timePrep?: string | null; scriptTitle?: string | null; scriptScenario?: string | null };
  onViewScript?: (title: string) => void;
}> = ({ plan, onViewScript }) => {
  const rows: [string, string | null | undefined][] = [
    [tr('互動方式', 'What'), plan.interaction],
    [tr('時間與準備', 'Time & prep'), plan.timePrep],
  ];
  return (
    <div className="space-y-2">
      {plan.scriptTitle && <ScriptLink title={plan.scriptTitle} scenario={plan.scriptScenario} onViewScript={onViewScript} />}
      <dl className="space-y-1.5 text-sm">
        {rows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-[0.1em] text-petal-muted">{label}</dt>
            <dd className="text-petal-ink whitespace-pre-wrap break-words leading-relaxed">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const PlanCard: React.FC<{
  plan: AlternativePlan;
  partner: string;
  busy: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onViewScript?: (title: string) => void;
}> = ({ plan, partner, busy, onApprove, onEdit, onToggleActive, onViewScript }) => {
  const isDisabled = plan.status === 'disabled';
  const chip = (ok: boolean, who: string) => (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
      {ok ? <Check className="w-3 h-3" /> : null}
      {who}{ok ? tr(' 已認可', ' approved') : tr(' 待認可', ' to approve')}
    </span>
  );
  return (
    <div
      data-testid="alt-plan-card"
      className={`rounded-xl border p-4 ${isDisabled ? 'border-petal-rule-soft bg-gray-50 opacity-80' : plan.status === 'approved' ? 'border-petal-sage/50 bg-petal-sage/10' : 'border-amber-200 bg-white'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-medium text-petal-ink break-words">{plan.title}</div>
        {busy && <span className="text-xs text-petal-muted">{tr('送出中…', 'Sending…')}</span>}
      </div>
      <PlanFields plan={plan} onViewScript={onViewScript} />
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {isDisabled ? (
          <span className="text-xs text-petal-muted">
            {plan.disabledByMe ? tr('你停用了這個方案', 'You paused this plan') : tr(`${partner}停用了這個方案`, `${partner} paused this plan`)}
          </span>
        ) : (
          <>
            <Users className="w-3.5 h-3.5 text-petal-muted" />
            {chip(plan.approvedByMe, tr('你', 'You'))}
            {chip(plan.approvedByPartner, partner)}
          </>
        )}
      </div>
      {!busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!isDisabled && !plan.approvedByMe && (
            <button
              type="button"
              data-testid="alt-plan-approve"
              onClick={onApprove}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-petal-sage-deep text-white text-sm"
            >
              <Check className="w-4 h-4" />
              {tr('我認可這個方案', 'I approve this plan')}
            </button>
          )}
          {!isDisabled && (
            <button
              type="button"
              data-testid="alt-plan-edit"
              onClick={onEdit}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-petal-rule text-sm text-petal-ink"
            >
              <Pencil className="w-3.5 h-3.5" />
              {tr('修改', 'Edit')}
            </button>
          )}
          <button
            type="button"
            data-testid={isDisabled ? 'alt-plan-reactivate' : 'alt-plan-disable'}
            onClick={onToggleActive}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-petal-rule text-sm text-petal-muted"
          >
            {isDisabled ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
            {isDisabled ? tr('重新啟用', 'Reactivate') : tr('停用', 'Pause')}
          </button>
        </div>
      )}
    </div>
  );
};

const PlanEditor: React.FC<{
  draft: Draft;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  canSave: boolean;
  isNew?: boolean;
  willResetApproval?: boolean;
  scripts: PlanScript[];
  onViewScript?: (title: string) => void;
}> = ({ draft, onChange, onCancel, onSave, canSave, isNew, willResetApproval, scripts, onViewScript }) => {
  // Keep a linked script selectable even if it's no longer in the list
  // (deleted / renamed / a sample's script the couple doesn't own).
  const options = draft.scriptTitle && !scripts.some((sc) => sc.title === draft.scriptTitle)
    ? [{ id: draft.scriptId, title: draft.scriptTitle, scenario: draft.scriptScenario }, ...scripts]
    : scripts;
  const pickScript = (title: string) => {
    const sc = options.find((o) => o.title === title);
    onChange({ ...draft, scriptTitle: sc?.title || '', scriptId: sc?.id || '', scriptScenario: sc?.scenario || '' });
  };
  return (
  <div className="rounded-xl border border-pink-200 bg-pink-50/60 p-4 space-y-3" data-testid="alt-plan-editor">
    <div>
      <label className="block text-sm text-gray-700 mb-1">{tr('方案名稱 *', 'Plan name *')}</label>
      <input
        data-testid="alt-plan-title"
        value={draft.title}
        maxLength={100}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        placeholder={tr('例如：週末劇本之夜', 'e.g. Weekend script night')}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
      />
    </div>
    <div>
      <label className="block text-sm text-gray-700 mb-1">{tr('角色扮演劇本（選填）', 'Roleplay script (optional)')}</label>
      <select
        data-testid="alt-plan-script-select"
        value={draft.scriptTitle}
        onChange={(e) => pickScript(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
      >
        <option value="">{tr('不使用劇本', 'No script')}</option>
        {options.map((sc) => (
          <option key={sc.title} value={sc.title}>{sc.title}</option>
        ))}
      </select>
      {draft.scriptTitle && (
        <div className="mt-2">
          <ScriptLink title={draft.scriptTitle} scenario={draft.scriptScenario} onViewScript={onViewScript} />
        </div>
      )}
    </div>
    <div>
      <label className="block text-sm text-gray-700 mb-1">
        {draft.scriptTitle ? tr('互動方式（選填）', 'What you\'d do (optional)') : tr('互動方式 *', 'What you\'d do together *')}
      </label>
      <textarea
        data-testid="alt-plan-interaction"
        value={draft.interaction}
        rows={3}
        maxLength={2000}
        onChange={(e) => onChange({ ...draft, interaction: e.target.value })}
        placeholder={draft.scriptTitle
          ? tr('想補充的玩法，例如：客廳佈置成咖啡廳', 'Anything to add, e.g. turn the living room into a café')
          : tr('例如：先來一段精油按摩，再依偎擁抱', 'e.g. Start with an oil massage, then cuddle')}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-200"
      />
      {!draft.scriptTitle && (
        <p className="text-xs text-gray-500 mt-1">{tr('也可以直接選一個劇本當作互動方式。', 'Or just pick a script as the plan.')}</p>
      )}
    </div>
    <div>
      <label className="block text-sm text-gray-700 mb-1">{tr('預期時間與準備', 'Time & preparation')}</label>
      <textarea
        data-testid="alt-plan-timePrep"
        value={draft.timePrep}
        rows={2}
        maxLength={1000}
        onChange={(e) => onChange({ ...draft, timePrep: e.target.value })}
        placeholder={tr('例如：約 1 小時；準備按摩精油、音樂', 'e.g. About an hour; massage oil, music')}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-200"
      />
    </div>
    <p className="text-xs text-gray-600">
      {isNew
        ? tr('送出即代表你認可這個方案；對方也認可後才會加入共同清單。', 'Sending counts as your approval; it joins the shared list once they approve too.')
        : willResetApproval
        ? tr('修改後需要對方重新認可，方案會先回到「待確認」。', 'After editing, they need to approve again, so the plan goes back to "Awaiting approval".')
        : tr('修改後需要對方重新認可。', 'After editing, they need to approve again.')}
    </p>
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm">
        {tr('取消', 'Cancel')}
      </button>
      <button
        type="button"
        data-testid="alt-plan-save"
        onClick={onSave}
        disabled={!canSave}
        className="px-4 py-2 bg-pink-500 text-white rounded-lg text-sm disabled:bg-pink-300 disabled:cursor-not-allowed"
      >
        {isNew ? tr('提出方案', 'Propose plan') : tr('儲存修改', 'Save changes')}
      </button>
    </div>
  </div>
  );
};

export default AlternativePlansPanel;
