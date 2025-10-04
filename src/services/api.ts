import axios from 'axios';

// API Configuration - Always use relative URLs for single server
const API_BASE_URL = '/api';

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

// Removed ApiIntimateRecord interface - using 'any' type for flexibility with actual backend response

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
  firstDate?: string;
  firstKissDate?: string;
  user1Nickname: string;
  user2Nickname?: string;
  createdAt: string;
  pairingCode?: string;
  user1Id?: string;
  user2Id?: string;
  isComplete?: boolean;
  waitingForPartner?: boolean;
  error_code?: string;
}

interface PairingCodeResponse {
  code: string;
  expiresAt: string;
}

interface SendPairingInvitationRequest {
  recipientEmail: string;
  message?: string;
}

interface PairingInvitationResponse {
  success: boolean;
  message: string;
  invitation: {
    id: string;
    recipientEmail: string;
    createdAt: string;
    expiresAt: string;
    emailSent: boolean;
  };
}

interface AcceptPairingInvitationResponse {
  success: boolean;
  message: string;
  requiresAuth?: boolean;
  invitation?: {
    senderNickname: string;
    recipientEmail: string;
    message: string;
    token: string;
  };
  couple?: {
    id: string;
    partnerNickname: string;
    createdAt: string;
  };
}

interface ApiError {
  message?: string;
  error?: string;
  status?: number;
}

interface ApiErrorResponse {
  response?: {
    data?: ApiError;
  };
  message?: string;
}

// Intimacy Request Types
interface IntimacyRequest {
  id: string;
  senderNickname: string;
  receiverNickname: string;
  messageContent: string;
  requestType: string;
  roleplayCategory?: string;
  scheduledTime?: string;
  status: string;
  respondedAt?: string;
  responseMessage?: string;
  alternativeType?: string;
  alternativeContent?: string;
  alternativeScheduledTime?: string;
  createdAt: string;
  expiresAt: string;
  direction?: 'sent' | 'received';  // Added to track if user sent or received this request
}

interface CreateIntimacyRequestRequest {
  messageContent: string;
  requestType: string;
  roleplayCategory?: string;
  scheduledTime?: string;
}

interface RespondToIntimacyRequestRequest {
  accept: boolean;
  responseMessage?: string;
  alternativeType?: string;
  alternativeContent?: string;
  alternativeScheduledTime?: string;
}

interface IntimacyTemplate {
  id: string;
  category: string;
  timeHint: string;
  roleplaySetup: string;
  suggestionLevel: string;
}

interface AlternativeIntimacyOption {
  id: string;
  category: string;
  title: string;
  description: string;
  estimatedDuration?: string;
}

interface AlternativeIntimacyOptionsGrouped {
  physical: AlternativeIntimacyOption[];
  emotional: AlternativeIntimacyOption[];
  playful: AlternativeIntimacyOption[];
  companionship: AlternativeIntimacyOption[];
}

interface Notification {
  id: string;
  notificationType: string;
  title: string;
  content: string;
  intimacyRequestId?: string;
  relatedUserNickname?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  priority: number;
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
      // Extract error message from nested structure
      const errorMessage = data?.error?.message || data?.message || data?.error || '未知錯誤';
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
        // For validation errors, show the detailed error message
        throw new Error(errorMessage);
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
      console.log('Raw love-moments response:', response.data); // Debug log
      
      // Handle the backend response format { success: true, love_moments: [...] }
      const loveMoments = response.data?.love_moments || response.data;
      if (!Array.isArray(loveMoments)) {
        console.error('Expected array but got:', typeof loveMoments, loveMoments);
        throw new Error('獲取記錄數據格式錯誤');
      }
      
      return loveMoments.map((record, index) => {
        try {
          return this.transformApiRecord(record);
        } catch (transformError) {
          console.error(`Error transforming record at index ${index}:`, transformError, record);
          throw new Error(`記錄轉換失敗 (索引 ${index})`);
        }
      });
    } catch (error: unknown) {
      console.error('Failed to fetch intimate records:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法獲取愛的時光記錄');
    }
  }

  async getIntimateRecord(id: string): Promise<IntimateRecord> {
    try {
      if (!id) {
        throw new Error('記錄ID不能為空');
      }
      const response = await apiClient.get(`/love-moments/${id}`);
      return this.transformApiRecord(response.data);
    } catch (error: unknown) {
      console.error('Failed to fetch intimate record:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法獲取記錄詳情');
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
      console.log('Create record API response:', response.data); // Debug log

      // The API returns {success: true, message: "...", love_moment: {...}}
      // We need to extract the love_moment object
      const recordData = response.data.love_moment || response.data;
      return this.transformApiRecord(recordData);
    } catch (error: unknown) {
      console.error('Failed to create intimate record:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法創建愛的時光記錄');
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
    } catch (error: unknown) {
      console.error('Failed to upload photo:', error);
      throw new Error((error as ApiErrorResponse)?.message || '照片上傳失敗');
    }
  }

  // Nicknames
  async getNicknames(coupleData?: CoupleResponse): Promise<{ partner1: string; partner2: string }> {
    try {
      // Use provided couple data if available, otherwise fetch from backend
      const couple = coupleData || await this.getCouple();

      // Get current user info from localStorage
      const authUserRaw = localStorage.getItem('authUser');
      const currentUserId = authUserRaw ? JSON.parse(authUserRaw)?.id : null;

      let currentUserNickname = '親愛的';
      let partnerNickname = '寶貝';

      if (currentUserId && couple) {
        // Determine which user in the couple is the current user
        if (couple.user1Id === currentUserId) {
          currentUserNickname = couple.user1Nickname || '親愛的';
          partnerNickname = couple.user2Nickname || '寶貝';
        } else if (couple.user2Id === currentUserId) {
          currentUserNickname = couple.user2Nickname || '親愛的';
          partnerNickname = couple.user1Nickname || '寶貝';
        }
      }

      return {
        partner1: currentUserNickname, // partner1 always represents current user
        partner2: partnerNickname      // partner2 always represents partner
      };
    } catch {
      // Fallback to local if not paired yet or error
      const saved = localStorage.getItem('nicknames');
      return saved ? JSON.parse(saved) : { partner1: '親愛的', partner2: '寶貝' };
    }
  }

  async updateNicknames(nicknames: { partner1?: string; partner2?: string }): Promise<void> {
    try {
      // Get current user info to determine which nickname belongs to them
      const authUserRaw = localStorage.getItem('authUser');
      const currentUserId = authUserRaw ? JSON.parse(authUserRaw)?.id : null;

      if (!currentUserId) {
        // No authenticated user, just save to localStorage
        localStorage.setItem('nicknames', JSON.stringify(nicknames));
        return;
      }

      // Get couple info to determine which partner the current user is
      const couple = await this.getCouple();

      // Determine the current user's nickname to send to backend
      let currentUserNickname: string | undefined;

      if (couple && couple.user1Id === currentUserId) {
        // Current user is user1, so partner1 nickname is theirs
        currentUserNickname = nicknames.partner1?.trim();
      } else if (couple && couple.user2Id === currentUserId) {
        // Current user is user2, so partner2 nickname is theirs
        currentUserNickname = nicknames.partner2?.trim();
      } else {
        // No couple relationship or couldn't determine, save to localStorage
        localStorage.setItem('nicknames', JSON.stringify(nicknames));
        return;
      }

      // Validate the nickname
      if (!currentUserNickname || currentUserNickname.length < 2) {
        // Invalid nickname, just save to localStorage
        localStorage.setItem('nicknames', JSON.stringify(nicknames));
        return;
      }

      // Send the correct payload format that backend expects
      await apiClient.put('/couples/nicknames', { nickname: currentUserNickname });

      // Also save to localStorage for consistency
      localStorage.setItem('nicknames', JSON.stringify(nicknames));
    } catch (error: unknown) {
      console.warn('Backend nickname update failed, falling back to localStorage:', error);
      localStorage.setItem('nicknames', JSON.stringify(nicknames));
    }
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

  async getCoinTransactions(): Promise<unknown[]> {
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
  async getAchievements(): Promise<unknown> {
    try {
      const response = await apiClient.get('/achievements');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch achievements:', error);
      throw error;
    }
  }

  // Statistics
  async getStats(): Promise<unknown> {
    try {
      const response = await apiClient.get('/stats');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      throw error;
    }
  }

  async getMonthlyStats(): Promise<unknown[]> {
    try {
      const response = await apiClient.get('/stats/monthly');
      return response.data || [];
    } catch (error) {
      console.error('Failed to fetch monthly stats:', error);
      throw error;
    }
  }

  async getWeeklyStats(): Promise<unknown[]> {
    try {
      const response = await apiClient.get('/stats/weekly');
      return response.data || [];
    } catch (error) {
      console.error('Failed to fetch weekly stats:', error);
      throw error;
    }
  }

  // Authentication
  async login(email: string, password: string): Promise<{ token: string; user: unknown }> {
    const response = await apiClient.post('/auth/login', { email, password });
    const { token, user } = response.data;
    
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(user));
    
    return { token, user };
  }

  async register(email: string, nickname: string, password: string): Promise<{ token: string; user: unknown }> {
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

  private transformApiRecord(apiRecord: any): IntimateRecord {
    // Handle both the expected ApiIntimateRecord and actual backend response
    console.log('Transforming API record:', apiRecord); // Debug log to see the raw response

    // Safely parse the date with fallback
    let momentDate: Date;
    if (apiRecord.moment_date) {
      momentDate = new Date(apiRecord.moment_date);
      // Check if date is valid
      if (isNaN(momentDate.getTime())) {
        console.warn('Invalid moment_date received:', apiRecord.moment_date);
        momentDate = new Date(); // Fallback to current date
      }
    } else {
      console.warn('No moment_date in API response, using current date');
      momentDate = new Date(); // Fallback to current date
    }

    // Generate a safe ID - handle cases where apiRecord.id might be undefined
    let safeId: number;
    if (apiRecord.id && typeof apiRecord.id === 'string') {
      // Try to convert UUID to number
      try {
        safeId = parseInt(apiRecord.id.replace(/-/g, '').substring(0, 8), 16);
      } catch (e) {
        safeId = Math.floor(Math.random() * 1000000); // Fallback random ID
      }
    } else {
      // Use timestamp-based ID if no ID provided
      safeId = Math.floor(momentDate.getTime() / 1000);
    }

    // Safely format date and time
    let dateStr: string;
    let timeStr: string;

    try {
      dateStr = momentDate.toISOString().split('T')[0];
      timeStr = momentDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
      console.error('Error formatting date/time:', e);
      // Fallback to manual formatting
      const now = new Date();
      dateStr = now.toISOString().split('T')[0];
      timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    return {
      id: safeId,
      date: dateStr,
      time: timeStr,
      mood: '💕', // Default mood
      notes: apiRecord.notes || '',
      timestamp: apiRecord.created_at,
      photo: apiRecord.photo_url || apiRecord.photo_id, // Handle both formats
      description: apiRecord.description || '',
      duration: apiRecord.duration || '',
      location: apiRecord.location || '',
      roleplayScript: apiRecord.roleplay_script || '',
      coinsEarned: apiRecord.coins_earned || 0,
      activityType: apiRecord.activity_type || 'intimate',
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await apiClient.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // Couples
  async createCouple(data: CreateCoupleRequest): Promise<CoupleResponse> {
    try {
      const response = await apiClient.post('/couples', data);
      return this.transformCoupleResponse(response.data.couple);
    } catch (error: unknown) {
      console.error('Failed to create couple:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法創建情侶關係');
    }
  }

  async getCouple(): Promise<CoupleResponse> {
    try {
      const response = await apiClient.get('/couples');
      // Handle case where user has no couple relationship
      if (response.data.error_code === 'NO_COUPLE_RELATIONSHIP' || !response.data.couple) {
        return {
          id: '',
          coupleName: '',
          anniversaryDate: '',
          user1Id: '',
          user1Nickname: '',
          user2Id: '',
          user2Nickname: '',
          createdAt: '',
          isComplete: false,
          waitingForPartner: false,
          error_code: 'NO_COUPLE_RELATIONSHIP'
        };
      }
      return this.transformCoupleResponse(response.data.couple);
    } catch (error: unknown) {
      console.error('Failed to get couple:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法獲取情侶信息');
    }
  }

  async generatePairingCode(): Promise<PairingCodeResponse> {
    try {
      const response = await apiClient.post('/couples/pairing-code');
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to generate pairing code:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法生成配對碼');
    }
  }

  // Email-based pairing invitation methods
  async sendPairingInvitation(data: SendPairingInvitationRequest): Promise<PairingInvitationResponse> {
    try {
      const response = await apiClient.post('/pairing-requests/send-invitation', data);
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to send pairing invitation:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法發送配對邀請');
    }
  }

  async acceptPairingInvitation(token: string): Promise<AcceptPairingInvitationResponse> {
    try {
      const response = await apiClient.post(`/pairing-requests/accept/${token}`);
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to accept pairing invitation:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法接受配對邀請');
    }
  }

  async rejectPairingInvitation(token: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.post(`/pairing-requests/reject/${token}`);
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to reject pairing invitation:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法拒絕配對邀請');
    }
  }

  async getPairingInvitation(token: string): Promise<{
    success: boolean;
    invitation: {
      senderNickname: string;
      recipientEmail: string;
      message: string;
      createdAt: string;
      expiresAt: string;
      status: string;
      isExpired: boolean;
    };
  }> {
    try {
      const response = await apiClient.get(`/pairing-requests/invitation/${token}`);
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to get pairing invitation:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法獲取配對邀請詳情');
    }
  }

  private transformCoupleResponse(data: unknown): CoupleResponse {
    const typedData = data as {
      id?: string;
      couple_name?: string;
      anniversary_date?: string;
      user1_id?: string;
      user1_nickname?: string;
      user2_id?: string;
      user2_nickname?: string;
      created_at?: string;
      pairing_code?: string;
    };

    return {
      id: typedData?.id || '',
      coupleName: typedData?.couple_name,
      anniversaryDate: typedData?.anniversary_date,
      user1Id: typedData?.user1_id,
      user1Nickname: typedData?.user1_nickname || '',
      user2Id: typedData?.user2_id,
      user2Nickname: typedData?.user2_nickname,
      createdAt: typedData?.created_at || new Date().toISOString(),
      pairingCode: typedData?.pairing_code,
    };
  }

  // Intimacy Requests
  async createIntimacyRequest(request: CreateIntimacyRequestRequest): Promise<IntimacyRequest> {
    try {
      // Map request types to server-accepted values
      let requestType = request.requestType;
      if (requestType === 'scheduled') {
        requestType = 'intimate'; // scheduled requests are intimate requests with a time
      }
      if (requestType !== 'compliment') {
        requestType = 'intimate'; // default to intimate for non-compliment requests
      }

      const response = await apiClient.post('/intimacy-requests', {
        message: request.messageContent,
        request_type: requestType,
        roleplay_category: request.roleplayCategory,
        scheduled_time: request.scheduledTime,
      });
      return this.transformIntimacyRequest(response.data.intimacy_request || response.data);
    } catch (error: unknown) {
      console.error('Failed to create intimacy request:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法發送親密邀請');
    }
  }

  // Journey / Couple details
  async updateCoupleJourney(payload: {
    anniversary_date?: string;
    first_meet_date?: string;
    first_date?: string;
    first_kiss_date?: string;
    first_kiss_place?: string;
    first_intimacy_date?: string;
    first_intimacy_place?: string;
  }): Promise<void> {
    await apiClient.put('/couples/journey', payload);
  }

  // User gender management
  async updateUserGender(gender: 'male' | 'female' | 'other'): Promise<void> {
    try {
      await apiClient.put('/auth/user/gender', { gender });
    } catch (error: unknown) {
      console.error('Failed to update user gender:', error);
      throw new Error((error as ApiErrorResponse)?.message || '更新性別設定失敗');
    }
  }

  async getIntimacyRequests(status?: string): Promise<IntimacyRequest[]> {
    try {
      const params = status ? { status } : {};
      const response = await apiClient.get('/intimacy-requests', { params });
      return response.data.intimacy_requests?.map((item: unknown) => this.transformIntimacyRequest(item)) || [];
    } catch (error: unknown) {
      console.error('Failed to fetch intimacy requests:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法獲取親密邀請記錄');
    }
  }

  async respondToIntimacyRequest(
    requestId: string,
    response: RespondToIntimacyRequestRequest
  ): Promise<IntimacyRequest> {
    try {
      const result = await apiClient.put(`/intimacy-requests/${requestId}/respond`, {
        response: response.accept ? 'accepted' : 'declined',
        response_message: response.responseMessage,
        alternative_type: response.alternativeType,
        alternative_content: response.alternativeContent,
        alternative_scheduled_time: response.alternativeScheduledTime,
      });
      return this.transformIntimacyRequest(result.data);
    } catch (error: unknown) {
      console.error('Failed to respond to intimacy request:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法回應親密邀請');
    }
  }

  async getIntimacyTemplates(): Promise<IntimacyTemplate[]> {
    try {
      const response = await apiClient.get('/intimacy-requests/intimacy-templates');
      return response.data.templates?.map((item: unknown) => this.transformIntimacyTemplate(item)) || [];
    } catch (error: unknown) {
      console.error('Failed to fetch intimacy templates:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法獲取親密邀請模板');
    }
  }

  async getIntimacyTemplatesByCategory(category: string): Promise<IntimacyTemplate[]> {
    try {
      const response = await apiClient.get(`/intimacy-requests/intimacy-templates/${category}`);
      return response.data.templates?.map((item: unknown) => this.transformIntimacyTemplate(item)) || [];
    } catch (error: unknown) {
      console.error('Failed to fetch intimacy templates by category:', error);
      // Re-throw the error from the interceptor without modification to preserve auth error handling
      throw error;
    }
  }

  async getAlternativeIntimacyOptions(): Promise<AlternativeIntimacyOptionsGrouped> {
    try {
      const response = await apiClient.get('/intimacy-requests/alternative-intimacy-options');
      return {
        physical: response.data.physical?.map((item: unknown) => this.transformAlternativeOption(item)) || [],
        emotional: response.data.emotional?.map((item: unknown) => this.transformAlternativeOption(item)) || [],
        playful: response.data.playful?.map((item: unknown) => this.transformAlternativeOption(item)) || [],
        companionship: response.data.companionship?.map((item: unknown) => this.transformAlternativeOption(item)) || [],
      };
    } catch (error: unknown) {
      console.error('Failed to fetch alternative intimacy options:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法獲取替代親密選項');
    }
  }

  // Notifications
  async getNotifications(params?: { notificationType?: string; isRead?: boolean }): Promise<Notification[]> {
    try {
      const queryParams = {
        notification_type: params?.notificationType,
        is_read: params?.isRead,
      };
      const response = await apiClient.get('/intimacy-requests/notifications', { params: queryParams });
      return response.data.notifications?.map((item: unknown) => this.transformNotification(item)) || [];
    } catch (error: unknown) {
      console.error('Failed to fetch notifications:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法獲取通知');
    }
  }

  async markNotificationsRead(notificationIds: string[]): Promise<void> {
    try {
      await apiClient.put('/intimacy-requests/notifications/mark-read', {
        notification_ids: notificationIds,
      });
    } catch (error: unknown) {
      console.error('Failed to mark notifications as read:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法標記通知為已讀');
    }
  }

  async getUnreadNotificationCount(): Promise<number> {
    try {
      const response = await apiClient.get('/intimacy-requests/notifications/unread-count');
      return response.data.unread_count || 0;
    } catch (error: unknown) {
      console.error('Failed to fetch unread notification count:', error);
      return 0;
    }
  }

  // Custom Scripts API
  async getCustomScripts(): Promise<unknown[]> {
    try {
      const response = await apiClient.get('/custom-scripts');
      return response.data.custom_scripts || [];
    } catch (error) {
      console.error('Failed to fetch custom scripts:', error);
      throw error;
    }
  }

  async createCustomScript(script: {
    title: string;
    category: 'romantic' | 'adventurous' | 'school' | 'bold';
    scenario: string;
    content: string;
    tags?: string[];
    duration?: string;
  }): Promise<unknown> {
    try {
      const response = await apiClient.post('/custom-scripts', script);
      return response.data.custom_script;
    } catch (error) {
      console.error('Failed to create custom script:', error);
      throw error;
    }
  }

  async updateCustomScript(id: string, updates: {
    title?: string;
    category?: 'romantic' | 'adventurous' | 'school' | 'bold';
    scenario?: string;
    content?: string;
    tags?: string[];
    duration?: string;
  }): Promise<unknown> {
    try {
      const response = await apiClient.put(`/custom-scripts/${id}`, updates);
      return response.data.custom_script;
    } catch (error) {
      console.error('Failed to update custom script:', error);
      throw error;
    }
  }

  async deleteCustomScript(id: string): Promise<void> {
    try {
      await apiClient.delete(`/custom-scripts/${id}`);
    } catch (error) {
      console.error('Failed to delete custom script:', error);
      throw error;
    }
  }

  // Custom Gifts API
  async getCustomGifts(): Promise<unknown[]> {
    try {
      const response = await apiClient.get('/custom-gifts');
      return response.data.custom_gifts || [];
    } catch (error) {
      console.error('Failed to fetch custom gifts:', error);
      throw error;
    }
  }

  async createCustomGift(gift: {
    title: string;
    description: string;
    cost: number;
    category: 'service' | 'experience' | 'physical' | 'intimate';
    icon?: string;
  }): Promise<unknown> {
    try {
      const response = await apiClient.post('/custom-gifts', gift);
      return response.data.custom_gift;
    } catch (error) {
      console.error('Failed to create custom gift:', error);
      throw error;
    }
  }

  async updateCustomGift(id: string, updates: {
    title?: string;
    description?: string;
    cost?: number;
    category?: 'service' | 'experience' | 'physical' | 'intimate';
    icon?: string;
  }): Promise<unknown> {
    try {
      const response = await apiClient.put(`/custom-gifts/${id}`, updates);
      return response.data.custom_gift;
    } catch (error) {
      console.error('Failed to update custom gift:', error);
      throw error;
    }
  }

  async deleteCustomGift(id: string): Promise<void> {
    try {
      await apiClient.delete(`/custom-gifts/${id}`);
    } catch (error) {
      console.error('Failed to delete custom gift:', error);
      throw error;
    }
  }

  // Transform methods for intimacy features
  private transformIntimacyRequest(data: unknown): IntimacyRequest {
    const typedData = data as {
      id?: string;
      sender_nickname?: string;
      receiver_nickname?: string;
      message_content?: string;
      request_type?: string;
      roleplay_category?: string;
      scheduled_time?: string;
      status?: string;
      responded_at?: string;
      response_message?: string;
      alternative_type?: string;
      alternative_content?: string;
      alternative_scheduled_time?: string;
      created_at?: string;
      expires_at?: string;
      direction?: 'sent' | 'received';
    };

    return {
      id: typedData?.id || '',
      senderNickname: typedData?.sender_nickname || '',
      receiverNickname: typedData?.receiver_nickname || '',
      messageContent: typedData?.message_content || '',
      requestType: typedData?.request_type || '',
      roleplayCategory: typedData?.roleplay_category,
      scheduledTime: typedData?.scheduled_time,
      status: typedData?.status || '',
      respondedAt: typedData?.responded_at,
      responseMessage: typedData?.response_message,
      alternativeType: typedData?.alternative_type,
      alternativeContent: typedData?.alternative_content,
      alternativeScheduledTime: typedData?.alternative_scheduled_time,
      createdAt: typedData?.created_at || '',
      expiresAt: typedData?.expires_at || '',
      direction: typedData?.direction,
    };
  }

  private transformIntimacyTemplate(data: unknown): IntimacyTemplate {
    const typedData = data as {
      id?: string;
      category?: string;
      time_hint?: string;
      roleplay_setup?: string;
      suggestion_level?: string;
    };

    return {
      id: typedData?.id || '',
      category: typedData?.category || '',
      timeHint: typedData?.time_hint || '',
      roleplaySetup: typedData?.roleplay_setup || '',
      suggestionLevel: typedData?.suggestion_level || '',
    };
  }

  private transformAlternativeOption(data: unknown): AlternativeIntimacyOption {
    const typedData = data as {
      id?: string;
      category?: string;
      title?: string;
      description?: string;
      estimated_duration?: string;
    };

    return {
      id: typedData?.id || '',
      category: typedData?.category || '',
      title: typedData?.title || '',
      description: typedData?.description || '',
      estimatedDuration: typedData?.estimated_duration,
    };
  }

  private transformNotification(data: unknown): Notification {
    const typedData = data as {
      id?: string;
      notification_type?: string;
      title?: string;
      content?: string;
      intimacy_request_id?: string;
      related_user_nickname?: string;
      is_read?: boolean;
      read_at?: string;
      created_at?: string;
      priority?: number;
    };

    return {
      id: typedData?.id || '',
      notificationType: typedData?.notification_type || '',
      title: typedData?.title || '',
      content: typedData?.content || '',
      intimacyRequestId: typedData?.intimacy_request_id,
      relatedUserNickname: typedData?.related_user_nickname,
      isRead: typedData?.is_read || false,
      readAt: typedData?.read_at,
      createdAt: typedData?.created_at || '',
      priority: typedData?.priority || 1,
    };
  }
}

export const apiService = new ApiService();
export default apiService;

// Export types for external use
export type {
  IntimacyRequest,
  CreateIntimacyRequestRequest,
  RespondToIntimacyRequestRequest,
  IntimacyTemplate,
  AlternativeIntimacyOption,
  AlternativeIntimacyOptionsGrouped,
  Notification,
}
