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
      if (it.senderNickname === me) {
        s.push(it);
      } else if (it.receiverNickname === me) {
        r.push(it);
      }
    });
    return { sent: s, received: r };
  }, [items, me]);

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
            <RequestList items={sent} emptyText="尚無發送紀錄" me={me} />
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">我收到的</h3>
            <RequestList items={received} emptyText="尚無收到紀錄" me={me} />
          </div>
        </div>
      )}
    </div>
  );
};

function RequestList({ items, emptyText, me }: { items: IntimacyRequest[]; emptyText: string; me: string }) {
  if (items.length === 0) {
    return <div className="text-gray-500 text-sm">{emptyText}</div>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((it) => (
        <li key={it.id} className="py-3 flex items-start justify-between">
          <div>
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-800">{it.senderNickname === me ? '你' : it.senderNickname}</span>
              <span className="mx-1">→</span>
              <span className="font-medium text-gray-800">{it.receiverNickname === me ? '你' : it.receiverNickname}</span>
            </div>
            <div className="text-gray-700 text-sm mt-1">{it.messageContent}</div>
            <div className="text-xs text-gray-400 mt-1">{new Date(it.createdAt).toLocaleString('zh-TW')}</div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${
            it.status === 'accepted' ? 'bg-green-100 text-green-700' : it.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
          }`}>{translateStatus(it.status)}</span>
        </li>
      ))}
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


