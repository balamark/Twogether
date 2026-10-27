import React, { useState, useEffect } from 'react';
import { User, Users, CheckCircle, Trash2 } from 'lucide-react';
import { apiService, type CycleRecord } from '../services/api';
import { AiCompanionList } from './AiCompanionPicker';
import LineNotificationSettings from './LineNotificationSettings';
import { PairingInviteShare } from './PairingInviteShare';
import { resolveCompanion } from '../utils/aiCompanions';
import { averageCycleLength, predictNextPeriodStart, ovulationWindow, computeCycleLengths } from '../utils/cycle';
import { TIMEZONE_OPTIONS } from '../utils/timezone-options';
import { formatYmdInTz, browserTz as getBrowserTz } from '../utils/datetime';
import { useEngineerMode } from '../contexts/EngineerModeContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { Spinner } from './ui/Spinner';
import { tr } from '../i18n/tr';

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
  birth_date?: string | null;
  email_verified?: boolean;
  email_notifications_enabled?: boolean;
  cycle_tracking_enabled?: boolean;
  public_share_show_nickname?: boolean;
  timezone?: string | null;
  couplePrimaryTimezone?: string | null;
  partnerTimezone?: string | null;
  partnerId?: string;
  partnerCode?: string;
  partnerNickname?: string;
  selected_therapist?: string | null;
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
  cycleRecords?: CycleRecord[];
  onCycleRecordsChange?: (records: CycleRecord[]) => void;
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
  setCustomEmotions,
  cycleRecords = [],
  onCycleRecordsChange
}) => {
  const [newMemoryQuestion, setNewMemoryQuestion] = useState('');
  const [newEmotion, setNewEmotion] = useState('');
  const [editingCompanion, setEditingCompanion] = useState(false);
  const [isSavingCompanion, setIsSavingCompanion] = useState(false);
  // 工程師模式（Premium 彩蛋）— 開關與權限都由 EngineerModeContext 提供。
  const engineer = useEngineerMode();

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

  // Helper function to format ISO date string to YYYY-MM-DD for HTML date input.
  // Use the viewer's tz so a midnight-in-local-tz timestamp doesn't roll back to
  // the previous day via UTC conversion.
  const formatDateForInput = (isoDateString: string): string => {
    if (!isoDateString) return '';
    try {
      return formatYmdInTz(isoDateString, getBrowserTz());
    } catch {
      return '';
    }
  };
  const [pairingCode, setPairingCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Gender selection state
  const [userGender, setUserGender] = useState<'male' | 'female' | 'other' | null>(null);

  // Birth date state (used for age-based health-reference suggestions)
  const [userBirthDate, setUserBirthDate] = useState<string>('');

  // Email notifications opt-out state
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState<boolean>(true);
  const [isSavingEmailPref, setIsSavingEmailPref] = useState<boolean>(false);

  // Login-email change state
  const [showEmailChangeForm, setShowEmailChangeForm] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState<string>('');
  const [emailChangePassword, setEmailChangePassword] = useState<string>('');
  const [isChangingEmail, setIsChangingEmail] = useState<boolean>(false);

  // Cycle tracking opt-in state
  const [cycleTrackingEnabled, setCycleTrackingEnabled] = useState<boolean>(false);
  const [isSavingCyclePref, setIsSavingCyclePref] = useState<boolean>(false);

  // Public-share nickname preference (default true = show nickname)
  const [shareShowNickname, setShareShowNickname] = useState<boolean>(true);
  const [isSavingSharePref, setIsSavingSharePref] = useState<boolean>(false);

  // Timezone settings — per-user and couple-level primary
  const browserTz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
  })();
  const [userTimezone, setUserTimezone] = useState<string>('');
  const [couplePrimaryTimezone, setCouplePrimaryTimezone] = useState<string>('');
  const [isSavingUserTz, setIsSavingUserTz] = useState<boolean>(false);
  const [isSavingCoupleTz, setIsSavingCoupleTz] = useState<boolean>(false);

  // Email invitation states
  const [recipientEmail, setRecipientEmail] = useState('');
  const [invitationMessage, setInvitationMessage] = useState('');
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);
  // Accept link for the invite just sent, so the user can pass it along
  // directly when the email is slow or filtered.
  const [sentInvite, setSentInvite] = useState<{ link: string; email: string; emailSent: boolean } | null>(null);

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

  useEffect(() => {
    const bd = authState.user?.birth_date;
    setUserBirthDate(bd ? formatDateForInput(bd) : '');
  }, [authState.user?.birth_date]);

  // Load email notification preference from auth state.
  useEffect(() => {
    const pref = authState.user?.email_notifications_enabled;
    if (typeof pref === 'boolean') {
      setEmailNotificationsEnabled(pref);
    }
  }, [authState.user?.email_notifications_enabled]);

  useEffect(() => {
    const pref = authState.user?.public_share_show_nickname;
    // Default to true (show nickname) when unset.
    setShareShowNickname(pref !== false);
  }, [authState.user?.public_share_show_nickname]);

  useEffect(() => {
    const pref = authState.user?.cycle_tracking_enabled;
    if (typeof pref === 'boolean') {
      setCycleTrackingEnabled(pref);
    }
  }, [authState.user?.cycle_tracking_enabled]);

  useEffect(() => {
    setUserTimezone(authState.user?.timezone || '');
  }, [authState.user?.timezone]);

  useEffect(() => {
    setCouplePrimaryTimezone(authState.user?.couplePrimaryTimezone || '');
  }, [authState.user?.couplePrimaryTimezone]);

  const handleUpdateUserTimezone = async (next: string) => {
    const previous = userTimezone;
    setUserTimezone(next);
    setIsSavingUserTz(true);
    try {
      await apiService.updateUserTimezone(next || null);
      // First-user-wins default: if no couple primary is set yet, adopt this value.
      let adoptedAsPrimary = false;
      if (next && !authState.user?.couplePrimaryTimezone && authState.partnerConnected) {
        try {
          await apiService.updateCouplePrimaryTimezone(next);
          adoptedAsPrimary = true;
        } catch {
          // Non-fatal; the user can set it manually below.
        }
      }
      if (authState.user && onAuthStateUpdate) {
        const updated = {
          ...authState,
          user: {
            ...authState.user,
            timezone: next || null,
            ...(adoptedAsPrimary ? { couplePrimaryTimezone: next } : {}),
          },
        };
        onAuthStateUpdate(updated);
        localStorage.setItem('authState', JSON.stringify(updated));
        localStorage.setItem('authUser', JSON.stringify(updated.user));
      }
      if (adoptedAsPrimary) setCouplePrimaryTimezone(next);
      showNotification({
        type: 'success',
        title: tr('已更新', 'Updated'),
        message: adoptedAsPrimary ? tr('我的時區與共用時區已同步設定', 'Your time zone and the shared time zone are both set') : tr('我的時區已更新', 'Your time zone was updated'),
        duration: 4000,
      });
    } catch (err) {
      setUserTimezone(previous);
      showNotification({
        type: 'error',
        title: tr('更新失敗', 'Couldn\'t update'),
        message: (err as Error)?.message || tr('無法更新時區設定', 'Couldn\'t update the time zone setting'),
        duration: 5000,
      });
    } finally {
      setIsSavingUserTz(false);
    }
  };

  const handleUpdateCompanion = async (next: string) => {
    if (next === (authState.user?.selected_therapist || null)) {
      setEditingCompanion(false);
      return;
    }
    setIsSavingCompanion(true);
    try {
      await apiService.updateAiCompanion(next);
      if (authState.user && onAuthStateUpdate) {
        const updated = {
          ...authState,
          user: {
            ...authState.user,
            selected_therapist: next,
          },
        };
        onAuthStateUpdate(updated);
        localStorage.setItem('authState', JSON.stringify(updated));
        localStorage.setItem('authUser', JSON.stringify(updated.user));
      }
      setEditingCompanion(false);
      showNotification({
        type: 'success',
        title: tr('已更換 AI 諮商師', 'AI counselor changed'),
        message: tr(`之後的 AI 回覆將由 ${resolveCompanion(next).name} 陪你們聊，過去的對話不會改變`, `From now on, ${resolveCompanion(next).name} will talk with you both. Past conversations won't change`),
        duration: 5000,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('更新失敗', 'Couldn\'t update'),
        message: (err as Error)?.message || tr('無法更新 AI 諮商師，請稍後再試', 'Couldn\'t update the AI counselor. Please try again in a moment'),
        duration: 5000,
      });
    } finally {
      setIsSavingCompanion(false);
    }
  };

  const handleUpdateCouplePrimaryTimezone = async (next: string) => {
    const previous = couplePrimaryTimezone;
    setCouplePrimaryTimezone(next);
    setIsSavingCoupleTz(true);
    try {
      await apiService.updateCouplePrimaryTimezone(next || null);
      if (authState.user && onAuthStateUpdate) {
        const updated = {
          ...authState,
          user: {
            ...authState.user,
            couplePrimaryTimezone: next || null,
          },
        };
        onAuthStateUpdate(updated);
        localStorage.setItem('authState', JSON.stringify(updated));
        localStorage.setItem('authUser', JSON.stringify(updated.user));
      }
      showNotification({
        type: 'success',
        title: tr('已更新', 'Updated'),
        message: tr('共用時區已更新', 'Shared time zone updated'),
        duration: 4000,
      });
    } catch (err) {
      setCouplePrimaryTimezone(previous);
      showNotification({
        type: 'error',
        title: tr('更新失敗', 'Couldn\'t update'),
        message: (err as Error)?.message || tr('無法更新共用時區設定', 'Couldn\'t update the shared time zone'),
        duration: 5000,
      });
    } finally {
      setIsSavingCoupleTz(false);
    }
  };

  const handleToggleCycleTracking = async (next: boolean) => {
    const previous = cycleTrackingEnabled;
    setCycleTrackingEnabled(next);
    setIsSavingCyclePref(true);
    try {
      await apiService.updateCycleTrackingEnabled(next);
      if (authState.user && onAuthStateUpdate) {
        const updated = {
          ...authState,
          user: { ...authState.user, cycle_tracking_enabled: next },
        };
        onAuthStateUpdate(updated);
        localStorage.setItem('authState', JSON.stringify(updated));
        localStorage.setItem('authUser', JSON.stringify(updated.user));
      }
      showNotification({
        type: 'success',
        title: tr('已更新', 'Updated'),
        message: next ? tr('已開啟週期追蹤', 'Cycle tracking turned on') : tr('已關閉週期追蹤', 'Cycle tracking turned off'),
        duration: 4000,
      });
    } catch (err) {
      setCycleTrackingEnabled(previous);
      showNotification({
        type: 'error',
        title: tr('更新失敗', 'Couldn\'t update'),
        message: (err as Error)?.message || tr('無法更新週期追蹤設定', 'Couldn\'t update the cycle tracking setting'),
        duration: 5000,
      });
    } finally {
      setIsSavingCyclePref(false);
    }
  };

  const handleDeleteCycleRecord = async (id: string) => {
    if (!onCycleRecordsChange) return;
    if (!window.confirm(tr('確定要刪除這筆週期紀錄嗎？刪除後無法復原。', 'Delete this cycle record? This can\'t be undone.'))) return;
    const previous = cycleRecords;
    onCycleRecordsChange(cycleRecords.filter(r => r.id !== id));
    try {
      await apiService.deleteCycleRecord(id);
      showNotification({ type: 'success', title: tr('已刪除', 'Deleted'), message: tr('週期紀錄已刪除', 'Cycle record deleted'), duration: 3000 });
    } catch (err) {
      onCycleRecordsChange(previous);
      showNotification({ type: 'error', title: tr('刪除失敗', 'Couldn\'t delete'), message: (err as Error)?.message || tr('無法刪除週期紀錄', 'Couldn\'t delete the cycle record'), duration: 5000 });
    }
  };

  const handleToggleEmailNotifications = async (next: boolean) => {
    const previous = emailNotificationsEnabled;
    setEmailNotificationsEnabled(next);
    setIsSavingEmailPref(true);
    try {
      await apiService.updateEmailNotificationsEnabled(next);
      if (authState.user && onAuthStateUpdate) {
        const updated = {
          ...authState,
          user: { ...authState.user, email_notifications_enabled: next },
        };
        onAuthStateUpdate(updated);
        localStorage.setItem('authState', JSON.stringify(updated));
        localStorage.setItem('authUser', JSON.stringify(updated.user));
      }
      showNotification({
        type: 'success',
        title: tr('已更新', 'Updated'),
        message: next ? tr('已開啟伴侶活動的電子郵件通知', 'Email notifications for your partner\'s activity are on') : tr('已關閉伴侶活動的電子郵件通知', 'Email notifications for your partner\'s activity are off'),
        duration: 4000,
      });
    } catch (err) {
      setEmailNotificationsEnabled(previous);
      showNotification({
        type: 'error',
        title: tr('更新失敗', 'Couldn\'t update'),
        message: (err as Error)?.message || tr('無法更新通知設定', 'Couldn\'t update the notification setting'),
        duration: 5000,
      });
    } finally {
      setIsSavingEmailPref(false);
    }
  };

  // Request a login-email change. The address only switches after the user
  // clicks the link we email to the new inbox, so on success we tell them to
  // go check it — we don't update authState.user.email here.
  const handleChangeEmail = async () => {
    const trimmed = newEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      showNotification({ type: 'warning', title: tr('請檢查 Email', 'Check the email'), message: tr('請輸入有效的電子郵件地址', 'Please enter a valid email address'), duration: 4000 });
      return;
    }
    if (!emailChangePassword) {
      showNotification({ type: 'warning', title: tr('需要密碼', 'Password required'), message: tr('請輸入目前的密碼以確認變更', 'Please enter your current password to confirm the change'), duration: 4000 });
      return;
    }
    setIsChangingEmail(true);
    try {
      const { message } = await apiService.changeUserEmail(trimmed, emailChangePassword);
      showNotification({ type: 'info', title: tr('確認信已寄出', 'Confirmation email sent'), message, duration: 7000 });
      setShowEmailChangeForm(false);
      setNewEmail('');
      setEmailChangePassword('');
    } catch (err) {
      // Branch on error_code so each case gets its own actionable message
      // rather than collapsing into a generic failure.
      const e = err as { error_code?: string; message?: string };
      const byCode: Record<string, string> = {
        EMAIL_CHANGE_BAD_PASSWORD: tr('目前密碼不正確，請重新輸入後再變更 Email', 'Your current password is incorrect. Please re-enter it before changing your email'),
        EMAIL_CHANGE_TAKEN: tr('此電子郵件已被其他帳號使用，請改用別的信箱', 'This email is already used by another account. Please use a different one'),
        EMAIL_CHANGE_SAME: tr('這已經是你目前的 Email 了', 'That\'s already your current email'),
        EMAIL_CHANGE_RATE_LIMITED: tr('剛剛才寄出確認信，請稍候一分鐘再試', 'A confirmation email was just sent. Please wait a minute and try again'),
        EMAIL_CHANGE_INVALID_INPUT: tr('請輸入有效的電子郵件地址與目前的密碼', 'Please enter a valid email address and your current password'),
      };
      showNotification({
        type: 'error',
        title: tr('無法變更 Email', 'Couldn\'t change the email'),
        message: (e.error_code && byCode[e.error_code]) || e.message || tr('變更 Email 失敗，請稍後再試', 'Couldn\'t change the email. Please try again in a moment'),
        duration: 5000,
      });
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleToggleShareNickname = async (next: boolean) => {
    const previous = shareShowNickname;
    setShareShowNickname(next);
    setIsSavingSharePref(true);
    try {
      await apiService.updatePublicShareNickname(next);
      if (authState.user && onAuthStateUpdate) {
        const updated = {
          ...authState,
          user: { ...authState.user, public_share_show_nickname: next },
        };
        onAuthStateUpdate(updated);
        localStorage.setItem('authState', JSON.stringify(updated));
        localStorage.setItem('authUser', JSON.stringify(updated.user));
      }
      showNotification({
        type: 'success',
        title: tr('已更新', 'Updated'),
        message: next
          ? tr('公開分享時會顯示你的暱稱', 'Your nickname will be shown when you share publicly')
          : tr('公開分享時會以「匿名」顯示你', 'You\'ll appear as "Anonymous" when you share publicly'),
        duration: 4000,
      });
    } catch (err) {
      setShareShowNickname(previous);
      showNotification({
        type: 'error',
        title: tr('更新失敗', 'Couldn\'t update'),
        message: (err as Error)?.message || tr('無法更新公開分享設定', 'Couldn\'t update the public sharing setting'),
        duration: 5000,
      });
    } finally {
      setIsSavingSharePref(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsSavingSettings(true);
      // Persist birth date (only if it changed from the auth-state value)
      const previousBirthDate = authState.user?.birth_date
        ? formatDateForInput(authState.user.birth_date)
        : '';
      const nextBirthDate = userBirthDate || null;
      const meeting = journeyMilestones.find(m => m.type === 'meeting');
      const firstDate = journeyMilestones.find(m => m.type === 'first_date');
      const firstKiss = journeyMilestones.find(m => m.type === 'first_kiss');
      const firstSex = journeyMilestones.find(m => m.type === 'first_sex');
      // The four writes touch independent fields, so send them together: run
      // one after another they made 保存設定 wait four round trips (~1–2s).
      await Promise.all([
        // Update user gender if specified
        userGender ? apiService.updateUserGender(userGender) : null,
        (previousBirthDate || '') !== (userBirthDate || '') ? apiService.updateUserBirthDate(nextBirthDate) : null,
        // Only update current user's nickname
        apiService.updateNicknames({
          partner1: nicknames.partner1,
          partner2: nicknames.partner2
        }),
        // Persist couple journey to backend
        apiService.updateCoupleJourney({
          first_meet_date: meeting?.date || undefined,
          anniversary_date: firstDate?.date || undefined,
          first_kiss_date: firstKiss?.date || undefined,
          first_kiss_place: firstKiss?.place || undefined,
          first_intimacy_date: firstSex?.date || undefined,
          first_intimacy_place: firstSex?.place || undefined,
        }),
      ]);
      // Update auth state and local storage so Header/profile and couple status reflect immediately
      if (authState.user && onAuthStateUpdate) {
        const updatedAuthState = {
          ...authState,
          user: {
            ...authState.user,
            nickname: nicknames.partner1, // Update with the new nickname
            partnerNickname: nicknames.partner2, // Keep partner nickname unchanged
            birth_date: nextBirthDate,
          },
        };
        onAuthStateUpdate(updatedAuthState);
        localStorage.setItem('authState', JSON.stringify(updatedAuthState));
        localStorage.setItem('authUser', JSON.stringify(updatedAuthState.user));
      }
      showNotification({
        type: 'success',
        title: tr('已保存設定', 'Settings saved'),
        message: tr('暱稱與愛情里程碑已更新', 'Nicknames and love milestones updated'),
        duration: 5000,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: tr('保存失敗', 'Couldn\'t save'),
        message: (err as Error)?.message || tr('無法保存暱稱，請稍後重試', 'Couldn\'t save the nickname. Please try again in a moment'),
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
        title: tr('配對碼已生成', 'Pairing code created'),
        message: tr('請分享給您的伴侶', 'Share it with your partner'),
        duration: 6000
      });
    } catch (err: unknown) {
      console.error('Generate pairing code error:', err);
      const errorCode = getApiErrorCode(err);
      if (errorCode === 'ALREADY_IN_COUPLE' || errorCode === 'ALREADY_PAIRED') {
        showNotification({
          type: 'error',
          title: tr('無法生成配對碼', 'Can\'t create a pairing code'),
          message: tr('您已經有配對的伴侶了，無法生成新的配對碼', 'You already have a partner, so you can\'t create a new pairing code'),
          duration: 8000
        });
      } else {
        showNotification({
          type: 'error',
          title: tr('生成失敗', 'Couldn\'t create'),
          message: (err as Error)?.message || tr('生成配對碼失敗，請稍後再試', 'Couldn\'t create a pairing code. Please try again in a moment'),
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
          title: tr('驗證錯誤', 'Check your input'),
          message: tr('請輸入配對碼', 'Please enter a pairing code'),
          duration: 6000
        });
        return;
      }

      const acceptResult = await apiService.acceptPairingCode(pairingCode.trim());

      if (acceptResult.requiresAuth) {
        showNotification({
          type: 'info',
          title: tr('需要登入', 'Sign-in required'),
          message: tr('請先登入以接受配對邀請', 'Please sign in to accept the pairing invitation'),
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
        title: tr('配對成功！', 'Paired!'),
        message: acceptResult.autoResolved
          ? tr('配對成功，我們已自動處理重複邀請', 'Paired! We took care of duplicate invitations automatically')
          : tr(`您現在已經與 ${authState.user?.partnerNickname || '伴侶'} 連結`, `You're now connected with ${authState.user?.partnerNickname || 'your partner'}`),
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
          title: tr('配對碼無效', 'Invalid pairing code'),
          message: tr('配對碼無效或已過期，請確認配對碼是否正確或請您的伴侶重新生成', 'The pairing code is invalid or expired. Please check the code, or ask your partner to create a new one'),
          duration: 8000
        });
      } else if (errorCode === 'ALREADY_IN_COUPLE' || errorCode === 'ALREADY_PAIRED') {
        showNotification({
          type: 'info',
          title: tr('已完成配對', 'Already paired'),
          message: tr('你們已經成功配對了！請重新整理頁面查看最新狀態。', 'You two are already paired! Refresh the page to see the latest status.'),
          duration: 8000
        });
      } else if (errorCode === 'INVITATION_EXPIRED') {
        showNotification({
          type: 'error',
          title: tr('配對碼已過期', 'Pairing code expired'),
          message: tr('此配對碼已過期，請您的伴侶重新生成', 'This pairing code has expired. Please ask your partner to create a new one'),
          duration: 8000
        });
      } else if (errorCode === 'SELF_PAIRING') {
        showNotification({
          type: 'error',
          title: tr('無法自配對', 'Can\'t pair with yourself'),
          message: tr('無法使用自己生成的配對碼進行配對', 'You can\'t pair using a code you created yourself'),
          duration: 8000
        });
      } else {
        showNotification({
          type: 'error',
          title: tr('配對失敗', 'Couldn\'t pair'),
          message: (err as Error)?.message || tr('配對失敗，請稍後再試', 'Pairing failed. Please try again in a moment'),
          duration: 8000
        });
      }
    }
  };

  // Neither pairing button had an in-flight guard — a double-tap could generate
  // multiple codes or fire the pairing attempt twice.
  const { run: generateCode, pending: generatingCode } = useAsyncAction(handleGenerateCode);
  const { run: pairWithCode, pending: pairing } = useAsyncAction(handlePairWithCode);

  const handleSendEmailInvitation = async () => {
    try {
      if (!recipientEmail.trim()) {
        showNotification({
          type: 'error',
          title: tr('驗證錯誤', 'Check your input'),
          message: tr('請輸入對方的電子郵件地址', 'Please enter your partner\'s email address'),
          duration: 6000
        });
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipientEmail.trim())) {
        showNotification({
          type: 'error',
          title: tr('電子郵件格式錯誤', 'Invalid email format'),
          message: tr('請輸入有效的電子郵件地址', 'Please enter a valid email address'),
          duration: 6000
        });
        return;
      }

      setIsSendingInvitation(true);

      const invitationData = {
        recipientEmail: recipientEmail.trim(),
        message: invitationMessage.trim() || undefined
      };

      const result = await apiService.sendPairingInvitation(invitationData);
      const token = result?.invitation?.token;

      showNotification({
        type: 'success',
        title: tr('邀請已發送！', 'Invitation sent!'),
        message: tr(`已向 ${recipientEmail} 發送配對邀請，請等待對方接受`, `A pairing invitation was sent to ${recipientEmail}. Waiting for them to accept`),
        duration: 8000
      });

      if (token) {
        setSentInvite({
          link: `${window.location.origin}/pairing/accept?token=${encodeURIComponent(token)}`,
          email: recipientEmail.trim(),
          emailSent: result?.invitation?.emailSent !== false,
        });
      }

      // Clear the form
      setRecipientEmail('');
      setInvitationMessage('');

    } catch (err: unknown) {
      console.error('Send email invitation error:', err);
      const errorCode = getApiErrorCode(err);
      const errorMessage = (err as Error)?.message || tr('發送邀請失敗，請稍後再試', 'Couldn\'t send the invitation. Please try again in a moment');

      if (errorCode === 'ALREADY_IN_COUPLE') {
        showNotification({
          type: 'error',
          title: tr('無法發送邀請', 'Can\'t send the invitation'),
          message: tr('您已經有配對的伴侶了，無法發送新的邀請', 'You already have a partner, so you can\'t send a new invitation'),
          duration: 8000
        });
        return;
      }
      if (errorCode === 'RECIPIENT_ALREADY_IN_COUPLE') {
        showNotification({
          type: 'error',
          title: tr('對方已配對', 'They\'re already paired'),
          message: tr('這位用戶已經與其他人建立配對', 'This user is already paired with someone else'),
          duration: 8000
        });
        return;
      }
      if (errorCode === 'INVITATION_ALREADY_SENT') {
        showNotification({
          type: 'info',
          title: tr('已發送邀請', 'Invitation already sent'),
          message: tr('您已經向這個信箱發送過邀請，請等待對方回應', 'You\'ve already invited this email. Please wait for their response'),
          duration: 8000
        });
        return;
      }

      showNotification({
        type: 'error',
        title: tr('發送失敗', 'Couldn\'t send'),
        message: errorMessage,
        duration: 8000
      });
    } finally {
      setIsSendingInvitation(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-10">
      <div className="border-b border-petal-rule pb-5 sm:pb-7">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-6">
          <div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2 sm:mb-3">
              {tr('— 設定', '— Settings')}
            </div>
            <h2 className="font-display text-2xl sm:text-3xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.1] md:leading-[1.05] mb-3">
              <em className="not-italic font-light italic text-pink-600">{tr('設定', 'Settings')}</em>
            </h2>
            <p className="font-display italic font-light text-base text-petal-muted">
              {tr('個人化你們的愛情應用。', 'Personalize your love app.')}
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
            {isSavingSettings ? tr('保存中…', 'Saving…') : tr('保存設定 →', 'Save settings →')}
          </button>
        </div>
      </div>

      {/* 工程師模式（Incident Mode）— Premium 限定的趣味彩蛋。開啟後整個 App
          變成深色 IDE 介面，文案改用 on-call 事故處理黑話。非 Premium 顯示
          三段式 gate：為什麼被擋 + 你可以做什麼 + 下一步。 */}
      <div
        className="bg-white rounded-2xl shadow-lg p-4 sm:p-6"
        data-testid="settings-engineer-mode"
        data-no-eng
      >
        <h3 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
          <span>{tr('工程師模式', 'Engineer mode')}</span>
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-petal-ink text-petal-cream tracking-wide">
            PREMIUM
          </span>
        </h3>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          {tr('把整個 App 切換成工程師的深色終端機介面，所有詞彙改用 on-call 事故處理的黑話—— 吵架變成「開 Incident」、和好變成「Postmortem」、傳親密邀請變成「開 Merge Request」、 記錄時光變成「Commit」。純好玩，隨時可以關掉。', 'Switch the whole app to an engineer\'s dark terminal look, with on-call incident jargon everywhere: a fight becomes "opening an Incident", making up becomes a "Postmortem", an intimacy invitation becomes "opening a Merge Request", and recording a moment becomes a "Commit". Just for fun; turn it off any time.')}
        </p>

        {engineer.canUse ? (
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-700">
                {tr('啟用工程師模式（Incident Mode）', 'Enable engineer mode (Incident Mode)')}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {engineer.enabled ? tr('目前：ON ● twogether-prod ● live', 'Now: ON ● twogether-prod ● live') : tr('目前：OFF', 'Now: OFF')}
              </p>
            </div>
            <input
              type="checkbox"
              data-testid="engineer-mode-toggle"
              checked={engineer.enabled}
              onChange={() => engineer.toggle()}
              className="w-5 h-5 mt-1 accent-red-500"
            />
          </label>
        ) : (
          <div className="rounded-lg border border-petal-rule bg-petal-cream-2/40 p-4">
            <div className="text-sm font-medium text-gray-700 mb-1">
              {tr('這是 Premium 專屬的趣味功能', 'This is a Premium-only fun feature')}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              {tr('目前你的方案還無法使用。升級 Premium 後即可解鎖—— 從右上角選單 →「升級 Premium」完成升級，再回到這裡就能一鍵切換工程師黑話介面。', 'It isn\'t available on your current plan. Upgrade to Premium to unlock it: open the menu in the top right → "Upgrade to Premium", then come back here to switch to the engineer jargon interface with one tap.')}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{tr('暱稱設定', 'Nicknames')}</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="partner1-name" className="block text-sm font-medium text-gray-700 mb-2">{tr('你的暱稱', 'Your nickname')}</label>
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
            <label htmlFor="partner2-name" className="block text-sm font-medium text-gray-700 mb-2">{tr('伴侶的暱稱', 'Your partner\'s nickname')}</label>
            <input
              id="partner2-name"
              name="partner2-name"
              type="text"
              value={nicknames.partner2}
              readOnly
              disabled
              className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              title={tr("伴侶的暱稱無法編輯，只能查看", 'Your partner\'s nickname can\'t be edited, only viewed')}
            />
            <p className="text-xs text-gray-500 mt-1">
              {tr('ℹ️ 伴侶的暱稱由對方設定，您無法修改', 'ℹ️ Your partner sets their own nickname; you can\'t change it')}
            </p>
          </div>
          {/* Global save button moved to header */}
        </div>
      </div>

      {/* Gender Selection */}
      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{tr('性別設定', 'Gender')}</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {tr('選擇您的性別 (用於角色扮演劇本的角色分配)', 'Choose your gender (used to assign roles in role-play scripts)')}
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
                <span className="ml-2 text-sm font-medium text-gray-700">{tr('女性 👩', 'Female 👩')}</span>
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
                <span className="ml-2 text-sm font-medium text-gray-700">{tr('男性 👨', 'Male 👨')}</span>
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
                <span className="ml-2 text-sm font-medium text-gray-700">{tr('其他 🌈', 'Other 🌈')}</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {tr('💡 此設定會影響角色扮演劇本中的角色名稱，例如偶像默認為女性角色', '💡 This affects role names in role-play scripts, e.g. the idol defaults to a female role')}
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <label htmlFor="user-birth-date" className="block text-sm font-medium text-gray-700 mb-2">
              {tr('生日 (可選)', 'Birthday (optional)')}
            </label>
            <input
              id="user-birth-date"
              type="date"
              value={userBirthDate}
              min="1900-01-01"
              max={formatYmdInTz(new Date(), getBrowserTz())}
              onChange={(e) => setUserBirthDate(e.target.value)}
              data-testid="settings-birth-date-input"
              className="w-full sm:max-w-xs p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
            <p className="text-xs text-gray-500 mt-2">
              {tr('💡 用於提供依年齡的健康參考建議（非醫療建議）', '💡 Used to give age-based health references (not medical advice)')}
            </p>
          </div>
        </div>
      </div>

      {/* AI Companion (諮商師) Selection */}
      <LineNotificationSettings showNotification={showNotification} />

      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6" data-testid="settings-ai-companion">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{tr('AI 諮商師', 'AI counselor')}</h3>
        <p className="text-xs text-gray-500 mb-4">
          {tr('在對話和牆上陪你們聊的 AI 諮商師。更換只影響之後的 AI 回覆，過去的對話不會改變。', 'The AI counselor who talks with you in conversations and on the wall. Changing it only affects future AI replies; past conversations won\'t change.')}
        </p>
        {(() => {
          const current = resolveCompanion(authState.user?.selected_therapist);
          return editingCompanion ? (
            <div className="space-y-3">
              <AiCompanionList
                selectedId={current.id}
                onSelect={handleUpdateCompanion}
                disabled={isSavingCompanion}
              />
              <button
                type="button"
                onClick={() => setEditingCompanion(false)}
                disabled={isSavingCompanion}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 disabled:opacity-50"
              >
                {tr('取消', 'Cancel')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>{current.emoji}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {current.name}
                    {!authState.user?.selected_therapist && (
                      <span className="ml-2 text-xs text-gray-400">{tr('（預設）', ' (default)')}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">{current.tagline}</p>
                </div>
              </div>
              <button
                type="button"
                data-testid="settings-change-companion"
                onClick={() => setEditingCompanion(true)}
                className="px-4 py-2 rounded-full bg-petal-rose-deep text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition"
              >
                {tr('更換', 'Change')}
              </button>
            </div>
          );
        })()}
      </div>

      {/* Timezone Settings */}
      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{tr('我的時區', 'My time zone')}</h3>
        <div className="space-y-3">
          <label htmlFor="user-timezone" className="block text-sm font-medium text-gray-700">
            {tr('選擇你所在的時區', 'Choose the time zone you\'re in')}
          </label>
          <select
            id="user-timezone"
            data-testid="user-timezone-select"
            value={userTimezone}
            disabled={isSavingUserTz}
            onChange={(e) => handleUpdateUserTimezone(e.target.value)}
            className="w-full sm:max-w-xs p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white"
          >
            <option value="">
              {browserTz ? tr(`使用裝置時區（${browserTz}）`, `Use device time zone (${browserTz})`) : tr('使用裝置預設時區', 'Use device default time zone')}
            </option>
            {TIMEZONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            {tr('💡 用於協助雙方協調時間。若伴侶尚未設定共用時區，我們會以你的時區作為預設。', '💡 Helps you both coordinate times. If your partner hasn\'t set a shared time zone, yours is used by default.')}
          </p>
        </div>
      </div>

      {authState.partnerConnected && (
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-1">{tr('共用時區', 'Shared time zone')}</h3>
          <p className="text-xs text-gray-500 mb-4">
            {tr('用於排程親密邀請、共同事件等時間顯示，雙方都會以此時區看到相同的時間。', 'Used to show times for scheduled intimacy invitations, shared events and more, so you both see the same time.')}
          </p>
          <div className="space-y-3">
            <select
              data-testid="couple-primary-timezone-select"
              value={couplePrimaryTimezone}
              disabled={isSavingCoupleTz}
              onChange={(e) => handleUpdateCouplePrimaryTimezone(e.target.value)}
              className="w-full sm:max-w-xs p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white"
            >
              <option value="">{tr('尚未設定（依各自裝置）', 'Not set (each uses their own device)')}</option>
              {TIMEZONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              {authState.user?.timezone && (
                <button
                  type="button"
                  onClick={() => handleUpdateCouplePrimaryTimezone(authState.user!.timezone!)}
                  disabled={isSavingCoupleTz}
                  className="px-3 py-1.5 text-xs rounded-full border border-petal-rule bg-petal-cream-2 text-petal-ink hover:bg-petal-sage/20 transition-colors disabled:opacity-50"
                >
                  {tr('套用我的時區', 'Use my time zone')}
                </button>
              )}
              {authState.user?.partnerTimezone && (
                <button
                  type="button"
                  onClick={() => handleUpdateCouplePrimaryTimezone(authState.user!.partnerTimezone!)}
                  disabled={isSavingCoupleTz}
                  className="px-3 py-1.5 text-xs rounded-full border border-petal-rule bg-petal-cream-2 text-petal-ink hover:bg-petal-sage/20 transition-colors disabled:opacity-50"
                >
                  {tr('套用伴侶的時區', 'Use my partner\'s time zone')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account Email (login email) */}
      {authState.isAuthenticated && authState.user && (
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">{tr('帳號 Email', 'Account email')}</h3>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-700 break-all">
                {authState.user.email}
              </div>
              <div className="mt-1">
                {authState.user.email_verified ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="w-3.5 h-3.5" /> {tr('已驗證', 'Verified')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                    {tr('尚未驗證', 'Not verified')}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {tr('這是你用來登入的 Email，也是接收通知的信箱。', 'This is the email you sign in with and where notifications are sent.')}
              </p>
            </div>
            {!showEmailChangeForm && (
              <button
                type="button"
                data-testid="change-email-button"
                onClick={() => setShowEmailChangeForm(true)}
                className="shrink-0 px-4 py-2 text-sm font-medium text-pink-600 border border-pink-300 rounded-lg hover:bg-pink-50"
              >
                {tr('變更', 'Change')}
              </button>
            )}
          </div>

          {showEmailChangeForm && (
            <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
              <div>
                <label htmlFor="new-email" className="block text-sm font-medium text-gray-700 mb-1">
                  {tr('新的 Email', 'New email')}
                </label>
                <input
                  id="new-email"
                  data-testid="new-email-input"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400"
                />
              </div>
              <div>
                <label htmlFor="email-change-password" className="block text-sm font-medium text-gray-700 mb-1">
                  {tr('目前的密碼', 'Current password')}
                </label>
                <input
                  id="email-change-password"
                  data-testid="email-change-password-input"
                  type="password"
                  autoComplete="current-password"
                  value={emailChangePassword}
                  onChange={(e) => setEmailChangePassword(e.target.value)}
                  placeholder={tr("輸入目前的密碼以確認", 'Enter your current password to confirm')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-pink-400"
                />
              </div>
              <p className="text-xs text-gray-500">
                {tr('我們會寄一封確認信到新的 Email。點擊信中的連結後，變更才會生效；在那之前請繼續使用目前的 Email 登入。', 'We\'ll send a confirmation email to the new address. The change takes effect once you click the link in it; until then, keep signing in with your current email.')}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="submit-email-change"
                  onClick={handleChangeEmail}
                  disabled={isChangingEmail || !newEmail.trim() || !emailChangePassword}
                  className="px-4 py-2 text-sm font-medium text-white bg-pink-500 rounded-lg hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isChangingEmail ? tr('寄送中…', 'Sending…') : tr('寄送確認信', 'Send confirmation email')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailChangeForm(false);
                    setNewEmail('');
                    setEmailChangePassword('');
                  }}
                  disabled={isChangingEmail}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {tr('取消', 'Cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Email Notification Preferences */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{tr('電子郵件通知', 'Email notifications')}</h3>
        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700">
              {tr('接收伴侶活動的電子郵件通知', 'Get email notifications about your partner\'s activity')}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {tr('當伴侶在牆上留言、開始對話、回覆訊息或回應親密邀請時，寄一封電子郵件給你。應用內通知不受影響。', 'When your partner posts on the wall, starts a conversation, replies to a message or responds to an intimacy invitation, we\'ll send you an email. In-app notifications aren\'t affected.')}
            </p>
          </div>
          <input
            type="checkbox"
            data-testid="email-notifications-toggle"
            checked={emailNotificationsEnabled}
            disabled={isSavingEmailPref}
            onChange={(e) => handleToggleEmailNotifications(e.target.checked)}
            className="w-5 h-5 mt-1 accent-pink-500"
          />
        </label>
      </div>

      {/* Public share display preference */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{tr('公開分享顯示方式', 'Public sharing display')}</h3>
        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700">
              {tr('公開分享時顯示我的暱稱', 'Show my nickname when sharing publicly')}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {tr('當你把「衝突事件」或「我們的牆」分享到公開問答時，會顯示你的暱稱（非真實姓名）。 關閉後，你在公開內容中會以「匿名」顯示。對方有各自的設定。', 'When you share a conflict or "Our wall" post to Public Q&A, your nickname is shown (not your real name). When off, you appear as "Anonymous" in public content. Your partner has their own setting.')}
            </p>
          </div>
          <input
            type="checkbox"
            data-testid="public-share-nickname-toggle"
            checked={shareShowNickname}
            disabled={isSavingSharePref}
            onChange={(e) => handleToggleShareNickname(e.target.checked)}
            className="w-5 h-5 mt-1 accent-pink-500"
          />
        </label>
      </div>

      {/* Cycle Tracking */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{tr('週期追蹤', 'Cycle tracking')}</h3>
        <label className="flex items-start justify-between gap-4 cursor-pointer">
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700">{tr('啟用週期追蹤', 'Enable cycle tracking')}</div>
            <p className="text-xs text-gray-500 mt-1">
              {tr('記錄月經週期，幫助掌握規律與適合備孕的時機。啟用後，記錄視窗會多一個「月經」選項，日曆會以紅／綠色點標示週期與備孕窗口。', 'Record your menstrual cycle to understand its pattern and fertile timing. Once on, the record window gets a "Period" option, and the calendar marks cycles and fertile windows with red/green dots.')}
            </p>
          </div>
          <input
            type="checkbox"
            data-testid="cycle-tracking-toggle"
            checked={cycleTrackingEnabled}
            disabled={isSavingCyclePref}
            onChange={(e) => handleToggleCycleTracking(e.target.checked)}
            className="w-5 h-5 mt-1 accent-red-500"
          />
        </label>

        {cycleTrackingEnabled && (
          <div className="mt-6 space-y-5" data-testid="cycle-stats-section">
            {(() => {
              const avg = averageCycleLength(cycleRecords);
              const nextStart = predictNextPeriodStart(cycleRecords);
              const ov = ovulationWindow(cycleRecords);
              const lengths = computeCycleLengths(cycleRecords);
              return (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-petal-cream-2/40 rounded-md p-4 border border-petal-rule">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-petal-muted mb-1">{tr('平均週期', 'Average cycle')}</div>
                      <div className="font-display italic font-light text-2xl text-petal-ink">
                        {avg !== null ? tr(`${avg.toFixed(1)} 天`, `${avg.toFixed(1)} days`) : tr('尚需 2 筆以上', 'Needs 2+ records')}
                      </div>
                    </div>
                    <div className="bg-petal-rose-soft/30 rounded-md p-4 border border-petal-rose-soft">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-petal-rose-deep mb-1">{tr('下次預測', 'Next predicted')}</div>
                      <div className="font-display italic font-light text-2xl text-petal-rose-deep">
                        {nextStart ?? '—'}
                      </div>
                    </div>
                    <div className="bg-emerald-50 rounded-md p-4 border border-emerald-200">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-emerald-700 mb-1">{tr('排卵日', 'Ovulation day')}</div>
                      <div className="font-display italic font-light text-2xl text-emerald-700">
                        {ov?.ovulation ?? '—'}
                      </div>
                    </div>
                  </div>

                  {lengths.length > 0 && (
                    <p className="text-xs text-petal-muted">
                      {tr('過去週期長度（天）：', 'Past cycle lengths (days): ')}{lengths.join(' · ')}
                    </p>
                  )}

                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-2">{tr('每一次的週期紀錄', 'Each cycle record')}</div>
                    {cycleRecords.length === 0 ? (
                      <p className="text-xs text-petal-muted italic">{tr('尚無紀錄。打開「記錄」視窗，選「月經」即可新增。', 'No records yet. Open the "Record" window and choose "Period" to add one.')}</p>
                    ) : (
                      <ul className="divide-y divide-petal-rule-soft border border-petal-rule rounded-md">
                        {cycleRecords.map(r => (
                          <li key={r.id} data-testid="cycle-record-row" className="flex items-center justify-between px-4 py-2.5">
                            <div className="text-sm text-petal-ink">
                              <span className="font-display italic">{r.startDate}</span>
                              <span className="text-petal-muted ml-3">· {r.lengthDays} {tr('天', ' days')}</span>
                              {r.notes && <span className="text-petal-muted ml-3 text-xs">{tr('「', '“')}{r.notes}{tr('」', '”')}</span>}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteCycleRecord(r.id)}
                              data-testid="cycle-record-delete"
                              className="text-petal-muted hover:text-red-500 transition-colors p-1"
                              aria-label={tr("刪除", 'Delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Journey Milestones Management */}
      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{tr('愛情里程碑設定', 'Love milestones')}</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="meeting-date" className="block text-sm font-medium text-gray-700 mb-2">{tr('相遇日期', 'Date we met')}</label>
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
            <label htmlFor="first-date" className="block text-sm font-medium text-gray-700 mb-2">{tr('開始交往的日期', 'Date we started dating')}</label>
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
            <label htmlFor="first-kiss" className="block text-sm font-medium text-gray-700 mb-2">{tr('初吻日期', 'First kiss date')}</label>
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
              <label htmlFor="first-kiss-place" className="block text-sm font-medium text-gray-700 mb-2">{tr('初吻事件地點', 'First kiss location')}</label>
              <input
                id="first-kiss-place"
                name="first-kiss-place"
                type="text"
                placeholder={tr("例如：象山步道、校園操場…", 'e.g. a hiking trail, the school field…')}
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
            <label htmlFor="first-intimacy-date" className="block text-sm font-medium text-gray-700 mb-2">{tr('第一次親密日期', 'First intimate date')}</label>
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
            <label htmlFor="first-intimacy-place" className="block text-sm font-medium text-gray-700 mb-2">{tr('第一次親密場所', 'First intimate place')}</label>
            <input
              id="first-intimacy-place"
              name="first-intimacy-place"
              type="text"
              placeholder={tr("例如：某飯店、家裡、露營車…", 'e.g. a hotel, home, a camper van…')}
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
      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{tr('自訂遊戲內容', 'Custom game content')}</h3>
        <p className="text-xs text-gray-500 mb-5">
          {tr('💡 這裡新增的題目與情緒，會出現在「情趣遊戲 → 回憶倒帶 / 情緒模仿秀」的隨機抽取清單中，與預設內容一起被抽到。', '💡 Questions and emotions you add here appear in the random draws for "Playful games → Memory rewind / Emotion charades", alongside the defaults.')}
        </p>

        {/* 回憶倒帶 questions */}
        <div className="mb-6">
          <label htmlFor="new-memory-question" className="block text-sm font-medium text-gray-700 mb-2">
            {tr('回憶倒帶 — 自訂題目', 'Memory rewind: custom questions')}
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {customMemoryQuestions.length === 0 ? (
              <p className="font-display italic font-light text-sm text-petal-muted">{tr('尚未新增自訂題目', 'No custom questions yet')}</p>
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
                    aria-label={tr(`移除題目：${q}`, `Remove question: ${q}`)}
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
              placeholder={tr("例如：你最喜歡我哪一個小習慣？", 'e.g. Which of my little habits do you love most?')}
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
            <button
              type="button"
              onClick={addMemoryQuestion}
              disabled={!newMemoryQuestion.trim()}
              className="px-4 py-3 bg-petal-ink text-petal-cream rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {tr('加入', 'Add')}
            </button>
          </div>
        </div>

        {/* 情緒模仿秀 emotions */}
        <div>
          <label htmlFor="new-emotion" className="block text-sm font-medium text-gray-700 mb-2">
            {tr('情緒模仿秀 — 自訂情緒', 'Emotion charades: custom emotions')}
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {customEmotions.length === 0 ? (
              <p className="font-display italic font-light text-sm text-petal-muted">{tr('尚未新增自訂情緒', 'No custom emotions yet')}</p>
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
                    aria-label={tr(`移除情緒：${emo}`, `Remove emotion: ${emo}`)}
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
              placeholder={tr("例如：得意、賴皮、想被寵", 'e.g. smug, cheeky, wanting to be spoiled')}
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
            />
            <button
              type="button"
              onClick={addEmotion}
              disabled={!newEmotion.trim()}
              className="px-4 py-3 bg-petal-ink text-petal-cream rounded-md font-display italic text-sm hover:bg-pink-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {tr('加入', 'Add')}
            </button>
          </div>
        </div>
      </div>

      {/* Authentication and Pairing Section */}
      {!authState.isAuthenticated ? (
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2 text-pink-500" />
            {tr('帳號設定', 'Account')}
          </h3>
          <p className="text-gray-600 mb-4">{tr('登入以同步你們的愛情數據，並與伴侶分享美好時光', 'Sign in to sync your love data and share good moments with your partner')}</p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full bg-petal-ink text-petal-cream py-3 rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
          >
            {tr('開始登入', 'Sign in')}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-green-500" />
            {tr('情侶配對', 'Pairing')}
          </h3>
          
          {/* User Status */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div>
                <p className="font-medium text-green-800">{tr('已登入', 'Signed in')}</p>
                <p className="text-sm text-green-600">{authState.user?.nickname}</p>
              </div>
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            
            {authState.partnerConnected ? (
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="font-medium text-green-800">{tr('✓ 已與伴侶連接', '✓ Connected with your partner')}</p>
                <p className="text-sm text-green-600">
                  {tr('與', 'Connected with ')} {authState.user?.partnerNickname || tr('伴侶', 'your partner')} {tr('連結中 - 你們可以分享愛的時光了！', '. You can share your moments of love now!')}
                </p>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="font-medium text-yellow-800 mb-2">{tr('等待配對', 'Waiting to pair')}</p>
                <p className="text-sm text-yellow-600">{tr('使用下方功能與伴侶建立連接', 'Use the options below to connect with your partner')}</p>
              </div>
            )}
          </div>

          {/* Generate Code Section */}
          {!authState.partnerConnected && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border rounded-2xl p-5 bg-pink-50/30">
                  <h4 className="text-lg font-medium mb-2">{tr('📧 透過電子郵件邀請', '📧 Invite by email')}</h4>
                  <p className="text-gray-600 mb-4">
                    {tr('直接透過電子郵件向您的伴侶發送配對邀請，對方只需點擊郵件中的連結即可接受配對。', 'Send your partner a pairing invitation by email; they just click the link in the email to accept.')}
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="recipient-email" className="block text-sm font-medium text-gray-700 mb-2">
                        {tr('伴侶的電子郵件地址', 'Your partner\'s email address')}
                      </label>
                      <input
                        id="recipient-email"
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder={tr("例如：partner@example.com", 'e.g. partner@example.com')}
                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                        disabled={isSendingInvitation}
                      />
                    </div>

                    <div>
                      <label htmlFor="invitation-message" className="block text-sm font-medium text-gray-700 mb-2">
                        {tr('個人訊息 (選填)', 'Personal message (optional)')}
                      </label>
                      <textarea
                        id="invitation-message"
                        value={invitationMessage}
                        onChange={(e) => setInvitationMessage(e.target.value)}
                        placeholder={tr("想對伴侶說的話...", 'Something to say to your partner...')}
                        rows={3}
                        maxLength={500}
                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
                        disabled={isSendingInvitation}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {invitationMessage.length}{tr('/500 字符', '/500 characters')}
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
                      {isSendingInvitation ? tr('發送中…', 'Sending…') : tr('發送邀請 →', 'Send invitation →')}
                    </button>

                    {sentInvite && (
                      <PairingInviteShare
                        link={sentInvite.link}
                        recipientEmail={sentInvite.email}
                        emailSent={sentInvite.emailSent}
                      />
                    )}
                  </div>
                </div>

                <div className="border rounded-2xl p-5 bg-yellow-50/40">
                  <h4 className="text-lg font-medium mb-2">{tr('🔑 透過配對碼', '🔑 Pair with a code')}</h4>
                  <p className="text-gray-600 mb-4">
                    {tr('生成配對碼並分享給您的伴侶，或輸入伴侶的配對碼完成配對。', 'Create a pairing code and share it with your partner, or enter your partner\'s code to pair.')}
                  </p>
                  <div className="space-y-4">
                    <button
                      onClick={generateCode}
                      disabled={generatingCode}
                      className="w-full bg-pink-500 text-white px-4 py-2 rounded hover:bg-pink-600 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {generatingCode && <Spinner />}
                      {generatingCode ? tr('生成中…', 'Creating…') : tr('生成配對碼', 'Create pairing code')}
                    </button>
                    {generatedCode && (
                      <div className="p-4 bg-white rounded-lg border">
                        <p className="text-gray-700">{tr('您的配對碼：', 'Your pairing code: ')}</p>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className="bg-yellow-200 px-3 py-1 rounded font-mono text-lg">
                            {generatedCode}
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(generatedCode)}
                            className="text-yellow-600 hover:text-yellow-700"
                          >
                            {tr('複製', 'Copy')}
                          </button>
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                          {tr('此配對碼將在7天後失效', 'This pairing code expires in 7 days')}
                        </p>
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <label htmlFor="pairing-code-input" className="block text-sm font-medium text-gray-700 mb-2">
                        {tr('輸入伴侶配對碼', 'Enter your partner\'s pairing code')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="pairing-code-input"
                          type="text"
                          value={pairingCode}
                          onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                          placeholder={tr("輸入配對碼", 'Enter pairing code')}
                          className="flex-1 border rounded px-3 py-2 font-mono"
                          maxLength={8}
                        />
                        <button
                          onClick={pairWithCode}
                          disabled={pairing}
                          className="bg-pink-500 text-white px-4 py-2 rounded hover:bg-pink-600 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {pairing && <Spinner />}
                          {pairing ? tr('配對中…', 'Pairing…') : tr('配對', 'Pair')}
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
