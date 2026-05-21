import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, CheckCircle, X, AlertCircle, Mail } from 'lucide-react';
import { apiService } from '../services/api';
import { useScrollLock } from '../hooks/useScrollLock';

interface PairingInvitationHandlerProps {
  token: string;
  onAccepted: () => void;
  onRejected: () => void;
  onClose: () => void;
  authState: {
    isAuthenticated: boolean;
    user: {
      id?: string;
      email?: string;
      nickname?: string;
    } | null;
  };
  setShowAuthModal: (show: boolean) => void;
  showNotification: (notification: {
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    message: string;
    duration?: number;
  }) => void;
}

interface PairingInvitationDetails {
  senderNickname: string;
  recipientEmail?: string;
  message?: string;
  createdAt: string;
  expiresAt: string;
  status: string;
  isExpired: boolean;
  type?: string;
  shortCode?: string;
}

const PairingInvitationHandler: React.FC<PairingInvitationHandlerProps> = ({
  token,
  onAccepted,
  onRejected,
  onClose,
  authState,
  setShowAuthModal,
  showNotification
}) => {
  const [invitation, setInvitation] = useState<PairingInvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const autoAcceptFired = useRef(false);

  const fetchInvitationDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiService.getPairingInvitation(token);
      setInvitation(response.invitation);

      if (response.invitation.isExpired) {
        setError('此邀請已過期');
      }
    } catch (err) {
      console.error('Failed to fetch invitation details:', err);
      setError((err as Error)?.message || '無法載入邀請詳情');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    autoAcceptFired.current = false;
    fetchInvitationDetails();
  }, [fetchInvitationDetails]);

  useScrollLock(true);

  const handleAccept = useCallback(async () => {
    if (!authState.isAuthenticated) {
      showNotification({
        type: 'info',
        title: '需要登入',
        message: '請先登入以接受配對邀請',
        duration: 6000
      });
      setShowAuthModal(true);
      return;
    }

    try {
      setProcessing(true);

      const response = await apiService.acceptPairingInvitation(token);

      if (response.requiresAuth) {
        showNotification({
          type: 'info',
          title: '需要登入',
          message: '請先登入以接受配對邀請',
          duration: 6000
        });
        setShowAuthModal(true);
        return;
      }

      showNotification({
        type: 'success',
        title: '配對成功！',
        message: response.autoResolved
          ? '配對成功，我們已自動處理重複邀請'
          : response.message || '您已成功與伴侶配對',
        duration: 8000
      });

      onAccepted();

    } catch (err) {
      console.error('Failed to accept invitation:', err);
      // Check if user is already paired despite the error (race condition / already-paired case)
      try {
        const couple = await apiService.getCouple();
        if (couple?.id) {
          showNotification({
            type: 'success',
            title: '配對成功！',
            message: '你們已成功配對！',
            duration: 8000
          });
          onAccepted();
          return;
        }
      } catch {
        // ignore — show original error below
      }
      showNotification({
        type: 'error',
        title: '接受邀請失敗',
        message: (err as Error)?.message || '無法接受配對邀請，請稍後再試',
        duration: 8000
      });
    } finally {
      setProcessing(false);
    }
  }, [authState.isAuthenticated, onAccepted, setShowAuthModal, showNotification, token]);

  // Auto-accept once the user is authenticated and invitation is loaded
  useEffect(() => {
    if (authState.isAuthenticated && invitation && !invitation.isExpired && !autoAcceptFired.current && !processing) {
      autoAcceptFired.current = true;
      handleAccept();
    }
  }, [authState.isAuthenticated, invitation, processing, handleAccept]);

  const handleReject = async () => {
    try {
      setProcessing(true);

      await apiService.rejectPairingInvitation(token);

      showNotification({
        type: 'info',
        title: '已拒絕邀請',
        message: '您已拒絕此配對邀請',
        duration: 6000
      });

      onRejected();

    } catch (err) {
      console.error('Failed to reject invitation:', err);
      showNotification({
        type: 'error',
        title: '拒絕邀請失敗',
        message: (err as Error)?.message || '無法拒絕配對邀請，請稍後再試',
        duration: 8000
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
            <p className="text-gray-600">載入邀請詳情中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-petal-cream rounded-md p-8 max-w-md w-full shadow-petal border border-petal-rule">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 text-petal-rose-deep mx-auto mb-4 opacity-75" strokeWidth={1.2} />
            <h2 className="font-display text-2xl font-light tracking-tight text-petal-ink mb-3">
              邀請<em className="not-italic font-light italic text-pink-600">無效</em>
            </h2>
            <p className="font-body text-sm text-petal-ink-soft mb-6 leading-relaxed">{error}</p>
            <button
              onClick={onClose}
              className="w-full border border-petal-rule text-petal-ink py-3 rounded-md hover:bg-petal-cream-2 transition-colors font-body text-sm"
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-petal-cream rounded-md p-8 max-w-md w-full shadow-petal border border-petal-rule">
        <div className="text-center">
          {/* Header */}
          <div className="mb-7 pb-6 border-b border-petal-rule">
            <Heart className="w-10 h-10 text-petal-rose-deep mx-auto mb-4 opacity-80" strokeWidth={1.2} />
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-2">
              — 配對邀請
            </div>
            <h2 className="font-display text-2xl font-light tracking-tight text-petal-ink mb-2">
              一份來自 <em className="not-italic font-light italic text-pink-600">Twogether</em> 的邀請
            </h2>
            <p className="font-display italic font-light text-sm text-petal-muted">您收到了一個配對邀請。</p>
          </div>

          {/* Invitation Details */}
          <div className="bg-petal-cream-2/40 rounded-md p-5 mb-6 border border-petal-rule-soft">
            <div className="font-body text-[11px] uppercase tracking-[0.14em] text-petal-muted mb-2">
              <Mail className="inline w-3.5 h-3.5 mr-1.5 text-petal-rose-deep" strokeWidth={1.5} />來自
            </div>
            <p className="font-display text-xl font-medium tracking-tight text-petal-ink mb-3">
              {invitation?.senderNickname}
            </p>

            {invitation?.message && (
              <div className="border-t border-petal-rule-soft pt-4 mt-3">
                <p className="font-body text-[11px] uppercase tracking-[0.14em] text-petal-muted mb-2">個人訊息</p>
                <p className="font-display italic font-light text-base text-petal-ink-soft leading-relaxed">"{invitation.message}"</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleAccept}
              disabled={processing}
              className={`w-full py-3 rounded-md font-display italic text-base transition-colors ${
                processing
                  ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                  : 'bg-petal-ink text-petal-cream hover:bg-pink-700'
              }`}
            >
              {processing ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-petal-muted border-t-transparent mr-2"></div>
                  處理中…
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                  接受邀請 →
                </div>
              )}
            </button>

            <button
              onClick={handleReject}
              disabled={processing}
              className={`w-full py-3 rounded-md font-body text-sm transition-colors ${
                processing
                  ? 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
                  : 'border border-petal-rule text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink'
              }`}
            >
              {processing ? '處理中…' : (
                <div className="flex items-center justify-center">
                  <X className="w-5 h-5 mr-2" />
                  拒絕邀請
                </div>
              )}
            </button>

            <button
              onClick={onClose}
              disabled={processing}
              className="w-full py-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              稍後處理
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PairingInvitationHandler;
