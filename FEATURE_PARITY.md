# Twogether — iOS ↔ Web Feature Parity

**Last updated:** 2026-03-27
**Reviewed by:** Claude Code

This document compares features across the iOS (SwiftUI) and Web (React/TypeScript) platforms. Use it as a living reference to track gaps and plan future work.

---

## Status Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented |
| 🚧 | Partial / placeholder |
| ❌ | Not implemented |
| 🌐 | Web-only (no iOS equivalent) |
| 📱 | iOS-only (no Web equivalent) |

---

## Feature Parity Table

### Authentication

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Email / password login | ✅ | ✅ | Both use JWT via `/api/auth/login` |
| User registration | ✅ | ✅ | |
| Password confirmation on signup | ✅ | ✅ | |
| Form validation (email format, min password length) | ✅ | ✅ | |
| Auth error display | ✅ | ✅ | |
| Biometric auth (Face ID / Touch ID) | ❌ | ❌ | Not implemented on either |
| OAuth / social login | ❌ | ❌ | Not implemented on either |

### Partner Pairing

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Generate pairing code (8-char) | ✅ | ✅ | |
| Copy code to clipboard | ✅ | ✅ | |
| Enter partner code to pair | ✅ | ✅ | |
| Email invitation to partner | ❌ | ✅ 🌐 | Web only — `/api/pairing-requests/send-invitation` |
| Accept invitation via token link | ❌ | ✅ 🌐 | Web only |
| Skip pairing ("skip for now") | ✅ | ❌ | iOS only |
| Offline pairing (queued sync) | ✅ 📱 | ❌ | iOS SwiftData offline queue |

### Record Intimacy (Love Moments)

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Date picker | ✅ | ✅ | iOS: SwiftUI DatePicker; Web: HTML date input + visual calendar picker |
| Time picker | ✅ | ✅ | |
| Description / notes field | ✅ | ✅ | iOS has both separately; Web has description + notes |
| Duration input | ✅ | ✅ | iOS: Int minutes; Web: text string (e.g. "30分鐘") |
| Location field | ✅ | ✅ | |
| Mood selection | ✅ | ✅ | iOS: 8 named moods with icons; Web: 6 emoji + labels (added in this PR) |
| **Activity type picker** | ✅ | ✅ | **Added in this PR** — 8 types matching iOS |
| Photo attachment | 🚧 | ✅ | iOS: placeholder ("Phase 4"); Web: upload with compression |
| Roleplay script association | ❌ | ✅ 🌐 | Web only |
| Coin reward on save | ❌ | ✅ 🌐 | Web only gamification |
| Form validation (required date/time) | ✅ | ✅ | |

### Browse / List Moments

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| List all moments (card layout) | ✅ | ✅ | |
| **Search by description / location** | ✅ | ✅ | **Added in this PR** |
| **Filter by mood** | ✅ | ✅ | **Added in this PR** |
| **Filter by activity type** | ✅ | ✅ | **Added in this PR** |
| Edit moment | ✅ | ❌ | iOS: context menu; Web: view-only |
| Delete moment | ✅ | ❌ | iOS: context menu swipe; Web: no delete UI |
| Empty state message | ✅ | ✅ | |
| Offline sync indicator | ✅ 📱 | ❌ | |

### Calendar View

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Full monthly grid | ✅ | ✅ | |
| Navigate to previous / next month | ✅ | ✅ | iOS: swipe gesture; Web: arrow buttons |
| Today indicator | ✅ | ✅ | |
| Days with moments highlighted | ✅ | ❌ | iOS shows count badge per day; Web calendar only used for date picking |
| Tap day to see moments | ✅ | ❌ | iOS shows list for selected day |
| **Total records stat card** | ✅ | ✅ | **Added in this PR** |
| **This month stat card** | ✅ | ✅ | **Added in this PR** |
| **Current streak stat card** | ✅ | ✅ | **Added in this PR** |
| **Longest streak stat card** | ✅ | ✅ | **Added in this PR** |
| Quick-add FAB from calendar | ✅ | ✅ | |

### Intimacy Request System

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Send intimacy invite to partner | ❌ | ✅ 🌐 | Web: categories (compliments, roleplay, custom, etc.) |
| Receive / respond to invite | ❌ | ✅ 🌐 | Web: accept / reject with alternatives |
| View invite history | ❌ | ✅ 🌐 | Web: IntimacyRequestsHistory component |
| Alternative intimacy options (when rejected) | ❌ | ✅ 🌐 | Web: physical / emotional / playful / companionship |
| Invite message templates by category | ❌ | ✅ 🌐 | |
| Time-limited invites (24h expiry) | ❌ | ✅ 🌐 | |
| Nudge email reminder | ❌ | ✅ 🌐 | |

### Notifications

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| In-app notification inbox | ❌ | ✅ 🌐 | Web: NotificationInbox component |
| Unread count badge | ❌ | ✅ 🌐 | |
| Mark notifications read | ❌ | ✅ 🌐 | |
| Native push notifications | ❌ | ❌ | Not yet on either platform |

### Roleplay

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Browse built-in scripts | 🚧 | ✅ | iOS: "Coming Soon" placeholder; Web: 6+ default scripts |
| Script detail view | 🚧 | ✅ | |
| Custom script upload | 🚧 | ✅ 🌐 | |
| Filter scripts by category | 🚧 | ✅ | |
| Associate script with moment record | ❌ | ✅ 🌐 | |

### Achievements & Statistics

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Achievement badges | ✅ | ✅ | Both implemented |
| Weekly / monthly statistics | ❌ | ✅ | Web: full stats view; iOS: calendar stats only |
| Achievement progress | ❌ | ✅ 🌐 | |
| Check / unlock achievements on save | ❌ | ✅ 🌐 | |

### Coin Reward System

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Earn coins from activities | ❌ | ✅ 🌐 | |
| Coin balance display | ❌ | ✅ 🌐 | |
| Coin shop / spend coins | ❌ | ✅ 🌐 | |
| Custom gifts system | ❌ | ✅ 🌐 | |
| Daily coin claim | ❌ | ✅ 🌐 | |

### Foreplay Exploration

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Browse foreplay activities | ❌ | ✅ 🌐 | Web: activities with coin rewards |
| Position suggestions | ❌ | ✅ 🌐 | |
| Activity detail modal with tips | ❌ | ✅ 🌐 | |

### Romantic Games

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Browse relationship games | ❌ | ✅ 🌐 | Web: 10+ games |
| Game instructions & tips | ❌ | ✅ 🌐 | |

### Conflict Resolution / Harmony

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Relationship harmony tips | ❌ | ✅ 🌐 | |
| Conflict resolution suggestions | ❌ | ✅ 🌐 | |

### Our Journey (Relationship Milestones)

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Milestone timeline | ❌ | ✅ 🌐 | Web: first date, first kiss, marriage, etc. |
| Add / edit milestones | ❌ | ✅ 🌐 | |

### Settings

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Settings screen | 🚧 | ✅ | iOS: "Coming Soon" placeholder |
| Partner nicknames | ❌ | ✅ | |
| Gender selection | ❌ | ✅ | |
| Unpair / reconnect partner | ❌ | ✅ | |

### Offline & Sync (iOS-only capabilities)

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| SwiftData local persistence | ✅ 📱 | ❌ | Web has no offline mode |
| Sync queue for offline actions | ✅ 📱 | ❌ | |
| Network monitoring (NWPathMonitor) | ✅ 📱 | ❌ | |
| Background sync | ✅ 📱 | ❌ | |
| Offline sync indicator | ✅ 📱 | ❌ | |

### Photos

| Feature | iOS | Web | Notes |
|---------|-----|-----|-------|
| Attach photo to moment | 🚧 | ✅ | iOS: "Phase 4" placeholder button |
| Photo upload with compression | ❌ | ✅ | Web: Supabase storage |
| Camera capture | ❌ | ❌ | |

---

## Summary

### Added in this PR (Parity Improvements)
1. **Activity type UI picker** in web love moment form — 8 types matching iOS (romantic, intimate, date, adventure, relaxing, playful, emotional, other)
2. **Mood labels** added to the 6-emoji mood picker in web form
3. **Search bar** on web love moments list — searches description, location, notes
4. **Mood filter chips** on web love moments list
5. **Activity type filter chips** on web love moments list
6. **4 Statistics cards** on web calendar view — Total Records, This Month, Current Streak, Longest Streak
7. **iOS Visual E2E Tests** — 5 comprehensive XCUITest cases for login, registration, pairing, recording a moment, and viewing calendar stats

### Remaining High-Priority Gaps (iOS vs Web)
| Gap | Priority | Effort |
|-----|---------|--------|
| Edit / delete moment on Web | High | Medium |
| Days-with-moments highlight on Web calendar | High | Medium |
| Tap day to see moments on Web calendar | High | Medium |
| iOS Roleplay feature (currently placeholder) | High | High |
| iOS Settings screen (currently placeholder) | Medium | Medium |
| iOS Intimacy Request system | Medium | High |
| Push notifications on both platforms | Medium | High |
| Offline mode for Web | Low | Very High |
| Photo upload on iOS | Low | Medium |

### iOS-only Features (by design)
- Offline-first sync with SwiftData
- Background sync
- Network monitoring
- "Skip pairing" during setup

### Web-only Features (by design or pending iOS)
- Email pairing invitations
- Intimacy request system with categories
- Coin reward gamification
- Foreplay exploration module
- Romantic games
- Conflict resolution / harmony tips
- Relationship journey milestones
- Notification inbox
- Custom scripts & gifts
