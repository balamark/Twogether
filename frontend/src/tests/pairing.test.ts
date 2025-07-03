import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { apiService } from '../services/api';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('Pairing Flow Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('mock-jwt-token');
  });

  describe('generatePairingCode', () => {
    it('should generate pairing code successfully', async () => {
      const mockResponse = {
        data: {
          code: 'X5RX6S7D',
          expires_at: '2025-07-04T13:28:47Z'
        }
      };

      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue(mockResponse),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        }
      } as any);

      const result = await apiService.generatePairingCode();

      expect(result).toEqual({
        code: 'X5RX6S7D',
        expiresAt: '2025-07-04T13:28:47Z'
      });
    });

    it('should handle generation errors properly', async () => {
      const mockError = {
        response: {
          status: 409,
          data: {
            error: {
              code: 'CODE_EXISTS',
              message: '您已有一個有效的配對碼'
            }
          }
        }
      };

      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        }
      } as any);

      await expect(apiService.generatePairingCode()).rejects.toThrow('您已有一個有效的配對碼');
    });
  });

  describe('createCouple with pairing code', () => {
    it('should pair successfully with valid code', async () => {
      const mockResponse = {
        data: {
          id: 'couple-uuid',
          couple_name: null,
          anniversary_date: null,
          user1_nickname: '測試用戶A',
          user2_nickname: '測試用戶B',
          created_at: '2025-07-03T13:28:47Z',
          pairing_code: null
        }
      };

      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue(mockResponse),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        }
      } as any);

      const result = await apiService.createCouple({ pairingCode: 'X5RX6S7D' });

      expect(result).toEqual({
        id: 'couple-uuid',
        coupleName: null,
        anniversaryDate: null,
        user1Nickname: '測試用戶A',
        user2Nickname: '測試用戶B',
        createdAt: '2025-07-03T13:28:47Z',
        pairingCode: null
      });
    });

    it('should handle invalid pairing code', async () => {
      const mockError = {
        response: {
          status: 404,
          data: {
            error: {
              code: 'NOT_FOUND',
              message: '配對碼無效或已過期'
            }
          }
        }
      };

      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        }
      } as any);

      await expect(apiService.createCouple({ pairingCode: 'INVALID1' }))
        .rejects.toThrow('配對碼無效或已過期');
    });

    it('should handle already paired user', async () => {
      const mockError = {
        response: {
          status: 409,
          data: {
            error: {
              code: 'ALREADY_PAIRED',
              message: '您已經有配對的伴侶了'
            }
          }
        }
      };

      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        }
      } as any);

      await expect(apiService.createCouple({ pairingCode: 'X5RX6S7D' }))
        .rejects.toThrow('您已經有配對的伴侶了');
    });
  });

  describe('getCouple', () => {
    it('should get couple information successfully', async () => {
      const mockResponse = {
        data: {
          id: 'couple-uuid',
          couple_name: '我們的愛情',
          anniversary_date: '2023-02-14',
          user1_nickname: '測試用戶A',
          user2_nickname: '測試用戶B',
          created_at: '2025-07-03T13:28:47Z',
          pairing_code: null
        }
      };

      mockedAxios.create.mockReturnValue({
        get: vi.fn().mockResolvedValue(mockResponse),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        }
      } as any);

      const result = await apiService.getCouple();

      expect(result).toEqual({
        id: 'couple-uuid',
        coupleName: '我們的愛情',
        anniversaryDate: '2023-02-14',
        user1Nickname: '測試用戶A',
        user2Nickname: '測試用戶B',
        createdAt: '2025-07-03T13:28:47Z',
        pairingCode: null
      });
    });

    it('should handle no couple found', async () => {
      const mockError = {
        response: {
          status: 404,
          data: {
            error: {
              code: 'NOT_FOUND',
              message: '找不到情侶檔案'
            }
          }
        }
      };

      mockedAxios.create.mockReturnValue({
        get: vi.fn().mockRejectedValue(mockError),
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        }
      } as any);

      await expect(apiService.getCouple()).rejects.toThrow('找不到情侶檔案');
    });
  });

  describe('Authentication state management', () => {
    it('should handle token validation', () => {
      // Test with valid token and auth state
      localStorageMock.getItem
        .mockReturnValueOnce('valid-token')
        .mockReturnValueOnce(JSON.stringify({ user: { id: '1' }, isAuthenticated: true }));

      expect(apiService.hasValidToken()).toBe(true);

      // Test with missing token
      localStorageMock.getItem.mockReturnValue(null);
      expect(apiService.hasValidToken()).toBe(false);
    });

    it('should clean up invalid auth state', () => {
      // Test with token but no auth state
      localStorageMock.getItem
        .mockReturnValueOnce('valid-token')
        .mockReturnValueOnce(null);

      expect(apiService.hasValidToken()).toBe(false);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('authToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('authUser');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('authState');
    });
  });
});

describe('End-to-End Pairing Flow Simulation', () => {
  it('should complete full pairing flow', async () => {
    // Mock successful registration for User A
    const userAResponse = {
      data: {
        token: 'user-a-token',
        user: {
          id: 'user-a-id',
          email: 'user-a@test.com',
          nickname: '測試用戶A'
        }
      }
    };

    // Mock pairing code generation
    const pairingCodeResponse = {
      data: {
        code: 'X5RX6S7D',
        expires_at: '2025-07-04T13:28:47Z'
      }
    };

    // Mock successful registration for User B
    const userBResponse = {
      data: {
        token: 'user-b-token',
        user: {
          id: 'user-b-id',
          email: 'user-b@test.com',
          nickname: '測試用戶B'
        }
      }
    };

    // Mock successful pairing
    const coupleResponse = {
      data: {
        id: 'couple-uuid',
        user1_nickname: '測試用戶A',
        user2_nickname: '測試用戶B',
        created_at: '2025-07-03T13:28:47Z'
      }
    };

    const mockAxiosInstance = {
      post: vi.fn()
        .mockResolvedValueOnce(userAResponse) // User A registration
        .mockResolvedValueOnce(pairingCodeResponse) // Pairing code generation
        .mockResolvedValueOnce(userBResponse) // User B registration
        .mockResolvedValueOnce(coupleResponse), // Pairing
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    // Simulate User A registration
    const userA = await apiService.register('user-a@test.com', '測試用戶A', 'password123');
    expect(userA.user.nickname).toBe('測試用戶A');

    // Simulate pairing code generation
    const pairingCode = await apiService.generatePairingCode();
    expect(pairingCode.code).toBe('X5RX6S7D');

    // Simulate User B registration
    const userB = await apiService.register('user-b@test.com', '測試用戶B', 'password123');
    expect(userB.user.nickname).toBe('測試用戶B');

    // Simulate pairing
    const couple = await apiService.createCouple({ pairingCode: 'X5RX6S7D' });
    expect(couple.user1Nickname).toBe('測試用戶A');
    expect(couple.user2Nickname).toBe('測試用戶B');
  });
}); 