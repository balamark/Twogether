import axios from 'axios';

// API Configuration
const API_BASE_URL = 'http://localhost:8080/api';

// Types
interface IntimateRecord {
  id: number;
  date: string;
  time: string;
  mood: string;
  notes: string;
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
  notes: string;
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

// API Client
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// API Service Class
class ApiService {
  // Intimate Records
  async getIntimateRecords(): Promise<IntimateRecord[]> {
    try {
      const response = await apiClient.get('/love-moments');
      return response.data.map(this.transformApiRecord);
    } catch (error) {
      console.error('Failed to fetch intimate records:', error);
      throw error;
    }
  }

  async getIntimateRecord(id: string): Promise<IntimateRecord> {
    try {
      const response = await apiClient.get(`/love-moments/${id}`);
      return this.transformApiRecord(response.data);
    } catch (error) {
      console.error('Failed to fetch intimate record:', error);
      throw error;
    }
  }

  async createIntimateRecord(record: Omit<IntimateRecord, 'id' | 'timestamp'>): Promise<IntimateRecord> {
    try {
      const apiPayload = {
        moment_date: new Date(`${record.date}T${record.time}`).toISOString(),
        notes: record.notes,
        description: record.description,
        duration: record.duration,
        location: record.location,
        roleplay_script: record.roleplayScript,
        activity_type: record.activityType || 'regular',
        photo_id: null, // Will be set after photo upload
      };

      const response = await apiClient.post('/love-moments', apiPayload);
      return this.transformApiRecord(response.data);
    } catch (error) {
      console.error('Failed to create intimate record:', error);
      throw error;
    }
  }

  // Photo Upload
  async uploadPhoto(file: File, caption?: string): Promise<{ id: string; url: string }> {
    try {
      const formData = new FormData();
      formData.append('photo', file);
      if (caption) {
        formData.append('caption', caption);
      }
      formData.append('memory_date', new Date().toISOString());

      const response = await apiClient.post('/photos', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Failed to upload photo:', error);
      throw error;
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
}

export const apiService = new ApiService();
export default apiService; 