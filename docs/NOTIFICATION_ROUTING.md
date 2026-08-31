# 通知中心點擊路由（Notification routing）

點通知中心的任一則通知，都應該把使用者帶到「那件事真正發生的地方」。
路由邏輯集中在 `src/components/NotificationInbox.tsx` 的 `handleNotificationClick`
switch；它呼叫 `onNavigate(view, payload?)`，由 `src/App.tsx` 的 `<NotificationInbox>`
`onNavigate` handler 實際切換頁面。

> 新增通知類型時：後端寫進 `notifications.notification_type` 的每個值，都必須在
> 這張表和上面的 switch 裡有對應目的地，否則點了會沒反應（落入 `default`）。
> `lib/eventNotify.js` 的 `EVENT_PUSH_EMOJI`、`services/emailService.js` 的 meta
> map、以及本 switch 三者要一起維護。

## 目前的對應表

| notification_type | 送給誰 | 目的地 | 送出位置 |
| --- | --- | --- | --- |
| `wall_post` / `wall_reply` / `wall_reaction` / `wall_ai_comment` | 伴侶 | `wall`（牆） | `routes/wall.js` |
| `event_created` / `event_reply` / `event_ai_comment` / `event_resolve_request` / `event_resolved` / `event_reopened` / `event_closing_started` / `event_closure_partner_ready` / `event_closure_done` | 伴侶 | `events`（好好說話，帶 `eventId` 直接開該則） | `lib/eventNotify.js` |
| `intimacy_request` / `request_response` | 伴侶 | `intimacy-history`（親密邀請紀錄） | `routes/intimacy-requests.js` |
| `consultation_message` | 諮商師／使用者 | `therapists`（心理諮商） | `routes/therapists.js` |
| `love_moment_*` / `cycle_record_*` | 伴侶 | `record`（記錄時光） | `services/notificationService.js` |
| `custom_script_*` | 伴侶 | `roleplay`（角色扮演） | `services/notificationService.js` |
| `custom_gift_*` | 伴侶 | `shop`（商店） | `services/notificationService.js` |
| `assessment_saved` / `love_wish_created` / `love_wish_deleted` | 伴侶 | `love-language`（愛的語言） | `services/notificationService.js` |
| `checkup_created` / `checkup_response` | 伴侶 | `conflict`（婚姻健檢入口） | `services/notificationService.js` |
| `couple_settings_updated` / `profile_updated` | 伴侶 | `settings`（設定） | `services/notificationService.js` |
| `deep_dive_shared` / `deep_dive_partner_responded` | 伴侶 | 開啟「情緒深潛」全螢幕層（`deepDiveIntent`，沿用 active/incoming journey） | `routes/deep-dive.js` |
| `dedicated_therapist_added` | 被指定方的伴侶 | `therapists`（可管理你們的專屬心理師） | `routes/therapists.js` |
| `dedicated_client_added` | 諮商師 | 諮商工作台 `counselor` → 自動開啟「我輔導的伴侶」中那對伴侶 | `routes/therapists.js` |

## 2026-08-31 這次補的洞

先前只有部分類型有路由，其餘落入 `default: break`（點了不跳頁）。這次補上：

- **`dedicated_client_added`（主要回報的 bug）**：諮商師被伴侶設為專屬諮商師的通知
  原本點了完全沒反應。現在會：
  1. 打開諮商模式（`setCounselorMode(true)`；若此帳號其實不是諮商師，`App.tsx` 的
     守衛 effect 會把 view 導回今天，不會卡住）。
  2. 切到 `counselor` 諮商工作台。
  3. 用 focus token（`counselorClientsFocus`）帶到「我輔導的伴侶」，並自動展開
     `clients[0]`。後端 `GET /api/therapists/clients` 以 `ct.created_at DESC` 排序，
     所以剛把你加入的那對伴侶就是第一筆——正是這則通知在講的伴侶。
- **`dedicated_therapist_added`**：伴侶端 → `therapists`。
- **`event_ai_comment` / `event_reopened`**：補進 events 群組（原本 emoji/email 有、
  但 switch 漏了）。
- **`wall_ai_comment`**：補進 wall 群組。
- **`deep_dive_shared` / `deep_dive_partner_responded`**：開啟情緒深潛層。

## 已知後續（follow-up）

- `dedicated_client_added` 目前用「最新一筆 client」推斷是哪對伴侶。單一伴侶或
  剛加入的情境完全正確；若諮商師同時被多對伴侶指定、且通知不是最新那筆，展開的
  可能不是該通知對應的伴侶。要做到 100% 精準需在通知列帶上 `couple_id`
  （`notifications` 目前沒有這欄，需 migration + API 回傳），再由前端比對開啟。
