import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, CheckCircle, X, AlertCircle, Mail } from 'lucide-react';
import { apiService } from '../services/api';

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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-4">邀請無效</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={onClose}
              className="w-full bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600 transition-colors"
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          {/* Header */}
          <div className="mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">配對邀請</h2>
            <p className="text-gray-600">您收到了一個 Twogether 配對邀請</p>
          </div>

          {/* Invitation Details */}
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-center mb-3">
              <Mail className="w-5 h-5 text-pink-500 mr-2" />
              <span className="text-sm text-gray-600">來自</span>
            </div>
            <p className="text-xl font-bold text-gray-800 mb-3">
              {invitation?.senderNickname}
            </p>

            {invitation?.message && (
              <div className="border-t border-pink-200 pt-4 mt-4">
                <p className="text-sm text-gray-500 mb-2">個人訊息：</p>
                <p className="text-gray-700 italic">"{invitation.message}"</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            <button
              onClick={handleAccept}
              disabled={processing}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                processing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700'
              }`}
            >
              {processing ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  處理中...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  接受邀請
                </div>
              )}
            </button>

            <button
              onClick={handleReject}
              disabled={processing}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                processing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
            >
              {processing ? '處理中...' : (
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
