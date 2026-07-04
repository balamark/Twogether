import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Heart, Clock, Send, Sparkles, X, RefreshCw, Wand2, ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import { apiService } from '../services/api';
import type {
  IntimacyTemplate,
  RoleplayMessageSuggestion,
  EventRecord,
  ReconciliationIntensity,
  ReconciliationOpener,
} from '../services/api';
import { conflictPhraseTiers } from '../data/conflictSteps';
import { useScrollLock } from '../hooks/useScrollLock';
import { useTimezone } from '../contexts/TimezoneContext';
import { formatDateTime, localInputToIsoInTz } from '../utils/datetime';
import { getTimezoneShortLabel } from '../utils/timezone-options';

// Minimal shape we need from a roleplay script — structurally satisfied by both
// the built-in defaults and custom/marketplace scripts passed in from App.
export interface FormScript {
  id: string;
  title: string;
  category: 'romantic' | 'adventurous' | 'school' | 'bold';
  scenario: string;
  script: string;
  image?: string;
  tags?: string[];
  duration?: string;
}

interface IntimacyRequestFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  // Scripts the couple owns (built-in defaults + custom). Marketplace favorites
  // are loaded lazily inside the form when the roleplay branch is opened.
  scripts?: FormScript[];
}

type Step = 'category' | 'script' | 'aimsg' | 'reconcile' | 'guidance' | 'template' | 'customize' | 'confirm';

// Reconciliation intensity levels (low → high). The goal is a neutral, face-
// saving opener for someone who can't yet bring themselves to apologize.
const RECONCILE_INTENSITIES: {
  key: ReconciliationIntensity;
  label: string;
  emoji: string;
  desc: string;
  dot: string;
}[] = [
  { key: 'goodwill', label: '先釋出善意', emoji: '🌱', desc: '還沒準備好談，但想先破冰', dot: 'bg-green-400' },
  { key: 'reflect', label: '各退一步', emoji: '🤝', desc: '我也有需要調整的地方', dot: 'bg-amber-400' },
  { key: 'talk', label: '想好好談談', emoji: '💬', desc: '真心想化解、好好溝通', dot: 'bg-rose-500' },
];

const SCRIPT_CATEGORY_TABS: { id: 'all' | FormScript['category']; label: string; icon: string }[] = [
  { id: 'all', label: '全部', icon: '🌟' },
  { id: 'romantic', label: '浪漫', icon: '💕' },
  { id: 'adventurous', label: '冒險', icon: '🔥' },
  { id: 'school', label: '校園', icon: '🏫' },
  { id: 'bold', label: '大膽', icon: '🧨' },
];

// Visual intensity for each AI suggestion level (low → high).
const LEVEL_STYLE: Record<string, { dot: string; chip: string }> = {
  normal: { dot: 'bg-green-400', chip: 'bg-green-50 text-green-700 border-green-200' },
  mild: { dot: 'bg-lime-400', chip: 'bg-lime-50 text-lime-700 border-lime-200' },
  moderate: { dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  explicit: { dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700 border-orange-200' },
  intense: { dot: 'bg-rose-600', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const IntimacyRequestForm: React.FC<IntimacyRequestFormProps> = ({
  isOpen,
  onClose,
  onSuccess,
  scripts = [],
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('category');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<IntimacyTemplate | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [requestType, setRequestType] = useState<'intimate' | 'scheduled'>('intimate');
  const [scheduledTime, setScheduledTime] = useState('');
  const [templates, setTemplates] = useState<IntimacyTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Roleplay branch state
  const [scriptCategory, setScriptCategory] = useState<'all' | FormScript['category']>('all');
  const [scriptTag, setScriptTag] = useState<string | null>(null);
  const [favoriteScripts, setFavoriteScripts] = useState<FormScript[]>([]);
  const [selectedScript, setSelectedScript] = useState<FormScript | null>(null);
  const [aiSummary, setAiSummary] = useState('');
  const [aiMessages, setAiMessages] = useState<RoleplayMessageSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedAiLevel, setSelectedAiLevel] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'up' | 'down'>>({});
  const [downOpenLevel, setDownOpenLevel] = useState<string | null>(null);
  const [downText, setDownText] = useState('');

  // Reconciliation branch state
  const [reconcileEvents, setReconcileEvents] = useState<EventRecord[]>([]);
  const [reconcileEventsLoading, setReconcileEventsLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [reconcileIntensity, setReconcileIntensity] = useState<ReconciliationIntensity | null>(null);
  const [reconcileOpeners, setReconcileOpeners] = useState<ReconciliationOpener[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(false);

  // Guidance branch state — set of selected phrase keys (`${tier.key}-${i}`)
  // from the 8-step "當我情緒上來時，你可以這樣接住我" guide.
  const [guidanceSelected, setGuidanceSelected] = useState<Set<string>>(new Set());

  const tz = useTimezone();

  const categories = [
    { id: 'compliment', name: '甜蜜讚美', emoji: '💕', description: '發送溫馨的讚美和愛意給伴侶' },
    { id: 'reconciliation', name: '真心和解', emoji: '🤝', description: '冷戰／吵架後，AI 幫你想一句中性、給台階的破冰開場白' },
    { id: 'guidance', name: '情緒指引', emoji: '🧭', description: '把「當我情緒上來時，你可以這樣接住我」的指引挑幾句傳給對方' },
    { id: 'roleplay', name: '角色扮演', emoji: '🎭', description: '選擇你們的劇本，AI 幫你想 5 句入戲開場邀請' },
    { id: 'custom', name: '自訂訊息', emoji: '✨', description: '完全客製化你的親密邀請' },
  ];

  const isRoleplay = selectedCategory === 'roleplay';

  const isReconciliation = selectedCategory === 'reconciliation';

  const isGuidance = selectedCategory === 'guidance';

  const flowSteps: Step[] = isRoleplay
    ? ['category', 'script', 'aimsg', 'customize', 'confirm']
    : isReconciliation
    ? ['category', 'reconcile', 'customize', 'confirm']
    : isGuidance
    ? ['category', 'guidance', 'customize', 'confirm']
    : selectedCategory === 'custom'
    ? ['category', 'customize', 'confirm']
    : ['category', 'template', 'customize', 'confirm'];

  // Owned scripts = defaults + custom (props) + marketplace favorites, de-duped.
  const ownedScripts = useMemo(() => {
    const map = new Map<string, FormScript>();
    for (const s of [...scripts, ...favoriteScripts]) {
      if (s && s.id && !map.has(s.id)) map.set(s.id, s);
    }
    return Array.from(map.values());
  }, [scripts, favoriteScripts]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of ownedScripts) for (const t of s.tags || []) set.add(t);
    return Array.from(set);
  }, [ownedScripts]);

  const filteredScripts = useMemo(
    () =>
      ownedScripts.filter(
        (s) =>
          (scriptCategory === 'all' || s.category === scriptCategory) &&
          (!scriptTag || (s.tags || []).includes(scriptTag)),
      ),
    [ownedScripts, scriptCategory, scriptTag],
  );

  const fetchTemplatesByCategory = useCallback(async () => {
    try {
      setLoading(true);
      const categoryTemplates = await apiService.getIntimacyTemplatesByCategory(selectedCategory);
      setTemplates(categoryTemplates);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '無法載入模板';
      setError(errorMessage);
      console.error('Failed to fetch intimacy templates by category:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (
      selectedCategory &&
      selectedCategory !== 'custom' &&
      selectedCategory !== 'roleplay' &&
      selectedCategory !== 'reconciliation'
    ) {
      fetchTemplatesByCategory();
    }
  }, [selectedCategory, fetchTemplatesByCategory]);

  // Load recent events the first time the reconciliation branch opens, so the
  // user can (optionally) ground the opener in a real incident. Non-fatal: the
  // flow still works with no events (a generic ice-breaker).
  useEffect(() => {
    if (currentStep !== 'reconcile' || reconcileEvents.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        setReconcileEventsLoading(true);
        const { events } = await apiService.listEvents({ limit: 8 });
        if (!cancelled) setReconcileEvents(events);
      } catch (err) {
        // Non-fatal — the user can still pick an intensity without an event.
        console.error('Failed to load events for reconciliation:', err);
      } finally {
        if (!cancelled) setReconcileEventsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStep, reconcileEvents.length]);

  // Lazily load marketplace favorites the first time the roleplay branch opens.
  useEffect(() => {
    if (currentStep !== 'script' || favoriteScripts.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const favs = await apiService.getFavoritedMarketplaceScripts();
        if (cancelled) return;
        setFavoriteScripts(
          favs.map((f) => ({
            id: f.id,
            title: f.title,
            category: f.category as FormScript['category'],
            scenario: f.scenario,
            script: f.script,
            tags: f.tags,
            duration: f.duration,
          })),
        );
      } catch (err) {
        // Non-fatal — the user can still pick from default/custom scripts.
        console.error('Failed to load favorited marketplace scripts:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStep, favoriteScripts.length]);

  const handleCategorySelect = function (categoryId: string) {
    setSelectedCategory(categoryId);
    setSelectedTemplate(null);
    setCustomMessage('');
    if (categoryId === 'custom') {
      setCurrentStep('customize');
    } else if (categoryId === 'roleplay') {
      setCurrentStep('script');
    } else if (categoryId === 'reconciliation') {
      setCurrentStep('reconcile');
    } else if (categoryId === 'guidance') {
      setGuidanceSelected(new Set());
      setCurrentStep('guidance');
    } else {
      setCurrentStep('template');
    }
  };

  const toggleGuidancePhrase = function (phraseKey: string) {
    setGuidanceSelected((prev) => {
      const next = new Set(prev);
      if (next.has(phraseKey)) next.delete(phraseKey);
      else next.add(phraseKey);
      return next;
    });
  };

  // Compose the selected guide phrases into one message, in the guide's
  // canonical order (not click order), then continue to the customize step.
  const handleGuidanceContinue = function () {
    const lines: string[] = [];
    for (const tier of conflictPhraseTiers) {
      tier.phrases.forEach((phrase, i) => {
        if (guidanceSelected.has(`${tier.key}-${i}`)) lines.push(`・${phrase}`);
      });
    }
    if (lines.length === 0) return;
    setCustomMessage(`想讓你知道，當我情緒上來時，你可以這樣接住我：\n\n${lines.join('\n')}`);
    setCurrentStep('customize');
  };

  const handleTemplateSelect = function (template: IntimacyTemplate) {
    setSelectedTemplate(template);
    setCustomMessage(`${template.timeHint}，${template.roleplaySetup}`);
    setCurrentStep('customize');
  };

  const generateMessages = useCallback(async (script: FormScript, regenerate = false) => {
    setAiLoading(true);
    setError(null);
    setAiSummary('');
    setAiMessages([]);
    setSelectedAiLevel(null);
    setFeedbackGiven({});
    setDownOpenLevel(null);
    setDownText('');
    try {
      const res = await apiService.generateRoleplayMessages({
        scriptId: script.id,
        scriptTitle: script.title,
        scriptScenario: script.scenario,
        scriptBody: script.script,
        category: script.category,
        regenerate,
      });
      setAiSummary(res.summary);
      setAiMessages(res.messages.filter((m) => m.text && m.text.trim()));
    } catch (err) {
      // 429/AI_DAILY_LIMIT_REACHED is also dispatched globally by the api
      // interceptor; we still show the specific message inline here.
      setError(
        err instanceof Error
          ? err.message
          : 'AI 暫時無法生成建議訊息，請稍後再試，或直接自行輸入邀請內容',
      );
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleSelectScript = function (script: FormScript) {
    setSelectedScript(script);
    setCurrentStep('aimsg');
    generateMessages(script);
  };

  const handleSelectAiMessage = function (m: RoleplayMessageSuggestion) {
    setCustomMessage(m.text);
    setSelectedAiLevel(m.level);
    setCurrentStep('customize');
  };

  // Thumb up posts immediately. Thumb down opens an optional reason box and
  // posts once on 送出 (so a down is one row, optionally carrying the text).
  const sendFeedback = function (m: RoleplayMessageSuggestion, rating: 'up' | 'down', feedbackText?: string) {
    setFeedbackGiven((prev) => ({ ...prev, [m.level]: rating }));
    apiService.submitRoleplayMessageFeedback({
      scriptId: selectedScript?.id,
      scriptTitle: selectedScript?.title,
      level: m.level,
      messageText: m.text,
      rating,
      feedbackText,
    });
  };

  const handleThumbUp = function (m: RoleplayMessageSuggestion) {
    setDownOpenLevel((cur) => (cur === m.level ? null : cur));
    sendFeedback(m, 'up');
  };

  const handleThumbDown = function (m: RoleplayMessageSuggestion) {
    setDownText('');
    setDownOpenLevel((cur) => (cur === m.level ? null : m.level));
  };

  const submitDownFeedback = function (m: RoleplayMessageSuggestion) {
    sendFeedback(m, 'down', downText.trim() || undefined);
    setDownOpenLevel(null);
    setDownText('');
  };

  const generateOpeners = useCallback(async (intensity: ReconciliationIntensity, eventId: string | null) => {
    setReconcileLoading(true);
    setError(null);
    setReconcileOpeners([]);
    setReconcileIntensity(intensity);
    try {
      const openers = await apiService.generateReconciliationOpeners(intensity, eventId);
      setReconcileOpeners(openers);
    } catch (err) {
      // 429/AI_DAILY_LIMIT_REACHED is also dispatched globally by the api
      // interceptor; we still show the specific message inline here.
      setError(
        err instanceof Error
          ? err.message
          : 'AI 暫時無法產生開場白，請稍後再試，或直接自行輸入和解內容。',
      );
    } finally {
      setReconcileLoading(false);
    }
  }, []);

  const handleSelectOpener = function (opener: ReconciliationOpener) {
    setCustomMessage(opener.text);
    setCurrentStep('customize');
  };

  const handleSendRequest = async function () {
    try {
      setLoading(true);
      setError(null);

      const messageContent = customMessage.trim();
      if (!messageContent) {
        setError('請輸入邀請內容');
        return;
      }

      await apiService.createIntimacyRequest({
        messageContent,
        requestType:
          selectedCategory === 'compliment'
            ? 'compliment'
            : selectedCategory === 'reconciliation'
            ? 'reconciliation'
            : selectedCategory === 'guidance'
            ? 'guidance'
            : requestType,
        roleplayCategory: isRoleplay ? selectedScript?.category : undefined,
        // Name the script + its 簡介 so the recipient (who may never have seen
        // it) knows what the in-character message refers to and can jump to it.
        scriptTitle: isRoleplay ? selectedScript?.title : undefined,
        scriptScenario: isRoleplay ? selectedScript?.scenario : undefined,
        scheduledTime:
          requestType === 'scheduled' && scheduledTime ? localInputToIsoInTz(scheduledTime, tz) : undefined,
      });

      onSuccess();
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '發送失敗');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = function () {
    setCurrentStep('category');
    setSelectedCategory('');
    setSelectedTemplate(null);
    setCustomMessage('');
    setRequestType('intimate');
    setScheduledTime('');
    setError(null);
    setScriptCategory('all');
    setScriptTag(null);
    setSelectedScript(null);
    setAiSummary('');
    setAiMessages([]);
    setAiLoading(false);
    setSelectedAiLevel(null);
    setFeedbackGiven({});
    setDownOpenLevel(null);
    setDownText('');
    setReconcileEvents([]);
    setReconcileEventsLoading(false);
    setSelectedEventId(null);
    setReconcileIntensity(null);
    setReconcileOpeners([]);
    setReconcileLoading(false);
    setGuidanceSelected(new Set());
  };

  const handleClose = function () {
    resetForm();
    onClose();
  };

  // Where the customize step's "返回" goes, depending on the active branch.
  const customizeBackStep: Step = isRoleplay
    ? 'aimsg'
    : isReconciliation
    ? 'reconcile'
    : isGuidance
    ? 'guidance'
    : selectedCategory === 'custom'
    ? 'category'
    : 'template';

  useScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[min(90vh,calc(100dvh-80px))] overflow-y-auto overscroll-contain">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Heart className="w-6 h-6 text-pink-500" />
            <h3 className="text-xl font-semibold text-gray-900">發送親密邀請</h3>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center space-x-4">
            {flowSteps.map((step, index) => (
              <div key={step} className={`flex items-center ${index < flowSteps.length - 1 ? 'flex-1' : ''}`}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep === step
                      ? 'bg-pink-500 text-white'
                      : flowSteps.indexOf(currentStep) > index
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {index + 1}
                </div>
                {index < flowSteps.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-2 ${
                      flowSteps.indexOf(currentStep) > index ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Step 1: Category Selection */}
          {currentStep === 'category' && (
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-gray-900 mb-4">選擇邀請類型</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    data-testid={`intimacy-category-${category.id}`}
                    onClick={() => handleCategorySelect(category.id)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-pink-300 hover:bg-pink-50 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="text-2xl">{category.emoji}</span>
                      <h5 className="font-medium text-gray-900">{category.name}</h5>
                    </div>
                    <p className="text-sm text-gray-600">{category.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 (roleplay): Pick a script */}
          {currentStep === 'script' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900">選擇劇本</h4>
                <button onClick={() => setCurrentStep('category')} className="text-sm text-pink-600 hover:text-pink-700">
                  返回選擇類型
                </button>
              </div>

              {/* Category tabs */}
              <div className="flex flex-wrap gap-2">
                {SCRIPT_CATEGORY_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    data-testid={`roleplay-cat-${tab.id}`}
                    onClick={() => setScriptCategory(tab.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      scriptCategory === tab.id
                        ? 'bg-pink-500 text-white border-pink-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-pink-300'
                    }`}
                  >
                    <span className="mr-1">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tag chips */}
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setScriptTag(null)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      !scriptTag ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200'
                    }`}
                  >
                    全部標籤
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setScriptTag((cur) => (cur === tag ? null : tag))}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        scriptTag === tag
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-pink-300'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Script list */}
              {filteredScripts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredScripts.map((script) => (
                    <button
                      key={script.id}
                      data-testid={`roleplay-script-${script.id}`}
                      onClick={() => handleSelectScript(script)}
                      className="flex gap-3 p-3 border border-gray-200 rounded-lg hover:border-pink-300 hover:bg-pink-50 transition-colors text-left"
                    >
                      <div className="w-16 h-16 flex-shrink-0 rounded-md bg-petal-cream-2 overflow-hidden flex items-center justify-center">
                        {script.image ? (
                          <img src={script.image} alt={script.title} className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-2xl">🎭</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm line-clamp-2">{script.title}</p>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{script.scenario}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-500 text-sm">
                  <p>這個分類／標籤下還沒有你擁有的劇本。</p>
                  <p className="mt-1">可以到「角色扮演」建立自訂劇本，或從創作市集收藏劇本後再回來。</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3 (roleplay): AI-generated messages */}
          {currentStep === 'aimsg' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-pink-500" /> AI 入戲開場邀請
                </h4>
                <button onClick={() => setCurrentStep('script')} className="text-sm text-pink-600 hover:text-pink-700">
                  返回選劇本
                </button>
              </div>

              {selectedScript && (
                <p className="text-sm text-gray-500">
                  劇本：<span className="font-medium text-gray-700">{selectedScript.title}</span>
                </p>
              )}

              {aiLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
                  <p className="mt-2 text-gray-600">AI 正在融入劇本，生成 5 句漸進式邀請…</p>
                </div>
              ) : aiMessages.length > 0 ? (
                <div className="space-y-3">
                  {aiSummary && (
                    <div className="bg-pink-50 border border-pink-100 rounded-lg p-3">
                      <p className="text-xs font-medium text-pink-600 mb-1">情境設定</p>
                      <p className="text-sm text-gray-700" data-testid="roleplay-ai-summary">{aiSummary}</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">暗示強度由弱到強，挑一句你喜歡的；選好後下一步可自由編輯。</p>
                  {aiMessages.map((m) => {
                    const style = LEVEL_STYLE[m.level] || LEVEL_STYLE.normal;
                    const rated = feedbackGiven[m.level];
                    return (
                      <div
                        key={m.level}
                        className="border border-gray-200 rounded-lg overflow-hidden hover:border-pink-300 transition-colors"
                      >
                        <button
                          data-testid={`roleplay-msg-${m.level}`}
                          onClick={() => handleSelectAiMessage(m)}
                          className="w-full p-4 text-left hover:bg-pink-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-3 h-3 rounded-full mt-1.5 ${style.dot}`}></div>
                            <div className="flex-1">
                              <span className={`inline-block text-xs px-2 py-0.5 rounded-full border mb-1.5 ${style.chip}`}>
                                {m.label}
                              </span>
                              <p className="text-gray-800 text-sm whitespace-pre-wrap">{m.text}</p>
                            </div>
                          </div>
                        </button>
                        {/* Feedback footer (siblings of the select button — no nested buttons) */}
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-t border-gray-100">
                          <span className="text-xs text-gray-400">這句如何？</span>
                          <button
                            data-testid={`roleplay-thumbup-${m.level}`}
                            onClick={() => handleThumbUp(m)}
                            className={`p-1.5 rounded-md transition-colors ${
                              rated === 'up' ? 'bg-green-100 text-green-600' : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            aria-label="讚"
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </button>
                          <button
                            data-testid={`roleplay-thumbdown-${m.level}`}
                            onClick={() => handleThumbDown(m)}
                            className={`p-1.5 rounded-md transition-colors ${
                              rated === 'down' ? 'bg-rose-100 text-rose-600' : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            aria-label="不喜歡"
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                          {rated && <span className="text-xs text-gray-400 ml-1">已回饋，謝謝！</span>}
                        </div>
                        {downOpenLevel === m.level && (
                          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 space-y-2">
                            <textarea
                              value={downText}
                              onChange={(e) => setDownText(e.target.value)}
                              placeholder="想告訴我們哪裡不喜歡嗎？（選填）"
                              rows={2}
                              className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-pink-400 resize-none"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  setDownOpenLevel(null);
                                  setDownText('');
                                }}
                                className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                              >
                                取消
                              </button>
                              <button
                                onClick={() => submitDownFeedback(m)}
                                className="px-3 py-1 text-xs bg-gray-800 text-white rounded-md hover:bg-gray-700"
                              >
                                送出回饋
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex flex-wrap justify-between gap-3 pt-1">
                    <button
                      onClick={() => selectedScript && generateMessages(selectedScript, true)}
                      data-testid="roleplay-regenerate"
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
                    >
                      <RefreshCw className="w-4 h-4" /> 重新生成
                    </button>
                    <button
                      onClick={() => {
                        setCustomMessage('');
                        setSelectedAiLevel(null);
                        setCurrentStep('customize');
                      }}
                      className="px-4 py-2 text-pink-600 hover:text-pink-700 transition-colors flex items-center gap-2 text-sm"
                    >
                      <Sparkles className="w-4 h-4" /> 自行輸入
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-gray-500 text-sm space-y-3">
                  <p>AI 暫時無法生成這個劇本的建議訊息。</p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => selectedScript && generateMessages(selectedScript, true)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" /> 重新生成
                    </button>
                    <button
                      onClick={() => {
                        setCustomMessage('');
                        setCurrentStep('customize');
                      }}
                      className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
                    >
                      自行輸入邀請內容
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2 (reconciliation): pick an event + intensity → AI openers */}
          {currentStep === 'reconcile' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-pink-500" /> AI 破冰開場白
                </h4>
                <button onClick={() => setCurrentStep('category')} className="text-sm text-pink-600 hover:text-pink-700">
                  返回選擇類型
                </button>
              </div>

              <p className="text-sm text-gray-500">
                吵架後拉不下臉？挑一個強度，AI 幫你想一句中性、給對方台階的第一句話，試試對方願不願意開啟對話。
              </p>

              {/* (Optional) pick a related event for context */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  選一個相關事件 <span className="text-gray-400 font-normal">（可略過）</span>
                </p>
                {reconcileEventsLoading ? (
                  <p className="text-sm text-gray-400">載入事件中…</p>
                ) : reconcileEvents.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      data-testid="reconcile-event-none"
                      onClick={() => setSelectedEventId(null)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        selectedEventId === null
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-pink-300'
                      }`}
                    >
                      不選，直接想開場白
                    </button>
                    {reconcileEvents.map((ev) => (
                      <button
                        key={ev.id}
                        data-testid={`reconcile-event-${ev.id}`}
                        onClick={() => setSelectedEventId((cur) => (cur === ev.id ? null : ev.id))}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors max-w-[16rem] truncate ${
                          selectedEventId === ev.id
                            ? 'bg-pink-500 text-white border-pink-500'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-pink-300'
                        }`}
                        title={ev.title}
                      >
                        {ev.title}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    目前沒有可參考的事件，沒關係，直接挑一個強度就能產生通用的破冰開場白。
                  </p>
                )}
              </div>

              {/* Pick an intensity */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">選擇強度</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {RECONCILE_INTENSITIES.map((lvl) => (
                    <button
                      key={lvl.key}
                      data-testid={`reconcile-intensity-${lvl.key}`}
                      onClick={() => setReconcileIntensity(lvl.key)}
                      className={`p-3 border rounded-lg text-left transition-colors ${
                        reconcileIntensity === lvl.key
                          ? 'border-pink-400 bg-pink-50'
                          : 'border-gray-200 hover:border-pink-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${lvl.dot}`}></span>
                        <span className="font-medium text-gray-900 text-sm">
                          {lvl.emoji} {lvl.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{lvl.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate / results */}
              {reconcileLoading ? (
                <div className="text-center py-10">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
                  <p className="mt-2 text-gray-600">AI 正在想幾句適合的破冰開場白…</p>
                </div>
              ) : reconcileOpeners.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">挑一句你喜歡的，下一步可自由編輯後再送出。</p>
                  {reconcileOpeners.map((o, i) => (
                    <button
                      key={i}
                      data-testid={`reconcile-opener-${i}`}
                      onClick={() => handleSelectOpener(o)}
                      className="w-full p-4 text-left border border-gray-200 rounded-lg hover:border-pink-300 hover:bg-pink-50 transition-colors"
                    >
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full border border-pink-200 bg-pink-50 text-pink-600 mb-1.5">
                        {o.label}
                      </span>
                      <p className="text-gray-800 text-sm whitespace-pre-wrap">{o.text}</p>
                    </button>
                  ))}
                  <div className="flex flex-wrap justify-between gap-3 pt-1">
                    <button
                      onClick={() => reconcileIntensity && generateOpeners(reconcileIntensity, selectedEventId)}
                      data-testid="reconcile-regenerate"
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
                    >
                      <RefreshCw className="w-4 h-4" /> 重新生成
                    </button>
                    <button
                      onClick={() => {
                        setCustomMessage('');
                        setCurrentStep('customize');
                      }}
                      className="px-4 py-2 text-pink-600 hover:text-pink-700 transition-colors flex items-center gap-2 text-sm"
                    >
                      <Sparkles className="w-4 h-4" /> 自行輸入
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  data-testid="reconcile-generate"
                  onClick={() => reconcileIntensity && generateOpeners(reconcileIntensity, selectedEventId)}
                  disabled={!reconcileIntensity}
                  className="w-full px-6 py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <Wand2 className="w-5 h-5" /> 讓 AI 想開場白
                </button>
              )}
            </div>
          )}

          {/* Step 2 (guidance): pick steps/phrases from the 8-step guide */}
          {currentStep === 'guidance' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900">情緒指引</h4>
                <button onClick={() => setCurrentStep('category')} className="text-sm text-pink-600 hover:text-pink-700">
                  返回選擇類型
                </button>
              </div>
              <p className="text-sm text-gray-600">
                這不是要對方道歉或認錯，而是讓 TA 知道：當你情緒上來時，怎麼做能讓你比較好受。挑幾句你最想說的，傳給對方。
              </p>

              <div className="space-y-4">
                {conflictPhraseTiers.map((tier) => (
                  <div key={tier.key} className={`rounded-lg border p-4 ${tier.cardClass}`}>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${tier.badgeClass} px-2 py-0.5 rounded`}
                      >
                        <span aria-hidden>{tier.dot}</span>
                        {tier.badge}
                      </span>
                      <span className="text-sm font-medium text-gray-800">{tier.title}</span>
                    </div>
                    <div className="space-y-2">
                      {tier.phrases.map((phrase, i) => {
                        const phraseKey = `${tier.key}-${i}`;
                        const checked = guidanceSelected.has(phraseKey);
                        return (
                          <button
                            key={phraseKey}
                            type="button"
                            data-testid={`guidance-phrase-${phraseKey}`}
                            onClick={() => toggleGuidancePhrase(phraseKey)}
                            className={`w-full text-left flex items-start gap-2 rounded-md border p-2.5 transition-colors ${
                              checked
                                ? 'border-pink-400 bg-pink-50'
                                : 'border-white bg-white/70 hover:border-pink-200'
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                                checked ? 'bg-pink-500 border-pink-500 text-white' : 'border-gray-300 bg-white'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                            </span>
                            <span className="text-sm text-gray-800 leading-relaxed">{phrase}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <button
                data-testid="guidance-continue"
                onClick={handleGuidanceContinue}
                disabled={guidanceSelected.size === 0}
                className="w-full px-6 py-3 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5" />
                已選 {guidanceSelected.size} 句，繼續
              </button>
            </div>
          )}

          {/* Step 2 (compliment): Template Selection */}
          {currentStep === 'template' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900">
                  {selectedCategory === 'compliment'
                    ? '選擇讚美訊息'
                    : selectedCategory === 'reconciliation'
                    ? '選擇和解訊息'
                    : '選擇訊息模板'}
                </h4>
                <button onClick={() => setCurrentStep('category')} className="text-sm text-pink-600 hover:text-pink-700">
                  返回選擇類型
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
                  <p className="mt-2 text-gray-600">載入模板中...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.length > 0 ? (
                    templates.map((template) => {
                      const isSelected = selectedTemplate?.id === template.id;
                      return (
                        <button
                          key={template.id}
                          onClick={() => handleTemplateSelect(template)}
                          className={`w-full p-4 border rounded-lg transition-colors text-left ${
                            isSelected ? 'border-pink-400 bg-pink-50' : 'border-gray-200 hover:border-pink-300 hover:bg-pink-50'
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <div
                              className={`w-3 h-3 rounded-full mt-2 ${
                                template.suggestionLevel === 'subtle'
                                  ? 'bg-green-400'
                                  : template.suggestionLevel === 'moderate'
                                  ? 'bg-yellow-400'
                                  : 'bg-red-400'
                              }`}
                            ></div>
                            <div className="flex-1">
                              <p className="text-gray-900 font-medium mb-1">{template.timeHint}</p>
                              <p className="text-gray-600 text-sm">{template.roleplaySetup}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : selectedCategory === 'compliment' || selectedCategory === 'reconciliation' ? (
                    [
                      { timeHint: '甜蜜時光', roleplaySetup: '你好溫柔，你是我的女神 💕' },
                      { timeHint: '愛的告白', roleplaySetup: '你是我見過最美麗的人，每天和你在一起都是幸福 ✨' },
                      { timeHint: '溫馨時刻', roleplaySetup: '你的笑容是我最愛的風景，能讓我的心瞬間溫暖 😊' },
                      { timeHint: '深情表達', roleplaySetup: '謝謝你一直在我身邊，你是我生命中最珍貴的禮物 🎁' },
                      { timeHint: '浪漫情話', roleplaySetup: '和你在一起的每一天，都比昨天更愛你一點 💖' },
                      { timeHint: '貼心話語', roleplaySetup: '你總是這麼體貼，讓我覺得自己是世界上最幸運的人 🍀' },
                      { timeHint: '愛意滿滿', roleplaySetup: '你的溫柔像春風，你的愛像暖陽，照亮了我的整個世界 🌞' },
                      { timeHint: '真心話', roleplaySetup: '遇見你是我這輩子最美好的事，願意和你走過每個春夏秋冬 🌸' },
                      { timeHint: '甜蜜宣言', roleplaySetup: '你不只是我的戀人，更是我的最佳朋友和靈魂伴侶 👫' },
                      { timeHint: '愛的承諾', roleplaySetup: '無論什麼時候，你都是我心中最特別的那個人 💝' },
                    ].map((template, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setCustomMessage(template.roleplaySetup);
                          setCurrentStep('customize');
                        }}
                        className="w-full p-4 border border-gray-200 rounded-lg hover:border-pink-300 hover:bg-pink-50 transition-colors text-left"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="w-3 h-3 rounded-full mt-2 bg-pink-400"></div>
                          <div className="flex-1">
                            <p className="text-gray-900 font-medium mb-1">{template.timeHint}</p>
                            <p className="text-gray-600 text-sm">{template.roleplaySetup}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>無可用模板</p>
                    </div>
                  )}

                  <button
                    onClick={() => setCurrentStep('customize')}
                    className="w-full p-4 border border-gray-200 rounded-lg hover:border-pink-300 hover:bg-pink-50 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Sparkles className="w-5 h-5 text-pink-500" />
                      <span className="text-gray-900 font-medium">
                        {selectedCategory === 'compliment'
                          ? '自訂讚美訊息'
                          : selectedCategory === 'reconciliation'
                          ? '自訂和解訊息'
                          : '自訂訊息內容'}
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step: Customize Message */}
          {currentStep === 'customize' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900">
                  {selectedCategory === 'compliment'
                    ? '自訂讚美內容'
                    : selectedCategory === 'reconciliation'
                    ? '自訂和解內容'
                    : '自訂邀請內容'}
                </h4>
                <button onClick={() => setCurrentStep(customizeBackStep)} className="text-sm text-pink-600 hover:text-pink-700">
                  返回
                </button>
              </div>

              {isRoleplay && selectedAiLevel && (
                <p className="text-xs text-gray-500">
                  已選用 AI 建議
                  <span className="text-pink-600 font-medium">
                    {' '}
                    {aiMessages.find((m) => m.level === selectedAiLevel)?.label || ''}
                  </span>
                  ，可自由修改。
                </p>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">邀請類型</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="intimate"
                        checked={requestType === 'intimate'}
                        onChange={(e) => setRequestType(e.target.value as 'intimate')}
                        className="mr-2"
                      />
                      <span>立即邀請</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="scheduled"
                        checked={requestType === 'scheduled'}
                        onChange={(e) => setRequestType(e.target.value as 'scheduled')}
                        className="mr-2"
                      />
                      <span>預約時間</span>
                    </label>
                  </div>
                </div>

                {requestType === 'scheduled' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      預約時間（以 {getTimezoneShortLabel(tz)} 顯示）
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      💡 雙方都會看到此時間以共用時區（{getTimezoneShortLabel(tz)}）為準，可在設定中調整。
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {selectedCategory === 'compliment' ? '讚美內容 *' : selectedCategory === 'reconciliation' ? '和解內容 *' : '邀請內容 *'}
                  </label>
                  <textarea
                    data-testid="intimacy-message-input"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder={
                      selectedCategory === 'compliment'
                        ? '輸入你想對伴侶說的甜蜜讚美...'
                        : selectedCategory === 'reconciliation'
                        ? '輸入你的真誠道歉和和解訊息...'
                        : '輸入你的親密邀請內容...'
                    }
                    rows={4}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">{customMessage.length}/1000 字符</p>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    data-testid="intimacy-preview-btn"
                    onClick={() => setCurrentStep('confirm')}
                    disabled={!customMessage.trim()}
                    className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    預覽邀請
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step: Confirm and Send */}
          {currentStep === 'confirm' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900">
                  {selectedCategory === 'compliment' ? '確認讚美內容' : selectedCategory === 'reconciliation' ? '確認和解內容' : '確認邀請內容'}
                </h4>
                <button onClick={() => setCurrentStep('customize')} className="text-sm text-pink-600 hover:text-pink-700">
                  編輯內容
                </button>
              </div>

              <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Heart className="w-6 h-6 text-pink-500 mt-1" />
                  <div className="flex-1">
                    <h5 className="font-medium text-gray-900 mb-2">
                      {selectedCategory === 'compliment' ? '你的甜蜜讚美' : selectedCategory === 'reconciliation' ? '你的真心和解' : '你的親密邀請'}
                    </h5>
                    {isRoleplay && selectedScript && (
                      <p className="text-xs text-pink-600 mb-2">劇本：{selectedScript.title}</p>
                    )}
                    <p className="text-gray-700 whitespace-pre-wrap">{customMessage}</p>
                    {requestType === 'scheduled' && scheduledTime && (
                      <div className="mt-3 flex items-center space-x-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>預約時間：{formatDateTime(localInputToIsoInTz(scheduledTime, tz), tz, { alwaysShowTz: true })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  data-testid="intimacy-send-btn"
                  onClick={handleSendRequest}
                  disabled={loading}
                  className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-pink-300 transition-colors flex items-center space-x-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{loading ? '發送中...' : selectedCategory === 'compliment' ? '發送讚美' : selectedCategory === 'reconciliation' ? '發送和解' : '發送邀請'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntimacyRequestForm;
