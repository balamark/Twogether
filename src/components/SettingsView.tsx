import React, { useState, useEffect } from 'react';
import { User, Users, CheckCircle } from 'lucide-react';
import { apiService } from '../services/api';

interface Nicknames {
  partner1: string;
  partner2: string;
}

interface JourneyMilestone {
  id: string;
  type: 'meeting' | 'first_date' | 'first_kiss' | 'first_sex' | 'marriage' | 'child_born' | 'intimacy_milestone' | 'custom';
  date: string;
  title: string;
  description: string;
  place?: string;
  count?: number;
  recordId?: number;
  isCustom?: boolean;
}

interface User {
  id: string;
  email: string;
  nickname: string;
  gender?: 'male' | 'female' | 'other';
  partnerId?: string;
  partnerCode?: string;
  partnerNickname?: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  partnerConnected: boolean;
}

interface ApiError {
  error: string;
  error_code: string;
  status: number;
  timestamp: string;
}

interface ApiErrorResponse {
  response?: {
    data?: ApiError;
  };
  message?: string;
  error_code?: string;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  coins?: number;
  badge?: string;
  duration?: number;
}

interface SettingsViewProps {
  nicknames: Nicknames;
  handleNicknameChange: (partner: 'partner1' | 'partner2', value: string) => void;
  journeyMilestones: JourneyMilestone[];
  setJourneyMilestones: React.Dispatch<React.SetStateAction<JourneyMilestone[]>>;
  authState: AuthState;
  setShowAuthModal: React.Dispatch<React.SetStateAction<boolean>>;
  onAuthStateUpdate?: (authState: AuthState) => void;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  customMemoryQuestions: string[];
  setCustomMemoryQuestions: React.Dispatch<React.SetStateAction<string[]>>;
  customEmotions: string[];
  setCustomEmotions: React.Dispatch<React.SetStateAction<string[]>>;
}

const SettingsView: React.FC<SettingsViewProps> = ({
  nicknames,
  handleNicknameChange,
  journeyMilestones,
  setJourneyMilestones,
  authState,
  setShowAuthModal,
  onAuthStateUpdate,
  showNotification,
  customMemoryQuestions,
  setCustomMemoryQuestions,
  customEmotions,
  setCustomEmotions
}) => {
  const [newMemoryQuestion, setNewMemoryQuestion] = useState('');
  const [newEmotion, setNewEmotion] = useState('');

  const addMemoryQuestion = () => {
    const trimmed = newMemoryQuestion.trim();
    if (!trimmed) return;
    if (customMemoryQuestions.includes(trimmed)) {
      setNewMemoryQuestion('');
      return;
    }
    setCustomMemoryQuestions(prev => [...prev, trimmed]);
    setNewMemoryQuestion('');
  };

  const removeMemoryQuestion = (index: number) => {
    setCustomMemoryQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const addEmotion = () => {
    const trimmed = newEmotion.trim();
    if (!trimmed) return;
    if (customEmotions.includes(trimmed)) {
      setNewEmotion('');
      return;
    }
    setCustomEmotions(prev => [...prev, trimmed]);
    setNewEmotion('');
  };

  const removeEmotion = (index: number) => {
    setCustomEmotions(prev => prev.filter((_, i) => i !== index));
  };

  // Helper function to format ISO date string to YYYY-MM-DD for HTML date input
  const formatDateForInput = (isoDateString: string): string => {
    if (!isoDateString) return '';
    try {
      const date = new Date(isoDateString);
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };
  const [pairingCode, setPairingCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Gender selection state
  const [userGender, setUserGender] = useState<'male' | 'female' | 'other' | null>(null);

  // Email invitation states
  const [recipientEmail, setRecipientEmail] = useState('');
  const [invitationMessage, setInvitationMessage] = useState('');
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);

  const getApiErrorCode = (err: unknown) => {
    const typed = err as ApiErrorResponse & { data?: ApiError; error_code?: string };
    return typed?.error_code || typed?.response?.data?.error_code;
  };

  // Load user's current gender from auth state when component mounts
  useEffect(() => {
    if (authState.user?.gender) {
      setUserGender(authState.user.gender);
    }
  }, [authState.user?.gender]);

  const handleSaveSettings = async () => {
    try {
      setIsSavingSettings(true);
      // Update user gender if specified
      if (userGender) {
        await apiService.updateUserGender(userGender);
      }
      // Only update current user's nickname
      await apiService.updateNicknames({
        partner1: nicknames.partner1,
        partner2: nicknames.partner2
      });
      // Persist couple journey to backend
      const meeting = journeyMilestones.find(m => m.type === 'meeting');
      const firstDate = journeyMilestones.find(m => m.type === 'first_date');
      const firstKiss = journeyMilestones.find(m => m.type === 'first_kiss');
      const firstSex = journeyMilestones.find(m => m.type === 'first_sex');
      await apiService.updateCoupleJourney({
        first_meet_date: meeting?.date || undefined,
        anniversary_date: firstDate?.date || undefined,
        first_kiss_date: firstKiss?.date || undefined,
        first_kiss_place: firstKiss?.place || undefined,
        first_intimacy_date: firstSex?.date || undefined,
        first_intimacy_place: firstSex?.place || undefined,
      });
      // Update auth state and local storage so Header/profile and couple status reflect immediately
      if (authState.user && onAuthStateUpdate) {
        const updatedAuthState = {
          ...authState,
          user: {
            ...authState.user,
            nickname: nicknames.partner1, // Update with the new nickname
            partnerNickname: nicknames.partner2, // Keep partner nickname unchanged
          },
        };
        onAuthStateUpdate(updatedAuthState);
        localStorage.setItem('authState', JSON.stringify(updatedAuthState));
        localStorage.setItem('authUser', JSON.stringify(updatedAuthState.user));
      }
      showNotification({
        type: 'success',
        title: '已保存設定',
        message: '暱稱與愛情里程碑已更新',
        duration: 5000,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: '保存失敗',
        message: (err as Error)?.message || '無法保存暱稱，請稍後重試',
        duration: 6000,
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleGenerateCode = async () => {
    try {
      const response = await apiService.generatePairingCode();
      setGeneratedCode(response.code);
      showNotification({
        type: 'success',
        title: '配對碼已生成',
        message: '請分享給您的伴侶',
        duration: 6000
      });
    } catch (err: unknown) {
      console.error('Generate pairing code error:', err);
      const errorCode = getApiErrorCode(err);
      if (errorCode === 'ALREADY_IN_COUPLE' || errorCode === 'ALREADY_PAIRED') {
        showNotification({
          type: 'error',
          title: '無法生成配對碼',
          message: '您已經有配對的伴侶了，無法生成新的配對碼',
          duration: 8000
        });
      } else {
        showNotification({
          type: 'error',
          title: '生成失敗',
          message: (err as Error)?.message || '生成配對碼失敗，請稍後再試',
          duration: 8000
        });
      }
    }
  };

  const handlePairWithCode = async () => {
    try {
      if (!pairingCode.trim()) {
        showNotification({
          type: 'error',
          title: '驗證錯誤',
          message: '請輸入配對碼',
          duration: 6000
        });
        return;
      }

      const acceptResult = await apiService.acceptPairingCode(pairingCode.trim());

      if (acceptResult.requiresAuth) {
        showNotification({
          type: 'info',
          title: '需要登入',
          message: '請先登入以接受配對邀請',
          duration: 6000
        });
        setShowAuthModal(true);
        return;
      }

      const coupleResult = await apiService.getCouple();

      if (authState.user && onAuthStateUpdate) {
        if (coupleResult.user1Nickname && coupleResult.user2Nickname) {
          const updatedNicknames = {
            partner1: coupleResult.user1Nickname,
            partner2: coupleResult.user2Nickname
          };
          handleNicknameChange('partner1', updatedNicknames.partner1);
          handleNicknameChange('partner2', updatedNicknames.partner2);
        }

        const updatedAuthState = {
          ...authState,
          partnerConnected: true,
          user: {
            ...authState.user,
            partnerId: coupleResult.id,
            partnerNickname: coupleResult.user1Nickname !== authState.user.nickname
              ? coupleResult.user1Nickname
              : coupleResult.user2Nickname
          }
        };

        localStorage.setItem('authState', JSON.stringify(updatedAuthState));
        onAuthStateUpdate(updatedAuthState);
      }

      showNotification({
        type: 'success',
        title: '配對成功！',
        message: acceptResult.autoResolved
          ? '配對成功，我們已自動處理重複邀請'
          : `您現在已經與 ${authState.user?.partnerNickname || '伴侶'} 連結`,
        duration: 8000
      });
      setPairingCode('');

    } catch (err: unknown) {
      console.error('Pair with code error:', err);
      const errorCode = getApiErrorCode(err);
      
      // Handle specific error cases
      if (errorCode === 'INVITATION_NOT_FOUND') {
        showNotification({
          type: 'error',
          title: '配對碼無效',
          message: '配對碼無效或已過期，請確認配對碼是否正確或請您的伴侶重新生成',
          duration: 8000
        });
      } else if (errorCode === 'ALREADY_IN_COUPLE' || errorCode === 'ALREADY_PAIRED') {
        showNotification({
          type: 'info',
          title: '已完成配對',
          message: '你們已經成功配對了！請重新整理頁面查看最新狀態。',
          duration: 8000
        });
      } else if (errorCode === 'INVITATION_EXPIRED') {
        showNotification({
          type: 'error',
          title: '配對碼已過期',
          message: '此配對碼已過期，請您的伴侶重新生成',
          duration: 8000
        });
      } else if (errorCode === 'SELF_PAIRING') {
        showNotification({
          type: 'error',
          title: '無法自配對',
          message: '無法使用自己生成的配對碼進行配對',
          duration: 8000
        });
      } else {
        showNotification({
          type: 'error',
          title: '配對失敗',
          message: (err as Error)?.message || '配對失敗，請稍後再試',
          duration: 8000
        });
      }
    }
  };

  const handleSendEmailInvitation = async () => {
    try {
      if (!recipientEmail.trim()) {
        showNotification({
          type: 'error',
          title: '驗證錯誤',
          message: '請輸入對方的電子郵件地址',
          duration: 6000
        });
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipientEmail.trim())) {
        showNotification({
          type: 'error',
          title: '電子郵件格式錯誤',
          message: '請輸入有效的電子郵件地址',
          duration: 6000
        });
        return;
      }

      setIsSendingInvitation(true);

      const invitationData = {
        recipientEmail: recipientEmail.trim(),
        message: invitationMessage.trim() || undefined
      };

      await apiService.sendPairingInvitation(invitationData);

      showNotification({
        type: 'success',
        title: '邀請已發送！',
        message: `已向 ${recipientEmail} 發送配對邀請，請等待對方接受`,
        duration: 8000
      });

      // Clear the form
      setRecipientEmail('');
      setInvitationMessage('');

    } catch (err: unknown) {
      console.error('Send email invitation error:', err);
      const errorCode = getApiErrorCode(err);
      const errorMessage = (err as Error)?.message || '發送邀請失敗，請稍後再試';

      if (errorCode === 'ALREADY_IN_COUPLE') {
        showNotification({
          type: 'error',
          title: '無法發送邀請',
          message: '您已經有配對的伴侶了，無法發送新的邀請',
          duration: 8000
        });
        return;
      }
      if (errorCode === 'RECIPIENT_ALREADY_IN_COUPLE') {
        showNotification({
          type: 'error',
          title: '對方已配對',
          message: '這位用戶已經與其他人建立配對',
          duration: 8000
        });
        return;
      }
      if (errorCode === 'INVITATION_ALREADY_SENT') {
        showNotification({
          type: 'info',
          title: '已發送邀請',
          message: '您已經向這個信箱發送過邀請，請等待對方回應',
          duration: 8000
        });
        return;
      }

      showNotification({
        type: 'error',
        title: '發送失敗',
        message: errorMessage,
        duration: 8000
      });
    } finally {
      setIsSendingInvitation(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
              — 設定
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
              <em className="not-italic font-light italic text-pink-600">設定</em>
            </h2>
            <p className="font-display italic font-light text-base text-petal-muted">
              個人化你們的愛情應用。
            </p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={isSavingSettings}
            className={`px-6 py-2.5 rounded-md font-display italic text-base transition-colors ${
              isSavingSettings
                ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
            }`}
          >
            {isSavingSettings ? '保存中…' : '保存設定 →'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">暱稱設定</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="partner1-name" className="block text-sm font-medium text-gray-700 mb-2">你的暱稱</label>
            <input
              id="partner1-name"
              name="partner1-name"
              type="text"
              value={nicknames.partner1}
              onChange={(e) => handleNicknameChange('partner1', e.target.value)}
              onFocus={(e) => {
                e.target.select();
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="partner2-name" className="block text-sm font-medium text-gray-700 mb-2">伴侶的暱稱</label>
            <input
              id="partner2-name"
              name="partner2-name"
              type="text"
              value={nicknames.partner2}
              readOnly
              disabled
              className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              title="伴侶的暱稱無法編輯，只能查看"
            />
            <p className="text-xs text-gray-500 mt-1">
              ℹ️ 伴侶的暱稱由對方設定，您無法修改
            </p>
          </div>
          {/* Global save button moved to header */}
        </div>
      </div>

      {/* Gender Selection */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">性別設定</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              選擇您的性別 (用於角色扮演劇本的角色分配)
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  checked={userGender === 'female'}
                  onChange={() => setUserGender('female')}
                  className="w-4 h-4 text-pink-600 bg-gray-100 border-gray-300 focus:ring-pink-500 focus:ring-2"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">女性 👩</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  checked={userGender === 'male'}
                  onChange={() => setUserGender('male')}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">男性 👨</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="gender"
                  value="other"
                  checked={userGender === 'other'}
                  onChange={() => setUserGender('other')}
                  className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 focus:ring-purple-500 focus:ring-2"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">其他 🌈</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 此設定會影響角色扮演劇本中的角色名稱，例如偶像默認為女性角色
            </p>
          </div>
        </div>
      </div>

      {/* Journey Milestones Management */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">愛情里程碑設定</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="meeting-date" className="block text-sm font-medium text-gray-700 mb-2">相遇日期</label>
            <input
              id="meeting-date"
              name="meeting-date"
              type="date"
              value={formatDateForInput(journeyMilestones.find(m => m.type === 'meeting')?.date || '')}
              onChange={(e) => {
                setJourneyMilestones(prev => prev.map(m => 
                  m.type === 'meeting' ? {...m, date: e.target.value} : m
                ));
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
          </div>
          <div>
            <label htmlFor="first-date" className="block text-sm font-medium text-gray-700 mb-2">開始交往的日期</label>
            <input
              id="first-date"
              name="first-date"
              type="date"
              value={formatDateForInput(journeyMilestones.find(m => m.type === 'first_date')?.date || '')}
              onChange={(e) => {
                setJourneyMilestones(prev => prev.map(m => 
                  m.type === 'first_date' ? {...m, date: e.target.value} : m
                ));
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
          </div>
          <div>
            <label htmlFor="first-kiss" className="block text-sm font-medium text-gray-700 mb-2">初吻日期</label>
            <input
              id="first-kiss"
              name="first-kiss"
              type="date"
              value={formatDateForInput(journeyMilestones.find(m => m.type === 'first_kiss')?.date || '')}
              onChange={(e) => {
                setJourneyMilestones(prev => prev.map(m => 
                  m.type === 'first_kiss' ? {...m, date: e.target.value} : m
                ));
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
            <div className="mt-3">
              <label htmlFor="first-kiss-place" className="block text-sm font-medium text-gray-700 mb-2">初吻事件地點</label>
              <input
                id="first-kiss-place"
                name="first-kiss-place"
                type="text"
                placeholder="例如：象山步道、校園操場…"
                value={journeyMilestones.find(m => m.type === 'first_kiss')?.place || ''}
                onChange={(e) => {
                  setJourneyMilestones(prev => prev.map(m => 
                    m.type === 'first_kiss' ? {...m, place: e.target.value} : m
                  ));
                }}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="first-intimacy-date" className="block text-sm font-medium text-gray-700 mb-2">第一次親密日期</label>
            <input
              id="first-intimacy-date"
              name="first-intimacy-date"
              type="date"
              value={formatDateForInput(journeyMilestones.find(m => m.type === 'first_sex')?.date || '')}
              onChange={(e) => {
                setJourneyMilestones(prev => prev.map(m =>
                  m.type === 'first_sex' ? {...m, date: e.target.value} : m
                ));
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
          </div>
          <div>
            <label htmlFor="first-intimacy-place" className="block text-sm font-medium text-gray-700 mb-2">第一次親密場所</label>
            <input
              id="first-intimacy-place"
              name="first-intimacy-place"
              type="text"
              placeholder="例如：某飯店、家裡、露營車…"
              value={journeyMilestones.find(m => m.type === 'first_sex')?.place || ''}
              onChange={(e) => {
                setJourneyMilestones(prev => prev.map(m => 
                  m.type === 'first_sex' ? {...m, place: e.target.value} : m
                ));
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
          </div>
        </div>
      </div>

      {/* Custom Game Content — 自訂遊戲內容 */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">自訂遊戲內容</h3>
        <p className="text-xs text-gray-500 mb-5">
          💡 這裡新增的題目與情緒，會出現在「情趣遊戲 → 回憶倒帶 / 情緒模仿秀」的隨機抽取清單中，與預設內容一起被抽到。
        </p>

        {/* 回憶倒帶 questions */}
        <div className="mb-6">
          <label htmlFor="new-memory-question" className="block text-sm font-medium text-gray-700 mb-2">
            回憶倒帶 — 自訂題目
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {customMemoryQuestions.length === 0 ? (
              <p className="font-display italic font-light text-sm text-petal-muted">尚未新增自訂題目</p>
            ) : (
              customMemoryQuestions.map((q, i) => (
                <span
                  key={i}
                  className="inline-flex items-start max-w-full px-3 py-1.5 bg-petal-cream-2 border border-petal-rule rounded-md text-sm text-petal-ink"
                >
                  <span className="break-words leading-snug">{q}</span>
                  <button
                    type="button"
                    onClick={() => removeMemoryQuestion(i)}
                    className="ml-2 text-petal-muted hover:text-petal-rose-deep flex-shrink-0 leading-snug"
                    aria-label={`移除題目：${q}`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              id="new-memory-question"
              type="text"
              value={newMemoryQuestion}
              onChange={(e) => setNewMemoryQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMemoryQuestion(); } }}
              placeholder="例如：你最喜歡我哪一個小習慣？"
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
            <button
              type="button"
              onClick={addMemoryQuestion}
              disabled={!newMemoryQuestion.trim()}
              className="px-4 py-3 bg-petal-ink text-petal-cream rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              加入
            </button>
          </div>
        </div>

        {/* 情緒模仿秀 emotions */}
        <div>
          <label htmlFor="new-emotion" className="block text-sm font-medium text-gray-700 mb-2">
            情緒模仿秀 — 自訂情緒
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {customEmotions.length === 0 ? (
              <p className="font-display italic font-light text-sm text-petal-muted">尚未新增自訂情緒</p>
            ) : (
              customEmotions.map((emo, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-3 py-1.5 bg-petal-rose-soft/30 border border-petal-rose-soft rounded-full text-sm text-petal-ink"
                >
                  {emo}
                  <button
                    type="button"
                    onClick={() => removeEmotion(i)}
                    className="ml-2 text-petal-muted hover:text-petal-rose-deep flex-shrink-0"
                    aria-label={`移除情緒：${emo}`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              id="new-emotion"
              type="text"
              value={newEmotion}
              onChange={(e) => setNewEmotion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmotion(); } }}
              placeholder="例如：得意、賴皮、想被寵"
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
            <button
              type="button"
              onClick={addEmotion}
              disabled={!newEmotion.trim()}
              className="px-4 py-3 bg-petal-ink text-petal-cream rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              加入
            </button>
          </div>
        </div>
      </div>

      {/* Authentication and Pairing Section */}
      {!authState.isAuthenticated ? (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2 text-pink-500" />
            帳號設定
          </h3>
          <p className="text-gray-600 mb-4">登入以同步你們的愛情數據，並與伴侶分享美好時光</p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full bg-petal-ink text-petal-cream py-3 rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
          >
            開始登入
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-green-500" />
            情侶配對
          </h3>
          
          {/* User Status */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div>
                <p className="font-medium text-green-800">已登入</p>
                <p className="text-sm text-green-600">{authState.user?.nickname}</p>
              </div>
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            
            {authState.partnerConnected ? (
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="font-medium text-green-800">✓ 已與伴侶連接</p>
                <p className="text-sm text-green-600">
                  與 {authState.user?.partnerNickname || '伴侶'} 連結中 - 你們可以分享愛的時光了！
                </p>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="font-medium text-yellow-800 mb-2">等待配對</p>
                <p className="text-sm text-yellow-600">使用下方功能與伴侶建立連接</p>
              </div>
            )}
          </div>

          {/* Generate Code Section */}
          {!authState.partnerConnected && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border rounded-2xl p-5 bg-pink-50/30">
                  <h4 className="text-lg font-medium mb-2">📧 透過電子郵件邀請</h4>
                  <p className="text-gray-600 mb-4">
                    直接透過電子郵件向您的伴侶發送配對邀請，對方只需點擊郵件中的連結即可接受配對。
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="recipient-email" className="block text-sm font-medium text-gray-700 mb-2">
                        伴侶的電子郵件地址
                      </label>
                      <input
                        id="recipient-email"
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="例如：partner@example.com"
                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        disabled={isSendingInvitation}
                      />
                    </div>

                    <div>
                      <label htmlFor="invitation-message" className="block text-sm font-medium text-gray-700 mb-2">
                        個人訊息 (選填)
                      </label>
                      <textarea
                        id="invitation-message"
                        value={invitationMessage}
                        onChange={(e) => setInvitationMessage(e.target.value)}
                        placeholder="想對伴侶說的話..."
                        rows={3}
                        maxLength={500}
                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                        disabled={isSendingInvitation}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {invitationMessage.length}/500 字符
                      </p>
                    </div>

                    <button
                      onClick={handleSendEmailInvitation}
                      disabled={isSendingInvitation || !recipientEmail.trim()}
                      className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                        isSendingInvitation || !recipientEmail.trim()
                          ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                          : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                      }`}
                    >
                      {isSendingInvitation ? '發送中…' : '發送邀請 →'}
                    </button>
                  </div>
                </div>

                <div className="border rounded-2xl p-5 bg-yellow-50/40">
                  <h4 className="text-lg font-medium mb-2">🔑 透過配對碼</h4>
                  <p className="text-gray-600 mb-4">
                    生成配對碼並分享給您的伴侶，或輸入伴侶的配對碼完成配對。
                  </p>
                  <div className="space-y-4">
                    <button
                      onClick={handleGenerateCode}
                      className="w-full bg-pink-500 text-white px-4 py-2 rounded hover:bg-pink-600 transition-colors"
                    >
                      生成配對碼
                    </button>
                    {generatedCode && (
                      <div className="p-4 bg-white rounded-lg border">
                        <p className="text-gray-700">您的配對碼：</p>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className="bg-yellow-200 px-3 py-1 rounded font-mono text-lg">
                            {generatedCode}
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(generatedCode)}
                            className="text-yellow-600 hover:text-yellow-700"
                          >
                            複製
                          </button>
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                          此配對碼將在7天後失效
                        </p>
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <label htmlFor="pairing-code-input" className="block text-sm font-medium text-gray-700 mb-2">
                        輸入伴侶配對碼
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="pairing-code-input"
                          type="text"
                          value={pairingCode}
                          onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                          placeholder="輸入配對碼"
                          className="flex-1 border rounded px-3 py-2 font-mono"
                          maxLength={8}
                        />
                        <button
                          onClick={handlePairWithCode}
                          className="bg-pink-500 text-white px-4 py-2 rounded hover:bg-pink-600 transition-colors"
                        >
                          配對
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}


    </div>
  );
};

export default SettingsView; 
