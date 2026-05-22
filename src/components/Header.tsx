import React, { useState, useEffect } from 'react';
import { User, LogOut, Coins, Heart, Bell, Send, Settings } from 'lucide-react';
import { apiService } from '../services/api';

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

interface HeaderProps {
  authState: AuthState;
  totalCoins: number;
  onShowAuthModal: () => void;
  onLogout: () => void;
  onShowIntimacyRequest: () => void;
  onShowNotifications: () => void;
  onShowCoinShop: () => void;
  onShowSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({
  authState,
  totalCoins,
  onShowAuthModal,
  onLogout,
  onShowIntimacyRequest,
  onShowNotifications,
  onShowCoinShop,
  onShowSettings,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // Fetch unread notification count only on login/refresh
  useEffect(() => {
    if (authState.isAuthenticated) {
      fetchUnreadCount();
      // No periodic refresh - only fetch on login/refresh to reduce server load
    }
  }, [authState.isAuthenticated]);

  const fetchUnreadCount = async function() {
    try {
      const count = await apiService.getUnreadNotificationCount();
      setUnreadNotificationCount(count);
    } catch (error) {
      console.error('Failed to fetch unread notification count:', error);
    }
  };

  const handleLogout = () => {
    onLogout();
    setShowUserMenu(false);
  };

  const handleNotificationClick = () => {
    onShowNotifications();
    setUnreadNotificationCount(0); // Reset count when opening notifications
    // Refresh count after opening notifications
    setTimeout(() => fetchUnreadCount(), 1000);
  };

  return (
    <div className="bg-petal-cream border-b border-petal-rule safe-pt safe-px">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Logo and Title */}
          <div className="flex items-center min-w-0">
            <div className="flex items-baseline space-x-2 min-w-0">
              <Heart className="w-6 h-6 text-pink-500 self-center opacity-80 shrink-0" strokeWidth={1.5} />
              <h1 className="font-display text-xl sm:text-2xl font-medium tracking-tight text-petal-ink truncate">
                Two<em className="not-italic font-light italic text-pink-600">gether</em>
                <span className="hidden sm:inline ml-2 font-body text-xs font-normal uppercase tracking-[0.18em] text-petal-muted align-middle">
                  圖在一起
                </span>
              </h1>
            </div>
          </div>

          {/* Right Side - Actions, Coins and User */}
          <div className="flex items-center space-x-1.5 sm:space-x-3 md:space-x-4 shrink-0">
            {/* Intimacy Request Button */}
            {authState.isAuthenticated && authState.partnerConnected && (
              <button
                onClick={onShowIntimacyRequest}
                className="flex items-center space-x-2 bg-pink-500 text-white p-2 sm:px-4 sm:py-2 rounded-full hover:bg-pink-600 transition-colors min-h-[40px] min-w-[40px] justify-center"
                title="發送親密邀請"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline text-sm font-medium">親密邀請</span>
              </button>
            )}

            {/* Notifications */}
            {authState.isAuthenticated && (
              <button
                onClick={handleNotificationClick}
                className="relative p-2 text-petal-ink-soft hover:text-petal-ink hover:bg-petal-cream-2 rounded-full transition-colors"
                title="通知中心"
              >
                <Bell className="w-4 h-4" strokeWidth={1.5} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-pink-600 text-white font-body text-[11px] leading-none w-[18px] h-[18px] rounded-full flex items-center justify-center">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>
            )}

            {/* Coins Display */}
            {authState.isAuthenticated && (
              <button
                onClick={onShowCoinShop}
                data-testid="coin-balance"
                title="前往金幣商店"
                className="flex items-center space-x-1 sm:space-x-1.5 border border-petal-rule hover:border-petal-ink px-2 sm:px-3 py-1.5 rounded-full transition-colors min-h-[40px]"
              >
                <Coins className="w-3.5 h-3.5 text-pink-600" strokeWidth={1.5} />
                <span className="font-display italic text-sm text-petal-ink">{totalCoins}</span>
              </button>
            )}

            {/* User Section */}
            {authState.isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-1 sm:space-x-1.5 border border-petal-rule hover:border-petal-ink px-2 sm:px-3 py-1.5 rounded-full transition-colors min-h-[40px] max-w-[140px] sm:max-w-none"
                >
                  <User className="w-3.5 h-3.5 text-petal-ink-soft shrink-0" strokeWidth={1.5} />
                  <span className="font-body text-sm text-petal-ink truncate">
                    {authState.user?.nickname || '用戶'}
                  </span>
                </button>

                {/* User Dropdown */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-[min(16rem,calc(100vw-2rem))] bg-petal-cream rounded-md shadow-petal border border-petal-rule z-50">
                    <div className="p-4 border-b border-petal-rule">
                      <div className="font-display text-base font-medium text-petal-ink">
                        {authState.user?.nickname}
                      </div>
                      <div className="font-body text-xs text-petal-muted mt-0.5">
                        {authState.user?.email}
                      </div>
                      {authState.partnerConnected ? (
                        <div className="mt-2.5 flex items-center space-x-1.5">
                          <div className="w-1.5 h-1.5 bg-petal-sage-deep rounded-full"></div>
                          <span className="font-body text-xs text-petal-sage-deep">已連接伴侶</span>
                        </div>
                      ) : (
                        <div className="mt-2.5 flex items-center space-x-1.5">
                          <div className="w-1.5 h-1.5 bg-petal-rose-deep rounded-full"></div>
                          <span className="font-body text-xs text-petal-rose-deep">等待伴侶連接</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <button
                        onClick={() => {
                          onShowSettings();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-settings"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>設定</span>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>登出</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Overlay to close dropdown */}
                {showUserMenu && (
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowUserMenu(false)}
                  />
                )}
              </div>
            ) : (
              <button
                onClick={onShowAuthModal}
                data-testid="header-auth-button"
                className="bg-petal-ink text-white px-5 py-2 rounded-full hover:bg-pink-700 transition-colors text-sm font-medium tracking-wide"
              >
                登入 / 註冊
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header; 