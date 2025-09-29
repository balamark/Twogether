import React, { useState, useEffect } from 'react';
import { Heart, Clock, Send, Sparkles, X } from 'lucide-react';
import { apiService } from '../services/api';
import type { IntimacyTemplate } from '../services/api';

interface IntimacyRequestFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const IntimacyRequestForm: React.FC<IntimacyRequestFormProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<'category' | 'template' | 'customize' | 'confirm'>('category');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [_selectedTemplate, setSelectedTemplate] = useState<IntimacyTemplate | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [requestType, setRequestType] = useState<'intimate' | 'scheduled'>('intimate');
  const [scheduledTime, setScheduledTime] = useState('');
  const [templates, setTemplates] = useState<IntimacyTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = [
    { id: 'compliment', name: '甜蜜讚美', emoji: '💕', description: '發送溫馨的讚美和愛意給伴侶' },
    { id: 'reconciliation', name: '真心和解', emoji: '🤝', description: '吵架後的真誠道歉和溫柔挽回' },
    { id: 'idol_photographer', name: '偶像/攝影師', emoji: '📸', description: '角色扮演：偶像與攝影師的私密互動' },
    { id: 'teacher_student', name: '老師/學生', emoji: '📚', description: '角色扮演：師生間的特別課程' },
    { id: 'foreign_student', name: '留學生邂逅', emoji: '✈️', description: '角色扮演：異國戀情的浪漫約會' },
    { id: 'custom', name: '自訂訊息', emoji: '✨', description: '完全客製化你的親密邀請' },
  ];

  useEffect(() => {
    if (selectedCategory && selectedCategory !== 'custom') {
      fetchTemplatesByCategory();
    }
  }, [selectedCategory]);

  const fetchTemplatesByCategory = async function() {
    try {
      setLoading(true);
      const categoryTemplates = await apiService.getIntimacyTemplatesByCategory(selectedCategory);
      setTemplates(categoryTemplates);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '無法載入模板';
      setError(errorMessage);
      console.error('Failed to fetch intimacy templates by category:', err);

      // If it's an authentication error, close the form so the app can handle login redirect
      if (errorMessage.includes('登錄已過期') || errorMessage.includes('重新登錄')) {
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = function(categoryId: string) {
    setSelectedCategory(categoryId);
    setSelectedTemplate(null);
    setCustomMessage('');
    if (categoryId === 'custom') {
      setCurrentStep('customize');
    } else {
      setCurrentStep('template');
    }
  };

  const handleTemplateSelect = function(template: IntimacyTemplate) {
    setSelectedTemplate(template);
    setCustomMessage(`${template.timeHint}，${template.roleplaySetup}`);
    setCurrentStep('customize');
  };

  const handleSendRequest = async function() {
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
        requestType: selectedCategory === 'compliment' ? 'compliment' : selectedCategory === 'reconciliation' ? 'reconciliation' : requestType,
        roleplayCategory: selectedCategory !== 'custom' && selectedCategory !== 'compliment' && selectedCategory !== 'reconciliation' ? selectedCategory : undefined,
        scheduledTime: requestType === 'scheduled' && scheduledTime ?
          new Date(scheduledTime).toISOString() : undefined,
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

  const resetForm = function() {
    setCurrentStep('category');
    setSelectedCategory('');
    setSelectedTemplate(null);
    setCustomMessage('');
    setRequestType('intimate');
    setScheduledTime('');
    setError(null);
  };

  const handleClose = function() {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Heart className="w-6 h-6 text-pink-500" />
            <h3 className="text-xl font-semibold text-gray-900">
              發送親密邀請
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center space-x-4">
            {['category', 'template', 'customize', 'confirm'].map((step, index) => (
              <div
                key={step}
                className={`flex items-center ${index < 3 ? 'flex-1' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep === step
                      ? 'bg-pink-500 text-white'
                      : steps.indexOf(currentStep) > index
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {index + 1}
                </div>
                {index < 3 && (
                  <div
                    className={`flex-1 h-px mx-2 ${
                      steps.indexOf(currentStep) > index
                        ? 'bg-green-500'
                        : 'bg-gray-200'
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
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                選擇邀請類型
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categories.map((category) => (
                  <button
                    key={category.id}
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

          {/* Step 2: Template Selection */}
          {currentStep === 'template' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900">
                  {selectedCategory === 'compliment' ? '選擇讚美訊息' : selectedCategory === 'reconciliation' ? '選擇和解訊息' : '選擇訊息模板'}
                </h4>
                <button
                  onClick={() => setCurrentStep('category')}
                  className="text-sm text-pink-600 hover:text-pink-700"
                >
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
                  {/* Show templates or default compliment options */}
                  {templates.length > 0 ? (
                    templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateSelect(template)}
                        className="w-full p-4 border border-gray-200 rounded-lg hover:border-pink-300 hover:bg-pink-50 transition-colors text-left"
                      >
                        <div className="flex items-start space-x-3">
                          <div className={`w-3 h-3 rounded-full mt-2 ${
                            template.suggestionLevel === 'subtle' ? 'bg-green-400' :
                            template.suggestionLevel === 'moderate' ? 'bg-yellow-400' :
                            'bg-red-400'
                          }`}></div>
                          <div className="flex-1">
                            <p className="text-gray-900 font-medium mb-1">
                              {template.timeHint}
                            </p>
                            <p className="text-gray-600 text-sm">
                              {template.roleplaySetup}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (selectedCategory === 'compliment' || selectedCategory === 'reconciliation') ? (
                    // Default options if templates aren't loaded
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
                      { timeHint: '愛的承諾', roleplaySetup: '無論什麼時候，你都是我心中最特別的那個人 💝' }
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
                            <p className="text-gray-900 font-medium mb-1">
                              {template.timeHint}
                            </p>
                            <p className="text-gray-600 text-sm">
                              {template.roleplaySetup}
                            </p>
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
                        {selectedCategory === 'compliment' ? '自訂讚美訊息' : selectedCategory === 'reconciliation' ? '自訂和解訊息' : '自訂訊息內容'}
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Customize Message */}
          {currentStep === 'customize' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900">
                  {selectedCategory === 'compliment' ? '自訂讚美內容' : selectedCategory === 'reconciliation' ? '自訂和解內容' : '自訂邀請內容'}
                </h4>
                <button
                  onClick={() => selectedCategory === 'custom' ? setCurrentStep('category') : setCurrentStep('template')}
                  className="text-sm text-pink-600 hover:text-pink-700"
                >
                  返回
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    邀請類型
                  </label>
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
                      預約時間
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {selectedCategory === 'compliment' ? '讚美內容 *' : selectedCategory === 'reconciliation' ? '和解內容 *' : '邀請內容 *'}
                  </label>
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder={selectedCategory === 'compliment' ?
                      "輸入你想對伴侶說的甜蜜讚美..." :
                      selectedCategory === 'reconciliation' ?
                      "輸入你的真誠道歉和和解訊息..." :
                      "輸入你的親密邀請內容..."}
                    rows={4}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {customMessage.length}/1000 字符
                  </p>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
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

          {/* Step 4: Confirm and Send */}
          {currentStep === 'confirm' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900">
                  {selectedCategory === 'compliment' ? '確認讚美內容' : selectedCategory === 'reconciliation' ? '確認和解內容' : '確認邀請內容'}
                </h4>
                <button
                  onClick={() => setCurrentStep('customize')}
                  className="text-sm text-pink-600 hover:text-pink-700"
                >
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
                    <p className="text-gray-700 whitespace-pre-wrap">{customMessage}</p>
                    {requestType === 'scheduled' && scheduledTime && (
                      <div className="mt-3 flex items-center space-x-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>預約時間：{new Date(scheduledTime).toLocaleString('zh-TW')}</span>
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
                  onClick={handleSendRequest}
                  disabled={loading}
                  className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-pink-300 transition-colors flex items-center space-x-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{loading ? '發送中...' : (selectedCategory === 'compliment' ? '發送讚美' : selectedCategory === 'reconciliation' ? '發送和解' : '發送邀請')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const steps = ['category', 'template', 'customize', 'confirm'];

export default IntimacyRequestForm;
