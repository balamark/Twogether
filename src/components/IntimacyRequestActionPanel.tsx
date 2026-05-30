import React, { useState, useEffect } from 'react';
import { Heart, Check, Smile, Coffee, HandHeart } from 'lucide-react';
import { apiService } from '../services/api';
import type {
  IntimacyRequest,
  AlternativeIntimacyOptionsGrouped,
  AlternativeIntimacyOption,
  RespondToIntimacyRequestRequest,
} from '../services/api';
import { useTimezone } from '../contexts/TimezoneContext';
import { localInputToIsoInTz, formatDateTime } from '../utils/datetime';
import { getTimezoneShortLabel } from '../utils/timezone-options';

interface IntimacyRequestActionPanelProps {
  request: IntimacyRequest;
  onResponded: () => void;
}

const AFFIRMATION_SUGGESTIONS = [
  '謝謝你想到我 ❤️',
  '我也很想跟你親近',
  '很開心你願意主動邀我',
];

const CLOSING_SUGGESTIONS = [
  '到時見 💕',
  '等不及了',
  '我也想你',
  '抱抱',
];

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'physical': return <HandHeart className="w-5 h-5 text-pink-500" />;
    case 'emotional': return <Heart className="w-5 h-5 text-red-500" />;
    case 'playful': return <Smile className="w-5 h-5 text-yellow-500" />;
    case 'companionship': return <Coffee className="w-5 h-5 text-blue-500" />;
    default: return <Heart className="w-5 h-5 text-gray-500" />;
  }
};

const getCategoryName = (category: string) => {
  switch (category) {
    case 'physical': return '肢體親密';
    case 'emotional': return '情感親密';
    case 'playful': return '趣味互動';
    case 'companionship': return '日常陪伴';
    default: return category;
  }
};

type Mode = 'choice' | 'accept' | 'alternative';

const IntimacyRequestActionPanel: React.FC<IntimacyRequestActionPanelProps> = ({
  request,
  onResponded,
}) => {
  const tz = useTimezone();
  const [mode, setMode] = useState<Mode>('choice');
  const [acceptMessage, setAcceptMessage] = useState<string>('接受你的邀請 💕');

  // 4-step alternative flow state
  const [affirmation, setAffirmation] = useState<string>('');
  const [alternativeOptions, setAlternativeOptions] = useState<AlternativeIntimacyOptionsGrouped | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState<{
    type: string;
    content: string;
  } | null>(null);
  const [altScheduledLocal, setAltScheduledLocal] = useState<string>('');
  const [closing, setClosing] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'alternative' && !alternativeOptions) {
      apiService
        .getAlternativeIntimacyOptions()
        .then(setAlternativeOptions)
        .catch((err) => {
          console.error('Failed to fetch alternative options:', err);
          setError('無法載入替代選項');
        });
    }
  }, [mode, alternativeOptions]);

  const handleAccept = async () => {
    try {
      setLoading(true);
      setError(null);
      await apiService.respondToIntimacyRequest(request.id, {
        accept: true,
        responseMessage: acceptMessage.trim() || undefined,
      });
      onResponded();
    } catch (err) {
      setError(err instanceof Error ? err.message : '回應失敗');
    } finally {
      setLoading(false);
    }
  };

  const canSendAlternative =
    affirmation.trim().length > 0 &&
    altScheduledLocal.length > 0 &&
    closing.trim().length > 0;

  const handleSendAlternative = async () => {
    if (!canSendAlternative) return;
    try {
      setLoading(true);
      setError(null);
      const responseMessage = `${affirmation.trim()}\n\n${closing.trim()}`;
      const response: RespondToIntimacyRequestRequest = {
        accept: false,
        responseMessage,
        alternativeType: selectedAlternative?.type,
        alternativeContent: selectedAlternative?.content,
        alternativeScheduledTime: localInputToIsoInTz(altScheduledLocal, tz),
      };
      await apiService.respondToIntimacyRequest(request.id, response);
      onResponded();
    } catch (err) {
      setError(err instanceof Error ? err.message : '回應失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-pink-200 bg-pink-50 p-4">
      {error && (
        <div className="mb-3 rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {mode === 'choice' && (
        <div className="flex flex-wrap gap-3">
          <button
            data-testid="intimacy-show-accept-button"
            onClick={() => setMode('accept')}
            disabled={loading}
            className="flex-1 min-w-[8rem] px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-pink-300 transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>接受邀請</span>
          </button>
          <button
            data-testid="intimacy-show-alternative-button"
            onClick={() => setMode('alternative')}
            disabled={loading}
            className="flex-1 min-w-[8rem] px-4 py-2 border border-pink-300 text-pink-700 bg-white rounded-lg hover:bg-pink-50 transition-colors"
          >
            想改一下方式
          </button>
        </div>
      )}

      {mode === 'accept' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1">給對方的回覆（可自訂）</label>
            <input
              type="text"
              value={acceptMessage}
              onChange={(e) => setAcceptMessage(e.target.value)}
              placeholder="例如：我好期待，今晚就從你的劇本開始吧"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setMode('choice')}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              返回
            </button>
            <button
              data-testid="intimacy-accept-button"
              onClick={handleAccept}
              disabled={loading}
              className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-pink-300 transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? '送出中…' : '送出接受'}</span>
            </button>
          </div>
        </div>
      )}

      {mode === 'alternative' && (
        <div className="space-y-5">
          <p className="text-xs text-pink-700 bg-white border border-pink-200 rounded-md px-3 py-2">
            想改一下方式時，依下面四個步驟回應，讓對方感受到被在乎：先肯定 → 想試試的方式 → 想改到的時間 → 結尾甜蜜話。
          </p>

          {/* Step 1 — affirmation */}
          <section>
            <h5 className="font-medium text-gray-900 text-sm mb-1">① 先謝謝對方</h5>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {AFFIRMATION_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAffirmation(s)}
                  className="text-xs px-2 py-1 rounded-full bg-white border border-pink-200 text-pink-700 hover:bg-pink-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <textarea
              data-testid="intimacy-affirmation"
              value={affirmation}
              onChange={(e) => setAffirmation(e.target.value)}
              rows={2}
              placeholder="例如：謝謝你想到我"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200 text-sm resize-none"
            />
          </section>

          {/* Step 2 — alternative activity (optional) */}
          <section>
            <h5 className="font-medium text-gray-900 text-sm mb-1">
              ② 想試試這個方式 <span className="text-xs text-gray-500 font-normal">（選填，可保持原邀請）</span>
            </h5>
            {!alternativeOptions ? (
              <div className="py-3 text-sm text-gray-500">載入中…</div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {Object.entries(alternativeOptions).map(([category, options]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-1.5">
                      {getCategoryIcon(category)}
                      <span className="text-sm font-medium text-gray-900">{getCategoryName(category)}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(options as AlternativeIntimacyOption[]).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            setSelectedAlternative((prev) =>
                              prev?.content === option.title
                                ? null
                                : { type: category, content: option.title }
                            )
                          }
                          className={`p-2.5 text-left border rounded-lg transition-colors ${
                            selectedAlternative?.content === option.title
                              ? 'border-pink-400 bg-pink-50 ring-1 ring-pink-300'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 bg-white'
                          }`}
                        >
                          <div className="font-medium text-gray-900 text-sm">{option.title}</div>
                          <div className="text-xs text-gray-600 mt-0.5">{option.description}</div>
                          {option.estimatedDuration && (
                            <div className="text-xs text-gray-500 mt-0.5">{option.estimatedDuration}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Step 3 — required new time */}
          <section>
            <h5 className="font-medium text-gray-900 text-sm mb-1">
              ③ 想改到這個時間 <span className="text-xs text-red-500 font-normal">必填</span>
            </h5>
            <input
              data-testid="intimacy-alt-scheduled-time"
              type="datetime-local"
              value={altScheduledLocal}
              onChange={(e) => setAltScheduledLocal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              以共用時區（{getTimezoneShortLabel(tz)}）顯示。
              {altScheduledLocal && (
                <> 對方會看到：<span className="text-gray-700">{formatDateTime(localInputToIsoInTz(altScheduledLocal, tz), tz, { alwaysShowTz: true })}</span></>
              )}
            </p>
          </section>

          {/* Step 4 — closing */}
          <section>
            <h5 className="font-medium text-gray-900 text-sm mb-1">④ 結尾一句甜蜜</h5>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {CLOSING_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setClosing(s)}
                  className="text-xs px-2 py-1 rounded-full bg-white border border-pink-200 text-pink-700 hover:bg-pink-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <textarea
              data-testid="intimacy-closing"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
              rows={2}
              placeholder="例如：到時見 💕"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200 text-sm resize-none"
            />
          </section>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setMode('choice')}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              返回
            </button>
            <button
              data-testid="intimacy-send-alternative-button"
              onClick={handleSendAlternative}
              disabled={!canSendAlternative || loading}
              className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-pink-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '送出中…' : '送出回應'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntimacyRequestActionPanel;
