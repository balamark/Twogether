import { tr } from '../i18n/tr';

// ─── 訪客模式 (guest mode) ──────────────────────────────────────────────────
// A visitor with no account runs the REAL app — every tab, every flow — on a
// sample couple. Instead of the network, the axios client answers from an
// in-browser mock backend (src/guest/guestApi.ts) whose data lives ONLY in this
// tab's sessionStorage: nothing a guest types reaches our servers, and closing
// the tab erases it. Signing in/up stores an authToken, which switches guest
// mode off for every later request automatically.
//
// Rules for code that touches auth storage:
// - Never write guest identity to localStorage (authState/authUser/authToken):
//   that would outlive the tab and break the privacy promise.
// - Read the signed-in user id through currentUserId() so cached queries and
//   nickname helpers work for guests too.

export const GUEST_USER_ID = 'guest-me';
export const GUEST_PARTNER_ID = 'guest-partner';
export const GUEST_COUPLE_ID = 'guest-couple';
const DISABLED_KEY = 'tw_guest_disabled';

function hasAuthToken(): boolean {
  try {
    return !!localStorage.getItem('authToken');
  } catch {
    return false;
  }
}

/** True while the visitor has no account session and guest mode isn't switched off. */
export function isGuestActive(): boolean {
  if (typeof window === 'undefined') return false;
  if (hasAuthToken()) return false;
  try {
    if (sessionStorage.getItem(DISABLED_KEY) === '1') return false;
  } catch { /* storage blocked — guest mode still works from memory */ }
  return true;
}

/** The signed-in user's id: the stored account, or the guest id while browsing as a guest. */
export function currentUserId(): string | null {
  try {
    const id = (JSON.parse(localStorage.getItem('authUser') || 'null') as { id?: string } | null)?.id;
    if (id) return id;
  } catch { /* fall through */ }
  return isGuestActive() ? GUEST_USER_ID : null;
}

export function guestNickname(): string {
  return tr('小安', 'Ann');
}
export function guestPartnerNickname(): string {
  return tr('阿哲', 'Jay');
}

/** The App-level user object for a guest (mirrors App.tsx `User`). */
export function buildGuestUser() {
  return {
    id: GUEST_USER_ID,
    email: 'guest@twogether.local',
    nickname: guestNickname(),
    gender: 'female' as const,
    email_verified: true,
    selected_therapist: 'luma',
    partnerCode: 'GUEST',
    partnerId: GUEST_COUPLE_ID,
    partnerNickname: guestPartnerNickname(),
    createdAt: new Date(Date.now() - 200 * 86400000).toISOString(),
    isGuest: true,
  };
}

/** Thrown-style error for actions a guest truly can't do (money, real people). */
export const GUEST_BLOCKED_CODE = 'GUEST_MODE';
export function guestBlockedMessage(): string {
  return tr(
    '這是試玩模式，付款、寄信和真人諮商需要真的帳號。免費註冊後就能使用，試玩資料只存在這個分頁。',
    'This is the guest preview: payments, emails and real counselors need a real account. Sign up free to use them; your preview data stays in this tab only.'
  );
}
