import axios from 'axios';
import { formatYmdInTz, browserTz } from '../utils/datetime';
import { setLastRequestId } from '../utils/telemetry';

// API Configuration - Always use relative URLs for single server
const API_BASE_URL = '/api';

// Types
interface IntimateRecord {
  id: number;
  apiId?: string;
  date: string;
  time: string;
  mood: string;
  notes?: string;
  timestamp: string;
  photo?: string;      // display URL
  photoId?: string;    // photos.id, persisted so the record keeps its photo
  description?: string;
  duration?: string;
  location?: string;
  roleplayScript?: string;
  coinsEarned?: number;
  activityType?: string;
}

interface ApiIntimateRecord {
  id?: string | number;
  moment_date?: string;
  notes?: string;
  created_at?: string;
  photo_url?: string;
  photo_id?: string;
  description?: string;
  duration?: string;
  location?: string;
  roleplay_script?: string;
  coins_earned?: number;
  activity_type?: string;
}

export interface CycleRecord {
  id: string;
  trackedBy: string;
  startDate: string;        // YYYY-MM-DD
  lengthDays: number;
  notes?: string;
  createdAt: string;
}

export type ActivityType =
  | 'love_moment' | 'custom_script' | 'wall_post' | 'event'
  | 'achievement' | 'coins' | 'checkin';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  actorNickname: string | null; // null for couple/system rows (coins, achievements)
  isSelf: boolean;
  description: string;
  date: string;                 // ISO timestamp
}

interface ApiCycleRecord {
  id: string;
  tracked_by: string;
  start_date: string;
  length_days: number;
  notes?: string;
  created_at: string;
  updated_at?: string;
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
  firstDate?: string;
  firstKissDate?: string;
  firstMeetDate?: string;
  firstKissPlace?: string;
  firstIntimacyDate?: string;
  firstIntimacyPlace?: string;
  user1Nickname: string;
  user2Nickname?: string;
  user1Timezone?: string;
  user2Timezone?: string;
  primaryTimezone?: string;
  createdAt: string;
  pairingCode?: string;
  user1Id?: string;
  user2Id?: string;
  isComplete?: boolean;
  waitingForPartner?: boolean;
  error_code?: string;
  pendingConflicts?: Record<string, { inviter: string; accepter: string }>;
}

interface PairingCodeResponse {
  code: string;
  expiresAt: string;
  token?: string;
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
    token?: string;
    shortCode?: string;
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
  autoResolved?: boolean;
  pendingConflicts?: Record<string, { inviter: string; accepter: string }>;
}

interface ApiError {
  message?: string;
  error?: string | { message?: string; code?: string };
  error_code?: string;
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
  senderId?: string;
  receiverId?: string;
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

// AI-generated roleplay invitation messages for a chosen script.
type RoleplayMessageLevel = 'normal' | 'mild' | 'moderate' | 'explicit' | 'intense';

interface RoleplayMessageSuggestion {
  level: RoleplayMessageLevel;
  label: string;
  text: string;
}

interface GenerateRoleplayMessagesInput {
  scriptId?: string;
  scriptTitle: string;
  scriptScenario?: string;
  scriptBody?: string;
  category?: string;
  regenerate?: boolean;
}

interface RoleplayMessagesResult {
  summary: string;
  messages: RoleplayMessageSuggestion[];
  cached?: boolean;
}

// Reconciliation openers — neutral, face-saving ice-breaker lines generated
// for the "真心和解" flow at a chosen intensity (low → high).
export type ReconciliationIntensity = 'goodwill' | 'reflect' | 'talk';

export interface ReconciliationOpener {
  label: string;
  text: string;
}

interface RoleplayMessageFeedbackInput {
  scriptId?: string;
  scriptTitle?: string;
  level?: string;
  messageText?: string;
  rating: 'up' | 'down';
  feedbackText?: string;
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

interface IntimacyRequestPeriodStats {
  accepted: number;
  rejected: number;
  unanswered: number;
}

type IntimacyRequestNudgeReason = 'rejected' | 'unanswered' | 'rejected_and_unanswered' | null;

interface IntimacyRequestNudge {
  shouldNudge: boolean;
  reason: IntimacyRequestNudgeReason;
  message: string | null;
}

interface IntimacyRequestStats {
  week: IntimacyRequestPeriodStats;
  month: IntimacyRequestPeriodStats;
}

interface IntimacyRequestStatsResponse {
  statistics: IntimacyRequestStats;
  nudge: IntimacyRequestNudge;
}

interface Notification {
  id: string;
  notificationType: string;
  title: string;
  content: string;
  intimacyRequestId?: string;
  eventId?: string;
  relatedUserNickname?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  priority: number;
}

// Event × Icebreaker feature
export type EventVersionKey = 'neutral' | 'firm' | 'warm';
export type EventStatus = 'open' | 'resolve_pending' | 'resolved';

export interface EventVersions {
  neutral: string;
  firm: string;
  warm: string;
}

export interface IcebreakerPreview {
  title: string;
  summary: string;
  emotions: string[];
  tags: string[];
  toxicityFlags: string[];
  versions: EventVersions;
}

export interface ReplyRewritePreview {
  versions: EventVersions;
  toxicityFlags: string[];
}

// One ready-to-send "接住情緒" (receive/validate the partner's emotion) response.
export interface EmotionAcceptance {
  label: string;
  text: string;
}

// AI coaching for the receiver: a short empathy note (help them SEE the feeling)
// plus three validating responses they can send.
export interface EmotionAcceptancePreview {
  empathy: string;
  acceptances: EmotionAcceptance[];
  toxicityFlags: string[];
}

export interface EventMessage {
  id: string;
  eventId: string;
  senderId: string;
  content: string;
  isAi: boolean;
  createdAt: string;
  readAt: string | null;
}

// 婚姻檢查 (Marriage Check-up)
export interface MarriageCheckupAnswers {
  scores: Record<string, number>;
  notes: Record<string, string>;
  gratitude: string;
  attention: string;
}

export interface MarriageCheckup {
  id: string;
  status: 'collecting' | 'revealed';
  createdBy: string;
  createdAt: string;
  revealedAt: string | null;
  mySubmitted: boolean;
  partnerSubmitted: boolean;
  myAnswers: MarriageCheckupAnswers | null;
  partnerAnswers: MarriageCheckupAnswers | null;
  aiSummary: string;
  aiPoints: string[];
}

export interface MarriageCheckupHistoryItem {
  id: string;
  status: string;
  createdAt: string;
  revealedAt: string | null;
  aiSummary: string;
}

export interface EventRecord {
  id: string;
  coupleId: string;
  createdBy: string;
  title: string;
  summary: string;
  emotions: string[];
  tags: string[];
  toxicityFlags: string[];
  versions: EventVersions;
  selectedVersion: EventVersionKey | null;
  status: EventStatus;
  isPrivate: boolean;
  publicStatus: 'private' | 'published';
  publicTitle: string | null;
  resolveRequestedBy: string | null;
  resolveRequestedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastMessagePreview: string | null;
  messages: EventMessage[];
}

export interface CreateEventInput {
  title: string;
  summary: string;
  emotions: string[];
  tags: string[];
  toxicityFlags: string[];
  versions: EventVersions;
  selectedVersion: EventVersionKey | null;
  isPrivate: boolean;
}

export interface EventListFilters {
  status?: EventStatus | 'all';
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface EventAnalyticsData {
  counts: { last7: number; last30: number };
  resolutionRate: number;
  avgResolutionHours: number | null;
  tagDistribution: { tag: string; count: number }[];
  emotionDistribution: { emotion: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
  hotspotHours: { hour: number; count: number }[];
}

export type WallPostCategory = 'important' | 'general';

export interface WallPost {
  id: string;
  content: string;
  mood_tag: string | null;
  category: WallPostCategory;
  author_id: string;
  author_nickname: string | null;
  reply_count: number;
  public_status?: 'private' | 'published';
  public_title?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WallReply {
  id: string;
  post_id: string;
  content: string;
  author_id: string;
  author_nickname: string | null;
  is_ai?: boolean;
  created_at: string;
}

export interface CreateWallPostInput {
  content: string;
  mood_tag?: string | null;
  category?: WallPostCategory;
}

export interface UpdateWallPostInput {
  content?: string;
  mood_tag?: string | null;
  category?: WallPostCategory;
}

// Marketplace — public custom-script discovery + community rating
export type ScriptCategory = 'romantic' | 'adventurous' | 'school' | 'bold';
export type ScriptReportReason = 'inappropriate' | 'spam' | 'copyright' | 'other';

export interface MarketplaceScript {
  id: string;
  title: string;
  category: ScriptCategory;
  scenario: string;
  script: string;
  tags: string[];
  duration: string;
  thumbnailUrl?: string | null;
  authorId: string;
  authorName: string;
  avgStars: number;
  ratingCount: number;
  isPublic: boolean;
  isCustom: true;
  createdAt: string;
  updatedAt?: string;
}

export interface MarketplaceScriptDetail extends MarketplaceScript {
  myRating: { stars: number; reviewText: string | null } | null;
  isFavorited: boolean;
  isAuthor: boolean;
}

export interface ScriptRatingEntry {
  id: string;
  stars: number;
  reviewText: string | null;
  userId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

// Auth storage keys — keep in sync with reads in App.tsx.
const AUTH_STORAGE_KEYS = ['authToken', 'authUser', 'authState', 'authTokenExpiresAt'] as const;

export const clearAuthStorage = (): void => {
  AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
};

export type SessionExpiredReason = 'expired' | 'invalid' | 'manual';

// Module-level guard so we only dispatch the expiration event once per
// "logged-in session". A burst of parallel requests (each returning 401) would
// otherwise trigger the redirect handler N times.
let sessionExpiredDispatched = false;

export const dispatchSessionExpired = (reason: SessionExpiredReason): void => {
  if (sessionExpiredDispatched) return;
  sessionExpiredDispatched = true;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { reason } }));
  }
};

// Called by the auth flow after a successful login/register so the next
// expiration can be detected.
export const resetSessionExpiredGuard = (): void => {
  sessionExpiredDispatched = false;
};

// Freemium: error_codes the backend returns (429) when a free couple hits a
// usage cap. The response interceptor turns any of these into a global
// `billing:limit-reached` event so the app can surface the upgrade paywall
// uniformly, no matter which feature triggered it.
export const BILLING_LIMIT_CODES = new Set([
  'AI_DAILY_LIMIT_REACHED',
  'SCRIPT_LIMIT_REACHED',
  'PHOTO_LIMIT_REACHED',
]);

export interface BillingPlan {
  id: 'pass_30' | 'pass_90' | 'pass_365';
  days: number;
  amount: number;
  label: string;
}

export interface BillingStatus {
  tier: 'free' | 'premium';
  expiresAt: string | null;
  hasCouple: boolean;
  plans: BillingPlan[];
}

// Which Taiwanese payment gateway to route a checkout through.
export type PaymentProvider = 'ecpay' | 'newebpay';

// Builds a hidden form and POSTs it to the gateway's hosted checkout — a
// full-page navigation, exactly how both ECPay and NewebPay expect the redirect.
export const submitGatewayForm = (actionUrl: string, params: Record<string, string>): void => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  form.style.display = 'none';
  Object.entries(params).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
};

// Returns the unix-ms timestamp at which the current token expires, or null
// if no token is stored or the expiry can't be determined. Prefers the
// authoritative `authTokenExpiresAt` value set at login; falls back to
// decoding the JWT payload for already-logged-in clients that pre-date this
// change.
export const getTokenExpiry = (): number | null => {
  const stored = localStorage.getItem('authTokenExpiresAt');
  if (stored) {
    const ms = Date.parse(stored);
    if (!Number.isNaN(ms)) return ms;
  }
  const token = localStorage.getItem('authToken');
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    // base64url → base64
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    ) as { exp?: number };
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch {
    return null;
  }
  return null;
};

// Enhanced API Client with error handling
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Reject anything that isn't shaped like a JWT before it can poison
// localStorage and trigger the malformed-token 403/401 loop on every
// subsequent request. Also persists the server-supplied expiry so the
// proactive-logout timer in App.tsx doesn't need to decode the JWT.
function persistAuth(token: unknown, user: unknown, tokenExpiresAt?: unknown): void {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('登錄失敗：伺服器回傳的憑證格式異常');
  }
  localStorage.setItem('authToken', token);
  localStorage.setItem('authUser', JSON.stringify(user));
  if (typeof tokenExpiresAt === 'string' && tokenExpiresAt.length > 0) {
    localStorage.setItem('authTokenExpiresAt', tokenExpiresAt);
  }
  resetSessionExpiredGuard();
}

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
    setLastRequestId(response.headers?.['x-request-id']);
    console.log(`API Response: ${response.status} ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
    setLastRequestId(error.response?.headers?.['x-request-id']);
    console.error('API Error:', error);

    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      // Extract error message from nested structure
      const errorMessage = data?.error?.message || data?.message || data?.error || '未知錯誤';
      const errorCode = data?.error_code || data?.error?.code || data?.error?.error_code;
      const requestUrl = error.config?.url || '';
      
      // Treat these error codes as "the session is no longer valid, send the
      // user back to login" regardless of whether the status is 401 or 403.
      // The backend (middleware/auth.js) uses 401 for "no/invalid token" and
      // 403 for "jwt.verify failed (expired/malformed)".
      const sessionExpiredCodes = new Set(['TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_MISSING']);
      const isAuthEndpoint = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

      // Handle specific error cases
      if (status === 401) {
        // Check if this is a login/register request - don't clear tokens for these
        if (isAuthEndpoint) {
          const authError = new Error('登錄信息錯誤，請檢查郵箱和密碼') as Error & { error_code?: string; status?: number; data?: unknown };
          authError.error_code = errorCode;
          authError.status = status;
          authError.data = data;
          throw authError;
        } else {
          // Token expired or invalid for authenticated requests
          clearAuthStorage();
          dispatchSessionExpired('expired');
          const authError = new Error('登錄已過期，請重新登錄') as Error & { error_code?: string; status?: number; data?: unknown };
          authError.error_code = errorCode;
          authError.status = status;
          authError.data = data;
          throw authError;
        }
      } else if (status === 403) {
        // A 403 with a session-related error_code (or the legacy "Invalid
        // or expired token" message from older deployments) means the JWT
        // was rejected by the auth middleware — treat it like a 401, clear
        // storage, and send the user back to login. A 403 without one of
        // these signals is a legitimate authorization failure (e.g. trying
        // to access someone else's resource) and stays "沒有權限".
        const dataObj = (data ?? {}) as { message?: string };
        const tokenIssue =
          sessionExpiredCodes.has(errorCode) ||
          errorCode === 'INVALID_TOKEN' ||
          dataObj.message === 'Invalid or expired token';
        if (!isAuthEndpoint && tokenIssue) {
          clearAuthStorage();
          dispatchSessionExpired(errorCode === 'TOKEN_EXPIRED' ? 'expired' : 'invalid');
          const authError = new Error('登錄已過期，請重新登錄') as Error & { error_code?: string; status?: number; data?: unknown };
          authError.error_code = errorCode;
          authError.status = status;
          authError.data = data;
          throw authError;
        }
        const forbiddenError = new Error('沒有權限執行此操作') as Error & { error_code?: string; status?: number; data?: unknown };
        forbiddenError.error_code = errorCode;
        forbiddenError.status = status;
        forbiddenError.data = data;
        throw forbiddenError;
      } else if (status === 404) {
        // Prefer the backend's specific message (e.g. "這個邀請已被撤回…")
        // so the user knows what to do, falling back to a generic string
        // only when the body has none.
        const backendMessage = data?.message || data?.error?.message;
        const notFoundError = new Error(backendMessage || '請求的資源不存在') as Error & { error_code?: string; status?: number; data?: unknown };
        notFoundError.error_code = errorCode;
        notFoundError.status = status;
        notFoundError.data = data;
        throw notFoundError;
      } else if (status === 422) {
        // For validation errors, show the detailed error message
        const validationError = new Error(errorMessage) as Error & { error_code?: string; status?: number; data?: unknown };
        validationError.error_code = errorCode;
        validationError.status = status;
        validationError.data = data;
        throw validationError;
      } else if (status === 429) {
        // Usage-cap hit. If it's one of our freemium caps, broadcast a global
        // event so the app can show the upgrade paywall; still throw so the
        // calling code can stop its own flow. Non-billing 429s (if any) just throw.
        if (BILLING_LIMIT_CODES.has(errorCode) && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('billing:limit-reached', {
              detail: { error_code: errorCode, message: errorMessage },
            })
          );
        }
        const limitError = new Error(errorMessage) as Error & { error_code?: string; status?: number; data?: unknown };
        limitError.error_code = errorCode;
        limitError.status = status;
        limitError.data = data;
        throw limitError;
      } else if (status >= 500) {
        // Same as 404: surface the backend's specific message when it has
        // one (e.g. "回應親密請求失敗") so the user sees what feature failed
        // instead of a featureless "服務器內部錯誤".
        const backendMessage = data?.message || data?.error?.message;
        const serverError = new Error(backendMessage || '服務器內部錯誤，請稍後再試') as Error & { error_code?: string; status?: number; data?: unknown };
        serverError.error_code = errorCode;
        serverError.status = status;
        serverError.data = data;
        throw serverError;
      }
      
      const apiError = new Error(errorMessage) as Error & { error_code?: string; status?: number; data?: unknown };
      apiError.error_code = errorCode;
      apiError.status = status;
      apiError.data = data;
      throw apiError;
    } else if (error.request) {
      // Network error
      const networkError = new Error('網絡連接失敗，請檢查網絡連接') as Error & { error_code?: string };
      networkError.error_code = 'NETWORK_ERROR';
      throw networkError;
    } else {
      // Other error
      const requestError = new Error(`請求失敗：${error.message}`) as Error & { error_code?: string };
      requestError.error_code = 'REQUEST_FAILED';
      throw requestError;
    }
  }
);

// Human therapist (心理諮商師) directory types
export type TherapistFocusArea =
  | 'family' | 'couple' | 'childhood' | 'individual'
  | 'sexuality' | 'parenting' | 'grief' | 'anxiety'
  | 'depression' | 'trauma' | 'addiction' | 'lgbtq'
  | 'career' | 'self_esteem';

export type TherapistIdentityStatus = 'unverified' | 'submitted' | 'verified' | 'rejected';

// Title + optional link, used by publications (source) and articles (url).
export interface TherapistLinkItem {
  title: string;
  url?: string;
  source?: string;
}

export interface Therapist {
  id: string;
  displayName: string;
  title?: string | null;
  focusAreas: TherapistFocusArea[];
  customSpecialties?: string[];
  languages: string[];
  yearsExperience?: number | null;
  bio?: string | null;
  photoUrl?: string | null;
  rateTwd: number;
  sessionMinutes: number;
  identityStatus?: TherapistIdentityStatus;
  // Rich profile sections (migration 048).
  introMessage?: string | null;
  approach?: string | null;
  about?: string | null;
  certifications?: string[];
  currentPositions?: string[];
  qualifications?: string[];
  training?: string[];
  publications?: TherapistLinkItem[];
  articles?: TherapistLinkItem[];
  acceptingNewClients?: boolean;
  createdAt: string;
}

export interface TherapistReview {
  id: string;
  reviewerDisplay: string;
  rating?: number | null;
  body: string;
  createdAt: string;
}

export interface TherapistReviewsResult {
  summary: { count: number; avgRating: number | null };
  canReview: boolean;
  alreadyReviewed: boolean;
  reviews: TherapistReview[];
}

// The therapist's own private view of their profile (GET /therapists/me).
export interface OwnTherapistProfile extends Therapist {
  licenseNo?: string | null;
  contactEmail: string;
  contactPhone?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  reviewNote?: string | null;
  emailVerified: boolean;
  identityDocuments: string[];
  identityStatus: TherapistIdentityStatus;
}

export interface TherapistApplicationInput {
  displayName: string;
  title?: string;
  licenseNo?: string;
  focusAreas: TherapistFocusArea[];
  customSpecialties?: string[];
  languages?: string[];
  yearsExperience?: number | null;
  bio?: string;
  photoUrl?: string;
  identityDocuments?: string[];
  rateTwd: number;
  sessionMinutes?: number;
  contactEmail: string;
  contactPhone?: string;
}

// Fields a therapist may edit on their own profile (PUT /therapists/me).
export interface TherapistProfileUpdate {
  displayName?: string;
  title?: string | null;
  focusAreas?: TherapistFocusArea[];
  customSpecialties?: string[];
  languages?: string[];
  yearsExperience?: number | null;
  bio?: string | null;
  photoUrl?: string | null;
  rateTwd?: number;
  sessionMinutes?: number;
  contactPhone?: string | null;
  // Rich profile sections (048).
  introMessage?: string | null;
  approach?: string | null;
  about?: string | null;
  certifications?: string[];
  currentPositions?: string[];
  qualifications?: string[];
  training?: string[];
  publications?: TherapistLinkItem[];
  articles?: TherapistLinkItem[];
  acceptingNewClients?: boolean;
}

export interface ConsultationRequestInput {
  focusArea?: TherapistFocusArea;
  message?: string;
  contactEmail?: string;
  preferredTime?: string;
}

// 公開問答 publish lifecycle. private → (client|therapist)_requested → published,
// or withdrawn. See migration 045 + routes/therapists.js publish handshake.
export type ConsultationPublicStatus =
  | 'private' | 'client_requested' | 'therapist_requested' | 'published' | 'withdrawn';

export interface TherapistConsultation {
  id: string;
  therapistId?: string;
  therapistName: string;
  therapistTitle?: string | null;
  therapistRateTwd?: number;
  therapistSessionMinutes?: number;
  requesterName?: string | null;
  role: 'therapist' | 'client';
  focusArea?: TherapistFocusArea | null;
  message?: string | null;
  preferredTime?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled' | 'no_show';
  respondedAt?: string | null;
  responseNote?: string | null;
  publicStatus?: ConsultationPublicStatus;
  publicTitle?: string | null;
  // Paid video session (046). bookingType 'free' = the no-charge chat.
  bookingType?: 'free' | 'scheduled';
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'refunded' | 'failed';
  priceTwd?: number | null;
  meetingProvider?: 'zoom' | 'meet' | 'other' | null;
  meetingUrl?: string | null; // only present once paid
  messageCount: number;
  createdAt: string;
}

export type MeetingProvider = 'zoom' | 'meet' | 'other';

export interface TherapistEarnings {
  introSessionsUsed: number;
  introSessionsRemaining: number;
  currentFeeRate: number;
  paidSessionCount: number;
  totalNetTwd: number;
  sessions: {
    id: string;
    priceTwd: number;
    feeRate: number;
    platformFeeTwd: number;
    therapistNetTwd: number;
    paidAt: string | null;
    status: string;
  }[];
}

export interface ConsultationMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  isTherapist: boolean;
  isMine: boolean;
  event: { id: string; title: string; summary: string } | null;
}

export interface ConsultationThread {
  role: 'therapist' | 'client';
  therapistName: string;
  currentUserId: string;
  publicStatus?: ConsultationPublicStatus;
  publicTitle?: string | null;
  messages: ConsultationMessage[];
}

// --- 公開問答 (Public Q&A) read-only browse types ---

export type PublicQaSource = 'consultation' | 'event' | 'wall';

export interface PublicQaThreadSummary {
  id: string;
  source: PublicQaSource;
  title: string;
  focusArea?: TherapistFocusArea | null;
  publishedAt: string;
  // null for couple-shared (event/wall) threads, which have no therapist.
  therapist: { id: string; displayName: string; title?: string | null; photoUrl?: string | null } | null;
  preview: string;
  messageCount: number;
  helpfulCount: number;
}

export interface PublicQaMessage {
  id: string;
  body: string;
  createdAt: string;
  isTherapist: boolean;
  isAi?: boolean;
  senderName: string; // therapist name, "匿名個案", "匿名 A/B", or "AI 諮商師"
}

export interface PublicQaThread {
  id: string;
  source: PublicQaSource;
  title: string;
  focusArea?: TherapistFocusArea | null;
  publishedAt: string;
  helpfulCount: number;
  hasVoted: boolean;
  therapist: { id: string; displayName: string; title?: string | null; photoUrl?: string | null } | null;
  messages: PublicQaMessage[];
}

export interface PublicQaListResult {
  page: number;
  hasMore: boolean;
  threads: PublicQaThreadSummary[];
}

export interface LoveWish {
  id: string;
  content: string;
}

export interface RelationshipSummary {
  paired: boolean;
  partnerNickname?: string | null;
  daysSinceIntimacy?: number | null;
  daysSinceAppreciation?: number | null;
  positive14?: number;
  negative14?: number;
  openConflicts?: number;
  checkin?: {
    myLastDays: number | null;
    coupleLastDays: number | null;
    periodDays: number;
    overdue: boolean;
  };
}

export interface RelationshipCheckin {
  id: string;
  nickname: string;
  isMine: boolean;
  trust: number;
  commitment: number;
  connection: number;
  note: string | null;
  createdAt: string;
}

export interface GoodwillGroup {
  kind: string;
  label: string;
  why: string;
  count: number;
  items: { text: string; who?: string; at: string; resolved?: boolean }[];
}

// API Service Class
class ApiService {
  private throwApiError(error: unknown, fallbackMessage: string): never {
    const typedError = error as Error & { error_code?: string; data?: unknown; response?: { data?: ApiError } };
    if (typedError?.error_code || typedError?.message) {
      throw typedError;
    }

    const responseData = (typedError as { response?: { data?: ApiError } })?.response?.data;
    const nestedError = responseData?.error && typeof responseData.error === 'object' ? responseData.error : undefined;
    const stringError = typeof responseData?.error === 'string' ? responseData.error : undefined;
    const responseMessage = responseData?.message || stringError || nestedError?.message;
    const responseCode = responseData?.error_code || nestedError?.code;

    if (responseMessage) {
      const enrichedError = new Error(responseMessage) as Error & { error_code?: string };
      enrichedError.error_code = responseCode;
      throw enrichedError;
    }

    throw new Error(fallbackMessage);
  }

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
      this.throwApiError(error, '無法獲取愛的時光記錄');
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
      this.throwApiError(error, '無法獲取記錄詳情');
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
        photo_id: record.photoId ?? null, // link the uploaded photo, if any
      };

      const response = await apiClient.post('/love-moments', apiPayload);
      console.log('Create record API response:', response.data); // Debug log

      // The API returns {success: true, message: "...", love_moment: {...}}
      // We need to extract the love_moment object
      const recordData = response.data.love_moment || response.data;
      return this.transformApiRecord(recordData);
    } catch (error: unknown) {
      console.error('Failed to create intimate record:', error);
      this.throwApiError(error, '無法創建愛的時光記錄');
    }
  }

  async updateIntimateRecord(id: string, record: Partial<IntimateRecord>): Promise<void> {
    try {
      if (!id) throw new Error('記錄ID不能為空');

      const apiPayload: Record<string, unknown> = {};
      if (record.date && record.time) {
        apiPayload.moment_date = new Date(`${record.date}T${record.time}`).toISOString();
      }
      if (record.notes !== undefined) apiPayload.notes = record.notes?.trim() || null;
      if (record.description !== undefined) apiPayload.description = record.description?.trim() || null;
      if (record.duration !== undefined) apiPayload.duration = record.duration?.trim() || null;
      if (record.location !== undefined) apiPayload.location = record.location?.trim() || null;
      if (record.roleplayScript !== undefined) apiPayload.roleplay_script = record.roleplayScript?.trim() || null;

      await apiClient.put(`/love-moments/${id}`, apiPayload);
    } catch (error: unknown) {
      console.error('Failed to update intimate record:', error);
      this.throwApiError(error, '無法更新記錄');
    }
  }

  async deleteIntimateRecord(id: string): Promise<void> {
    try {
      if (!id) throw new Error('記錄ID不能為空');
      await apiClient.delete(`/love-moments/${id}`);
    } catch (error: unknown) {
      console.error('Failed to delete intimate record:', error);
      this.throwApiError(error, '無法刪除記錄');
    }
  }

  // Recent activity feed (user + partner) for the profile 最近動態 section.
  async getActivityFeed(): Promise<ActivityItem[]> {
    try {
      const response = await apiClient.get('/activity');
      return (response.data?.activities || []) as ActivityItem[];
    } catch (error: unknown) {
      console.error('Failed to fetch activity feed:', error);
      this.throwApiError(error, '無法獲取最近動態');
    }
  }

  // Cycle (period) records
  async getCycleRecords(): Promise<CycleRecord[]> {
    try {
      const response = await apiClient.get('/cycle-records');
      const rows = (response.data?.cycle_records || []) as ApiCycleRecord[];
      return rows.map(this.transformCycleRecord);
    } catch (error: unknown) {
      console.error('Failed to fetch cycle records:', error);
      this.throwApiError(error, '無法獲取週期紀錄');
    }
  }

  async createCycleRecord(input: { startDate: string; lengthDays?: number; notes?: string }): Promise<CycleRecord> {
    try {
      if (!input.startDate) throw new Error('請選擇週期開始日');
      const response = await apiClient.post('/cycle-records', {
        start_date: input.startDate,
        length_days: input.lengthDays ?? 5,
        notes: input.notes?.trim() || null,
      });
      const row = (response.data?.cycle_record || response.data) as ApiCycleRecord;
      return this.transformCycleRecord(row);
    } catch (error: unknown) {
      console.error('Failed to create cycle record:', error);
      this.throwApiError(error, '無法建立週期紀錄');
    }
  }

  async updateCycleRecord(id: string, input: Partial<{ startDate: string; lengthDays: number; notes: string }>): Promise<void> {
    try {
      if (!id) throw new Error('紀錄ID不能為空');
      const payload: Record<string, unknown> = {};
      if (input.startDate !== undefined) payload.start_date = input.startDate;
      if (input.lengthDays !== undefined) payload.length_days = input.lengthDays;
      if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;
      await apiClient.put(`/cycle-records/${id}`, payload);
    } catch (error: unknown) {
      console.error('Failed to update cycle record:', error);
      this.throwApiError(error, '無法更新週期紀錄');
    }
  }

  async deleteCycleRecord(id: string): Promise<void> {
    try {
      if (!id) throw new Error('紀錄ID不能為空');
      await apiClient.delete(`/cycle-records/${id}`);
    } catch (error: unknown) {
      console.error('Failed to delete cycle record:', error);
      this.throwApiError(error, '無法刪除週期紀錄');
    }
  }

  private transformCycleRecord(row: ApiCycleRecord): CycleRecord {
    return {
      id: String(row.id),
      trackedBy: String(row.tracked_by),
      startDate: String(row.start_date).slice(0, 10),
      lengthDays: Number(row.length_days),
      notes: row.notes || undefined,
      createdAt: row.created_at,
    };
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

      const response = await apiClient.post('/photos/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // Extended timeout for file upload
      });

      // Backend returns { success, photo: { id, file_path, ... } }.
      const photo = response.data?.photo;
      if (!photo?.id || !photo?.file_path) {
        throw new Error('上傳成功但未獲取到照片資訊');
      }

      return { id: photo.id, url: photo.file_path };
    } catch (error: unknown) {
      console.error('Failed to upload photo:', error);
      this.throwApiError(error, '照片上傳失敗');
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
      // Not paired yet or error — backend is the only source of truth, so
      // surface the defaults instead of caching client-side.
      return { partner1: '親愛的', partner2: '寶貝' };
    }
  }

  async updateNicknames(nicknames: { partner1?: string; partner2?: string }): Promise<void> {
    const authUserRaw = localStorage.getItem('authUser');
    const currentUserId = authUserRaw ? JSON.parse(authUserRaw)?.id : null;
    if (!currentUserId) return;

    // partner1 always represents the current user (see getNicknames convention).
    const myNickname = nicknames.partner1?.trim();
    if (!myNickname || myNickname.length < 2) return;

    await apiClient.put('/couples/nicknames', { nickname: myNickname });
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
    const { token, user, tokenExpiresAt } = response.data;
    persistAuth(token, user, tokenExpiresAt);
    return { token, user };
  }

  async register(email: string, nickname: string, password: string): Promise<{ token: string; user: unknown }> {
    const response = await apiClient.post('/auth/register', { email, nickname, password });
    const { token, user, tokenExpiresAt } = response.data;
    persistAuth(token, user, tokenExpiresAt);
    return { token, user };
  }

  async logout(): Promise<void> {
    clearAuthStorage();
    resetSessionExpiredGuard();
  }

  // Re-send the email-verification link to the logged-in user.
  async resendVerification(): Promise<{ success: boolean; message: string; alreadyVerified?: boolean }> {
    const response = await apiClient.post('/auth/resend-verification', {});
    return response.data;
  }

  // Start a password reset. Always resolves (the backend never reveals whether
  // the email exists) — surface the generic message to the user.
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data;
  }

  // Lightweight session-validity probe — hits GET /auth/me. If the token is
  // no longer accepted, the response interceptor will dispatch the global
  // expiration event; callers don't need to handle the failure themselves.
  async getCurrentUser(): Promise<unknown> {
    const response = await apiClient.get('/auth/me');
    return response.data?.user;
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
      } catch (error) {
        console.warn('Failed to parse record id, generating fallback:', error);
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
      // Server timestamps are UTC; render the calendar date in the viewer's
      // browser tz so a Taipei moment recorded at 00:30 doesn't show as the
      // previous day.
      const tz = browserTz();
      dateStr = formatYmdInTz(momentDate, tz);
      timeStr = momentDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    } catch (error) {
      console.error('Error formatting date/time:', error);
      // Fallback to manual formatting
      const now = new Date();
      dateStr = formatYmdInTz(now, browserTz());
      timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    return {
      id: safeId,
      apiId: typeof apiRecord.id === 'string' ? apiRecord.id : String(apiRecord.id ?? ''),
      date: dateStr,
      time: timeStr,
      mood: '💕', // Default mood
      notes: apiRecord.notes || '',
      timestamp: apiRecord.created_at || new Date().toISOString(),
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
      const payload: Record<string, unknown> = {};
      if (data.coupleName) payload.couple_name = data.coupleName;
      if (data.anniversaryDate) payload.anniversary_date = data.anniversaryDate;
      if (data.partnerEmail) payload.partnerEmail = data.partnerEmail;
      if (data.pairingCode) payload.pairing_code = data.pairingCode;

      const response = await apiClient.post('/couples', payload);
      return this.transformCoupleResponse(response.data.couple);
    } catch (error: unknown) {
      console.error('Failed to create couple:', error);
      this.throwApiError(error, '無法創建情侶關係');
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
      this.throwApiError(error, '無法獲取情侶信息');
    }
  }

  async generatePairingCode(): Promise<PairingCodeResponse> {
    try {
      const response = await apiClient.post('/couples/pairing-code');
      return {
        code: response.data.code,
        expiresAt: response.data.expires_at || response.data.expiresAt,
        token: response.data.token
      };
    } catch (error: unknown) {
      console.error('Failed to generate pairing code:', error);
      this.throwApiError(error, '無法生成配對碼');
    }
  }

  // Email-based pairing invitation methods
  async sendPairingInvitation(data: SendPairingInvitationRequest): Promise<PairingInvitationResponse> {
    try {
      const response = await apiClient.post('/pairing-requests', {
        ...data,
        type: 'email'
      });
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to send pairing invitation:', error);
      this.throwApiError(error, '無法發送配對邀請');
    }
  }

  async createPairingCodeInvite(): Promise<PairingInvitationResponse> {
    try {
      const response = await apiClient.post('/pairing-requests', { type: 'code' });
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to create pairing code invite:', error);
      this.throwApiError(error, '無法生成配對碼');
    }
  }

  async acceptPairingInvitation(token: string): Promise<AcceptPairingInvitationResponse> {
    try {
      const response = await apiClient.post(`/pairing-requests/accept/${token}`);
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to accept pairing invitation:', error);
      this.throwApiError(error, '無法接受配對邀請');
    }
  }

  async acceptPairingCode(code: string): Promise<AcceptPairingInvitationResponse> {
    try {
      const response = await apiClient.post('/pairing-requests/accept-code', { code });
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to accept pairing code:', error);
      this.throwApiError(error, '無法接受配對邀請');
    }
  }

  async rejectPairingInvitation(token: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.post(`/pairing-requests/reject/${token}`);
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to reject pairing invitation:', error);
      this.throwApiError(error, '無法拒絕配對邀請');
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
      type?: string;
      shortCode?: string;
    };
  }> {
    try {
      const response = await apiClient.get(`/pairing-requests/${token}`);
      return response.data;
    } catch (error: unknown) {
      console.error('Failed to get pairing invitation:', error);
      this.throwApiError(error, '無法獲取配對邀請詳情');
    }
  }

  private transformCoupleResponse(data: unknown): CoupleResponse {
    const typedData = data as {
      id?: string;
      couple_name?: string;
      anniversary_date?: string;
      first_meet_date?: string;
      first_date?: string;
      first_kiss_date?: string;
      first_kiss_place?: string;
      first_intimacy_date?: string;
      first_intimacy_place?: string;
      user1_id?: string;
      user1_nickname?: string;
      user1_timezone?: string;
      user2_id?: string;
      user2_nickname?: string;
      user2_timezone?: string;
      primary_timezone?: string;
      created_at?: string;
      pairing_code?: string;
      pending_conflicts?: Record<string, { inviter: string; accepter: string }>;
    };

    return {
      id: typedData?.id || '',
      coupleName: typedData?.couple_name,
      anniversaryDate: typedData?.anniversary_date,
      firstMeetDate: typedData?.first_meet_date,
      firstDate: typedData?.first_date,
      user1Id: typedData?.user1_id,
      user1Nickname: typedData?.user1_nickname || '',
      user1Timezone: typedData?.user1_timezone,
      user2Id: typedData?.user2_id,
      user2Nickname: typedData?.user2_nickname,
      user2Timezone: typedData?.user2_timezone,
      primaryTimezone: typedData?.primary_timezone,
      firstKissDate: typedData?.first_kiss_date,
      firstKissPlace: typedData?.first_kiss_place,
      firstIntimacyDate: typedData?.first_intimacy_date,
      firstIntimacyPlace: typedData?.first_intimacy_place,
      createdAt: typedData?.created_at || new Date().toISOString(),
      pairingCode: typedData?.pairing_code,
      pendingConflicts: typedData?.pending_conflicts
    };
  }

  // Intimacy Requests
  async createIntimacyRequest(request: CreateIntimacyRequestRequest): Promise<IntimacyRequest> {
    try {
      // Map request types to server-accepted values. A few categories carry a
      // distinct meaning end-to-end (compliment / reconciliation / guidance);
      // everything else (incl. scheduled) is stored as a generic intimate request.
      let requestType = request.requestType;
      if (!['compliment', 'reconciliation', 'guidance'].includes(requestType)) {
        requestType = 'intimate';
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

  async updateUserBirthDate(birthDate: string | null): Promise<void> {
    try {
      await apiClient.put('/auth/user/birth-date', { birth_date: birthDate });
    } catch (error: unknown) {
      console.error('Failed to update user birth date:', error);
      throw new Error((error as ApiErrorResponse)?.message || '更新生日失敗');
    }
  }

  async updateUserTimezone(timezone: string | null): Promise<void> {
    try {
      await apiClient.put('/auth/user/timezone', { timezone });
    } catch (error: unknown) {
      console.error('Failed to update user timezone:', error);
      throw new Error((error as ApiErrorResponse)?.message || '更新時區失敗');
    }
  }

  async updateCouplePrimaryTimezone(timezone: string | null): Promise<void> {
    try {
      await apiClient.put('/couples/primary-timezone', { primary_timezone: timezone });
    } catch (error: unknown) {
      console.error('Failed to update couple primary timezone:', error);
      throw new Error((error as ApiErrorResponse)?.message || '更新共用時區失敗');
    }
  }

  async updateEmailNotificationsEnabled(enabled: boolean): Promise<void> {
    try {
      await apiClient.put('/auth/user/email-notifications', {
        email_notifications_enabled: enabled,
      });
    } catch (error: unknown) {
      console.error('Failed to update email notifications pref:', error);
      throw new Error((error as ApiErrorResponse)?.message || '更新電子郵件通知設定失敗');
    }
  }

  // Request a login-email change. The new address only takes effect after the
  // user clicks the confirmation link we email to it. Preserves error_code so
  // the UI can branch on the specific reason (bad password, taken, etc.).
  async changeUserEmail(newEmail: string, password: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.put('/auth/user/email', {
        new_email: newEmail,
        password,
      });
      return { message: response.data?.message || '我們已寄出確認信到新的 Email，請點擊信中連結完成變更。' };
    } catch (error: unknown) {
      console.error('Failed to change user email:', error);
      throw error;
    }
  }

  async updatePublicShareNickname(enabled: boolean): Promise<void> {
    try {
      await apiClient.put('/auth/user/public-share-nickname', {
        public_share_show_nickname: enabled,
      });
    } catch (error: unknown) {
      console.error('Failed to update public-share nickname pref:', error);
      throw new Error((error as ApiErrorResponse)?.message || '更新公開分享設定失敗');
    }
  }

  async updateCycleTrackingEnabled(enabled: boolean): Promise<void> {
    try {
      await apiClient.put('/auth/user/cycle-tracking', {
        cycle_tracking_enabled: enabled,
      });
    } catch (error: unknown) {
      console.error('Failed to update cycle tracking pref:', error);
      throw new Error((error as ApiErrorResponse)?.message || '更新週期追蹤設定失敗');
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

  async getIntimacyRequestStats(): Promise<IntimacyRequestStatsResponse> {
    try {
      const response = await apiClient.get('/intimacy-requests/stats');
      const statistics = response.data.statistics || {};
      const nudge = response.data.nudge || {};

      return {
        statistics: {
          week: this.normalizePeriodStats(statistics.week),
          month: this.normalizePeriodStats(statistics.month)
        },
        nudge: {
          shouldNudge: Boolean(nudge.shouldNudge),
          reason: (nudge.reason ?? null) as IntimacyRequestNudgeReason,
          message: nudge.message ?? null,
        }
      };
    } catch (error: unknown) {
      console.error('Failed to fetch intimacy stats:', error);
      throw new Error((error as ApiErrorResponse)?.message || '無法獲取親密邀請統計');
    }
  }

  async sendIntimacyNudgeEmail(): Promise<string> {
    try {
      const response = await apiClient.post('/intimacy-requests/stats/send-nudge');

      if (!response.data?.success) {
        const message = response.data?.message || '無法寄出貼心提醒';
        throw new Error(message);
      }

      return response.data.message || '貼心提醒已寄出';
    } catch (error: unknown) {
      console.error('Failed to send intimacy nudge email:', error);
      if (error instanceof Error && error.message) {
        throw error;
      }
      throw new Error((error as ApiErrorResponse)?.message || '無法寄出貼心提醒');
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

  // Ask the AI to summarize a roleplay script and produce 5 escalating opening
  // invitation messages. 429 (AI_DAILY_LIMIT_REACHED) is surfaced by the shared
  // response interceptor as a billing:limit-reached event — let it propagate.
  async generateRoleplayMessages(input: GenerateRoleplayMessagesInput): Promise<RoleplayMessagesResult> {
    try {
      const response = await apiClient.post('/intimacy-requests/script-messages', {
        scriptId: input.scriptId,
        scriptTitle: input.scriptTitle,
        scriptScenario: input.scriptScenario,
        scriptBody: input.scriptBody,
        category: input.category,
        regenerate: input.regenerate,
      });
      return {
        summary: response.data.summary || '',
        messages: (response.data.messages || []) as RoleplayMessageSuggestion[],
        cached: !!response.data.cached,
      };
    } catch (error: unknown) {
      console.error('Failed to generate roleplay messages:', error);
      // Preserve error_code/message from the interceptor so the UI can branch.
      throw error;
    }
  }

  // Thumb up/down (+ optional text) on a generated roleplay message. Best-effort
  // analytics — callers fire-and-forget; failures never block the user.
  async submitRoleplayMessageFeedback(input: RoleplayMessageFeedbackInput): Promise<void> {
    try {
      await apiClient.post('/intimacy-requests/script-messages/feedback', input);
    } catch (error: unknown) {
      console.error('Failed to submit roleplay message feedback:', error);
    }
  }

  // Generate three neutral, face-saving reconciliation openers for the chosen
  // intensity, optionally grounded in a past event. 429 (AI_DAILY_LIMIT_REACHED)
  // propagates via the shared interceptor; error_code is preserved for the UI.
  async generateReconciliationOpeners(
    intensity: ReconciliationIntensity,
    eventId?: string | null,
  ): Promise<ReconciliationOpener[]> {
    try {
      const response = await apiClient.post('/intimacy-requests/reconciliation-openers', {
        intensity,
        eventId: eventId || undefined,
      });
      return (response.data.openers || []) as ReconciliationOpener[];
    } catch (error: unknown) {
      console.error('Failed to generate reconciliation openers:', error);
      // Preserve error_code/message from the interceptor so the UI can branch.
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

  // User feedback / 用戶心得
  // Public feature flags — admin-controlled on/off bits for gated UI. Reads the
  // unauthenticated endpoint; on any failure returns {} so callers fall back to
  // each flag's default (off) rather than breaking the page.
  async getFeatureFlags(): Promise<Record<string, boolean>> {
    try {
      const response = await apiClient.get('/feature-flags');
      const flags = response.data?.flags;
      return flags && typeof flags === 'object' ? flags : {};
    } catch (error: unknown) {
      console.error('Failed to fetch feature flags:', error);
      return {};
    }
  }

  async getApprovedFeedback(): Promise<
    Array<{ id: string; name: string; rating: number; content: string }>
  > {
    try {
      const response = await apiClient.get('/feedback/approved');
      return response.data?.reviews || [];
    } catch (error: unknown) {
      console.error('Failed to fetch approved feedback:', error);
      return [];
    }
  }

  async getMyFeedback(): Promise<
    Array<{ id: string; name: string; rating: number; content: string; status: string }>
  > {
    try {
      const response = await apiClient.get('/feedback/mine');
      return response.data?.feedback || [];
    } catch (error: unknown) {
      console.error('Failed to fetch my feedback:', error);
      return [];
    }
  }

  async submitFeedback(input: {
    rating: number;
    body: string;
    displayName?: string;
  }): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post('/feedback', input);
    return response.data;
  }

  // Assessments (愛的語言 love languages, future: MBTI / 星座)
  async getAssessments(): Promise<
    Array<{ type: string; result: string; scores: Record<string, number>; updatedAt: string }>
  > {
    try {
      const response = await apiClient.get('/assessments');
      return response.data?.assessments || [];
    } catch (error: unknown) {
      console.error('Failed to fetch assessments:', error);
      return [];
    }
  }

  async getPartnerAssessments(): Promise<{
    partner: { nickname: string } | null;
    assessments: Array<{ type: string; result: string; updatedAt: string }>;
  }> {
    try {
      const response = await apiClient.get('/assessments/partner');
      return {
        partner: response.data?.partner ?? null,
        assessments: response.data?.assessments || [],
      };
    } catch (error: unknown) {
      console.error('Failed to fetch partner assessments:', error);
      return { partner: null, assessments: [] };
    }
  }

  async saveAssessment(
    type: string,
    result: string,
    scores: Record<string, number>
  ): Promise<{ type: string; result: string; scores: Record<string, number>; updatedAt: string }> {
    try {
      const response = await apiClient.put(`/assessments/${type}`, { result, scores });
      return response.data.assessment;
    } catch (error: unknown) {
      console.error('Failed to save assessment:', error);
      this.throwApiError(error, '儲存測驗結果失敗，請稍後再試');
    }
  }

  // 愛的行動 wishlist (custom items each partner proposes for themselves).
  async getLoveWishes(): Promise<{ mine: LoveWish[]; partner: LoveWish[] }> {
    try {
      const response = await apiClient.get('/assessments/love-wishes');
      return { mine: response.data?.mine || [], partner: response.data?.partner || [] };
    } catch (error: unknown) {
      console.error('Failed to fetch love wishes:', error);
      return { mine: [], partner: [] };
    }
  }

  async addLoveWish(content: string): Promise<LoveWish> {
    try {
      const response = await apiClient.post('/assessments/love-wishes', { content });
      return response.data.wish;
    } catch (error: unknown) {
      console.error('Failed to add love wish:', error);
      this.throwApiError(error, '新增失敗，請稍後再試');
    }
  }

  async deleteLoveWish(id: string): Promise<void> {
    try {
      await apiClient.delete(`/assessments/love-wishes/${id}`);
    } catch (error: unknown) {
      console.error('Failed to delete love wish:', error);
      this.throwApiError(error, '刪除失敗，請稍後再試');
    }
  }

  // Relationship cultivation ("關係之屋") dashboard + check-ins.
  async getRelationshipSummary(): Promise<RelationshipSummary> {
    try {
      const response = await apiClient.get('/relationship/summary');
      return response.data as RelationshipSummary;
    } catch (error: unknown) {
      console.error('Failed to fetch relationship summary:', error);
      return { paired: false };
    }
  }

  async submitCheckin(input: { trust: number; commitment: number; connection: number; note?: string }): Promise<void> {
    try {
      await apiClient.post('/relationship/checkin', input);
    } catch (error: unknown) {
      console.error('Failed to submit check-in:', error);
      this.throwApiError(error, '儲存關係檢視失敗，請稍後再試');
    }
  }

  async getCheckins(): Promise<RelationshipCheckin[]> {
    try {
      const response = await apiClient.get('/relationship/checkins');
      return (response.data?.checkins || []) as RelationshipCheckin[];
    } catch (error: unknown) {
      console.error('Failed to fetch check-ins:', error);
      return [];
    }
  }

  async getGoodwillBreakdown(): Promise<{ positive: GoodwillGroup[]; negative: GoodwillGroup[] }> {
    try {
      const response = await apiClient.get('/relationship/goodwill');
      return { positive: response.data?.positive || [], negative: response.data?.negative || [] };
    } catch (error: unknown) {
      console.error('Failed to fetch goodwill breakdown:', error);
      return { positive: [], negative: [] };
    }
  }

  // Custom Scripts API
  // Extract the most specific server-side error message from an axios failure.
  // Validation errors come back as { errors: [{ path, msg }] } — surfacing
  // errors[0].msg tells the user exactly which field was rejected (e.g.
  // "劇本內容必須在1-50000個字符之間") instead of a generic "驗證失敗".
  private extractScriptError(error: unknown, fallback: string): Error {
    const err = error as {
      message?: string;
      error_code?: string;
      status?: number;
      data?: { errors?: Array<{ msg?: string }>; message?: string };
      response?: { data?: { errors?: Array<{ msg?: string }>; message?: string } };
    };
    // The response interceptor has already unwrapped the body onto `err.data`
    // (plus a human message + error_code); only a path that bypasses the
    // interceptor would still carry the raw axios `err.response.data` shape, so
    // try both. Previously this read only `err.response.data` and so threw away
    // the interceptor's specific message AND error_code — turning a clear
    // "免費方案最多建立 N 個自訂劇本" cap message into a generic "無法建立劇本".
    const data = err?.data ?? err?.response?.data;
    const fieldMsg = data?.errors?.[0]?.msg;
    const message = fieldMsg || err?.message || data?.message || fallback;
    const result = new Error(message) as Error & { error_code?: string; status?: number };
    if (err?.error_code) result.error_code = err.error_code;
    if (err?.status) result.status = err.status;
    return result;
  }

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
    photos?: File[];
    isPublic?: boolean;
  }): Promise<unknown> {
    try {
      // Multipart path when any photos are attached; the first is the cover.
      if (script.photos && script.photos.length > 0) {
        const fd = new FormData();
        fd.append('title', script.title);
        fd.append('category', script.category);
        fd.append('scenario', script.scenario);
        fd.append('content', script.content);
        fd.append('duration', script.duration ?? '15-30分鐘');
        fd.append('tags', JSON.stringify(script.tags ?? []));
        for (const p of script.photos) fd.append('photos', p);
        if (script.isPublic !== undefined) fd.append('isPublic', String(script.isPublic));
        const response = await apiClient.post('/custom-scripts', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data.custom_script;
      }
      // No files → plain JSON. An empty/undefined `photos` serializes harmlessly
      // (the server only reads photos from multipart) so no need to strip it.
      const response = await apiClient.post('/custom-scripts', script);
      return response.data.custom_script;
    } catch (error) {
      console.error('Failed to create custom script:', error);
      throw this.extractScriptError(error, '無法建立劇本');
    }
  }

  async updateCustomScript(id: string, updates: {
    title?: string;
    category?: 'romantic' | 'adventurous' | 'school' | 'bold';
    scenario?: string;
    content?: string;
    tags?: string[];
    duration?: string;
    photos?: File[];
    // URLs of existing photos to keep, in order. Presence of this field (even
    // empty) tells the server to rebuild the photo set; absence leaves it as-is.
    existingPhotos?: string[];
    isPublic?: boolean;
  }): Promise<unknown> {
    try {
      const hasPhotoChange =
        (updates.photos && updates.photos.length > 0) || updates.existingPhotos !== undefined;
      // Multipart path when the photo series changed — mirrors createCustomScript.
      if (hasPhotoChange) {
        const fd = new FormData();
        if (updates.title !== undefined) fd.append('title', updates.title);
        if (updates.category !== undefined) fd.append('category', updates.category);
        if (updates.scenario !== undefined) fd.append('scenario', updates.scenario);
        if (updates.content !== undefined) fd.append('content', updates.content);
        if (updates.duration !== undefined) fd.append('duration', updates.duration);
        if (updates.tags !== undefined) fd.append('tags', JSON.stringify(updates.tags));
        if (updates.isPublic !== undefined) fd.append('isPublic', String(updates.isPublic));
        if (updates.existingPhotos !== undefined) {
          fd.append('existingPhotos', JSON.stringify(updates.existingPhotos));
        }
        for (const p of updates.photos ?? []) fd.append('photos', p);
        const response = await apiClient.put(`/custom-scripts/${id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data.custom_script;
      }
      // Metadata-only edit → plain JSON. photos is empty and existingPhotos is
      // undefined here (otherwise hasPhotoChange routed to multipart above), so
      // sending `updates` as-is leaves the photo series untouched server-side.
      const response = await apiClient.put(`/custom-scripts/${id}`, updates);
      return response.data.custom_script;
    } catch (error) {
      console.error('Failed to update custom script:', error);
      throw this.extractScriptError(error, '無法更新劇本');
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

  // Email a custom script to the paired partner to spark their interest. The
  // backend resolves the partner and returns a clear message for each outcome
  // (shared / unpaired / opted out), so surface response.message either way.
  async shareCustomScript(id: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post(`/custom-scripts/${id}/share`, {});
    return response.data;
  }

  // Script Favorites API — couple-scoped list of favorited script ids
  // (both built-in default ids and custom UUIDs).
  async getScriptFavorites(): Promise<string[]> {
    try {
      const response = await apiClient.get('/script-favorites');
      return response.data.favorites || [];
    } catch (error) {
      console.error('Failed to fetch script favorites:', error);
      throw error;
    }
  }

  async addScriptFavorite(scriptId: string): Promise<void> {
    try {
      await apiClient.post('/script-favorites', { scriptId });
    } catch (error) {
      console.error('Failed to add script favorite:', error);
      throw error;
    }
  }

  async removeScriptFavorite(scriptId: string): Promise<void> {
    try {
      await apiClient.delete(`/script-favorites/${encodeURIComponent(scriptId)}`);
    } catch (error) {
      console.error('Failed to remove script favorite:', error);
      throw error;
    }
  }

  // Marketplace API — public custom-scripts with ratings/reviews/reports
  async getMarketplaceScripts(params: {
    sort?: 'rating' | 'recent' | 'popular';
    category?: 'romantic' | 'adventurous' | 'school' | 'bold';
    limit?: number;
    offset?: number;
  } = {}): Promise<MarketplaceScript[]> {
    try {
      const response = await apiClient.get('/marketplace/scripts', { params });
      return (response.data.scripts || []) as MarketplaceScript[];
    } catch (error) {
      console.error('Failed to fetch marketplace scripts:', error);
      throw error;
    }
  }

  async getMarketplaceScript(id: string): Promise<MarketplaceScriptDetail> {
    try {
      const response = await apiClient.get(`/marketplace/scripts/${id}`);
      return response.data.script as MarketplaceScriptDetail;
    } catch (error) {
      console.error('Failed to fetch marketplace script:', error);
      throw error;
    }
  }

  async getScriptRatings(id: string, params: { limit?: number; offset?: number } = {}): Promise<ScriptRatingEntry[]> {
    try {
      const response = await apiClient.get(`/marketplace/scripts/${id}/ratings`, { params });
      return (response.data.ratings || []) as ScriptRatingEntry[];
    } catch (error) {
      console.error('Failed to fetch script ratings:', error);
      throw error;
    }
  }

  async rateScript(id: string, stars: number, reviewText?: string): Promise<void> {
    try {
      await apiClient.post(`/marketplace/scripts/${id}/rate`, { stars, reviewText });
    } catch (error) {
      console.error('Failed to submit rating:', error);
      throw this.extractScriptError(error, '無法送出評分');
    }
  }

  async deleteScriptRating(id: string): Promise<void> {
    try {
      await apiClient.delete(`/marketplace/scripts/${id}/rate`);
    } catch (error) {
      console.error('Failed to delete rating:', error);
      throw error;
    }
  }

  async reportScript(id: string, reason: ScriptReportReason, detail?: string): Promise<void> {
    try {
      await apiClient.post(`/marketplace/scripts/${id}/report`, { reason, detail });
    } catch (error) {
      console.error('Failed to submit report:', error);
      throw this.extractScriptError(error, '無法送出檢舉');
    }
  }

  async getFavoritedMarketplaceScripts(): Promise<MarketplaceScript[]> {
    try {
      const response = await apiClient.get('/marketplace/my-favorites');
      return (response.data.scripts || []) as MarketplaceScript[];
    } catch (error) {
      console.error('Failed to fetch favorited marketplace scripts:', error);
      throw error;
    }
  }

  // Wall API — couple-shared notes/moods with threaded replies
  async getWallPosts(): Promise<WallPost[]> {
    try {
      const response = await apiClient.get('/wall');
      return (response.data.wall_posts || []) as WallPost[];
    } catch (error) {
      console.error('Failed to fetch wall posts:', error);
      throw error;
    }
  }

  async createWallPost(input: CreateWallPostInput): Promise<WallPost> {
    try {
      const response = await apiClient.post('/wall', input);
      return response.data.wall_post as WallPost;
    } catch (error) {
      console.error('Failed to create wall post:', error);
      throw error;
    }
  }

  async updateWallPost(id: string, updates: UpdateWallPostInput): Promise<WallPost> {
    try {
      const response = await apiClient.put(`/wall/${id}`, updates);
      return response.data.wall_post as WallPost;
    } catch (error) {
      console.error('Failed to update wall post:', error);
      throw error;
    }
  }

  async deleteWallPost(id: string): Promise<void> {
    try {
      await apiClient.delete(`/wall/${id}`);
    } catch (error) {
      console.error('Failed to delete wall post:', error);
      throw error;
    }
  }

  async getWallPostReplies(postId: string): Promise<WallReply[]> {
    try {
      const response = await apiClient.get(`/wall/${postId}/replies`);
      return (response.data.replies || []) as WallReply[];
    } catch (error) {
      console.error('Failed to fetch wall replies:', error);
      throw error;
    }
  }

  async createWallPostReply(postId: string, content: string): Promise<WallReply> {
    try {
      const response = await apiClient.post(`/wall/${postId}/replies`, { content });
      return response.data.reply as WallReply;
    } catch (error) {
      console.error('Failed to create wall reply:', error);
      throw error;
    }
  }

  async deleteWallPostReply(replyId: string): Promise<void> {
    try {
      await apiClient.delete(`/wall/replies/${replyId}`);
    } catch (error) {
      console.error('Failed to delete wall reply:', error);
      throw error;
    }
  }

  // Generate (but don't post) an AI 諮商師 comment for a wall thread. The
  // requester previews it before choosing to share it with their partner.
  async previewWallAiComment(postId: string): Promise<string> {
    try {
      const response = await apiClient.post(`/wall/${postId}/ai-comment/preview`, {});
      return response.data.comment as string;
    } catch (error) {
      console.error('Failed to preview wall AI comment:', error);
      throw error;
    }
  }

  // Post a previewed AI 諮商師 comment into the thread (visible to both partners).
  async postWallAiComment(postId: string, content: string): Promise<WallReply> {
    try {
      const response = await apiClient.post(`/wall/${postId}/ai-comment`, { content });
      return response.data.reply as WallReply;
    } catch (error) {
      console.error('Failed to post wall AI comment:', error);
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
      sender_id?: string;
      receiver_id?: string;
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
      requester?: { id?: string; nickname?: string };
      recipient?: { id?: string; nickname?: string };
    };

    return {
      id: typedData?.id || '',
      senderId: typedData?.sender_id || typedData?.requester?.id,
      receiverId: typedData?.receiver_id || typedData?.recipient?.id,
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
      event_id?: string;
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
      eventId: typedData?.event_id,
      relatedUserNickname: typedData?.related_user_nickname,
      isRead: typedData?.is_read || false,
      readAt: typedData?.read_at,
      createdAt: typedData?.created_at || '',
      priority: typedData?.priority || 1,
    };
  }

  private normalizePeriodStats(data: unknown): IntimacyRequestPeriodStats {
    const typed = data as { accepted?: number; rejected?: number; unanswered?: number } | undefined;
    const toNumber = (value?: number) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };

    return {
      accepted: toNumber(typed?.accepted),
      rejected: toNumber(typed?.rejected),
      unanswered: toNumber(typed?.unanswered),
    };
  }

  // ---------------------------------------------------------------------------
  // Events × Icebreaker
  // ---------------------------------------------------------------------------

  async previewIcebreaker(rawText: string): Promise<IcebreakerPreview> {
    try {
      const response = await apiClient.post('/events/icebreaker', { rawText });
      const p = response.data.preview ?? {};
      return {
        title: p.title || '',
        summary: p.summary || '',
        emotions: Array.isArray(p.emotions) ? p.emotions : [],
        tags: Array.isArray(p.tags) ? p.tags : [],
        toxicityFlags: Array.isArray(p.toxicityFlags) ? p.toxicityFlags : [],
        versions: {
          neutral: p.versions?.neutral || '',
          firm: p.versions?.firm || '',
          warm: p.versions?.warm || '',
        },
      };
    } catch (error: unknown) {
      console.error('Failed to preview icebreaker:', error);
      this.throwApiError(error, '無法解析輸入內容');
    }
  }

  async createEvent(input: CreateEventInput): Promise<EventRecord> {
    try {
      const payload = {
        title: input.title,
        summary: input.summary,
        emotions: input.emotions,
        tags: input.tags,
        toxicity_flags: input.toxicityFlags,
        ai_neutral: input.versions.neutral,
        ai_firm: input.versions.firm,
        ai_warm: input.versions.warm,
        selected_version: input.selectedVersion,
        is_private: input.isPrivate,
      };
      const response = await apiClient.post('/events', payload);
      return this.transformEvent(response.data.event);
    } catch (error: unknown) {
      console.error('Failed to create event:', error);
      this.throwApiError(error, '無法建立事件');
    }
  }

  async listEvents(filters: EventListFilters = {}): Promise<{ events: EventRecord[]; total: number }> {
    try {
      const params: Record<string, string | number> = {};
      if (filters.status) params.status = filters.status;
      if (filters.tag) params.tag = filters.tag;
      if (filters.limit) params.limit = filters.limit;
      if (filters.offset) params.offset = filters.offset;
      const response = await apiClient.get('/events', { params });
      const events = (response.data.events || []).map((row: unknown) => this.transformEvent(row));
      return { events, total: response.data.total || 0 };
    } catch (error: unknown) {
      console.error('Failed to list events:', error);
      this.throwApiError(error, '無法取得事件列表');
    }
  }

  async getEvent(id: string): Promise<EventRecord> {
    try {
      const response = await apiClient.get(`/events/${id}`);
      return this.transformEvent(response.data.event);
    } catch (error: unknown) {
      console.error('Failed to fetch event:', error);
      this.throwApiError(error, '無法取得事件詳情');
    }
  }

  async replyToEvent(id: string, content: string): Promise<EventMessage> {
    try {
      const response = await apiClient.post(`/events/${id}/messages`, { content });
      return this.transformEventMessage(response.data.message);
    } catch (error: unknown) {
      console.error('Failed to reply to event:', error);
      this.throwApiError(error, '無法送出訊息');
    }
  }

  async previewReplyRewrite(eventId: string, rawReply: string): Promise<ReplyRewritePreview> {
    try {
      const response = await apiClient.post(`/events/${eventId}/messages/preview-rewrite`, { rawReply });
      const p = response.data.preview ?? {};
      return {
        versions: {
          neutral: p.versions?.neutral || '',
          firm: p.versions?.firm || '',
          warm: p.versions?.warm || '',
        },
        toxicityFlags: Array.isArray(p.toxicityFlags) ? p.toxicityFlags : [],
      };
    } catch (error: unknown) {
      console.error('Failed to preview reply rewrite:', error);
      this.throwApiError(error, '無法改寫回覆，請稍後再試');
    }
  }

  // Preview AI "接住情緒" coaching for the receiver — an empathy note plus three
  // validating responses. Not persisted; the user picks one to insert/send.
  async previewEmotionAcceptance(eventId: string): Promise<EmotionAcceptancePreview> {
    try {
      const response = await apiClient.post(`/events/${eventId}/messages/preview-acceptance`);
      const p = response.data.preview ?? {};
      return {
        empathy: p.empathy || '',
        acceptances: Array.isArray(p.acceptances)
          ? p.acceptances
              .filter((a: unknown): a is EmotionAcceptance => !!a && typeof (a as EmotionAcceptance).text === 'string')
              .map((a: EmotionAcceptance) => ({ label: a.label || '', text: a.text }))
          : [],
        toxicityFlags: Array.isArray(p.toxicityFlags) ? p.toxicityFlags : [],
      };
    } catch (error: unknown) {
      console.error('Failed to preview emotion acceptance:', error);
      this.throwApiError(error, 'AI 接住情緒建議暫時無法產生，請稍後再試');
    }
  }

  // Preview an AI 諮商師 comment for an event (not persisted until posted).
  async previewEventAiComment(eventId: string): Promise<string> {
    try {
      const response = await apiClient.post(`/events/${eventId}/ai-comment/preview`);
      return response.data.comment || '';
    } catch (error: unknown) {
      console.error('Failed to preview event AI comment:', error);
      this.throwApiError(error, 'AI 諮商師暫時無法回應，請稍後再試');
    }
  }

  // Post a previewed AI 諮商師 comment into the event thread.
  async postEventAiComment(eventId: string, content: string): Promise<EventMessage> {
    try {
      const response = await apiClient.post(`/events/${eventId}/ai-comment`, { content });
      return this.transformEventMessage(response.data.message);
    } catch (error: unknown) {
      console.error('Failed to post event AI comment:', error);
      this.throwApiError(error, '無法新增 AI 留言，請稍後再試');
    }
  }

  async markEventMessageRead(eventId: string, msgId: string): Promise<void> {
    try {
      await apiClient.put(`/events/${eventId}/messages/${msgId}/read`);
    } catch (error: unknown) {
      console.error('Failed to mark event message read:', error);
      // Silent: read receipts are best-effort
    }
  }

  async requestEventResolve(id: string): Promise<EventRecord> {
    try {
      const response = await apiClient.post(`/events/${id}/resolve-request`);
      return this.transformEvent(response.data.event);
    } catch (error: unknown) {
      console.error('Failed to request event resolve:', error);
      this.throwApiError(error, '無法發起解決請求');
    }
  }

  async confirmEventResolve(id: string): Promise<EventRecord> {
    try {
      const response = await apiClient.post(`/events/${id}/resolve-confirm`);
      return this.transformEvent(response.data.event);
    } catch (error: unknown) {
      console.error('Failed to confirm event resolve:', error);
      this.throwApiError(error, '無法確認解決');
    }
  }

  // Re-open a resolved event so the couple can keep discussing.
  async reopenEvent(id: string): Promise<EventRecord> {
    try {
      const response = await apiClient.post(`/events/${id}/reopen`);
      return this.transformEvent(response.data.event);
    } catch (error: unknown) {
      console.error('Failed to reopen event:', error);
      this.throwApiError(error, '無法重新開啟事件');
    }
  }

  async getEventAnalytics(): Promise<EventAnalyticsData> {
    try {
      const response = await apiClient.get('/events/analytics');
      const a = response.data.analytics ?? {};
      return {
        counts: {
          last7: Number(a.counts?.last7) || 0,
          last30: Number(a.counts?.last30) || 0,
        },
        resolutionRate: Number(a.resolution_rate) || 0,
        avgResolutionHours: a.avg_resolution_hours == null ? null : Number(a.avg_resolution_hours),
        tagDistribution: Array.isArray(a.tag_distribution) ? a.tag_distribution : [],
        emotionDistribution: Array.isArray(a.emotion_distribution) ? a.emotion_distribution : [],
        dailyTrend: Array.isArray(a.daily_trend) ? a.daily_trend : [],
        hotspotHours: Array.isArray(a.hotspot_hours) ? a.hotspot_hours : [],
      };
    } catch (error: unknown) {
      console.error('Failed to fetch event analytics:', error);
      this.throwApiError(error, '無法取得分析資料');
    }
  }

  // ----- 婚姻檢查 (Marriage Check-up) -----

  async getMarriageCheckup(): Promise<MarriageCheckup | null> {
    try {
      const response = await apiClient.get('/marriage-checkups');
      return (response.data.checkup as MarriageCheckup) ?? null;
    } catch (error: unknown) {
      console.error('Failed to load marriage checkup:', error);
      this.throwApiError(error, '無法載入婚姻檢查，請稍後再試');
    }
  }

  async startMarriageCheckup(): Promise<MarriageCheckup> {
    try {
      const response = await apiClient.post('/marriage-checkups');
      return response.data.checkup as MarriageCheckup;
    } catch (error: unknown) {
      console.error('Failed to start marriage checkup:', error);
      this.throwApiError(error, '無法開始婚姻檢查，請稍後再試');
    }
  }

  async submitMarriageCheckupResponse(
    id: string,
    answers: MarriageCheckupAnswers,
  ): Promise<MarriageCheckup> {
    try {
      const response = await apiClient.post(`/marriage-checkups/${id}/response`, { answers });
      return response.data.checkup as MarriageCheckup;
    } catch (error: unknown) {
      console.error('Failed to submit marriage checkup response:', error);
      this.throwApiError(error, '無法送出答案，請稍後再試');
    }
  }

  async getMarriageCheckupHistory(): Promise<MarriageCheckupHistoryItem[]> {
    try {
      const response = await apiClient.get('/marriage-checkups/history');
      return Array.isArray(response.data.checkups) ? response.data.checkups : [];
    } catch (error: unknown) {
      console.error('Failed to load marriage checkup history:', error);
      this.throwApiError(error, '無法載入歷史紀錄，請稍後再試');
    }
  }

  async getMarriageCheckupById(id: string): Promise<MarriageCheckup> {
    try {
      const response = await apiClient.get(`/marriage-checkups/${id}`);
      return response.data.checkup as MarriageCheckup;
    } catch (error: unknown) {
      console.error('Failed to load marriage checkup:', error);
      this.throwApiError(error, '無法載入婚姻檢查，請稍後再試');
    }
  }

  private transformEvent(data: unknown): EventRecord {
    const r = (data ?? {}) as {
      id?: string;
      couple_id?: string;
      created_by?: string;
      title?: string;
      summary?: string;
      emotions?: string[];
      tags?: string[];
      toxicity_flags?: string[];
      versions?: { neutral?: string; firm?: string; warm?: string };
      selected_version?: EventVersionKey | null;
      status?: EventStatus;
      is_private?: boolean;
      public_status?: 'private' | 'published';
      public_title?: string | null;
      resolve_requested_by?: string | null;
      resolve_requested_at?: string | null;
      resolved_at?: string | null;
      created_at?: string;
      updated_at?: string;
      unread_count?: number;
      last_message_preview?: string | null;
      messages?: unknown[];
    };
    return {
      id: r.id || '',
      coupleId: r.couple_id || '',
      createdBy: r.created_by || '',
      title: r.title || '',
      summary: r.summary || '',
      emotions: r.emotions ?? [],
      tags: r.tags ?? [],
      toxicityFlags: r.toxicity_flags ?? [],
      versions: {
        neutral: r.versions?.neutral || '',
        firm: r.versions?.firm || '',
        warm: r.versions?.warm || '',
      },
      selectedVersion: r.selected_version ?? null,
      status: (r.status as EventStatus) || 'open',
      isPrivate: Boolean(r.is_private),
      publicStatus: r.public_status === 'published' ? 'published' : 'private',
      publicTitle: r.public_title ?? null,
      resolveRequestedBy: r.resolve_requested_by ?? null,
      resolveRequestedAt: r.resolve_requested_at ?? null,
      resolvedAt: r.resolved_at ?? null,
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || '',
      unreadCount: Number(r.unread_count) || 0,
      lastMessagePreview: r.last_message_preview ?? null,
      messages: Array.isArray(r.messages) ? r.messages.map((m) => this.transformEventMessage(m)) : [],
    };
  }

  private transformEventMessage(data: unknown): EventMessage {
    const r = (data ?? {}) as {
      id?: string;
      event_id?: string;
      sender_id?: string;
      content?: string;
      is_ai?: boolean;
      created_at?: string;
      read_at?: string | null;
    };
    return {
      id: r.id || '',
      eventId: r.event_id || '',
      senderId: r.sender_id || '',
      content: r.content || '',
      isAi: r.is_ai === true,
      createdAt: r.created_at || '',
      readAt: r.read_at ?? null,
    };
  }

  // Billing / premium passes
  async getBillingStatus(): Promise<BillingStatus> {
    try {
      const response = await apiClient.get('/billing/status');
      const d = response.data;
      return {
        tier: d.tier === 'premium' ? 'premium' : 'free',
        expiresAt: d.expires_at ?? null,
        hasCouple: Boolean(d.has_couple),
        plans: Array.isArray(d.plans) ? d.plans : [],
      };
    } catch (error: unknown) {
      console.error('Failed to fetch billing status:', error);
      this.throwApiError(error, '無法取得訂閱狀態');
    }
  }

  // Redeems a coupon code for a free Premium pass. Returns the granted days and
  // the couple's new expiry on success; throws an Error carrying `error_code`
  // (COUPON_INVALID / COUPON_EXPIRED / COUPON_EXHAUSTED / COUPON_ALREADY_REDEEMED
  // / NO_COMPLETE_COUPLE) so the caller can show a specific, actionable message.
  async redeemCoupon(code: string): Promise<{ days: number; expiresAt: string | null }> {
    try {
      const response = await apiClient.post('/billing/redeem-coupon', { code });
      return {
        days: Number(response.data?.days) || 0,
        expiresAt: response.data?.expires_at ?? null,
      };
    } catch (error: unknown) {
      console.error('Failed to redeem coupon:', error);
      this.throwApiError(error, '無法兌換優惠碼，請稍後再試');
    }
  }

  // Creates an order and redirects the browser to the chosen gateway's hosted
  // checkout (ECPay or NewebPay). Resolves only if the redirect could not be
  // initiated (otherwise the page navigates away).
  async startCheckout(plan: BillingPlan['id'], provider: PaymentProvider = 'ecpay'): Promise<void> {
    try {
      const response = await apiClient.post('/billing/checkout', { plan, provider });
      const { action_url, params } = response.data || {};
      if (!action_url || !params) {
        throw new Error('付款資料異常，請稍後再試');
      }
      submitGatewayForm(action_url, params);
    } catch (error: unknown) {
      console.error('Failed to start checkout:', error);
      this.throwApiError(error, '無法建立付款，請稍後再試');
    }
  }

  // --- Human therapists (心理諮商師) ---

  async getTherapists(focus?: TherapistFocusArea): Promise<Therapist[]> {
    try {
      const response = await apiClient.get('/therapists', {
        params: focus ? { focus } : undefined,
      });
      return (response.data?.therapists || []) as Therapist[];
    } catch (error: unknown) {
      console.error('Failed to fetch therapists:', error);
      this.throwApiError(error, '無法取得諮商師列表');
    }
  }

  async getTherapist(id: string): Promise<Therapist> {
    try {
      const response = await apiClient.get(`/therapists/${id}`);
      return response.data?.therapist as Therapist;
    } catch (error: unknown) {
      console.error('Failed to fetch therapist:', error);
      this.throwApiError(error, '無法取得諮商師資料');
    }
  }

  async applyAsTherapist(input: TherapistApplicationInput): Promise<{ id: string; status: string }> {
    try {
      const response = await apiClient.post('/therapists/apply', input);
      return response.data?.application;
    } catch (error: unknown) {
      console.error('Failed to submit therapist application:', error);
      this.throwApiError(error, '送出申請失敗，請稍後再試');
    }
  }

  // Self-service therapist profile (logged-in therapist).
  async getMyTherapistProfile(): Promise<OwnTherapistProfile | null> {
    try {
      const response = await apiClient.get('/therapists/me');
      return response.data?.therapist as OwnTherapistProfile;
    } catch (error: unknown) {
      // 404 just means "this user isn't a therapist" — return null, not throw.
      const code = (error as { response?: { status?: number } })?.response?.status;
      if (code === 404) return null;
      console.error('Failed to fetch own therapist profile:', error);
      this.throwApiError(error, '無法取得諮商師檔案');
    }
  }

  async updateMyTherapistProfile(input: TherapistProfileUpdate): Promise<OwnTherapistProfile> {
    try {
      const response = await apiClient.put('/therapists/me', input);
      return response.data?.therapist as OwnTherapistProfile;
    } catch (error: unknown) {
      console.error('Failed to update therapist profile:', error);
      this.throwApiError(error, '更新檔案失敗，請稍後再試');
    }
  }

  async addMyTherapistDocument(url: string): Promise<OwnTherapistProfile> {
    try {
      const response = await apiClient.post('/therapists/me/documents', { url });
      return response.data?.therapist as OwnTherapistProfile;
    } catch (error: unknown) {
      console.error('Failed to add therapist document:', error);
      this.throwApiError(error, '上傳文件失敗，請稍後再試');
    }
  }

  // Upload a therapist photo (kind='photo') or credential document
  // (kind='document'). Public endpoints (used by the no-login sign-up form too).
  async uploadTherapistAsset(file: File, kind: 'photo' | 'document'): Promise<string> {
    try {
      const form = new FormData();
      form.append(kind, file);
      const response = await apiClient.post(`/therapists/upload-${kind}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data?.url as string;
    } catch (error: unknown) {
      console.error('Failed to upload therapist asset:', error);
      this.throwApiError(error, '上傳失敗，請稍後再試');
    }
  }

  async requestConsultation(therapistId: string, input: ConsultationRequestInput): Promise<{ id: string; status: string }> {
    try {
      const response = await apiClient.post(`/therapists/${therapistId}/consult`, input);
      return response.data?.consultation;
    } catch (error: unknown) {
      console.error('Failed to request consultation:', error);
      this.throwApiError(error, '預約失敗，請稍後再試');
    }
  }

  async getMyConsultations(): Promise<TherapistConsultation[]> {
    try {
      const response = await apiClient.get('/therapists/consultations/mine');
      return (response.data?.consultations || []) as TherapistConsultation[];
    } catch (error: unknown) {
      console.error('Failed to fetch consultations:', error);
      this.throwApiError(error, '無法取得預約紀錄');
    }
  }

  async getConsultationMessages(consultationId: string): Promise<ConsultationThread> {
    try {
      const response = await apiClient.get(`/therapists/consultations/${consultationId}/messages`);
      const d = response.data || {};
      return {
        role: d.role,
        therapistName: d.therapistName,
        currentUserId: d.currentUserId,
        publicStatus: d.publicStatus,
        publicTitle: d.publicTitle,
        messages: (d.messages || []) as ConsultationMessage[],
      };
    } catch (error: unknown) {
      console.error('Failed to fetch consultation messages:', error);
      this.throwApiError(error, '無法載入訊息');
    }
  }

  async postConsultationMessage(consultationId: string, body: string, eventId?: string): Promise<void> {
    try {
      await apiClient.post(`/therapists/consultations/${consultationId}/messages`, {
        body,
        eventId: eventId || undefined,
      });
    } catch (error: unknown) {
      console.error('Failed to post consultation message:', error);
      this.throwApiError(error, '送出訊息失敗');
    }
  }

  // --- 公開問答 (Public Q&A) ---

  // Propose publishing a consultation chat. The other party must approve.
  async requestPublishConsultation(consultationId: string, title: string): Promise<{ publicStatus: ConsultationPublicStatus; message: string }> {
    try {
      const response = await apiClient.post(`/therapists/consultations/${consultationId}/publish-request`, { title });
      return { publicStatus: response.data?.publicStatus, message: response.data?.message };
    } catch (error: unknown) {
      console.error('Failed to request publish:', error);
      this.throwApiError(error, '提議公開失敗，請稍後再試');
    }
  }

  // Consent to a pending publish proposal (must be the other party).
  async approvePublishConsultation(consultationId: string): Promise<{ publicStatus: ConsultationPublicStatus; message: string }> {
    try {
      const response = await apiClient.post(`/therapists/consultations/${consultationId}/publish-approve`);
      return { publicStatus: response.data?.publicStatus, message: response.data?.message };
    } catch (error: unknown) {
      console.error('Failed to approve publish:', error);
      this.throwApiError(error, '同意公開失敗，請稍後再試');
    }
  }

  // Pull a pending/published consultation back to private.
  async withdrawPublishConsultation(consultationId: string): Promise<{ publicStatus: ConsultationPublicStatus; message: string }> {
    try {
      const response = await apiClient.post(`/therapists/consultations/${consultationId}/publish-withdraw`);
      return { publicStatus: response.data?.publicStatus, message: response.data?.message };
    } catch (error: unknown) {
      console.error('Failed to withdraw publish:', error);
      this.throwApiError(error, '取消公開失敗，請稍後再試');
    }
  }

  // Public read-only browse of published Q&A threads.
  async getPublicQa(focus?: TherapistFocusArea, page = 1): Promise<PublicQaListResult> {
    try {
      const response = await apiClient.get('/therapists/qa', {
        params: { ...(focus ? { focus } : {}), page },
      });
      const d = response.data || {};
      return { page: d.page || page, hasMore: Boolean(d.hasMore), threads: (d.threads || []) as PublicQaThreadSummary[] };
    } catch (error: unknown) {
      console.error('Failed to fetch public Q&A:', error);
      this.throwApiError(error, '無法取得公開問答列表');
    }
  }

  async getPublicQaThread(id: string, source: PublicQaSource = 'consultation'): Promise<PublicQaThread> {
    try {
      const response = await apiClient.get(`/therapists/qa/${id}`, {
        params: source === 'consultation' ? {} : { source },
      });
      return response.data?.thread as PublicQaThread;
    } catch (error: unknown) {
      console.error('Failed to fetch public Q&A thread:', error);
      this.throwApiError(error, '無法載入公開問答');
    }
  }

  // Share / un-share a conflict event into 公開問答.
  async publishEvent(eventId: string, title?: string): Promise<EventRecord> {
    try {
      const response = await apiClient.post(`/events/${eventId}/publish`, title ? { title } : {});
      return this.transformEvent(response.data.event);
    } catch (error: unknown) {
      console.error('Failed to publish event:', error);
      this.throwApiError(error, '公開失敗，請稍後再試');
    }
  }

  async unpublishEvent(eventId: string): Promise<EventRecord> {
    try {
      const response = await apiClient.post(`/events/${eventId}/unpublish`);
      return this.transformEvent(response.data.event);
    } catch (error: unknown) {
      console.error('Failed to unpublish event:', error);
      this.throwApiError(error, '取消公開失敗，請稍後再試');
    }
  }

  // Share / un-share a wall thread into 公開問答.
  async publishWallPost(postId: string, title?: string): Promise<void> {
    try {
      await apiClient.post(`/wall/${postId}/publish`, title ? { title } : {});
    } catch (error: unknown) {
      console.error('Failed to publish wall post:', error);
      this.throwApiError(error, '公開失敗，請稍後再試');
    }
  }

  async unpublishWallPost(postId: string): Promise<void> {
    try {
      await apiClient.post(`/wall/${postId}/unpublish`);
    } catch (error: unknown) {
      console.error('Failed to unpublish wall post:', error);
      this.throwApiError(error, '取消公開失敗，請稍後再試');
    }
  }

  // Toggle a "helpful" vote. Returns the new state + count.
  async votePublicQa(id: string): Promise<{ voted: boolean; helpfulCount: number }> {
    try {
      const response = await apiClient.post(`/therapists/qa/${id}/vote`);
      return { voted: Boolean(response.data?.voted), helpfulCount: response.data?.helpfulCount ?? 0 };
    } catch (error: unknown) {
      console.error('Failed to vote public Q&A:', error);
      this.throwApiError(error, '操作失敗，請稍後再試');
    }
  }

  // --- Therapist reviews (客戶評價) ---

  async getTherapistReviews(therapistId: string): Promise<TherapistReviewsResult> {
    try {
      const response = await apiClient.get(`/therapists/${therapistId}/reviews`);
      const d = response.data || {};
      return {
        summary: d.summary || { count: 0, avgRating: null },
        canReview: Boolean(d.canReview),
        alreadyReviewed: Boolean(d.alreadyReviewed),
        reviews: (d.reviews || []) as TherapistReview[],
      };
    } catch (error: unknown) {
      console.error('Failed to fetch therapist reviews:', error);
      this.throwApiError(error, '無法取得評價');
    }
  }

  async submitTherapistReview(
    therapistId: string,
    input: { body: string; rating?: number | null; displayName?: string },
  ): Promise<{ message: string }> {
    try {
      const response = await apiClient.post(`/therapists/${therapistId}/reviews`, input);
      return { message: response.data?.message || '感謝你的評價！' };
    } catch (error: unknown) {
      console.error('Failed to submit therapist review:', error);
      this.throwApiError(error, '送出評價失敗，請稍後再試');
    }
  }

  // --- Paid video sessions (視訊諮商) ---

  // Book a paid session (off a free chat), then call paySession to charge it.
  async bookVideoSession(
    therapistId: string,
    input: { message?: string; preferredTime?: string; sourceConsultationId?: string },
  ): Promise<{ id: string; priceTwd: number }> {
    try {
      const response = await apiClient.post(`/therapists/${therapistId}/book-video`, input);
      const c = response.data?.consultation || {};
      return { id: c.id, priceTwd: c.priceTwd };
    } catch (error: unknown) {
      console.error('Failed to book video session:', error);
      this.throwApiError(error, '預約失敗，請稍後再試');
    }
  }

  // Start checkout for a booked session; redirects the browser on success.
  async paySession(consultationId: string, provider: PaymentProvider = 'ecpay'): Promise<void> {
    try {
      const response = await apiClient.post(`/therapists/consultations/${consultationId}/pay`, { provider });
      const { action_url, params } = response.data || {};
      if (!action_url || !params) throw new Error('付款資料異常，請稍後再試');
      submitGatewayForm(action_url, params);
    } catch (error: unknown) {
      console.error('Failed to start session payment:', error);
      this.throwApiError(error, '無法建立付款，請稍後再試');
    }
  }

  // Therapist responds to a booking: accept / decline / complete / no_show.
  async respondConsultation(
    consultationId: string,
    action: 'accept' | 'decline' | 'complete' | 'no_show',
    note?: string,
  ): Promise<void> {
    try {
      await apiClient.post(`/therapists/consultations/${consultationId}/respond`, { action, note });
    } catch (error: unknown) {
      console.error('Failed to respond to consultation:', error);
      this.throwApiError(error, '回覆預約失敗，請稍後再試');
    }
  }

  // Therapist sets the third-party meeting link (after accepting).
  async setMeetingLink(consultationId: string, provider: MeetingProvider, url: string): Promise<void> {
    try {
      await apiClient.post(`/therapists/consultations/${consultationId}/meeting-link`, { provider, url });
    } catch (error: unknown) {
      console.error('Failed to set meeting link:', error);
      this.throwApiError(error, '設定會議連結失敗，請稍後再試');
    }
  }

  async getMyEarnings(): Promise<TherapistEarnings> {
    try {
      const response = await apiClient.get('/therapists/me/earnings');
      return response.data?.earnings as TherapistEarnings;
    } catch (error: unknown) {
      console.error('Failed to fetch earnings:', error);
      this.throwApiError(error, '無法取得收入資料');
    }
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
  RoleplayMessageLevel,
  RoleplayMessageSuggestion,
  GenerateRoleplayMessagesInput,
  RoleplayMessagesResult,
  RoleplayMessageFeedbackInput,
  AlternativeIntimacyOption,
  AlternativeIntimacyOptionsGrouped,
  Notification,
  IntimacyRequestPeriodStats,
  IntimacyRequestStats,
  IntimacyRequestNudge,
  IntimacyRequestStatsResponse,
}
