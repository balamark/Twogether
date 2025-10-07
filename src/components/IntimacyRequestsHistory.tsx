import React, { useEffect, useMemo, useState } from 'react';
import apiService from '../services/api';
import type { IntimacyRequest } from '../services/api';

interface User {
  id: string;
  email: string;
  nickname: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  partnerConnected: boolean;
}

interface IntimacyRequestsHistoryProps {
  authState: AuthState;
}

export const IntimacyRequestsHistory: React.FC<IntimacyRequestsHistoryProps> = ({ authState }) => {
  const [items, setItems] = useState<IntimacyRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<IntimacyRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const me = authState.user?.nickname || '';

  useEffect(() => {
    if (!authState.isAuthenticated) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch all (backend supports optional status filter)
        const all = await apiService.getIntimacyRequests();
        setItems(all);
      } catch (e) {
        setError((e as Error)?.message || '載入失敗');
      } finally {
        setLoading(false);
      }
    })();
  }, [authState.isAuthenticated]);

  const { sent, received } = useMemo(() => {
    const s: IntimacyRequest[] = [];
    const r: IntimacyRequest[] = [];
    items.forEach((it) => {
      // Use direction field from backend if available, fallback to nickname comparison
      if (it.direction === 'sent') {
        s.push(it);
      } else if (it.direction === 'received') {
        r.push(it);
      } else {
        // Fallback: categorize by nickname if direction is not available
        if (it.senderNickname === me) {
          s.push(it);
        } else if (it.receiverNickname === me) {
          r.push(it);
        }
      }
    });
    return { sent: s, received: r };
  }, [items, me]);

  const handleRequestClick = (request: IntimacyRequest) => {
    setSelectedRequest(request);
    setShowDetailModal(true);
  };

  if (!authState.isAuthenticated) {
    return (
      <div className="text-center py-10 text-gray-500">請先登入以查看歷史親密邀請</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-6 rounded-2xl">
        <h2 className="text-2xl font-bold mb-2">親密邀請紀錄</h2>
        <p className="text-blue-100">查看你發送與收到的所有邀請</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      )}
      {error && (
        <div className="text-center text-red-600">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">我發送的</h3>
            <RequestList items={sent} emptyText="尚無發送紀錄" me={me} onRequestClick={handleRequestClick} />
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">我收到的</h3>
            <RequestList items={received} emptyText="尚無收到紀錄" me={me} onRequestClick={handleRequestClick} />
          </div>
        </div>
      )}

      {/* Request Detail Modal */}
      {showDetailModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-800">親密邀請詳情</h3>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                {/* Sender and Receiver */}
                <div>
                  <h4 className="font-medium text-gray-800 mb-2">發送者與接收者</h4>
                  <div className="text-lg text-gray-700 bg-gray-50 p-3 rounded-lg">
                    <span className="font-medium text-indigo-600">
                      {selectedRequest.senderNickname === me ? '你' : selectedRequest.senderNickname}
                    </span>
                    <span className="mx-2">→</span>
                    <span className="font-medium text-indigo-600">
                      {selectedRequest.receiverNickname === me ? '你' : selectedRequest.receiverNickname}
                    </span>
                  </div>
                </div>

                {/* Message Content */}
                <div>
                  <h4 className="font-medium text-gray-800 mb-2">邀請內容</h4>
                  <p className="text-gray-700 bg-blue-50 p-3 rounded-lg">
                    {selectedRequest.messageContent}
                  </p>
                </div>

                {/* Request Type */}
                <div>
                  <h4 className="font-medium text-gray-800 mb-2">類型</h4>
                  <p className="text-gray-700">
                    {selectedRequest.requestType === 'intimate' ? '立即邀請' : 
                     selectedRequest.requestType === 'scheduled' ? '預約時間' : selectedRequest.requestType}
                  </p>
                </div>

                {/* Roleplay Category */}
                {selectedRequest.roleplayCategory && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">角色扮演類別</h4>
                    <p className="text-gray-700">{selectedRequest.roleplayCategory}</p>
                  </div>
                )}

                {/* Scheduled Time */}
                {selectedRequest.scheduledTime && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">預約時間</h4>
                    <p className="text-gray-700">
                      {new Date(selectedRequest.scheduledTime).toLocaleString('zh-TW')}
                    </p>
                  </div>
                )}

                {/* Status */}
                <div>
                  <h4 className="font-medium text-gray-800 mb-2">狀態</h4>
                  <span className={`inline-block text-sm px-3 py-1 rounded-full ${
                    selectedRequest.status === 'accepted' ? 'bg-green-100 text-green-700' : 
                    selectedRequest.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 
                    'bg-red-100 text-red-700'
                  }`}>
                    {translateStatus(selectedRequest.status)}
                  </span>
                </div>

                {/* Response Message */}
                {selectedRequest.responseMessage && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">回應訊息</h4>
                    <p className="text-gray-700 bg-green-50 p-3 rounded-lg italic">
                      "{selectedRequest.responseMessage}"
                    </p>
                  </div>
                )}

                {/* Alternative Options */}
                {selectedRequest.alternativeType && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">替代選項</h4>
                    <div className="bg-pink-50 p-3 rounded-lg">
                      <p className="text-gray-700">
                        <span className="font-medium">類型:</span> {selectedRequest.alternativeType}
                      </p>
                      {selectedRequest.alternativeContent && (
                        <p className="text-gray-700 mt-1">
                          <span className="font-medium">內容:</span> {selectedRequest.alternativeContent}
                        </p>
                      )}
                      {selectedRequest.alternativeScheduledTime && (
                        <p className="text-gray-700 mt-1">
                          <span className="font-medium">時間:</span> {new Date(selectedRequest.alternativeScheduledTime).toLocaleString('zh-TW')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">建立時間</h4>
                    <p className="text-sm text-gray-600">
                      {new Date(selectedRequest.createdAt).toLocaleString('zh-TW')}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">過期時間</h4>
                    <p className="text-sm text-gray-600">
                      {new Date(selectedRequest.expiresAt).toLocaleString('zh-TW')}
                    </p>
                  </div>
                </div>

                {selectedRequest.respondedAt && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">回應時間</h4>
                    <p className="text-sm text-gray-600">
                      {new Date(selectedRequest.respondedAt).toLocaleString('zh-TW')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function RequestList({ items, emptyText, me, onRequestClick }: { 
  items: IntimacyRequest[]; 
  emptyText: string; 
  me: string;
  onRequestClick: (request: IntimacyRequest) => void;
}) {
  if (items.length === 0) {
    return <div className="text-gray-500 text-sm">{emptyText}</div>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((it) => {
        // Determine who is "you" based on direction field
        let senderDisplay = it.senderNickname;
        let receiverDisplay = it.receiverNickname;
        
        if (it.direction === 'sent') {
          // Current user is sender
          senderDisplay = '你';
          receiverDisplay = it.receiverNickname;
        } else if (it.direction === 'received') {
          // Current user is receiver
          senderDisplay = it.senderNickname;
          receiverDisplay = '你';
        } else {
          // Fallback to nickname comparison if direction is not set
          senderDisplay = it.senderNickname === me ? '你' : it.senderNickname;
          receiverDisplay = it.receiverNickname === me ? '你' : it.receiverNickname;
        }

        return (
          <li 
            key={it.id} 
            className="py-3 flex items-start justify-between hover:bg-gray-50 transition-colors cursor-pointer rounded-lg px-2 -mx-2"
            onClick={() => onRequestClick(it)}
          >
            <div>
              <div className="text-sm text-gray-600">
                <span className="font-medium text-gray-800">{senderDisplay}</span>
                <span className="mx-1">→</span>
                <span className="font-medium text-gray-800">{receiverDisplay}</span>
              </div>
              <div className="text-gray-700 text-sm mt-1">{it.messageContent}</div>
              <div className="text-xs text-gray-400 mt-1">{new Date(it.createdAt).toLocaleString('zh-TW')}</div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${
              it.status === 'accepted' ? 'bg-green-100 text-green-700' : it.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
            }`}>{translateStatus(it.status)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function translateStatus(status: string): string {
  if (status === 'accepted') return '已接受';
  if (status === 'rejected') return '已拒絕';
  if (status === 'expired') return '已過期';
  return '待回應';
}

export default IntimacyRequestsHistory;


