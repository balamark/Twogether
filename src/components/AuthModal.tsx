import { useState } from 'react';
import { X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiService } from '../services/api';
import type { Notification } from '../App';
import { tr } from '../i18n/tr';

interface AuthModalProps {
  onClose: () => void;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
  handleLogin: (email: string, password: string) => Promise<void>;
  handleRegister: (email: string, nickname: string, password: string) => Promise<void>;
  handlePartnerConnect: (partnerCode: string) => Promise<void>;
}

// Auth Modal Component. Defined at module scope (not inside App) so its identity
// is stable across App re-renders — a nested definition would remount on every
// render and wipe the email/password/nickname fields mid-entry. See issue #41.
const AuthModal = ({
  onClose,
  showNotification,
  handleLogin,
  handleRegister,
  handlePartnerConnect,
}: AuthModalProps) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'partner' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  useScrollLock(true);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isLoading) return; // Prevent double-clicking

    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const emailValue = (formData.get('email') as string || '').trim();
    const passwordValue = (formData.get('password') as string || '');
    const nicknameValue = (formData.get('nickname') as string || '').trim();
    const confirmPasswordValue = (formData.get('confirm-password') as string || '');
    const partnerCodeValue = (formData.get('partner-code') as string || '').trim();

    try {
      if (authMode === 'login') {
        // Validate login form
        if (!emailValue) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('請輸入電子郵件地址', 'Please enter your email address'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        if (!passwordValue) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('請輸入密碼', 'Please enter your password'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailValue)) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('請輸入有效的電子郵件地址', 'Please enter a valid email address'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        // Password length validation
        if (passwordValue.length < 6) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('密碼至少需要6個字符', 'Password must be at least 6 characters'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        await handleLogin(emailValue, passwordValue);
      } else if (authMode === 'register') {
        // Validate registration form
        if (!emailValue) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('請輸入電子郵件地址', 'Please enter your email address'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        if (!nicknameValue) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('請輸入暱稱', 'Please enter a nickname'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        if (!passwordValue) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('請輸入密碼', 'Please enter a password'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailValue)) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('請輸入有效的電子郵件地址', 'Please enter a valid email address'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        // Nickname length validation
        if (nicknameValue.length < 2 || nicknameValue.length > 50) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('暱稱必須在2-50個字符之間', 'Nickname must be 2–50 characters'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        // Password length validation
        if (passwordValue.length < 6) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('密碼至少需要6個字符', 'Password must be at least 6 characters'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        if (passwordValue !== confirmPasswordValue) {
          showNotification({
            type: 'error',
            title: tr('密碼不匹配', 'Passwords don\'t match'),
            message: tr('請確認兩次輸入的密碼相同', 'Please make sure both passwords are the same'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        await handleRegister(emailValue, nicknameValue, passwordValue);
      } else {
        // Validate partner code
        if (!partnerCodeValue) {
          showNotification({
            type: 'error',
            title: tr('驗證錯誤', 'Check your input'),
            message: tr('請輸入配對碼', 'Please enter a pairing code'),
            duration: 6000
          });
          setIsLoading(false);
          return;
        }
        await handlePartnerConnect(partnerCodeValue);
      }
    } catch (error) {
      // Error handling is done in individual functions
      console.error('Form submission error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot-password: the backend always replies with the same generic message
  // (it never reveals whether the email exists), so we just surface it and
  // return the user to the login screen.
  const handleForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;
    const formData = new FormData(e.currentTarget);
    const emailValue = (formData.get('email') as string || '').trim();
    if (!emailValue) {
      showNotification({ type: 'error', title: tr('驗證錯誤', 'Check your input'), message: tr('請輸入電子郵件地址', 'Please enter your email address'), duration: 6000 });
      return;
    }
    setIsLoading(true);
    try {
      const result = await apiService.forgotPassword(emailValue);
      showNotification({
        type: 'success',
        title: tr('請查收信箱', 'Check your inbox'),
        message: result?.message || tr('如果這個 Email 有註冊帳號，我們已寄出重設密碼的連結。', 'If this email has an account, we\'ve sent a link to reset your password.'),
        duration: 7000,
      });
      setAuthMode('login');
    } catch (error) {
      showNotification({
        type: 'error',
        title: tr('寄送失敗', 'Couldn\'t send'),
        message: (error as Error)?.message || tr('無法寄出重設信，請稍後再試。', 'Couldn\'t send the reset email. Please try again in a moment.'),
        duration: 6000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-petal-cream rounded-md p-7 max-w-md w-full shadow-petal border border-petal-rule" data-testid="auth-modal">
        <div className="flex justify-between items-end mb-6 pb-5 border-b border-petal-rule">
          <div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
              — {authMode === 'login' ? tr('登入', 'Sign in') : authMode === 'register' ? tr('註冊', 'Sign up') : authMode === 'forgot' ? tr('重設密碼', 'Reset password') : tr('連接', 'Connect')}
            </div>
            <h3 data-testid="auth-modal-heading" className="font-display text-2xl font-light tracking-tight text-petal-ink">
              {authMode === 'login' ? <>{tr('登入', 'Welcome')}<em className="not-italic font-light italic text-pink-600">{tr('愛的時光', ' back')}</em></> :
               authMode === 'register' ? <>{tr('註冊', 'Create')}<em className="not-italic font-light italic text-pink-600">{tr('新帳號', ' an account')}</em></> :
               authMode === 'forgot' ? <>{tr('重設', 'Reset')}<em className="not-italic font-light italic text-pink-600">{tr('密碼', ' password')}</em></> :
               <>{tr('連接', 'Connect')}<em className="not-italic font-light italic text-pink-600">{tr('伴侶', ' your partner')}</em></>}
            </h3>
          </div>
          <button
            onClick={onClose}
            data-testid="auth-modal-close-button"
            className="text-petal-muted hover:text-petal-ink transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {authMode === 'login' && (
          <form key="login-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-2">
                {tr('電子郵件', 'Email')}
              </label>
              <input
                id="login-email"
                name="email"
                data-testid="auth-email-input"
                type="email"
                defaultValue={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder={tr("輸入你的電子郵件", 'Enter your email')}
                disabled={isLoading}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">
                {tr('密碼', 'Password')}
              </label>
              <input
                id="login-password"
                name="password"
                data-testid="auth-password-input"
                type="password"
                autoComplete="current-password"
                defaultValue={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder={tr("輸入你的密碼", 'Enter your password')}
                disabled={isLoading}
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              data-testid="auth-submit-button"
              className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                isLoading
                  ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                  : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin"></div>
                  <span>{tr('登入中…', 'Signing in…')}</span>
                </div>
              ) : (
                <span>{tr('開始愛的旅程 →', 'Start your love journey →')}</span>
              )}
            </button>
          </form>
        )}

        {authMode === 'register' && (
          <form key="register-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-2">
                {tr('電子郵件', 'Email')}
              </label>
              <input
                id="register-email"
                name="email"
                type="email"
                defaultValue={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder={tr("輸入你的電子郵件", 'Enter your email')}
                disabled={isLoading}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label htmlFor="register-nickname" className="block text-sm font-medium text-gray-700 mb-2">
                {tr('暱稱', 'Nickname')}
              </label>
              <input
                id="register-nickname"
                name="nickname"
                type="text"
                defaultValue={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder={tr("輸入你的暱稱", 'Enter your nickname')}
                disabled={isLoading}
                autoComplete="nickname"
                required
              />
            </div>
            <div>
              <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-2">
                {tr('密碼', 'Password')}
              </label>
              <input
                id="register-password"
                name="password"
                type="password"
                autoComplete="new-password"
                defaultValue={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder={tr("輸入你的密碼", 'Enter your password')}
                disabled={isLoading}
                required
              />
            </div>
            <div>
              <label htmlFor="register-confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                {tr('確認密碼', 'Confirm password')}
              </label>
              <input
                id="register-confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                defaultValue={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder={tr("再次輸入密碼", 'Enter your password again')}
                disabled={isLoading}
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              data-testid="auth-submit-button"
              className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                isLoading
                  ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                  : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin"></div>
                  <span>{tr('註冊中…', 'Signing up…')}</span>
                </div>
              ) : (
                <span>{tr('註冊帳號 →', 'Create account →')}</span>
              )}
            </button>
          </form>
        )}

        {authMode === 'partner' && (
          <form key="partner-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="partner-code" className="block text-sm font-medium text-gray-700 mb-2">
                {tr('伴侶配對碼', 'Partner\'s pairing code')}
              </label>
              <input
                id="partner-code"
                name="partner-code"
                type="text"
                defaultValue={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder={tr("輸入伴侶的配對碼", 'Enter your partner\'s pairing code')}
                disabled={isLoading}
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              data-testid="auth-submit-button"
              className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                isLoading
                  ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                  : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin"></div>
                  <span>{tr('連接中…', 'Connecting…')}</span>
                </div>
              ) : (
                <span>{tr('連接伴侶 →', 'Connect partner →')}</span>
              )}
            </button>
          </form>
        )}

        {authMode === 'forgot' && (
          <form key="forgot-form" onSubmit={handleForgot} className="space-y-4">
            <p className="font-body text-sm text-petal-ink-soft leading-relaxed">
              {tr('輸入你註冊時使用的電子郵件，我們會寄送重設密碼的連結給你。', 'Enter the email you signed up with and we\'ll send you a link to reset your password.')}
            </p>
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-2">
                {tr('電子郵件', 'Email')}
              </label>
              <input
                id="forgot-email"
                name="email"
                data-testid="forgot-email-input"
                type="email"
                defaultValue={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder={tr("輸入你的電子郵件", 'Enter your email')}
                disabled={isLoading}
                autoComplete="username"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              data-testid="forgot-submit-button"
              className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                isLoading
                  ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                  : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-4 h-4 border-2 border-petal-muted border-t-transparent rounded-full animate-spin"></div>
                  <span>{tr('寄送中…', 'Sending…')}</span>
                </div>
              ) : (
                <span>{tr('寄送重設連結 →', 'Send reset link →')}</span>
              )}
            </button>
          </form>
        )}

        <div className="mt-4 text-center space-y-2">
          {authMode === 'login' && (
            <>
              <button
                onClick={() => setAuthMode('register')}
                disabled={isLoading}
                className={`text-pink-600 hover:text-pink-700 text-sm block w-full ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {tr('還沒帳號？立即註冊', 'No account yet? Sign up')}
              </button>
              <button
                onClick={() => setAuthMode('partner')}
                disabled={isLoading}
                className={`text-pink-600 hover:text-pink-700 text-sm block w-full ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {tr('已有帳號？連接伴侶', 'Have an account? Connect your partner')}
              </button>
              <button
                onClick={() => setAuthMode('forgot')}
                disabled={isLoading}
                data-testid="forgot-password-link"
                className={`text-petal-muted hover:text-petal-ink text-sm block w-full ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {tr('忘記密碼？', 'Forgot password?')}
              </button>
            </>
          )}
          {authMode === 'forgot' && (
            <button
              onClick={() => setAuthMode('login')}
              disabled={isLoading}
              className={`text-pink-600 hover:text-pink-700 text-sm block w-full ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {tr('← 返回登入', '← Back to sign in')}
            </button>
          )}
          {authMode === 'register' && (
            <button
              onClick={() => setAuthMode('login')}
              disabled={isLoading}
              className={`text-pink-600 hover:text-pink-700 text-sm block w-full ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {tr('已有帳號？立即登入', 'Already have an account? Sign in')}
            </button>
          )}
          {authMode === 'partner' && (
            <button
              onClick={() => setAuthMode('login')}
              disabled={isLoading}
              className={`text-pink-600 hover:text-pink-700 text-sm block w-full ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {tr('還沒帳號？立即註冊', 'No account yet? Sign up')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
