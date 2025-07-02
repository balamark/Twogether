import React from 'react';
import { User, Users, CheckCircle } from 'lucide-react';

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
  createdAt: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  partnerConnected: boolean;
}

interface SettingsViewProps {
  nicknames: Nicknames;
  handleNicknameChange: (partner: 'partner1' | 'partner2', value: string) => void;
  journeyMilestones: JourneyMilestone[];
  setJourneyMilestones: React.Dispatch<React.SetStateAction<JourneyMilestone[]>>;
  authState: AuthState;
  setShowAuthModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const SettingsView: React.FC<SettingsViewProps> = ({
  nicknames,
  handleNicknameChange,
  journeyMilestones,
  setJourneyMilestones,
  authState,
  setShowAuthModal
}) => {
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

      {/* Authentication Section */}
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
            配對狀態
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div>
                <p className="font-medium text-green-800">已登入</p>
                <p className="text-sm text-green-600">{authState.user?.nickname}</p>
              </div>
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            
            {!authState.partnerConnected ? (
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="font-medium text-yellow-800 mb-2">配對碼</p>
                <div className="flex items-center space-x-2">
                  <span className="bg-yellow-200 px-3 py-1 rounded font-mono text-lg">
                    {authState.user?.partnerCode}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(authState.user?.partnerCode || '')}
                    className="text-yellow-600 hover:text-yellow-700"
                  >
                    複製
                  </button>
                </div>
                <p className="text-sm text-yellow-600 mt-2">分享此碼給你的伴侶來連接帳號</p>
              </div>
            ) : (
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="font-medium text-green-800">✓ 已與伴侶連接</p>
                <p className="text-sm text-green-600">你們可以分享愛的時光了！</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsView; 