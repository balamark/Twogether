import React, { useState } from 'react';
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
  count?: number;
  recordId?: number;
  isCustom?: boolean;
}

interface User {
  id: string;
  email: string;
  nickname: string;
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

interface SettingsViewProps {
  nicknames: Nicknames;
  handleNicknameChange: (partner: 'partner1' | 'partner2', value: string) => void;
  journeyMilestones: JourneyMilestone[];
  setJourneyMilestones: React.Dispatch<React.SetStateAction<JourneyMilestone[]>>;
  authState: AuthState;
  setShowAuthModal: React.Dispatch<React.SetStateAction<boolean>>;
  onAuthStateUpdate?: (authState: AuthState) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({
  nicknames,
  handleNicknameChange,
  journeyMilestones,
  setJourneyMilestones,
  authState,
  setShowAuthModal,
  onAuthStateUpdate
}) => {
  const [pairingCode, setPairingCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleGenerateCode = async () => {
    try {
      setError(null);
      setSuccess(null);
      const response = await apiService.generatePairingCode();
      setGeneratedCode(response.code);
      setSuccess('配對碼已生成，請分享給您的伴侶');
    } catch (err: unknown) {
      console.error('Generate pairing code error:', err);
      const apiError = (err as ApiErrorResponse)?.response?.data;
      if (apiError?.error_code === 'ALREADY_PAIRED') {
        setError('您已經有配對的伴侶了，無法生成新的配對碼');
      } else if (apiError?.error_code === 'CODE_EXISTS') {
        setError('您已有一個有效的配對碼，請等待其過期後再生成新的配對碼');
      } else {
        setError((err as Error)?.message || '生成配對碼失敗，請稍後再試');
      }
    }
  };

  const handlePairWithCode = async () => {
    try {
      setError(null);
      setSuccess(null);
      if (!pairingCode.trim()) {
        setError('請輸入配對碼');
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
      
      setSuccess(`配對成功！您現在已經與 ${authState.user?.partnerNickname || '伴侶'} 連結`);
      setPairingCode('');
      
    } catch (err: unknown) {
      console.error('Pair with code error:', err);
      const apiError = (err as ApiErrorResponse)?.response?.data;
      
      // Handle specific error cases
      if (apiError?.error_code === 'NOT_FOUND') {
        setError('配對碼無效或已過期，請確認配對碼是否正確或請您的伴侶重新生成');
      } else if (apiError?.error_code === 'ALREADY_PAIRED') {
        setError('您已經有配對的伴侶了，無法使用配對碼');
      } else if (apiError?.error_code === 'CODE_EXPIRED') {
        setError('此配對碼已過期，請您的伴侶重新生成');
      } else if (apiError?.error_code === 'SELF_PAIRING') {
        setError('無法使用自己生成的配對碼進行配對');
      } else {
        setError((err as Error)?.message || '配對失敗，請稍後再試');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6 rounded-2xl">
        <h2 className="text-2xl font-bold mb-2">設定</h2>
        <p className="text-indigo-100">個人化你們的愛情應用</p>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">暱稱設定</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="partner1-name" className="block text-sm font-medium text-gray-700 mb-2">伴侶一的暱稱</label>
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
            <label htmlFor="partner2-name" className="block text-sm font-medium text-gray-700 mb-2">伴侶二的暱稱</label>
            <input
              id="partner2-name"
              name="partner2-name"
              type="text"
              value={nicknames.partner2}
              onChange={(e) => handleNicknameChange('partner2', e.target.value)}
              onFocus={(e) => {
                e.target.select();
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
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
            <label htmlFor="first-date" className="block text-sm font-medium text-gray-700 mb-2">第一次約會日期</label>
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
          </div>
          <div>
            <label htmlFor="first-intimacy" className="block text-sm font-medium text-gray-700 mb-2">第一次親密日期</label>
            <input
              id="first-intimacy"
              name="first-intimacy"
              type="date"
              value={journeyMilestones.find(m => m.type === 'first_sex')?.date || ''}
              onChange={(e) => {
                setJourneyMilestones(prev => prev.map(m => 
                  m.type === 'first_sex' ? {...m, date: e.target.value} : m
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

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-4">
          <span className="block sm:inline">{error}</span>
          <button
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
            onClick={() => setError(null)}
          >
            <span className="sr-only">關閉</span>
            <span className="text-2xl">&times;</span>
          </button>
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mt-4">
          <span className="block sm:inline">{success}</span>
          <button
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
            onClick={() => setSuccess(null)}
          >
            <span className="sr-only">關閉</span>
            <span className="text-2xl">&times;</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default SettingsView; 