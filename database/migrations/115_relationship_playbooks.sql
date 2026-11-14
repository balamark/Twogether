-- 關係解方手冊 Relationship Playbook: the private side of a public feature.
--
-- The Playbooks themselves are public, read-only content served from
-- lib/playbooks/ (no table). What a signed-in user does with them is private:
--
--   playbook_saves        — "收藏這份手冊", one row per user per Playbook.
--   playbook_reflections  — "我的經驗": what happened to us, plus optional
--                           answers to the Playbook's reflection questions.
--
-- Both are owner-only (user_id); nothing here is ever shown to other users or
-- on the public pages. playbook_slug is a content slug, not a FK, because the
-- content lives in code; the API only accepts published slugs.

CREATE TABLE IF NOT EXISTS playbook_saves (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    playbook_slug VARCHAR(80) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, playbook_slug)
);

CREATE TABLE IF NOT EXISTS playbook_reflections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    playbook_slug VARCHAR(80) NOT NULL,
    experience TEXT NOT NULL,
    answers JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playbook_reflections_user_slug
    ON playbook_reflections (user_id, playbook_slug, created_at DESC);

ALTER TABLE public.playbook_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_reflections ENABLE ROW LEVEL SECURITY;
