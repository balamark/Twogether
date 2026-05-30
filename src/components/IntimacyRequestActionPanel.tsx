import React, { useState, useEffect } from 'react';
import { Heart, Check, Smile, Coffee, HandHeart } from 'lucide-react';
import { apiService } from '../services/api';
import type {
  IntimacyRequest,
  AlternativeIntimacyOptionsGrouped,
  AlternativeIntimacyOption,
  RespondToIntimacyRequestRequest,
} from '../services/api';

interface IntimacyRequestActionPanelProps {
  request: IntimacyRequest;
  onResponded: () => void;
}

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

const IntimacyRequestActionPanel: React.FC<IntimacyRequestActionPanelProps> = ({
  request,
  onResponded,
}) => {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [alternativeOptions, setAlternativeOptions] = useState<AlternativeIntimacyOptionsGrouped | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState<{
    type: string;
    content: string;
    scheduledTime?: string;
  } | null>(null);
  const [acceptMessage, setAcceptMessage] = useState<string>('接受你的邀請 💕');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (showAlternatives && !alternativeOptions) {
      apiService
        .getAlternativeIntimacyOptions()
        .then(setAlternativeOptions)
        .catch((err) => {
          console.error('Failed to fetch alternative options:', err);
          setError('無法載入替代選項');
        });
    }
  }, [showAlternatives, alternativeOptions]);

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

  const handleSendAlternative = async () => {
    if (!selectedAlternative) return;
    try {
      setLoading(true);
      setError(null);
      const response: RespondToIntimacyRequestRequest = {
        accept: false,
        responseMessage: '現在不太合適，但我們可以試試這個 💝',
        alternativeType: selectedAlternative.type,
        alternativeContent: selectedAlternative.content,
        alternativeScheduledTime: selectedAlternative.scheduledTime,
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

      {!showAlternatives ? (
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
          <div className="flex space-x-3">
            <button
              data-testid="intimacy-accept-button"
              onClick={handleAccept}
              disabled={loading}
              className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-pink-300 transition-colors flex items-center space-x-2"
            >
              <Check className="w-4 h-4" />
              <span>接受邀請</span>
            </button>
            <button
              data-testid="intimacy-alternatives-button"
              onClick={() => setShowAlternatives(true)}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              改個時間
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">選擇替代的親密方式</h4>

          {!alternativeOptions ? (
            <div className="py-4 text-sm text-gray-500">載入中…</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(alternativeOptions).map(([category, options]) => (
                <div key={category}>
                  <div className="flex items-center space-x-2 mb-2">
                    {getCategoryIcon(category)}
                    <h5 className="font-medium text-gray-900">{getCategoryName(category)}</h5>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(options as AlternativeIntimacyOption[]).map((option) => (
                      <button
                        key={option.id}
                        onClick={() =>
                          setSelectedAlternative({ type: category, content: option.title })
                        }
                        className={`p-3 text-left border rounded-lg transition-colors ${
                          selectedAlternative?.content === option.title
                            ? 'border-pink-300 bg-pink-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-medium text-gray-900 text-sm">{option.title}</div>
                        <div className="text-xs text-gray-600 mt-1">{option.description}</div>
                        {option.estimatedDuration && (
                          <div className="text-xs text-gray-500 mt-1">{option.estimatedDuration}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end space-x-3 mt-4">
            <button
              onClick={() => {
                setShowAlternatives(false);
                setSelectedAlternative(null);
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              data-testid="intimacy-send-alternative-button"
              onClick={handleSendAlternative}
              disabled={!selectedAlternative || loading}
              className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-pink-300 transition-colors"
            >
              {loading ? '發送中...' : '發送建議'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntimacyRequestActionPanel;
