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
}

const SettingsView: React.FC<SettingsViewProps> = ({
  nicknames,
  handleNicknameChange,
  journeyMilestones,
  setJourneyMilestones,
  authState,
  setShowAuthModal,
  onAuthStateUpdate,
  showNotification
}) => {
  const [pairingCode, setPairingCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Gender selection state
  const [userGender, setUserGender] = useState<'male' | 'female' | 'other' | null>(null);

  // Email invitation states
  const [recipientEmail, setRecipientEmail] = useState('');
  const [invitationMessage, setInvitationMessage] = useState('');
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);

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
        anniversary_date: meeting?.date || undefined,
        first_date: firstDate?.date || undefined,
        first_kiss_date: firstKiss?.date || undefined,
        first_kiss_place: (firstKiss as any)?.place || undefined,
        first_intimacy_place: (firstSex as any)?.place || undefined,
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
      const apiError = (err as ApiErrorResponse)?.response?.data;
      if (apiError?.error_code === 'ALREADY_PAIRED') {
        showNotification({
          type: 'error',
          title: '無法生成配對碼',
          message: '您已經有配對的伴侶了，無法生成新的配對碼',
          duration: 8000
        });
      } else if (apiError?.error_code === 'CODE_EXISTS') {
        showNotification({
          type: 'error',
          title: '配對碼已存在',
          message: '您已有一個有效的配對碼，請等待其過期後再生成新的配對碼',
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
      
      const coupleResult = await apiService.createCouple({ pairingCode: pairingCode.trim() });
      
      // Update authentication state to reflect pairing
      if (authState.user && onAuthStateUpdate) {
        // Update nicknames based on couple information
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
        
        // Update local state and localStorage
        localStorage.setItem('authState', JSON.stringify(updatedAuthState));
        
        // Update parent component's auth state
        onAuthStateUpdate(updatedAuthState);
      }
      
      showNotification({
        type: 'success',
        title: '配對成功！',
        message: `您現在已經與 ${authState.user?.partnerNickname || '伴侶'} 連結`,
        duration: 8000
      });
      setPairingCode('');
      
    } catch (err: unknown) {
      console.error('Pair with code error:', err);
      const apiError = (err as ApiErrorResponse)?.response?.data;
      
      // Handle specific error cases
      if (apiError?.error_code === 'NOT_FOUND') {
        showNotification({
          type: 'error',
          title: '配對碼無效',
          message: '配對碼無效或已過期，請確認配對碼是否正確或請您的伴侶重新生成',
          duration: 8000
        });
      } else if (apiError?.error_code === 'ALREADY_PAIRED') {
        showNotification({
          type: 'error',
          title: '無法配對',
          message: '您已經有配對的伴侶了，無法使用配對碼',
          duration: 8000
        });
      } else if (apiError?.error_code === 'CODE_EXPIRED') {
        showNotification({
          type: 'error',
          title: '配對碼已過期',
          message: '此配對碼已過期，請您的伴侶重新生成',
          duration: 8000
        });
      } else if (apiError?.error_code === 'SELF_PAIRING') {
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
      const errorMessage = (err as Error)?.message || '發送邀請失敗，請稍後再試';

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
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6 rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">設定</h2>
            <p className="text-indigo-100">個人化你們的愛情應用</p>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={isSavingSettings}
            className={`inline-flex items-center px-4 py-2 rounded-lg text-white transition-colors ${
              isSavingSettings ? 'bg-white/30 cursor-not-allowed' : 'bg-white/20 hover:bg-white/30'
            }`}
          >
            {isSavingSettings ? '保存中…' : '保存設定'}
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
              value={journeyMilestones.find(m => m.type === 'meeting')?.date || ''}
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
              value={journeyMilestones.find(m => m.type === 'first_date')?.date || ''}
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
              value={journeyMilestones.find(m => m.type === 'first_kiss')?.date || ''}
              onChange={(e) => {
                setJourneyMilestones(prev => prev.map(m => 
                  m.type === 'first_kiss' ? {...m, date: e.target.value} : m
                ));
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
            <div className="mt-3">
              <label htmlFor="first-kiss-place" className="block text-sm font-medium text-gray-700 mb-2">印象深刻的親吻事件地點</label>
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
            className="w-full bg-gradient-to-r from-pink-500 to-rose-600 text-white py-3 rounded-lg hover:from-pink-600 hover:to-rose-700 transition-colors"
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
              <div className="mb-6">
                <h4 className="text-lg font-medium mb-2">生成配對碼</h4>
                <p className="text-gray-600 mb-4">
                  生成一個配對碼並分享給您的伴侶，讓他們可以與您配對。
                  配對碼有效期為24小時。
                </p>
                <button
                  onClick={handleGenerateCode}
                  className="bg-pink-500 text-white px-4 py-2 rounded hover:bg-pink-600 transition-colors"
                >
                  生成配對碼
                </button>
                {generatedCode && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
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
                      此配對碼將在24小時後失效
                    </p>
                  </div>
                )}
              </div>

              {/* Email Invitation Section */}
              <div className="border-t pt-6">
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
                    className={`w-full py-3 rounded-lg font-medium transition-colors ${
                      isSendingInvitation || !recipientEmail.trim()
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600'
                    }`}
                  >
                    {isSendingInvitation ? '發送中...' : '💌 發送邀請'}
                  </button>
                </div>
              </div>

              {/* Enter Code Section */}
              <div className="border-t pt-6">
                <h4 className="text-lg font-medium mb-2">輸入配對碼</h4>
                <p className="text-gray-600 mb-4">
                  如果您的伴侶已經生成了配對碼，請在此輸入以完成配對。
                </p>
                <div className="flex gap-2">
                  <input
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
            </>
          )}
        </div>
      )}


    </div>
  );
};

export default SettingsView; 