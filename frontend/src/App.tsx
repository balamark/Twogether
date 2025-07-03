import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, Calendar, Trophy, Gamepad2, MessageCircle, Clock, Sparkles, Camera, MapPin, Upload, Play, Coins, Plus, X, User, ShoppingBag } from 'lucide-react';
import SettingsView from './components/SettingsView';
import RoleplayView from './components/RoleplayView';
import { AchievementsView } from './components/AchievementsView';
import Header from './components/Header';
import { NotificationContainer } from './components/ErrorNotification';
import { apiService } from './services/api';

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
  count?: number;
  recordId?: number;
  isCustom?: boolean;
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

interface CoinActivity {
  type: string;
  baseCoins: number;
  bonusConditions?: { condition: string; bonus: number }[];
}

interface RoleplayScript {
  id: string;
  title: string;
  category: 'romantic' | 'adventurous';
  scenario: string;
  image?: string;
  script: string;
  isCustom?: boolean;
  createdBy?: string;
  createdAt?: string;
  tags?: string[];
  duration?: string;
}

interface CoinGift {
  id: string;
  title: string;
  description: string;
  cost: number;
  category: 'service' | 'experience' | 'physical' | 'intimate';
  icon: string;
  isCustom?: boolean;
  createdBy?: string;
}

interface User {
  id: string;
  email: string;
  nickname: string;
  partnerId?: string;
  partnerCode?: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  partnerConnected: boolean;
}

// Default roleplay scripts
const defaultRoleplayScripts = [
  {
    id: 'first-meeting',
    title: '初次相遇',
    category: 'romantic' as const,
    scenario: '在咖啡廳偶然相遇的陌生人',
    image: '/images/roleplay/first-meeting.jpg',
    script: `[partner1]: 不好意思，這個位子有人坐嗎？
[partner2]: 沒有，請坐。你看起來很面熟，我們是不是在哪裡見過？
[partner1]: 我也有這種感覺，也許是命運的安排。我叫[partner1]，你呢？
[partner2]: 我是[partner2]，很高興認識你。你常來這家咖啡廳嗎？
[partner1]: 第一次來，但看來我會常來的。因為遇到了特別的人。
[partner2]: 你真會說話。那要不要一起喝杯咖啡，聊聊彼此？`,
    duration: '15-20分鐘'
  },
  {
    id: 'office-romance',
    title: '辦公室秘密',
    category: 'adventurous' as const,
    scenario: '下班後的辦公室，只剩下你們兩個',
    image: '/images/roleplay/office-romance.jpg',
    script: `[partner1]: 終於只剩我們兩個了，今天加班真累。
[partner2]: 是啊，不過和你一起加班感覺還不錯。
[partner1]: 我一直想找機會和你單獨聊聊...關於我們。
[partner2]: 我也是，其實我對你...有特別的感覺。
[partner1]: 真的嗎？我還以為只有我一個人這樣想。
[partner2]: 那現在我們該怎麼辦？這裡是辦公室...
[partner1]: 沒關係，現在沒有人會來。讓我好好看看你...`,
    duration: '20-30分鐘'
  },
  {
    id: 'forbidden-temptation',
    title: '禁忌誘惑',
    category: 'adventurous' as const,
    scenario: '朋友的聚會上，兩個不該在一起的人',
    image: '/images/roleplay/forbidden-temptation.jpg',
    script: `[partner1]: 我們不應該在這裡...
[partner2]: 我知道，但我忍不住。每次看到你，我就...
[partner1]: 別人會看到的。我們是朋友的...
[partner2]: 忘記那些吧，就這一次。你也感受到了，對嗎？
[partner1]: 這很危險...但我無法抗拒你。
[partner2]: 那就不要抗拒。跟我來，我知道一個安靜的地方。`,
    duration: '25-35分鐘'
  },
  {
    id: 'reunion-love',
    title: '舊情復燃',
    category: 'romantic' as const,
    scenario: '多年後的同學會，重遇初戀',
    image: '/images/roleplay/reunion-love.jpg',
    script: `[partner1]: [partner2]？真的是你嗎？這麼多年了...
[partner2]: [partner1]！我沒想到會在這裡見到你。你一點都沒變。
[partner1]: 你還是那麼美。這些年過得怎麼樣？
[partner2]: 還好，但總覺得缺少了什麼。現在看到你，我想起了...
[partner1]: 想起了什麼？
[partner2]: 想起了我們在一起的那些美好時光。你還記得嗎？
[partner1]: 當然記得，那是我最珍貴的回憶。你知道嗎，我從來沒有忘記過你。`,
    duration: '20-30分鐘'
  },
  {
    id: 'vacation-romance',
    title: '度假誘惑',
    category: 'romantic' as const,
    scenario: '海邊度假村的浪漫邂逅',
    image: '/images/roleplay/vacation-romance.jpg',
    script: `[partner1]: 這個海灘真美，尤其是夕陽西下的時候。
[partner2]: 是啊，但最美的風景是你。
[partner1]: 你真會說話。這次度假真是來對了。
[partner2]: 能遇到你，是我最大的收穫。今晚月色很美...
[partner1]: 你想做什麼？
[partner2]: 想和你一起在月光下漫步，然後...
[partner1]: 然後呢？
[partner2]: 然後讓這個夜晚變得難忘。`,
    duration: '15-25分鐘'
  }
];

// Add interfaces for the data structures
interface ForeplayActivity {
  title: string;
  description: string;
  duration: string;
  coins: number;
  tips: string[];
}

interface PositionSuggestion {
  name: string;
  difficulty: string;
  description: string;
  coins: number;
  benefits: string[];
}

const LoveTimeApp = () => {
  const [currentView, setCurrentView] = useState('record');
  const [intimateRecords, setIntimateRecords] = useState<IntimateRecord[]>([]);
  const [nicknames, setNicknames] = useState<Nicknames>({ partner1: '親愛的', partner2: '寶貝' });
  
  useEffect(() => {
    localStorage.setItem('nicknames', JSON.stringify(nicknames));
  }, [nicknames]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [roleplayFilter, setRoleplayFilter] = useState('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalCoins, setTotalCoins] = useState(0);
  const [customGifts, setCustomGifts] = useState<CoinGift[]>([]);
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    partnerConnected: false
  });
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [customScripts, setCustomScripts] = useState<RoleplayScript[]>([]);
  const [showScriptUploadModal, setShowScriptUploadModal] = useState(false);
  const [journeyMilestones, setJourneyMilestones] = useState<JourneyMilestone[]>([
    {
      id: 'meeting',
      type: 'meeting',
      date: '2024-01-01',
      title: '我們相遇的日子',
      description: '命運讓我們相遇，開始了這段美好的愛情故事'
    },
    {
      id: 'first_date',
      type: 'first_date', 
      date: '2024-01-15',
      title: '第一次約會',
      description: '緊張又興奮的第一次約會，從此心中只有彼此'
    },
    {
      id: 'first_kiss',
      type: 'first_kiss',
      date: '2024-01-20',
      title: '初吻',
      description: '那個讓時間停止的美好瞬間'
    },
    {
      id: 'first_sex',
      type: 'first_sex',
      date: '2024-02-14',
      title: '第一次親密',
      description: '愛情昇華的神聖時刻'
    }
  ]);

  const [selectedRecord, setSelectedRecord] = useState<IntimateRecord | null>(null);
  const [showRecordDetail, setShowRecordDetail] = useState(false);

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image compression utility
  const compressImage = (file: File, maxWidth: number = 800, maxHeight: number = 600, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  // Authentication functions
  const generatePartnerCode = () => {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  };

  const handleLogin = async (email: string, password: string, nickname: string) => {
    try {
      const authResult = await apiService.login(email, password);
      
      const user: User = {
        id: authResult.user.id || Date.now().toString(),
        email: authResult.user.email,
        nickname: authResult.user.nickname,
        partnerCode: generatePartnerCode(),
        createdAt: authResult.user.created_at || new Date().toISOString()
      };
      
      setAuthState({
        user,
        isAuthenticated: true,
        partnerConnected: false
      });
      
      setNicknames(prev => ({ ...prev, partner1: nickname }));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: false }));
      setShowAuthModal(false);
      
      showNotification({
        type: 'success',
        title: '登入成功！',
        message: `歡迎回來 ${nickname}！`,
        duration: 5000
      });
    } catch (error: unknown) {
      console.error('Login error:', error);
      showNotification({
        type: 'error',
        title: '登入失敗',
        message: (error as Error)?.message || '登入過程中發生錯誤，請檢查帳號密碼',
        duration: 5000
      });
    }
  };

  const handleRegister = async (email: string, nickname: string, password: string) => {
    try {
      const authResult = await apiService.register(email, nickname, password);
      
      const user: User = {
        id: authResult.user.id || Date.now().toString(),
        email: authResult.user.email,
        nickname: authResult.user.nickname,
        partnerCode: generatePartnerCode(),
        createdAt: authResult.user.created_at || new Date().toISOString()
      };
      
      setAuthState({
        user,
        isAuthenticated: true,
        partnerConnected: false
      });
      
      setNicknames(prev => ({ ...prev, partner1: nickname }));
      localStorage.setItem('authState', JSON.stringify({ user, isAuthenticated: true, partnerConnected: false }));
      setShowAuthModal(false);
      
      showNotification({
        type: 'success',
        title: '註冊成功！',
        message: `歡迎 ${nickname}！已為你創建新帳號`,
        duration: 5000
      });
    } catch (error: unknown) {
      console.error('Registration error:', error);
      showNotification({
        type: 'error',
        title: '註冊失敗',
        message: (error as Error)?.message || '註冊過程中發生錯誤，請檢查輸入資料',
        duration: 5000
      });
    }
  };

  const handlePartnerConnect = (partnerCode: string) => {
    // Implementation here
    console.log('Connecting with partner code:', partnerCode);
  };

  const handleLogout = async () => {
    try {
      await apiService.logout();
      setAuthState({
        user: null,
        isAuthenticated: false,
        partnerConnected: false
      });
      showNotification({
        type: 'info',
        title: '已登出',
        message: '感謝使用 Twogether'
      });
    } catch (error: unknown) {
      showNotification({
        type: 'error',
        title: '登出失敗',
        message: (error as Error)?.message || '登出過程中發生錯誤'
      });
    }
  };



  // Coin activities configuration
  const coinActivities: { [key: string]: CoinActivity } = {
    'roleplay': { 
      type: '角色扮演', 
      baseCoins: 500,
      bonusConditions: [
        { condition: '使用新劇本', bonus: 200 },
        { condition: '超過30分鐘', bonus: 300 }
      ]
    },
    'new_position': { 
      type: '嘗試新姿勢', 
      baseCoins: 200,
      bonusConditions: [
        { condition: '第一次嘗試', bonus: 300 }
      ]
    },
    'long_session': { 
      type: '長時間親密', 
      baseCoins: 1000,
      bonusConditions: [
        { condition: '超過1小時', bonus: 500 }
      ]
    },
    'new_location': { 
      type: '新地點', 
      baseCoins: 300,
      bonusConditions: [
        { condition: '戶外', bonus: 400 }
      ]
    },
    'foreplay': { 
      type: '前戲活動', 
      baseCoins: 150 
    },
    'regular': { 
      type: '親密時光', 
      baseCoins: 100 
    }
  };

  // Default gift catalog
  const defaultGifts: CoinGift[] = [
    {
      id: 'massage',
      title: '全身按摩',
      description: '30分鐘專業按摩服務',
      cost: 1500,
      category: 'service',
      icon: '💆‍♀️'
    },
    {
      id: 'dinner',
      title: '浪漫晚餐',
      description: '親手準備一頓豐盛晚餐',
      cost: 2000,
      category: 'service',
      icon: '🍽️'
    },
    {
      id: 'movie_night',
      title: '電影之夜',
      description: '一起看最愛的電影加零食',
      cost: 800,
      category: 'experience',
      icon: '🎬'
    },
    {
      id: 'oral_service',
      title: '特殊服務',
      description: '你懂的特別服務',
      cost: 3000,
      category: 'intimate',
      icon: '💋'
    },
    {
      id: 'babysitting',
      title: '帶娃2小時',
      description: '讓伴侶休息2小時',
      cost: 2500,
      category: 'service',
      icon: '👶'
    },
    {
      id: 'shopping',
      title: '購物基金',
      description: '500元購物預算',
      cost: 5000,
      category: 'physical',
      icon: '💰'
    }
  ];

  // Load saved data on component mount - only once
  useEffect(() => {
    const loadInitialData = () => {
      // Load localStorage data first (doesn't require authentication)
      const savedMilestones = JSON.parse(localStorage.getItem('journeyMilestones') || '[]');
      const savedAuth = JSON.parse(localStorage.getItem('authState') || '{}');
      const savedCustomGifts = JSON.parse(localStorage.getItem('customGifts') || '[]');
      const savedCustomScripts = JSON.parse(localStorage.getItem('customScripts') || '[]');
      
      setJourneyMilestones(savedMilestones);
      setCustomGifts(savedCustomGifts);
      setCustomScripts(savedCustomScripts);
      
      // Only set auth state if we have both user and valid token
      const authToken = localStorage.getItem('authToken');
      if (savedAuth.user && authToken) {
        setAuthState(savedAuth);
      } else {
        // Clear invalid auth state
        localStorage.removeItem('authState');
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
      }
    };

    loadInitialData();
  }, []);

  // Load authenticated data when user logs in
  useEffect(() => {
    const loadAuthenticatedData = async () => {
      try {
        // Load nicknames
        const storedNicknames = await apiService.getNicknames();
        setNicknames(storedNicknames);
        
        // Load intimacy records from backend
        try {
          const records = await apiService.getIntimateRecords();
          setIntimateRecords(records);
        } catch (error) {
          console.error('Failed to load intimate records:', error);
          // Keep empty array if API fails
        }

        // Load couple information to get partner details
        try {
          const coupleInfo = await apiService.getCouple();
          if (coupleInfo && authState.user) {
            const partnerNickname = coupleInfo.user1Nickname !== authState.user.nickname 
              ? coupleInfo.user1Nickname 
              : coupleInfo.user2Nickname;
            
            const updatedAuthState = {
              ...authState,
              partnerConnected: !!coupleInfo.user2Nickname,
              user: {
                ...authState.user,
                partnerId: coupleInfo.id,
                partnerNickname: partnerNickname || undefined
              }
            };
            
            setAuthState(updatedAuthState);
            localStorage.setItem('authState', JSON.stringify(updatedAuthState));
            
            // Update nicknames if both partners exist
            if (coupleInfo.user1Nickname && coupleInfo.user2Nickname) {
              const coupleNicknames = {
                partner1: coupleInfo.user1Nickname,
                partner2: coupleInfo.user2Nickname
              };
              setNicknames(coupleNicknames);
              await apiService.updateNicknames(coupleNicknames);
            }
          }
        } catch (coupleError) {
          console.log('No couple found or error fetching couple info:', coupleError);
          // This is okay - user might not be paired yet
        }
        
        // Load scripts
        const storedScripts = localStorage.getItem('customScripts');
        if (storedScripts) {
          setCustomScripts(JSON.parse(storedScripts));
        }
      } catch (error) {
        console.error('Error loading authenticated data:', error);
      }
    };

    loadAuthenticatedData();
  }, [authState.isAuthenticated, authState]);

  // Note: Intimate records are now persisted in the backend, no localStorage needed

  useEffect(() => {
    const saveNicknames = async () => {
      try {
        await apiService.updateNicknames(nicknames);
      } catch (error) {
        console.error('Error saving nicknames:', error);
      }
    };
    
    saveNicknames();
  }, [nicknames]);

  useEffect(() => {
    localStorage.setItem('journeyMilestones', JSON.stringify(journeyMilestones));
  }, [journeyMilestones]);

  useEffect(() => {
    localStorage.setItem('totalCoins', totalCoins.toString());
  }, [totalCoins]);

  useEffect(() => {
    localStorage.setItem('customGifts', JSON.stringify(customGifts));
  }, [customGifts]);

  useEffect(() => {
    localStorage.setItem('customScripts', JSON.stringify(customScripts));
  }, [customScripts]);

  // Notification system
  const showNotification = (notification: Omit<Notification, 'id'>) => {
    const id = Date.now().toString();
    const newNotification = { ...notification, id };
    setNotifications(prev => [...prev, newNotification]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, notification.duration || 5000);
  };

  const calculateCoins = (activityType: string, duration?: string, isNewScript?: boolean): number => {
    const activity = coinActivities[activityType] || coinActivities['regular'];
    let coins = activity.baseCoins;
    
    // Apply bonus conditions
    if (activity.bonusConditions) {
      activity.bonusConditions.forEach(bonus => {
        if (bonus.condition === '使用新劇本' && isNewScript === true) coins += bonus.bonus;
        if (bonus.condition === '超過30分鐘' && duration && parseInt(duration) > 30) coins += bonus.bonus;
        if (bonus.condition === '超過1小時' && duration && parseInt(duration) > 60) coins += bonus.bonus;
      });
    }
    
    return coins;
  };

  const checkBadgeProgress = () => {
    const thisWeek = getWeeklyStats();
    const total = intimateRecords.length;
    
    let badgeProgress = '';
    let nextBadge = '';
    
    if (thisWeek < 1) {
      badgeProgress = `還需 ${1 - thisWeek} 次達成「週間戀人」徽章`;
      nextBadge = 'weekly_lovers';
    } else if (thisWeek < 3) {
      badgeProgress = `還需 ${3 - thisWeek} 次達成「熱戀情侶」徽章`;
      nextBadge = 'passionate_couple';
    } else if (thisWeek < 5) {
      badgeProgress = `還需 ${5 - thisWeek} 次達成「甜蜜無敵」徽章`;
      nextBadge = 'sweet_invincible';
    } else if (total < 10) {
      badgeProgress = `還需 ${10 - total} 次達成第10次里程碑`;
      nextBadge = 'milestone_10';
    }
    
    return { badgeProgress, nextBadge };
  };

  const updateIntimacyMilestones = useCallback(() => {
    const totalCount = intimateRecords.length;
    const milestones = [10, 20, 50, 100, 200, 500, 1000];
    
    milestones.forEach(count => {
      if (totalCount >= count) {
        const existingMilestone = journeyMilestones.find(m => 
          m.type === 'intimacy_milestone' && m.count === count
        );
        
        if (!existingMilestone) {
          const newMilestone: JourneyMilestone = {
            id: `intimacy_${count}`,
            type: 'intimacy_milestone',
            date: intimateRecords[count - 1]?.date || new Date().toISOString().split('T')[0],
            title: `親密時光第 ${count} 次`,
            description: `恭喜你們達成了 ${count} 次親密時光的里程碑！`,
            count,
            recordId: intimateRecords[count - 1]?.id
          };
          setJourneyMilestones(prev => [...prev, newMilestone].sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          ));
        }
      }
    });
  }, [intimateRecords, journeyMilestones]);

  // Update milestones based on intimacy count - separate effect
  useEffect(() => {
    if (intimateRecords.length > 0) {
      updateIntimacyMilestones();
    }
  }, [intimateRecords.length, updateIntimacyMilestones]);

  const addIntimateRecord = async (
    date: string, 
    time: string, 
    mood: string, 
    notes?: string,
    photo?: string,
    description?: string,
    duration?: string,
    location?: string,
    roleplayScript?: string,
    activityType: string = 'regular'
  ) => {
    try {
      const isNewScript = roleplayScript ? !intimateRecords.some(r => r.roleplayScript === roleplayScript) : false;
      const coinsEarned = calculateCoins(activityType, duration, isNewScript);
      
      let photoId: string | null = null;
      
      // Upload photo if provided
      if (photo) {
        try {
          // Convert base64 to File object
          const response = await fetch(photo);
          const blob = await response.blob();
          const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
          
          const photoResponse = await apiService.uploadPhoto(file, description);
          photoId = photoResponse.id;
        } catch (photoError) {
          console.error('Photo upload failed:', photoError);
          showNotification({
            type: 'warning',
            title: '照片上傳失敗',
            message: '記錄已保存，但照片上傳失敗',
            duration: 5000
          });
        }
      }
      
      // Create record using API service
      const recordData = {
        date,
        time,
        mood,
        notes,
        photo: photoId ? `/api/photos/${photoId}/file` : undefined,
        description,
        duration,
        location,
        roleplayScript,
        activityType
      };
      
      const newRecord = await apiService.createIntimateRecord(recordData);
      
      // Update local state
      setIntimateRecords(prev => [...prev, newRecord]);
      
      // Update coins using API service
      await apiService.updateCoins(coinsEarned);
      setTotalCoins(prev => prev + coinsEarned);
      
      // Show success notification
      const { badgeProgress } = checkBadgeProgress();
      showNotification({
        type: 'success',
        title: '記錄成功！',
        message: badgeProgress,
        coins: coinsEarned,
        duration: 6000
      });
    } catch (error: unknown) {
      console.error('Error adding intimate record:', error);
      showNotification({
        type: 'error',
        title: '記錄失敗',
        message: (error as Error)?.message || '無法保存記錄，請檢查網絡連接',
        duration: 5000
      });
    }
  };

  const showRecordDetails = async (recordId: number) => {
    try {
      // Find record in local state first
      const localRecord = intimateRecords.find(r => r.id === recordId);
      if (localRecord) {
        setSelectedRecord(localRecord);
        setShowRecordDetail(true);
        return;
      }
      
      // If not found locally, fetch from API
      const record = await apiService.getIntimateRecord(recordId.toString());
      setSelectedRecord(record);
      setShowRecordDetail(true);
    } catch (error) {
      console.error('Error fetching record details:', error);
      showNotification({
        type: 'warning',
        title: '載入失敗',
        message: '無法載入記錄詳情',
        duration: 3000
      });
    }
  };

  // Script management functions
  const parseScriptContent = (content: string): string => {
    // Clean and format script content
    const lines = content.split('\n').filter(line => line.trim());
    const formattedLines = lines.map(line => {
      // Replace placeholder names with actual nicknames
      line = line.replace(/\[男\]|\[他\]|\[partner1\]/gi, nicknames.partner1);
      line = line.replace(/\[女\]|\[她\]|\[partner2\]/gi, nicknames.partner2);
      
      // Format dialogue
      if (line.includes(':')) {
        const [speaker, dialogue] = line.split(':');
        return `${speaker.trim()}: "${dialogue.trim()}"`;
      }
      
      return line;
    });
    
    return formattedLines.join('\n\n');
  };

  const addCustomScript = (title: string, category: 'romantic' | 'adventurous', scenario: string, content: string, tags: string[] = []) => {
    const newScript: RoleplayScript = {
      id: Date.now().toString(),
      title,
      category,
      scenario,
      script: parseScriptContent(content),
      isCustom: true,
      createdBy: authState.user?.id,
      createdAt: new Date().toISOString(),
      tags,
      duration: '15-30分鐘'
    };
    
    setCustomScripts(prev => [...prev, newScript]);
    setShowScriptUploadModal(false);
    
    showNotification({
      type: 'success',
      title: '劇本上傳成功！',
      message: `${title} 已加入你的劇本庫`,
      coins: 200,
      duration: 5000
    });
    
    setTotalCoins(prev => prev + 200); // Reward for creating content
  };

  // Gift management functions
  const addCustomGift = (title: string, description: string, cost: number, category: CoinGift['category'], icon: string) => {
    const newGift: CoinGift = {
      id: Date.now().toString(),
      title,
      description,
      cost,
      category,
      icon,
      isCustom: true,
      createdBy: authState.user?.id
    };
    
    setCustomGifts(prev => [...prev, newGift]);
    
    showNotification({
      type: 'success',
      title: '禮品已添加！',
      message: `${title} 已加入禮品商店`,
      duration: 3000
    });
  };

  const purchaseGift = (gift: CoinGift) => {
    if (totalCoins >= gift.cost) {
      setTotalCoins(prev => prev - gift.cost);
      
      showNotification({
        type: 'success',
        title: '購買成功！',
        message: `你獲得了 ${gift.title}！記得兌現承諾哦～`,
        duration: 5000
      });
    } else {
      showNotification({
        type: 'warning',
        title: '金幣不足',
        message: `還需要 ${gift.cost - totalCoins} 枚金幣`,
        duration: 3000
      });
    }
  };

  const getWeeklyStats = () => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = intimateRecords.filter(record => 
      new Date(record.date) >= oneWeekAgo && new Date(record.date) <= now
    );
    return thisWeek.length;
  };



  const romanticGames = [
    { 
      title: '真心話大冒險', 
      desc: '輪流問對方從未問過的問題，增進了解',
      instructions: [
        '1. 準備紙條寫下問題，放入盒子中',
        '2. 輪流抽取問題，必須誠實回答',
        '3. 問題可以包括：夢想、恐懼、幻想、回憶',
        '4. 大冒險可以是：唱歌、按摩、親吻、擥抱',
        '5. 創造安全舒適的環境，互相尊重'
      ],
      questions: [
        '如果今晚是世界末日，你最想和我做什麼？',
        '你對我身體最著迷的部位是哪裡？',
        '描述你心中最完美的約會夜晚',
        '你最想在哪個地方和我親熱？',
        '如果可以實現一個性幻想，會是什麼？'
      ]
    },
    { 
      title: '感官按摩', 
      desc: '用觸覺喚醒彼此的感官，放鬆身心',
      instructions: [
        '1. 準備香薰蠟燭和按摩油',
        '2. 調暗燈光，播放輕柔音樂',
        '3. 從肩膀開始，慢慢按摩全身',
        '4. 專注於對方的反應和呼吸',
        '5. 輪流為對方按摩，享受被愛撫的感覺'
      ],
      tips: [
        '用溫熱的按摩油，避免太冷',
        '變化按摩的力度和節奏',
        '不要忽略敏感部位',
        '用指尖輕撫，製造酥麻感',
        '按摩時保持眼神交流'
      ]
    },
    { 
      title: '情慾骰子', 
      desc: '用骰子決定親密動作，增加刺激感',
      instructions: [
        '1. 準備兩個骰子（動作骰子和部位骰子）',
        '2. 動作包括：親吻、撫摸、按摩、舔舐、輕咬、吹氣',
        '3. 部位包括：唇、頸、耳、胸、腰、腿',
        '4. 輪流擲骰子，按照結果執行',
        '5. 可以設定時間限制，增加刺激感'
      ],
      variations: [
        '加入溫度元素：冰塊或溫水',
        '使用羽毛或絲巾增加質感',
        '設定不同的強度等級',
        '加入調情話語的要求',
        '結合不同的姿勢或位置'
      ]
    },
    { 
      title: '慢燃調情', 
      desc: '用語言和眼神慢慢點燃激情',
      instructions: [
        '1. 面對面坐著，保持眼神接觸',
        '2. 輪流說出對方最性感的特質',
        '3. 描述你想對對方做的事情',
        '4. 用手輕撫但不要碰觸私密部位',
        '5. 建立期待感，延遲滿足'
      ],
      phrases: [
        '你知道嗎？當你看著我的時候...',
        '我一直在想像...',
        '今晚我想要...',
        '你讓我感到...',
        '如果我們現在...'
      ]
    },
    { 
      title: '記憶重現', 
      desc: '重演你們最難忘的親密時刻',
      instructions: [
        '1. 分享彼此最難忘的親密回憶',
        '2. 選擇一個想要重演的場景',
        '3. 儘可能還原當時的情境',
        '4. 加入新的元素讓體驗更豐富',
        '5. 專注於當時的感覺和情緒'
      ],
      scenarios: [
        '第一次親吻的地點和感覺',
        '最浪漫的一次約會夜晚',
        '最激情的一次親密時光',
        '最意外的親密時刻',
        '最溫柔纏綿的早晨'
      ]
    },
    { 
      title: '慾望清單', 
      desc: '分享彼此的性幻想和願望',
      instructions: [
        '1. 各自寫下5個親密願望',
        '2. 交換清單，討論每一項',
        '3. 選擇雙方都感興趣的項目',
        '4. 制定實現這些願望的計劃',
        '5. 從最容易實現的開始嘗試'
      ],
      categories: [
        '新的地點或環境',
        '不同的角色扮演',
        '新的親密方式',
        '感官刺激體驗',
        '浪漫情境設定'
      ]
    }
  ];

  const conflictResolutions = [
    { title: '傾聽練習', desc: '給對方5分鐘不被打斷的表達時間' },
    { title: '愛的語言', desc: '用"我感覺"而不是"你總是"來表達' },
    { title: '擁抱和解', desc: '爭吵後先給對方一個溫暖的擁抱' },
    { title: '寫信溝通', desc: '將想說的話寫成信，避免激烈爭吵' },
    { title: '約定時間', desc: '設定專門的溝通時間，心平氣和討論' }
  ];

  // Foreplay Activities
  const foreplayActivities = [
    {
      title: '感官按摩',
      description: '用溫熱的按摩油為彼此按摩，喚醒身體的每一寸肌膚',
      duration: '15-30分鐘',
      coins: 150,
      tips: ['使用香薰蠟燭營造氛圍', '從肩膀開始慢慢按摩', '專注於對方的反應']
    },
    {
      title: '冰火兩重天',
      description: '用冰塊和溫水交替刺激敏感部位，帶來不同的感官體驗',
      duration: '10-20分鐘',
      coins: 200,
      tips: ['準備冰塊和溫水', '輕柔地在身體上滑動', '注意對方的感受']
    },
    {
      title: '羽毛撫摸',
      description: '用柔軟的羽毛輕撫身體，帶來酥麻的快感',
      duration: '10-15分鐘',
      coins: 150,
      tips: ['選擇柔軟的羽毛', '從不敏感部位開始', '變化力度和速度']
    },
    {
      title: '蒙眼遊戲',
      description: '蒙上眼睛，讓其他感官更加敏銳，增加神秘感',
      duration: '20-30分鐘',
      coins: 250,
      tips: ['使用絲巾或眼罩', '專注於觸覺和聽覺', '保持溝通']
    }
  ];

  // Position suggestions
  const positionSuggestions = [
    {
      name: '蓮花式',
      difficulty: '簡單',
      description: '面對面坐著，增進親密感和眼神交流',
      coins: 200,
      benefits: ['增進情感連結', '便於親吻和撫摸', '適合慢節奏']
    },
    {
      name: '側臥式',
      difficulty: '簡單',
      description: '側躺進行，適合長時間親密',
      coins: 200,
      benefits: ['減少疲勞', '適合懷孕期', '便於撫摸']
    },
    {
      name: '後入式',
      difficulty: '中等',
      description: '從後方進入，帶來不同的刺激感',
      coins: 300,
      benefits: ['深度刺激', '便於撫摸敏感部位', '角度變化']
    },
    {
      name: '站立式',
      difficulty: '困難',
      description: '站立進行，增加新鮮感和刺激',
      coins: 400,
      benefits: ['新鮮體驗', '不同角度', '增加難度挑戰']
    }
  ];

  const roleplayScripts = [
    {
      title: '初次相遇',
      category: 'romantic',
      scenario: '重現你們第一次見面的場景，但這次更加大膽',
      image: '/images/roleplay/first-meeting.jpg', // Add instruction in README for updating images
      script: `${nicknames.partner1}: "不好意思，請問這個位置有人坐嗎？"

${nicknames.partner2}: "沒有，請坐。你看起來很面熟呢..."

${nicknames.partner1}: "真的嗎？也許我們在夢中見過... 我感覺對你有種特殊的吸引力。"

${nicknames.partner2}: "這話聽起來很老套，但不知道為什麼，我也有同樣的感覺。你的眼神讓我心跳加速。"

${nicknames.partner1}: "既然我們有如此奇妙的緣分，不如讓我更了解你一些？比如... 你喜歡被怎樣溫柔地對待？"

${nicknames.partner2}: "你真直接... 但我喜歡。我喜歡慢慢來，先從溫柔的撫摸開始，然後..."

${nicknames.partner1}: "然後呢？別害羞，告訴我你的想法。"

${nicknames.partner2}: "然後我希望你能吻我，不只是嘴唇，還有我的脖子... 讓我感受到你的渴望。"

${nicknames.partner1}: "你的話讓我血管裡的血液都在沸騰。如果我現在就吻你，你會拒絕嗎？"

${nicknames.partner2}: "試試看就知道了... 但我警告你，一旦開始，我可能就停不下來了。"

${nicknames.partner1}: "那正是我希望的。讓我們忘掉這是第一次見面，就像我們等待彼此已經很久了..."

${nicknames.partner2}: "帶我到一個只有我們兩個人的地方，讓我們好好'了解'彼此..."

${nicknames.partner1}: "跟我來，今晚我要讓你知道什麼叫做一見鍾情的激情..."

${nicknames.partner2}: "我已經迫不及待想要感受你的溫度了..."`
    },
    {
      title: '辦公室秘密',
      category: 'adventurous',
      scenario: '同事間的禁忌戀情，充滿刺激與激情',
      image: '/images/roleplay/office-romance.jpg',
      script: `${nicknames.partner1}: "會議結束後，到我辦公室來一下，我們需要討論那個... 特殊項目。"

${nicknames.partner2}: "又是那個項目？我們已經討論過很多次了... 難道還有什麼需要深入探討的？"

${nicknames.partner1}: "當然有。而且這次我想要... 更深入的討論。門記得鎖上。"

${nicknames.partner2}: "你知道我們不能被別人發現。如果被抓到，我們都會有麻煩的..."

${nicknames.partner1}: "但是你也知道，自從上次我們在檔案室的那次'加班'之後，我一直無法集中注意力工作。"

${nicknames.partner2}: "那次... 你的手撫摸我的方式，讓我整個星期都心神不寧。"

${nicknames.partner1}: "今天我想要更多。我想要你坐在我的辦公桌上，讓我好好'檢查'你的工作表現。"

${nicknames.partner2}: "如果有人敲門怎麼辦？"

${nicknames.partner1}: "那就讓這成為我們的秘密刺激。想像著隨時可能被發現的危險，難道不讓你更興奮嗎？"

${nicknames.partner2}: "你這樣說話讓我全身都起雞皮疙瘩... 好吧，但是你要溫柔一點，我們不能發出太大聲音。"

${nicknames.partner1}: "我會讓你咬著我的領帶，這樣就不會有人聽到你的喘息聲了..."

${nicknames.partner2}: "天啊，你總是知道怎麼讓我失去理智。快點鎖門，我已經等不及了..."

${nicknames.partner1}: "這次我要讓你知道什麼叫做真正的'加班'，直到你完全滿意為止..."

${nicknames.partner2}: "那我們最好準備一個很好的藉口，因為我感覺今晚會是一個很長很長的夜晚..."`
    },
    {
      title: '禁忌誘惑',
      category: 'adventurous',
      scenario: '陌生人間的危險吸引力，充滿神秘與慾望',
      image: '/images/roleplay/forbidden-temptation.jpg',
      script: `${nicknames.partner1}: "我注意你很久了。你知道自己有多吸引人嗎？"

${nicknames.partner2}: "我們甚至不認識彼此... 這樣不太合適吧？"

${nicknames.partner1}: "有時候最刺激的就是未知。你不好奇我會如何對待你嗎？"

${nicknames.partner2}: "你的眼神讓我感到危險... 但同時也讓我無法抗拒。"

${nicknames.partner1}: "危險？也許是的。但我保證，如果你願意相信我一個晚上，我會讓你體驗從未有過的感受。"

${nicknames.partner2}: "你怎麼確定我想要那種體驗？"

${nicknames.partner1}: "因為你的身體已經告訴我答案了。你的呼吸，你的姿態，甚至你看我的方式..."

${nicknames.partner2}: "你觀察得很仔細... 那你還發現了什麼？"

${nicknames.partner1}: "我發現你其實和我一樣渴望。渴望突破日常的束縛，渴望感受真正的激情。"

${nicknames.partner2}: "也許你是對的... 但如果我跟你走，你會怎樣對我？"

${nicknames.partner1}: "首先，我會慢慢脫掉你的每一件衣服，同時告訴你你有多美。然後..."

${nicknames.partner2}: "然後什麼？別停下來，我想知道所有細節..."

${nicknames.partner1}: "然後我會用我的唇吻遍你身體的每一寸，直到你顫抖著求我給你更多..."

${nicknames.partner2}: "聽起來你很有經驗... 但我不是那麼容易滿足的人。"

${nicknames.partner1}: "那正好，因為我有整晚的時間來證明我的能力。現在，給我你的手..."

${nicknames.partner2}: "帶我走吧，但我警告你，一旦開始，我會要求你給我所有的一切..."`
    },
    {
      title: '舊情復燃',
      category: 'romantic',
      scenario: '多年後重逢的戀人，重新點燃昔日激情',
      image: '/images/roleplay/reunion-love.jpg',
      script: `${nicknames.partner1}: "這麼多年了，你還是那麼美... 時間似乎對你特別仁慈。"

${nicknames.partner2}: "你也是... 但你的眼神比以前更加深邃，更加... 誘人。"

${nicknames.partner1}: "你知道嗎？這些年來，我從未忘記過你身體的味道，你呻吟的聲音..."

${nicknames.partner2}: "別說了... 你這樣說讓我想起那些瘋狂的夜晚。"

${nicknames.partner1}: "為什麼不能說？我們都已經成年了，而且我們之間有過那麼美好的回憶。"

${nicknames.partner2}: "美好？那些夜晚簡直是... 令人著迷。我也經常想起你的撫摸，你讓我達到巔峰時的樣子..."

${nicknames.partner1}: "既然我們都還想著彼此，為什麼不重新開始？我們現在更成熟，更知道如何取悅對方。"

${nicknames.partner2}: "你認為我們還能找回當年的激情嗎？"

${nicknames.partner1}: "不只是找回，我相信會更加強烈。現在我們知道什麼是真正的渴望，什麼是真正的需要。"

${nicknames.partner2}: "那你現在想要什麼？"

${nicknames.partner1}: "我想要重新認識你的身體，用更加成熟的方式愛你，讓你感受到前所未有的滿足。"

${nicknames.partner2}: "如果我說我也想要重新感受你的溫度，重新聽到你叫我名字的聲音呢？"

${nicknames.partner1}: "那就讓我們回到當年我們最愛的那個地方，重新寫下我們的愛情故事..."

${nicknames.partner2}: "但這次，我們要讓它更加瘋狂，更加難忘... 我已經等不及了。"

${nicknames.partner1}: "跟我來，今晚我要讓你知道，有些愛情只會隨著時間變得更加濃烈..."`
    },
    {
      title: '度假誘惑',
      category: 'romantic',
      scenario: '在異國他鄉的浪漫度假，遠離世俗束縛',
      image: '/images/roleplay/vacation-romance.jpg',
      script: `${nicknames.partner1}: "看這片海灘，只有我們兩個人... 你不覺得這是完美的時機嗎？"

${nicknames.partner2}: "什麼的完美時機？"

${nicknames.partner1}: "做一些我們在家鄉從不敢做的事情... 這裡沒有人認識我們，我們可以完全放開自己。"

${nicknames.partner2}: "海風輕拂，月色如水... 確實很適合做一些特別的事情。你心裡想的是什麼？"

${nicknames.partner1}: "我想在這月光下吻你，然後慢慢脫掉你的比基尼，讓海浪撫摸我們赤裸的身體..."

${nicknames.partner2}: "這裡是公共場所... 萬一有人看到呢？"

${nicknames.partner1}: "那不是更刺激嗎？而且現在是深夜，除了月亮和星星，沒有人會看到我們。"

${nicknames.partner2}: "你總是知道怎麼說服我做瘋狂的事情... 但我必須承認，這個想法讓我很興奮。"

${nicknames.partner1}: "那就讓我們創造一個永遠不會忘記的回憶。我要在沙灘上愛你，讓你的呻吟聲混合著海浪聲..."

${nicknames.partner2}: "如果我們被抓到怎麼辦？"

${nicknames.partner1}: "那我們就說我們是在慶祝蜜月... 而且誰能抗拒如此美麗的夜晚和如此性感的伴侶呢？"

${nicknames.partner2}: "你的話讓我全身發熱... 好吧，但我們要找一個相對隱蔽的地方。"

${nicknames.partner1}: "我知道一個完美的小海灣，被岩石圍繞，絕對私密... 讓我帶你去那裡。"

${nicknames.partner2}: "那我們還在等什麼呢？我想要在星空下感受你的愛撫，讓這個夜晚變得難忘..."

${nicknames.partner1}: "跟我來，今晚海灘將見證我們最狂野的激情... 我要讓你在浪花中達到天堂。"`
    }
  ];

  const CalendarView = () => {
    // Helper function to get current time in HH:MM format
    const getCurrentTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const [recordForm, setRecordForm] = useState({
      date: selectedDate,
      time: getCurrentTime(),
      mood: '💕',
      notes: '',
      description: '',
      duration: '',
      location: '',
      photo: '',
      roleplayScript: ''
    });

    const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const compressedImage = await compressImage(file);
        setRecordForm({...recordForm, photo: compressedImage});
      } catch (err) {
        console.error('Failed to upload photo:', err);
        showNotification({
          type: 'error',
          title: '照片上傳失敗',
          message: '請稍後再試',
          duration: 3000
        });
      }
    };

    const handleSubmitRecord = async () => {
      // Validate required fields
      if (!recordForm.date) {
        showNotification({
          type: 'error',
          title: '驗證錯誤',
          message: '請選擇日期',
          duration: 5000
        });
        return;
      }

      if (!recordForm.time) {
        showNotification({
          type: 'error',
          title: '驗證錯誤',
          message: '請選擇時間',
          duration: 5000
        });
        return;
      }

      await addIntimateRecord(
        recordForm.date,
        recordForm.time,
        recordForm.mood,
        recordForm.notes || undefined, // Convert empty string to undefined
        recordForm.photo,
        recordForm.description || undefined, // Convert empty string to undefined
        recordForm.duration || undefined,
        recordForm.location || undefined,
        recordForm.roleplayScript || undefined
      );
      setShowRecordModal(false);
      setRecordForm({
        date: selectedDate,
        time: getCurrentTime(),
        mood: '💕',
        notes: '',
        description: '',
        duration: '',
        location: '',
        photo: '',
        roleplayScript: ''
      });
    };

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-pink-500 to-purple-600 text-white p-6 rounded-2xl">
          <h2 className="text-2xl font-bold mb-4">愛的日曆</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">選擇日期</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full p-3 rounded-lg text-gray-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">親密時刻</label>
              <button
                onClick={() => {
                  setRecordForm({...recordForm, date: selectedDate});
                  setShowRecordModal(true);
                }}
                className="w-full bg-white text-pink-600 p-3 rounded-lg font-medium hover:bg-pink-50 transition-colors"
              >
                記錄今天的愛 ❤️
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Record Modal */}
        {showRecordModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-800">記錄親密時光</h3>
                  <button
                    onClick={() => setShowRecordModal(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">日期選擇</label>
                      <div className="space-y-3">
                        <input
                          type="date"
                          value={recordForm.date}
                          onChange={(e) => setRecordForm({...recordForm, date: e.target.value})}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                        />
                        <CalendarDatePicker 
                          selectedDate={recordForm.date}
                          onDateSelect={(date) => setRecordForm({...recordForm, date})}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">時間</label>
                      <input
                        type="time"
                        value={recordForm.time}
                        onChange={(e) => setRecordForm({...recordForm, time: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  {/* Photo Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Camera className="w-4 h-4 inline mr-2" />
                      上傳照片 (可選)
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                      {recordForm.photo ? (
                        <div className="relative">
                          <img 
                            src={recordForm.photo} 
                            alt="記憶照片" 
                            className="max-h-32 mx-auto rounded-lg"
                          />
                          <button
                            onClick={() => setRecordForm({...recordForm, photo: ''})}
                            className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 text-sm"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div>
                          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-pink-600 hover:text-pink-700 font-medium"
                          >
                            點擊上傳照片
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            className="hidden"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Description and Details */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">描述你們做了什麼</label>
                    <textarea
                      value={recordForm.description}
                      onChange={(e) => setRecordForm({...recordForm, description: e.target.value})}
                      placeholder="分享這個美好時光的細節..."
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 h-20"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Clock className="w-4 h-4 inline mr-2" />
                        持續時間
                      </label>
                      <input
                        type="text"
                        value={recordForm.duration}
                        onChange={(e) => setRecordForm({...recordForm, duration: e.target.value})}
                        placeholder="例如：30分鐘"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <MapPin className="w-4 h-4 inline mr-2" />
                        地點
                      </label>
                      <input
                        type="text"
                        value={recordForm.location}
                        onChange={(e) => setRecordForm({...recordForm, location: e.target.value})}
                        placeholder="例如：臥室、客廳"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                  </div>

                  {/* Roleplay Script Reference */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Play className="w-4 h-4 inline mr-2" />
                      角色扮演劇本 (可選)
                    </label>
                    <select
                      value={recordForm.roleplayScript}
                      onChange={(e) => setRecordForm({...recordForm, roleplayScript: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                    >
                      <option value="">未使用劇本</option>
                      {roleplayScripts.map((script, index) => (
                        <option key={index} value={script.title}>{script.title}</option>
                      ))}
                    </select>
                  </div>

                  {/* Mood and Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">心情</label>
                    <div className="flex space-x-2">
                      {['💕', '🔥', '😍', '🥰', '😘', '🌟'].map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => setRecordForm({...recordForm, mood: emoji})}
                          className={`p-2 text-2xl rounded-lg border-2 ${
                            recordForm.mood === emoji 
                              ? 'border-pink-500 bg-pink-50' 
                              : 'border-gray-300 hover:border-pink-300'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">備註</label>
                    <textarea
                      value={recordForm.notes}
                      onChange={(e) => setRecordForm({...recordForm, notes: e.target.value})}
                      placeholder="記錄這個特別時刻的感受..."
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 h-20"
                    />
                  </div>
                </div>

                <div className="flex space-x-4 mt-6">
                  <button
                    onClick={() => setShowRecordModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmitRecord}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:shadow-lg"
                  >
                    保存記錄
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            親密記錄 ({intimateRecords.length} 次)
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {intimateRecords.slice().reverse().map((record) => (
              <div 
                key={record.id} 
                className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => showRecordDetails(record.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{record.mood}</div>
                    <div>
                      <div className="font-medium text-gray-800">
                        {record.date} {record.time}
                      </div>
                      {record.description && (
                        <div className="text-sm text-gray-600 mt-1">
                          {record.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {record.photo && (
                    <div className="flex-shrink-0">
                      <img 
                        src={record.photo} 
                        alt="記憶照片" 
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-2">
                  {record.duration && (
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {record.duration}
                    </span>
                  )}
                  {record.location && (
                    <span className="flex items-center">
                      <MapPin className="w-3 h-3 mr-1" />
                      {record.location}
                    </span>
                  )}
                  {record.roleplayScript && (
                    <span className="flex items-center text-purple-600">
                      <Play className="w-3 h-3 mr-1" />
                      {record.roleplayScript}
                    </span>
                  )}
                </div>
                
                {record.notes && (
                  <p className="text-sm text-gray-600 mt-2 italic">"{record.notes}"</p>
                )}
              </div>
            ))}
            {intimateRecords.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                還沒有記錄，開始你們的愛情之旅吧！
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };



  const GamesView = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white p-6 rounded-2xl">
        <h2 className="text-2xl font-bold mb-2">情趣遊戲</h2>
        <p className="text-purple-100">增進彼此感情的有趣活動</p>
      </div>

      <div className="space-y-6">
        {romanticGames.map((game, index) => (
          <div key={index} className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start space-x-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-800 mb-2">{game.title}</h3>
                <p className="text-gray-600 mb-4">{game.desc}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-pink-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-3">遊戲步驟：</h4>
                <ul className="space-y-2">
                  {game.instructions.map((instruction, i) => (
                    <li key={i} className="text-sm text-gray-700">{instruction}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-800 mb-3">
                  {game.questions ? '問題範例：' : 
                   game.tips ? '小貼士：' : 
                   game.variations ? '變化玩法：' :
                   game.phrases ? '調情話語：' :
                   game.scenarios ? '場景建議：' : '願望類別：'}
                </h4>
                <ul className="space-y-2">
                  {(game.questions || game.tips || game.variations || game.phrases || game.scenarios || game.categories || []).map((item, i) => (
                    <li key={i} className="text-sm text-gray-700">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const ConflictView = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-500 to-teal-600 text-white p-6 rounded-2xl">
        <h2 className="text-2xl font-bold mb-2">和諧相處</h2>
        <p className="text-green-100">化解矛盾，增進理解</p>
      </div>

      <div className="space-y-4">
        {conflictResolutions.map((solution, index) => (
          <div key={index} className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-800 mb-2">{solution.title}</h3>
                <p className="text-gray-600">{solution.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // RoleplayView component moved to separate file

  // Authentication Modal Component
  const AuthModal = () => {
    const [authMode, setAuthMode] = useState<'login' | 'register' | 'partner'>('login');
    const [email, setEmail] = useState('');
    const [nickname, setNickname] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [partnerCode, setPartnerCode] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      if (authMode === 'login') {
        handleLogin(email, password, nickname);
      } else if (authMode === 'register') {
        if (password !== confirmPassword) {
          showNotification({
            type: 'error',
            title: '密碼不匹配',
            message: '請確認兩次輸入的密碼相同',
            duration: 3000
          });
          return;
        }
        handleRegister(email, nickname, password);
      } else {
        handlePartnerConnect(partnerCode);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-pink-700">
              {authMode === 'login' ? '登入愛的時光' : 
               authMode === 'register' ? '註冊新帳號' : '連接伴侶'}
            </h3>
            <button
              onClick={() => setShowAuthModal(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === 'login' ? (
              <>
                <div>
                  <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 mb-2">
                    電子郵件
                  </label>
                  <input
                    id="auth-email"
                    name="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                    placeholder="輸入你的電子郵件"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-2">
                    密碼
                  </label>
                  <input
                    id="auth-password"
                    name="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                    placeholder="輸入你的密碼"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label htmlFor="auth-nickname" className="block text-sm font-medium text-gray-700 mb-2">
                    暱稱
                  </label>
                  <input
                    id="auth-nickname"
                    name="auth-nickname"
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                    placeholder="輸入你的暱稱"
                    required
                  />
                </div>
              </>
            ) : authMode === 'register' ? (
              <>
                <div>
                  <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 mb-2">
                    電子郵件
                  </label>
                  <input
                    id="auth-email"
                    name="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                    placeholder="輸入你的電子郵件"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="auth-nickname" className="block text-sm font-medium text-gray-700 mb-2">
                    暱稱
                  </label>
                  <input
                    id="auth-nickname"
                    name="auth-nickname"
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                    placeholder="輸入你的暱稱"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-2">
                    密碼
                  </label>
                  <input
                    id="auth-password"
                    name="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                    placeholder="輸入你的密碼"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label htmlFor="auth-confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                    確認密碼
                  </label>
                  <input
                    id="auth-confirm-password"
                    name="auth-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                    placeholder="再次輸入密碼"
                    required
                    minLength={6}
                  />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="partner-code" className="block text-sm font-medium text-gray-700 mb-2">
                  伴侶配對碼
                </label>
                <input
                  id="partner-code"
                  name="partner-code"
                  type="text"
                  value={partnerCode}
                  onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  placeholder="輸入伴侶的配對碼"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-pink-500 to-rose-600 text-white py-3 rounded-lg hover:from-pink-600 hover:to-rose-700 transition-colors"
            >
              {authMode === 'login' ? '開始愛的旅程' : 
               authMode === 'register' ? '註冊帳號' : '連接伴侶'}
            </button>
          </form>

          <div className="mt-4 text-center space-y-2">
            {authMode === 'login' && (
              <>
                <button
                  onClick={() => setAuthMode('register')}
                  className="text-pink-600 hover:text-pink-700 text-sm block w-full"
                >
                  還沒帳號？立即註冊
                </button>
                <button
                  onClick={() => setAuthMode('partner')}
                  className="text-pink-600 hover:text-pink-700 text-sm block w-full"
                >
                  已有帳號？連接伴侶
                </button>
              </>
            )}
            {authMode === 'register' && (
              <button
                onClick={() => setAuthMode('login')}
                className="text-pink-600 hover:text-pink-700 text-sm block w-full"
              >
                已有帳號？立即登入
              </button>
            )}
            {authMode === 'partner' && (
              <button
                onClick={() => setAuthMode('login')}
                className="text-pink-600 hover:text-pink-700 text-sm block w-full"
              >
                還沒帳號？立即註冊
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Coin Shop Component
  const CoinShopView = () => {
    const [showAddGiftModal, setShowAddGiftModal] = useState(false);
    const [newGift, setNewGift] = useState({
      title: '',
      description: '',
      cost: 1000,
      category: 'service' as CoinGift['category'],
      icon: '🎁'
    });

    const allGifts = [...defaultGifts, ...customGifts];

    const handleAddGift = (e: React.FormEvent) => {
      e.preventDefault();
      addCustomGift(newGift.title, newGift.description, newGift.cost, newGift.category, newGift.icon);
      setNewGift({ title: '', description: '', cost: 1000, category: 'service', icon: '🎁' });
    };

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-yellow-500 to-orange-600 text-white p-6 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2 flex items-center">
                <ShoppingBag className="mr-2" />
                金幣商店
              </h2>
              <p className="text-yellow-100">用愛賺來的金幣兌換特別禮品</p>
            </div>
            <div className="text-right">
              <div className="flex items-center space-x-2 bg-white bg-opacity-20 px-4 py-2 rounded-full mb-2">
                <Coins className="w-5 h-5" />
                <span className="font-bold text-xl">{totalCoins}</span>
              </div>
              <button
                onClick={() => setShowAddGiftModal(true)}
                className="bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1 rounded-full text-sm flex items-center space-x-1"
              >
                <Plus className="w-4 h-4" />
                <span>自訂禮品</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allGifts.map((gift) => (
            <div key={gift.id} className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">{gift.icon}</div>
                <h3 className="text-lg font-bold text-gray-800">{gift.title}</h3>
                <p className="text-gray-600 text-sm">{gift.description}</p>
              </div>
              
              <div className="flex items-center justify-between mb-4">
                <span className={`px-2 py-1 rounded-full text-xs ${
                  gift.category === 'service' ? 'bg-blue-100 text-blue-800' :
                  gift.category === 'experience' ? 'bg-green-100 text-green-800' :
                  gift.category === 'physical' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-pink-100 text-pink-800'
                }`}>
                  {gift.category === 'service' ? '服務' :
                   gift.category === 'experience' ? '體驗' :
                   gift.category === 'physical' ? '實物' : '親密'}
                </span>
                <div className="flex items-center space-x-1 text-yellow-600">
                  <Coins className="w-4 h-4" />
                  <span className="font-bold">{gift.cost}</span>
                </div>
              </div>

              <button
                onClick={() => purchaseGift(gift)}
                disabled={totalCoins < gift.cost}
                className={`w-full py-3 rounded-lg font-medium transition-colors ${
                  totalCoins >= gift.cost
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-600 text-white hover:from-yellow-600 hover:to-orange-700'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {totalCoins >= gift.cost ? '立即兌換' : '金幣不足'}
              </button>
            </div>
          ))}
        </div>

        {/* Add Custom Gift Modal */}
        {showAddGiftModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-yellow-700">添加自訂禮品</h3>
                <button
                  onClick={() => setShowAddGiftModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleAddGift} className="space-y-4">
                <div>
                  <label htmlFor="gift-title" className="block text-sm font-medium text-gray-700 mb-2">
                    禮品名稱
                  </label>
                  <input
                    id="gift-title"
                    name="gift-title"
                    type="text"
                    value={newGift.title}
                    onChange={(e) => setNewGift(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    placeholder="例如：按摩服務"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="gift-description" className="block text-sm font-medium text-gray-700 mb-2">
                    描述
                  </label>
                  <textarea
                    id="gift-description"
                    name="gift-description"
                    value={newGift.description}
                    onChange={(e) => setNewGift(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    placeholder="詳細描述這個禮品"
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="gift-cost" className="block text-sm font-medium text-gray-700 mb-2">
                      金幣價格
                    </label>
                    <input
                      id="gift-cost"
                      name="gift-cost"
                      type="number"
                      value={newGift.cost}
                      onChange={(e) => setNewGift(prev => ({ ...prev, cost: parseInt(e.target.value) }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                      min="100"
                      step="100"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="gift-icon" className="block text-sm font-medium text-gray-700 mb-2">
                      圖示
                    </label>
                    <input
                      id="gift-icon"
                      name="gift-icon"
                      type="text"
                      value={newGift.icon}
                      onChange={(e) => setNewGift(prev => ({ ...prev, icon: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                      placeholder="🎁"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="gift-category" className="block text-sm font-medium text-gray-700 mb-2">
                    類別
                  </label>
                  <select
                    id="gift-category"
                    name="gift-category"
                    value={newGift.category}
                    onChange={(e) => setNewGift(prev => ({ ...prev, category: e.target.value as CoinGift['category'] }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    required
                  >
                    <option value="service">服務</option>
                    <option value="experience">體驗</option>
                    <option value="physical">實物</option>
                    <option value="intimate">親密</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 text-white py-3 rounded-lg hover:from-yellow-600 hover:to-orange-700 transition-colors"
                >
                  添加禮品
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Script Upload Modal Component
  const ScriptUploadModal = () => {
    const [scriptData, setScriptData] = useState({
      title: '',
      category: 'romantic' as 'romantic' | 'adventurous',
      scenario: '',
      content: '',
      tags: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const tags = scriptData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      addCustomScript(scriptData.title, scriptData.category, scriptData.scenario, scriptData.content, tags);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-pink-700">上傳自訂劇本</h3>
            <button
              onClick={() => setShowScriptUploadModal(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2">劇本格式說明：</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• 使用 [男] 或 [partner1] 代表第一個伴侶</li>
              <li>• 使用 [女] 或 [partner2] 代表第二個伴侶</li>
              <li>• 每行對話格式：角色名: 對話內容</li>
              <li>• 系統會自動替換為你們的暱稱</li>
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="script-title" className="block text-sm font-medium text-gray-700 mb-2">
                  劇本標題
                </label>
                <input
                  id="script-title"
                  name="script-title"
                  type="text"
                  value={scriptData.title}
                  onChange={(e) => setScriptData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  placeholder="例如：浪漫晚餐"
                  required
                />
              </div>

              <div>
                <label htmlFor="script-category" className="block text-sm font-medium text-gray-700 mb-2">
                  類別
                </label>
                <select
                  id="script-category"
                  name="script-category"
                  value={scriptData.category}
                  onChange={(e) => setScriptData(prev => ({ ...prev, category: e.target.value as 'romantic' | 'adventurous' }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                  required
                >
                  <option value="romantic">浪漫</option>
                  <option value="adventurous">冒險</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="script-scenario" className="block text-sm font-medium text-gray-700 mb-2">
                情境描述
              </label>
              <input
                id="script-scenario"
                name="script-scenario"
                type="text"
                value={scriptData.scenario}
                onChange={(e) => setScriptData(prev => ({ ...prev, scenario: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder="簡短描述這個劇本的情境"
                required
              />
            </div>

            <div>
              <label htmlFor="script-content" className="block text-sm font-medium text-gray-700 mb-2">
                劇本內容
              </label>
              <textarea
                id="script-content"
                name="script-content"
                value={scriptData.content}
                onChange={(e) => setScriptData(prev => ({ ...prev, content: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder="[男]: 今晚的月色真美&#10;[女]: 是啊，就像你的眼睛一樣..."
                rows={10}
                required
              />
            </div>

            <div>
              <label htmlFor="script-tags" className="block text-sm font-medium text-gray-700 mb-2">
                標籤 (用逗號分隔)
              </label>
              <input
                id="script-tags"
                name="script-tags"
                type="text"
                value={scriptData.tags}
                onChange={(e) => setScriptData(prev => ({ ...prev, tags: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                placeholder="浪漫, 晚餐, 月光"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-pink-500 to-rose-600 text-white py-3 rounded-lg hover:from-pink-600 hover:to-rose-700 transition-colors"
            >
              上傳劇本 (+200 金幣)
            </button>
          </form>
        </div>
      </div>
    );
  };

  // Foreplay View Component
  const ForeplayView = () => {
    const [selectedActivity, setSelectedActivity] = useState<ForeplayActivity | null>(null);
    const [selectedPosition, setSelectedPosition] = useState<PositionSuggestion | null>(null);

    const handleTryActivity = (activity: ForeplayActivity) => {
      const coinsEarned = activity.coins;
      setTotalCoins(prev => prev + coinsEarned);
      
      showNotification({
        type: 'success',
        title: `已嘗試 ${activity.title}！`,
        message: '記得稍後記錄你們的親密時光',
        coins: coinsEarned,
        duration: 4000
      });
    };

    const handleTryPosition = (position: PositionSuggestion) => {
      const coinsEarned = position.coins;
      setTotalCoins(prev => prev + coinsEarned);
      
      showNotification({
        type: 'success',
        title: `已嘗試 ${position.name}！`,
        message: '記得稍後記錄你們的親密時光',
        coins: coinsEarned,
        duration: 4000
      });
    };

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-pink-500 to-rose-600 text-white p-6 rounded-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2 flex items-center">
                <Sparkles className="mr-2" />
                前戲與探索
              </h2>
              <p className="text-pink-100">增進親密感的活動和建議</p>
            </div>
            <div className="flex items-center space-x-2 bg-white bg-opacity-20 px-4 py-2 rounded-full">
              <Coins className="w-5 h-5" />
              <span className="font-bold">{totalCoins}</span>
            </div>
          </div>
        </div>

        {/* Foreplay Activities */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">前戲活動</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {foreplayActivities.map((activity, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="text-lg font-semibold text-pink-700">{activity.title}</h4>
                  <div className="flex items-center space-x-1 text-yellow-600">
                    <Coins className="w-4 h-4" />
                    <span className="font-bold">+{activity.coins}</span>
                  </div>
                </div>
                <p className="text-gray-600 mb-3">{activity.description}</p>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-500 flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {activity.duration}
                  </span>
                  <button
                    onClick={() => handleTryActivity(activity)}
                    className="bg-gradient-to-r from-pink-500 to-rose-600 text-white px-4 py-2 rounded-full hover:from-pink-600 hover:to-rose-700 transition-colors flex items-center space-x-2"
                  >
                    <Play className="w-4 h-4" />
                    <span>嘗試</span>
                  </button>
                </div>
                <button
                  onClick={() => setSelectedActivity(activity)}
                  className="text-pink-600 text-sm hover:text-pink-700"
                >
                  查看詳細提示 →
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Position Suggestions */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">姿勢建議</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {positionSuggestions.map((position, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-lg font-semibold text-pink-700">{position.name}</h4>
                  <div className="flex items-center space-x-1 text-yellow-600">
                    <Coins className="w-4 h-4" />
                    <span className="font-bold">+{position.coins}</span>
                  </div>
                </div>
                <div className="mb-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    position.difficulty === '簡單' ? 'bg-green-100 text-green-800' :
                    position.difficulty === '中等' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {position.difficulty}
                  </span>
                </div>
                <p className="text-gray-600 text-sm mb-3">{position.description}</p>
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setSelectedPosition(position)}
                    className="text-pink-600 text-sm hover:text-pink-700"
                  >
                    詳細資訊
                  </button>
                  <button
                    onClick={() => handleTryPosition(position)}
                    className="bg-gradient-to-r from-pink-500 to-rose-600 text-white px-3 py-1 rounded-full text-sm hover:from-pink-600 hover:to-rose-700 transition-colors"
                  >
                    嘗試
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Detail Modal */}
        {selectedActivity && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-pink-700">{selectedActivity.title}</h3>
                <button
                  onClick={() => setSelectedActivity(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-gray-600 mb-4">{selectedActivity.description}</p>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-800 mb-2">實用提示：</h4>
                <ul className="space-y-1">
                  {selectedActivity.tips.map((tip: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <span className="text-pink-500 mr-2">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => {
                  handleTryActivity(selectedActivity);
                  setSelectedActivity(null);
                }}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-600 text-white py-3 rounded-lg hover:from-pink-600 hover:to-rose-700 transition-colors"
              >
                開始嘗試
              </button>
            </div>
          </div>
        )}

        {/* Position Detail Modal */}
        {selectedPosition && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-pink-700">{selectedPosition.name}</h3>
                <button
                  onClick={() => setSelectedPosition(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-gray-600 mb-4">{selectedPosition.description}</p>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-800 mb-2">優點：</h4>
                <ul className="space-y-1">
                  {selectedPosition.benefits.map((benefit: string, index: number) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start">
                      <span className="text-pink-500 mr-2">•</span>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => {
                  handleTryPosition(selectedPosition);
                  setSelectedPosition(null);
                }}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-600 text-white py-3 rounded-lg hover:from-pink-600 hover:to-rose-700 transition-colors"
              >
                嘗試這個姿勢
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleNicknameChange = useCallback((partner: 'partner1' | 'partner2', value: string) => {
    setNicknames(prev => ({...prev, [partner]: value}));
  }, []);

  // SettingsView component moved to separate file

  // Our Journey View
  const OurJourneyView = () => {
    const sortedMilestones = [...journeyMilestones].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const handleMilestoneClick = (milestone: JourneyMilestone) => {
      if (milestone.recordId) {
        // Find and highlight the specific record
        const record = intimateRecords.find(r => r.id === milestone.recordId);
        if (record) {
          setCurrentView('calendar');
          // Could add more specific navigation logic here
        }
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-6 rounded-2xl">
          <h2 className="text-2xl font-bold mb-2">我們的愛情旅程</h2>
          <p className="text-emerald-100">記錄每個重要的時刻和里程碑</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-pink-500 to-purple-600"></div>
            
            <div className="space-y-8">
              {sortedMilestones.map((milestone) => (
                <div key={milestone.id} className="relative flex items-start space-x-6">
                  {/* Timeline Node */}
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold relative z-10 ${
                    milestone.type === 'meeting' ? 'bg-gradient-to-br from-pink-500 to-rose-600' :
                    milestone.type === 'first_date' ? 'bg-gradient-to-br from-purple-500 to-indigo-600' :
                    milestone.type === 'first_kiss' ? 'bg-gradient-to-br from-teal-500 to-cyan-600' :
                    milestone.type === 'first_sex' ? 'bg-gradient-to-br from-pink-500 to-purple-600' :
                    milestone.type === 'marriage' ? 'bg-gradient-to-br from-orange-500 to-red-600' :
                    milestone.type === 'child_born' ? 'bg-gradient-to-br from-green-500 to-teal-600' :
                    'bg-gradient-to-br from-blue-500 to-indigo-600'
                  }`}>
                    {milestone.type === 'meeting' ? '💕' :
                     milestone.type === 'first_date' ? '🌹' :
                     milestone.type === 'first_kiss' ? '💋' :
                     milestone.type === 'first_sex' ? '💋' :
                     milestone.type === 'marriage' ? '👫' :
                     milestone.type === 'child_born' ? '👶' :
                     '🏆'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 bg-gray-50 rounded-lg p-6">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">{milestone.title}</h3>
                        <p className="text-sm text-gray-500">{milestone.date}</p>
                      </div>
                      {milestone.count && (
                        <span className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                          第 {milestone.count} 次
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 mb-4">{milestone.description}</p>
                    
                    {milestone.recordId && (
                      <button
                        onClick={() => handleMilestoneClick(milestone)}
                        className="inline-flex items-center text-pink-600 hover:text-pink-700 font-medium text-sm"
                      >
                        <Heart className="w-4 h-4 mr-1" />
                        查看詳細記錄
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Future Milestones Preview */}
            <div className="mt-8 p-6 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg border-2 border-dashed border-pink-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <Sparkles className="w-5 h-5 mr-2 text-pink-500" />
                即將到來的里程碑
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { count: 10, achieved: intimateRecords.length >= 10 },
                  { count: 20, achieved: intimateRecords.length >= 20 },
                  { count: 50, achieved: intimateRecords.length >= 50 },
                  { count: 100, achieved: intimateRecords.length >= 100 }
                ].map(({ count, achieved }) => (
                  <div key={count} className={`p-4 rounded-lg border-2 ${
                    achieved 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-gray-200 bg-white'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">第 {count} 次親密時光</span>
                      {achieved ? (
                        <span className="text-green-600 font-bold">✓ 已達成</span>
                      ) : (
                        <span className="text-gray-500">
                          還需 {count - intimateRecords.length} 次
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const navItems = [
    { id: 'foreplay', label: '前戲探索', icon: Sparkles },
    { id: 'record', label: '記錄時光', icon: Calendar },
    { id: 'achievements', label: '親密統計', icon: Trophy },
    { id: 'shop', label: '金幣商店', icon: ShoppingBag },
    { id: 'games', label: '情趣遊戲', icon: Gamepad2 },
    { id: 'conflict', label: '和諧相處', icon: MessageCircle },
    { id: 'roleplay', label: '角色扮演', icon: Play },
    { id: 'journey', label: '愛情旅程', icon: Trophy },
    { id: 'settings', label: '設定', icon: Heart }
  ];

  const renderView = () => {
    // Show login prompt for private content when not authenticated
    if (!authState.isAuthenticated) {
      switch (currentView) {
        case 'settings': return <SettingsView 
          nicknames={nicknames}
          handleNicknameChange={handleNicknameChange}
          journeyMilestones={journeyMilestones}
          setJourneyMilestones={setJourneyMilestones}
          authState={authState}
          setShowAuthModal={setShowAuthModal}
          onAuthStateUpdate={setAuthState}
        />;
        default: return (
          <div className="flex items-center justify-center min-h-64">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">歡迎使用 Twogether</h2>
              <p className="text-gray-600 mb-6">登入以開始記錄你們的愛情時光</p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-6 py-3 rounded-lg hover:shadow-lg transition-colors"
              >
                立即登入
              </button>
            </div>
          </div>
        );
      }
    }

    // Show authenticated content
    switch (currentView) {
      case 'foreplay': return <ForeplayView />;
      case 'record': return <CalendarView />;
      case 'achievements': return <AchievementsView />;
      case 'shop': return <CoinShopView />;
      case 'games': return <GamesView />;
      case 'conflict': return <ConflictView />;
      case 'roleplay': return <RoleplayView 
        defaultRoleplayScripts={defaultRoleplayScripts}
        customScripts={customScripts}
        roleplayFilter={roleplayFilter}
        setRoleplayFilter={setRoleplayFilter}
        setShowScriptUploadModal={setShowScriptUploadModal}
        parseScriptContent={parseScriptContent}
        addIntimateRecord={addIntimateRecord}
      />;
      case 'journey': return <OurJourneyView />;
      case 'settings': return <SettingsView 
        nicknames={nicknames}
        handleNicknameChange={handleNicknameChange}
        journeyMilestones={journeyMilestones}
        setJourneyMilestones={setJourneyMilestones}
        authState={authState}
        setShowAuthModal={setShowAuthModal}
        onAuthStateUpdate={setAuthState}
      />;
      default: return <ForeplayView />;
    }
  };

  const closeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Calendar component for date picking
  const CalendarDatePicker = ({ selectedDate, onDateSelect }: { selectedDate: string, onDateSelect: (date: string) => void }) => {
    const [currentMonth, setCurrentMonth] = useState(() => {
      const date = selectedDate ? new Date(selectedDate) : new Date();
      return new Date(date.getFullYear(), date.getMonth(), 1);
    });

    const getDaysInMonth = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDayOfWeek = firstDay.getDay();

      const days = [];
      
      // Previous month's trailing days
      for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const day = new Date(year, month, -i);
        days.push({ date: day, isCurrentMonth: false });
      }
      
      // Current month's days
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        days.push({ date, isCurrentMonth: true });
      }
      
      // Next month's leading days
      const remainingDays = 42 - days.length; // 6 rows × 7 days
      for (let day = 1; day <= remainingDays; day++) {
        const date = new Date(year, month + 1, day);
        days.push({ date, isCurrentMonth: false });
      }
      
      return days;
    };

    const formatDate = (date: Date) => {
      return date.toISOString().split('T')[0];
    };

    const isSelected = (date: Date) => {
      return formatDate(date) === selectedDate;
    };

    const isToday = (date: Date) => {
      const today = new Date();
      return date.toDateString() === today.toDateString();
    };

    const days = getDaysInMonth(currentMonth);
    const monthYear = currentMonth.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });

    return (
      <div className="bg-white rounded-lg p-4 border">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="p-2 hover:bg-gray-100 rounded"
          >
            ‹
          </button>
          <h3 className="font-semibold text-gray-800">{monthYear}</h3>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="p-2 hover:bg-gray-100 rounded"
          >
            ›
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {days.map((dayInfo, index) => {
            const { date, isCurrentMonth } = dayInfo;
            const selected = isSelected(date);
            const today = isToday(date);
            
            return (
              <button
                key={index}
                onClick={() => onDateSelect(formatDate(date))}
                className={`
                  p-2 text-sm rounded hover:bg-gray-100 transition-colors
                  ${isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}
                  ${selected ? 'bg-pink-500 text-white hover:bg-pink-600' : ''}
                  ${today && !selected ? 'bg-blue-100 text-blue-600' : ''}
                `}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-50 to-indigo-100">
      {/* Header */}
      <Header
        authState={authState}
        totalCoins={totalCoins}
        onShowAuthModal={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />
      
      {/* Notification Container */}
      <NotificationContainer 
        notifications={notifications}
        onClose={closeNotification}
      />
      
      <div className="container mx-auto px-4 py-8">
        {/* Tagline */}
        <div className="text-center mb-8">
          <p className="text-gray-600">為熱戀中的你們，記錄每一段親密時光</p>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all ${
                  currentView === item.id
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg'
                    : 'bg-white text-gray-600 hover:bg-pink-50 hover:text-pink-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto">
          {renderView()}
        </div>
      </div>
      
      {/* Modals */}
      {showAuthModal && <AuthModal />}
      {showScriptUploadModal && <ScriptUploadModal />}

      {/* Record Detail Modal */}
      {showRecordDetail && selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-800">親密時光詳情</h3>
                <button
                  onClick={() => setShowRecordDetail(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                {/* Basic Info */}
                <div className="flex items-center space-x-4">
                  <div className="text-4xl">{selectedRecord.mood}</div>
                  <div>
                    <div className="text-xl font-medium text-gray-800">
                      {selectedRecord.date} {selectedRecord.time}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(selectedRecord.timestamp).toLocaleString('zh-TW')}
                    </div>
                  </div>
                </div>

                {/* Photo */}
                {selectedRecord.photo && (
                  <div className="text-center">
                    <img 
                      src={selectedRecord.photo} 
                      alt="記憶照片" 
                      className="max-w-full max-h-96 rounded-lg mx-auto shadow-lg"
                    />
                  </div>
                )}

                {/* Description */}
                {selectedRecord.description && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">描述</h4>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">
                      {selectedRecord.description}
                    </p>
                  </div>
                )}

                {/* Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedRecord.duration && (
                    <div className="flex items-center space-x-2">
                      <Clock className="w-5 h-5 text-pink-500" />
                      <span className="text-gray-700">持續時間: {selectedRecord.duration}</span>
                    </div>
                  )}
                  {selectedRecord.location && (
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-5 h-5 text-pink-500" />
                      <span className="text-gray-700">地點: {selectedRecord.location}</span>
                    </div>
                  )}
                  {selectedRecord.roleplayScript && (
                    <div className="flex items-center space-x-2">
                      <Play className="w-5 h-5 text-purple-500" />
                      <span className="text-gray-700">劇本: {selectedRecord.roleplayScript}</span>
                    </div>
                  )}
                  {selectedRecord.coinsEarned && (
                    <div className="flex items-center space-x-2">
                      <Coins className="w-5 h-5 text-yellow-500" />
                      <span className="text-gray-700">獲得金幣: {selectedRecord.coinsEarned}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedRecord.notes && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">備註</h4>
                    <p className="text-gray-700 bg-pink-50 p-3 rounded-lg italic">
                      "{selectedRecord.notes}"
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

export default LoveTimeApp;
