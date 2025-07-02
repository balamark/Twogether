import axios from 'axios';

// API Configuration
const API_BASE_URL = 'http://localhost:8080/api';
const USE_BACKEND = false; // Toggle between localStorage and backend

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
  coins_earned?: number;
  activity_type?: string;
  created_at: string;
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
    if (!USE_BACKEND) {
      // Use localStorage
      const saved = localStorage.getItem('intimateRecords');
      return saved ? JSON.parse(saved) : [];
    }

    try {
      const response = await apiClient.get('/love-moments');
      return response.data.map(this.transformApiRecord);
    } catch (error) {
      console.error('Failed to fetch intimate records:', error);
      // Fallback to localStorage
      const saved = localStorage.getItem('intimateRecords');
      return saved ? JSON.parse(saved) : [];
    }
  }

  async createIntimateRecord(record: Omit<IntimateRecord, 'id' | 'timestamp'>): Promise<IntimateRecord> {
    const newRecord: IntimateRecord = {
      ...record,
      id: Date.now(),
      timestamp: new Date().toISOString(),
    };

    if (!USE_BACKEND) {
      // Use localStorage
      const existing = await this.getIntimateRecords();
      const updated = [...existing, newRecord];
      localStorage.setItem('intimateRecords', JSON.stringify(updated));
      return newRecord;
    }

    try {
      const apiPayload = {
        moment_date: new Date(`${record.date}T${record.time}`).toISOString(),
        notes: record.notes,
        description: record.description,
        duration: record.duration,
        location: record.location,
        roleplay_script: record.roleplayScript,
        activity_type: record.activityType || 'regular',
      };

      const response = await apiClient.post('/love-moments', apiPayload);
      return this.transformApiRecord(response.data);
    } catch (error) {
      console.error('Failed to create intimate record:', error);
      // Fallback to localStorage
      const existing = await this.getIntimateRecords();
      const updated = [...existing, newRecord];
      localStorage.setItem('intimateRecords', JSON.stringify(updated));
      return newRecord;
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
    if (!USE_BACKEND) {
      return parseInt(localStorage.getItem('totalCoins') || '0');
    }

    try {
      const response = await apiClient.get('/coins/balance');
      return response.data.balance || 0;
    } catch (error) {
      console.error('Failed to fetch coins:', error);
      return parseInt(localStorage.getItem('totalCoins') || '0');
    }
  }

  async updateCoins(amount: number): Promise<void> {
    if (!USE_BACKEND) {
      const current = await this.getTotalCoins();
      localStorage.setItem('totalCoins', (current + amount).toString());
      return;
    }

    try {
      await apiClient.post('/coins/transaction', {
        amount: Math.abs(amount),
        transaction_type: amount > 0 ? 'earn' : 'spend',
        description: amount > 0 ? '記錄愛的時光' : '購買禮品',
      });
    } catch (error) {
      console.error('Failed to update coins:', error);
      // Fallback to localStorage
      const current = await this.getTotalCoins();
      localStorage.setItem('totalCoins', (current + amount).toString());
    }
  }

  // Authentication
  async login(email: string, password: string): Promise<{ token: string; user: any }> {
    if (!USE_BACKEND) {
      // Mock login for localStorage mode
      const mockUser = {
        id: Date.now().toString(),
        email,
        nickname: email.split('@')[0],
      };
      const mockToken = 'mock-token-' + Date.now();
      localStorage.setItem('authToken', mockToken);
      localStorage.setItem('authUser', JSON.stringify(mockUser));
      return { token: mockToken, user: mockUser };
    }

    const response = await apiClient.post('/auth/login', { email, password });
    const { token, user } = response.data;
    
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(user));
    
    return { token, user };
  }

  async register(email: string, nickname: string, password: string): Promise<{ token: string; user: any }> {
    if (!USE_BACKEND) {
      // Mock register for localStorage mode
      const mockUser = {
        id: Date.now().toString(),
        email,
        nickname,
      };
      const mockToken = 'mock-token-' + Date.now();
      localStorage.setItem('authToken', mockToken);
      localStorage.setItem('authUser', JSON.stringify(mockUser));
      return { token: mockToken, user: mockUser };
    }

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

  // Helper method to transform API records to frontend format
  private transformApiRecord(apiRecord: ApiIntimateRecord): IntimateRecord {
    const momentDate = new Date(apiRecord.moment_date);
    return {
      id: parseInt(apiRecord.id) || Date.now(),
      date: momentDate.toISOString().split('T')[0],
      time: momentDate.toTimeString().slice(0, 5),
      mood: '💕', // Default mood
      notes: apiRecord.notes,
      timestamp: apiRecord.created_at,
      description: apiRecord.description,
      duration: apiRecord.duration,
      location: apiRecord.location,
      roleplayScript: apiRecord.roleplay_script,
      coinsEarned: apiRecord.coins_earned,
      activityType: apiRecord.activity_type,
    };
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    if (!USE_BACKEND) return true;
    
    try {
      await apiClient.get('/health');
      return true;
    } catch (error) {
      console.error('Backend health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService; 