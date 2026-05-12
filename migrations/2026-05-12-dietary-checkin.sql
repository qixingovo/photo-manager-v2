-- 忌口打卡记录表
CREATE TABLE IF NOT EXISTS dietary_checkins (
    id BIGSERIAL PRIMARY KEY,
    user_name TEXT NOT NULL,
    checkin_date DATE NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT true,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_name, checkin_date)
);

-- 扩展 rpg_progress 表
ALTER TABLE rpg_progress
ADD COLUMN IF NOT EXISTS dietary_month_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS dietary_completed_cycles JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS dietary_custom_rewards JSONB DEFAULT '[]'::jsonb;
