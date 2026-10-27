import React, { useState } from 'react';
import { User, LogOut, Coins, Heart, Bell, Send, Settings, Trophy, Inbox, Crown, MessageSquarePlus, Activity, LifeBuoy, Compass, BookOpen, Play, StickyNote, HeartHandshake, HeartPulse } from 'lucide-react';
import type { BillingStatus } from '../services/api';
import LanguageSwitch from './LanguageSwitch';
import { useLanguage } from '../i18n/LanguageContext';

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
  unreadNotificationCount: number;
  onShowCoinShop: () => void;
  onShowSettings: () => void;
  onShowActivity: () => void;
  onShowJourney: () => void;
  onShowStories: () => void;
  onShowRoleplay: () => void;
  onShowWall: () => void;
  onShowEmotionCheck: () => void;
  onShowTherapists: () => void;
  onShowIntimacyHistory: () => void;
  onShowUpgrade: () => void;
  onShowFeedback: () => void;
  onShowLoveLanguage: () => void;
  onShowDeepDive: () => void;
  onShowHelp: () => void;
  // Couple's Premium status; when premium, the menu shows the expiry date so it's
  // always visible (not just on the upgrade page).
  billingStatus?: BillingStatus | null;
  // Counselor role switch. The pill only renders for therapist accounts
  // (isTherapist); toggling flips the whole app between the couple context and
  // the 諮商師工作台. counselorMode reflects which side is active.
  isTherapist?: boolean;
  counselorMode?: boolean;
  onToggleCounselorMode?: () => void;
}

// Short M/D for the header badge (full date lives on the upgrade page).
function formatShortDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
  } catch {
    return iso;
  }
}

const Header: React.FC<HeaderProps> = ({
  authState,
  totalCoins,
  onShowAuthModal,
  onLogout,
  onShowIntimacyRequest,
  onShowNotifications,
  unreadNotificationCount,
  onShowCoinShop,
  onShowSettings,
  onShowActivity,
  onShowJourney,
  onShowStories,
  onShowRoleplay,
  onShowWall,
  onShowEmotionCheck,
  onShowTherapists,
  onShowIntimacyHistory,
  onShowUpgrade,
  onShowFeedback,
  onShowLoveLanguage,
  onShowDeepDive,
  onShowHelp,
  billingStatus,
  isTherapist = false,
  counselorMode = false,
  onToggleCounselorMode,
}) => {
  const { t, locale } = useLanguage();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const handleLogout = () => {
    onLogout();
    setShowUserMenu(false);
  };


  return (
    <div className="bg-petal-cream border-b border-petal-rule safe-pt safe-px">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Logo and Title */}
          <div className="flex items-center min-w-0">
            <div className="flex items-baseline space-x-2 min-w-0">
              <Heart className="w-6 h-6 text-pink-500 self-center opacity-80 shrink-0" strokeWidth={1.5} />
              <h1 className="font-display text-lg sm:text-2xl font-medium tracking-tight text-petal-ink truncate">
                Two<em className="not-italic font-light italic text-pink-600">gether</em>
                <span className="hidden sm:inline ml-2 font-body text-xs font-normal uppercase tracking-[0.18em] text-petal-muted align-middle">
                  {t('header.tagline')}
                </span>
              </h1>
            </div>
          </div>

          {/* Right Side - Actions, Coins and User */}
          <div className="flex items-center space-x-1.5 sm:space-x-3 md:space-x-4 shrink-0">
            {/* Counselor role switch — therapist accounts only. A segmented pill
                (like a light/dark toggle) that flips the whole app between the
                couple context (一般) and the 諮商師工作台 (諮商師). */}
            {authState.isAuthenticated && isTherapist && onToggleCounselorMode && (
              <div
                role="switch"
                aria-checked={counselorMode}
                aria-label={t('header.counselorSwitch')}
                data-testid="counselor-mode-toggle"
                data-mode={counselorMode ? 'counselor' : 'user'}
                className="flex items-center gap-0.5 p-0.5 rounded-full border border-petal-rule bg-petal-cream-2"
              >
                <button
                  type="button"
                  onClick={() => { if (counselorMode) onToggleCounselorMode(); }}
                  aria-pressed={!counselorMode}
                  title={t('header.modeUserTitle')}
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-colors text-xs font-medium ${
                    !counselorMode
                      ? 'bg-petal-ink text-petal-cream'
                      : 'text-petal-ink-soft hover:text-petal-ink'
                  }`}
                >
                  <User className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="hidden sm:inline">{t('header.modeUser')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { if (!counselorMode) onToggleCounselorMode(); }}
                  aria-pressed={counselorMode}
                  title={t('header.modeCounselor')}
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full transition-colors text-xs font-medium ${
                    counselorMode
                      ? 'bg-petal-ink text-petal-cream'
                      : 'text-petal-ink-soft hover:text-petal-ink'
                  }`}
                >
                  <HeartHandshake className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="hidden sm:inline">{t('header.modeCounselor')}</span>
                </button>
              </div>
            )}

            {/* Intimacy Request Button */}
            {authState.isAuthenticated && authState.partnerConnected && (
              <button
                onClick={onShowIntimacyRequest}
                data-testid="header-intimacy-button"
                className="flex items-center space-x-2 bg-pink-500 text-white p-2 sm:px-4 sm:py-2 rounded-full hover:bg-pink-600 transition-colors min-h-[40px] min-w-[40px] justify-center"
                title={t('header.intimacyTitle')}
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline text-sm font-medium">{t('header.intimacy')}</span>
              </button>
            )}

            {/* Notifications */}
            {authState.isAuthenticated && (
              <button
                onClick={onShowNotifications}
                className="relative p-2 text-petal-ink-soft hover:text-petal-ink hover:bg-petal-cream-2 rounded-full transition-colors"
                title={t('header.notifications')}
                aria-label={t('header.notifications')}
              >
                <Bell className="w-4 h-4" strokeWidth={1.5} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-pink-600 text-white font-body text-[11px] leading-none w-[18px] h-[18px] rounded-full flex items-center justify-center">
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                )}
              </button>
            )}

            {/* User Section */}
            {authState.isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  data-testid="user-menu-toggle"
                  className="flex items-center space-x-1 sm:space-x-1.5 border border-petal-rule hover:border-petal-ink px-2 sm:px-3 py-1.5 rounded-full transition-colors min-h-[40px] max-w-[140px] sm:max-w-none"
                >
                  <User className="w-3.5 h-3.5 text-petal-ink-soft shrink-0" strokeWidth={1.5} />
                  <span className="font-body text-sm text-petal-ink truncate">
                    {authState.user?.nickname || t('header.userFallback')}
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
                          <span className="font-body text-xs text-petal-sage-deep">{t('header.partnerConnected')}</span>
                        </div>
                      ) : (
                        <div className="mt-2.5 flex items-center space-x-1.5">
                          <div className="w-1.5 h-1.5 bg-petal-rose-deep rounded-full"></div>
                          <span className="font-body text-xs text-petal-rose-deep">{t('header.partnerWaiting')}</span>
                        </div>
                      )}
                      {/* Signed-in users switch language here, not in the
                          header row, which was crowded on phones. */}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="font-body text-xs text-petal-muted">{t('lang.switchLabel')}</span>
                        <LanguageSwitch />
                      </div>
                    </div>
                    <div className="p-2">
                      <button
                        onClick={() => {
                          onShowCoinShop();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-coin-shop"
                        className="w-full flex items-center justify-between px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <span className="flex items-center space-x-2">
                          <Coins className="w-3.5 h-3.5 text-pink-600" strokeWidth={1.5} />
                          <span>{t('menu.coinShop')}</span>
                        </span>
                        <span data-testid="coin-balance" className="font-display italic text-sm text-petal-ink">{totalCoins}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowActivity();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-activity"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <Activity className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.activity')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowJourney();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-journey"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <Trophy className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.journey')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowStories();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-stories"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.stories')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowRoleplay();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-roleplay"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.roleplay')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowWall();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-wall"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <StickyNote className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.wall')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowTherapists();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-therapists"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <HeartHandshake className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.therapists')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowIntimacyHistory();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-intimacy-history"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <Inbox className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.intimacyHistory')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowLoveLanguage();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-love-language"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <Heart className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.loveLanguage')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowEmotionCheck();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-emotion-check"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <HeartPulse className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.emotionCheck')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowDeepDive();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-deep-dive"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <Compass className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.deepDive')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowUpgrade();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-upgrade"
                        data-tier={billingStatus?.tier || 'free'}
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-pink-600 hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <Crown className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {billingStatus?.tier === 'premium' ? (
                          <span>
                            {t('menu.premiumMember')}
                            {billingStatus.expiresAt ? t('menu.premiumExpires', { date: formatShortDate(billingStatus.expiresAt, locale) }) : ''}
                          </span>
                        ) : (
                          <span>{t('menu.upgrade')}</span>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          onShowFeedback();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-feedback"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.feedback')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowHelp();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-help"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <LifeBuoy className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.help')}</span>
                      </button>
                      <button
                        onClick={() => {
                          onShowSettings();
                          setShowUserMenu(false);
                        }}
                        data-testid="user-menu-settings"
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.settings')}</span>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-2 px-3 py-2 font-body text-sm text-petal-ink-soft hover:bg-petal-cream-2 rounded-md transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('menu.logout')}</span>
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
                {t('header.signIn')}
              </button>
            )}

            {/* 語言切換：登入前放在最右上角；登入後收進個人選單（見上方），
                讓 390px 寬的手機 header 不會擠成一排按鈕。 */}
            {!authState.isAuthenticated && <LanguageSwitch />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header; 