import axios from 'axios';

// API Configuration - Direct backend call
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

// Types
interface IntimateRecord {
  id: number;
  date: string;
  time: string;
  mood: string;
  notes?: string;
  timestamp: string;
  photo?: string;
  description?: string;
  duration?: string;
  location?: string;
  roleplayScript?: string;
  coinsEarned?: number;
  activityType?: string;
}

interface ApiIntimateRecord {
  id: string;
  moment_date: string;
  notes?: string;
  description?: string;
  duration?: string;
  location?: string;
  roleplay_script?: string;
  photo_url?: string;
  coins_earned?: number;
  activity_type?: string;
  created_at: string;
  recorded_by_nickname: string;
}

interface CreateCoupleRequest {
  coupleName?: string;
  anniversaryDate?: string;
  partnerEmail?: string;
  pairingCode?: string;
}

interface CoupleResponse {
  id: string;
  coupleName?: string;
  anniversaryDate?: string;
  user1Nickname: string;
  user2Nickname?: string;
  createdAt: string;
  pairingCode?: string;
}

interface PairingCodeResponse {
  code: string;
  expiresAt: string;
}

// Enhanced API Client with error handling
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`, config.data);
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for unified error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    console.error('API Error:', error);
    
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      const errorMessage = data?.error || data?.message || '未知錯誤';
      const requestUrl = error.config?.url || '';
      
      // Handle specific error cases
      if (status === 401) {
        // Check if this is a login/register request - don't clear tokens for these
        if (requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register')) {
          throw new Error('登錄信息錯誤，請檢查郵箱和密碼');
        } else {
          // Token expired or invalid for authenticated requests
          localStorage.removeItem('authToken');
          localStorage.removeItem('authUser');
          localStorage.removeItem('authState');
          throw new Error('登錄已過期，請重新登錄');
        }
      } else if (status === 403) {
        throw new Error('沒有權限執行此操作');
      } else if (status === 404) {
        throw new Error('請求的資源不存在');
      } else if (status === 422) {
        throw new Error(`輸入驗證失敗：${errorMessage}`);
      } else if (status >= 500) {
        throw new Error('服務器內部錯誤，請稍後再試');
      }
      
      throw new Error(errorMessage);
    } else if (error.request) {
      // Network error
      throw new Error('網絡連接失敗，請檢查網絡連接');
    } else {
      // Other error
      throw new Error(`請求失敗：${error.message}`);
    }
  }
);

// API Service Class
class ApiService {
  // Intimate Records
  async getIntimateRecords(): Promise<IntimateRecord[]> {
    try {
      const response = await apiClient.get('/love-moments');
      if (!Array.isArray(response.data)) {
        throw new Error('獲取記錄數據格式錯誤');
      }
      return response.data.map(this.transformApiRecord);
    } catch (error: any) {
      console.error('Failed to fetch intimate records:', error);
      throw new Error(error.message || '無法獲取愛的時光記錄');
    }
  }

  async getIntimateRecord(id: string): Promise<IntimateRecord> {
    try {
      if (!id) {
        throw new Error('記錄ID不能為空');
      }
      const response = await apiClient.get(`/love-moments/${id}`);
      return this.transformApiRecord(response.data);
    } catch (error: any) {
      console.error('Failed to fetch intimate record:', error);
      throw new Error(error.message || '無法獲取記錄詳情');
    }
  }

  async createIntimateRecord(record: Omit<IntimateRecord, 'id' | 'timestamp'>): Promise<IntimateRecord> {
    try {
      // Validate required fields
      if (!record.date || !record.time) {
        throw new Error('請填寫必要的記錄信息（日期、時間）');
      }

      const apiPayload = {
        moment_date: new Date(`${record.date}T${record.time}`).toISOString(),
        notes: record.notes?.trim() || null,
        description: record.description?.trim(),
        duration: record.duration?.trim(),
        location: record.location?.trim(),
        roleplay_script: record.roleplayScript?.trim(),
        activity_type: record.activityType || 'regular',
        photo_id: null, // Will be set after photo upload
      };

      const response = await apiClient.post('/love-moments', apiPayload);
      return this.transformApiRecord(response.data);
    } catch (error: any) {
      console.error('Failed to create intimate record:', error);
      throw new Error(error.message || '無法創建愛的時光記錄');
    }
  }

  // Photo Upload
  async uploadPhoto(file: File, caption?: string): Promise<{ id: string; url: string }> {
    try {
      // Validate file
      if (!file) {
        throw new Error('請選擇要上傳的照片');
      }
      
      // Check file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('照片文件大小不能超過10MB');
      }
      
      // Check file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('只支持 JPEG、PNG 和 WebP 格式的照片');
      }

      const formData = new FormData();
      formData.append('photo', file);
      if (caption?.trim()) {
        formData.append('caption', caption.trim());
      }
      formData.append('memory_date', new Date().toISOString());

      const response = await apiClient.post('/photos', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // Extended timeout for file upload
      });

      if (!response.data?.url) {
        throw new Error('上傳成功但未獲取到照片URL');
      }

      return response.data;
    } catch (error: any) {
      console.error('Failed to upload photo:', error);
      throw new Error(error.message || '照片上傳失敗');
    }
  }

  // Nicknames
  async getNicknames(): Promise<{ partner1: string; partner2: string }> {
    const saved = localStorage.getItem('nicknames');
    return saved ? JSON.parse(saved) : { partner1: '親愛的', partner2: '寶貝' };
  }

  async updateNicknames(nicknames: { partner1: string; partner2: string }): Promise<void> {
    localStorage.setItem('nicknames', JSON.stringify(nicknames));
    // TODO: Update backend when implemented
  }

  // Coins
  async getTotalCoins(): Promise<number> {
    try {
      const response = await apiClient.get('/coins/balance');
      return response.data.balance || 0;
    } catch (error) {
      console.error('Failed to fetch coins:', error);
      throw error;
    }
  }

  async getCoinBalance(): Promise<{ balance: number; totalEarned: number; totalSpent: number }> {
    try {
      const response = await apiClient.get('/coins/balance');
      return {
        balance: response.data.balance || 0,
        totalEarned: response.data.total_earned || 0,
        totalSpent: response.data.total_spent || 0,
      };
    } catch (error) {
      console.error('Failed to fetch coin balance:', error);
      throw error;
    }
  }

  async getCoinTransactions(): Promise<any[]> {
    try {
      const response = await apiClient.get('/coins/transactions');
      return response.data || [];
    } catch (error) {
      console.error('Failed to fetch coin transactions:', error);
      throw error;
    }
  }

  async updateCoins(amount: number): Promise<void> {
    try {
      await apiClient.post('/coins/transaction', {
        amount: Math.abs(amount),
        transaction_type: amount > 0 ? 'earn' : 'spend',
        description: amount > 0 ? '記錄愛的時光' : '購買禮品',
      });
    } catch (error) {
      console.error('Failed to update coins:', error);
      throw error;
    }
  }

  // Achievements
  async getAchievements(): Promise<any> {
    try {
      const response = await apiClient.get('/achievements');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch achievements:', error);
      throw error;
    }
  }

  // Statistics
  async getStats(): Promise<any> {
    try {
      const response = await apiClient.get('/stats');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      throw error;
    }
  }

  async getMonthlyStats(): Promise<any[]> {
    try {
      const response = await apiClient.get('/stats/monthly');
      return response.data || [];
    } catch (error) {
      console.error('Failed to fetch monthly stats:', error);
      throw error;
    }
  }

  async getWeeklyStats(): Promise<any[]> {
    try {
      const response = await apiClient.get('/stats/weekly');
      return response.data || [];
    } catch (error) {
      console.error('Failed to fetch weekly stats:', error);
      throw error;
    }
  }

  // Authentication
  async login(email: string, password: string): Promise<{ token: string; user: any }> {
    const response = await apiClient.post('/auth/login', { email, password });
    const { token, user } = response.data;
    
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(user));
    
    return { token, user };
  }

  async register(email: string, nickname: string, password: string): Promise<{ token: string; user: any }> {
    const response = await apiClient.post('/auth/register', { email, nickname, password });
    const { token, user } = response.data;
    
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(user));
    
    return { token, user };
  }

  async logout(): Promise<void> {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  }

  // Token validation
  hasValidToken(): boolean {
    const token = localStorage.getItem('authToken');
    const authState = localStorage.getItem('authState');
    
    if (!token || !authState) {
      // Clean up if either is missing
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      localStorage.removeItem('authState');
      return false;
    }
    
    return true;
  }

  private transformApiRecord(apiRecord: ApiIntimateRecord): IntimateRecord {
    const momentDate = new Date(apiRecord.moment_date);
    return {
      id: parseInt(apiRecord.id.replace(/-/g, '').substring(0, 8), 16), // Convert UUID to number
      date: momentDate.toISOString().split('T')[0],
      time: momentDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }),
      mood: '💕', // Default mood
      notes: apiRecord.notes,
      timestamp: apiRecord.created_at,
      photo: apiRecord.photo_url,
      description: apiRecord.description,
      duration: apiRecord.duration,
      location: apiRecord.location,
      roleplayScript: apiRecord.roleplay_script,
      coinsEarned: apiRecord.coins_earned,
      activityType: apiRecord.activity_type,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await apiClient.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  // Couples
  async createCouple(data: CreateCoupleRequest): Promise<CoupleResponse> {
    try {
      const response = await apiClient.post('/couples', {
        couple_name: data.coupleName,
        anniversary_date: data.anniversaryDate,
        partner_email: data.partnerEmail,
        pairing_code: data.pairingCode,
      });
      return this.transformCoupleResponse(response.data);
    } catch (error: any) {
      console.error('Failed to create couple:', error);
      throw new Error(error.message || '無法創建情侶檔案');
    }
  }

  async getCouple(): Promise<CoupleResponse> {
    try {
      const response = await apiClient.get('/couples');
      return this.transformCoupleResponse(response.data);
    } catch (error: any) {
      console.error('Failed to get couple:', error);
      throw new Error(error.message || '無法獲取情侶檔案');
    }
  }

  async generatePairingCode(): Promise<PairingCodeResponse> {
    try {
      const response = await apiClient.post('/couples/pairing-code');
      return {
        code: response.data.code,
        expiresAt: response.data.expires_at,
      };
    } catch (error: any) {
      console.error('Failed to generate pairing code:', error);
      throw new Error(error.message || '無法生成配對碼');
    }
  }

  private transformCoupleResponse(data: any): CoupleResponse {
    return {
      id: data.id,
      coupleName: data.couple_name,
      anniversaryDate: data.anniversary_date,
      user1Nickname: data.user1_nickname,
      user2Nickname: data.user2_nickname,
      createdAt: data.created_at,
      pairingCode: data.pairing_code,
    };
  }
}

export const apiService = new ApiService();
export default apiService; 