-- 通知中心 showed every 親密邀請 twice (and every 接受/婉拒 reply twice).
-- Migration 009 added AFTER INSERT / AFTER UPDATE triggers on intimacy_requests
-- that insert a notification, and routes/intimacy-requests.js also inserts one
-- explicitly (with better fallback copy, the nudge title, and logging). The
-- route is the single source of truth now; drop the triggers.
--
-- Existing duplicates are collapsed: per (user, type, request), rows created
-- within 10 seconds of the newest are the same event, so keep the newest (the
-- route's copy) and carry over a read state from the dropped twin. Idempotent.

DROP TRIGGER IF EXISTS trigger_notify_intimacy_request ON intimacy_requests;
DROP TRIGGER IF EXISTS trigger_notify_request_response ON intimacy_requests;
DROP FUNCTION IF EXISTS notify_intimacy_request();
DROP FUNCTION IF EXISTS notify_request_response();

UPDATE notifications keep
SET is_read = TRUE,
    read_at = COALESCE(keep.read_at, dup.read_at, NOW())
FROM notifications dup
WHERE keep.intimacy_request_id IS NOT NULL
  AND dup.intimacy_request_id = keep.intimacy_request_id
  AND dup.user_id = keep.user_id
  AND dup.notification_type = keep.notification_type
  AND dup.id <> keep.id
  AND dup.created_at <= keep.created_at
  AND keep.created_at - dup.created_at < INTERVAL '10 seconds'
  AND dup.is_read AND NOT keep.is_read;

DELETE FROM notifications dup
USING notifications keep
WHERE keep.intimacy_request_id IS NOT NULL
  AND dup.intimacy_request_id = keep.intimacy_request_id
  AND dup.user_id = keep.user_id
  AND dup.notification_type = keep.notification_type
  AND dup.id <> keep.id
  AND (dup.created_at < keep.created_at
       OR (dup.created_at = keep.created_at AND dup.id < keep.id))
  AND keep.created_at - dup.created_at < INTERVAL '10 seconds';
