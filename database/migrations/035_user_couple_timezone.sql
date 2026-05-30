-- Migration: Add timezone columns for per-user setting and couple-level primary timezone.
-- users.timezone — viewer's own IANA tz (e.g. 'Asia/Taipei')
-- couples.primary_timezone — IANA tz used to interpret/display shared timestamps for both partners

ALTER TABLE users   ADD COLUMN timezone         VARCHAR(64);
ALTER TABLE couples ADD COLUMN primary_timezone VARCHAR(64);
