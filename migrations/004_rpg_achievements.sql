-- ============================================
-- 004 恋爱成就 RPG 系统 数据库迁移
-- XP / 等级 / 每日任务 / 称号 / 自定义奖励
-- ============================================

CREATE TABLE IF NOT EXISTS rpg_progress (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name TEXT NOT NULL UNIQUE,
    xp INT DEFAULT 0,
    daily_quests JSONB DEFAULT '[]',
    weekly_quests JSONB DEFAULT '[]',
    unlocked_titles JSONB DEFAULT '[]',
    active_title TEXT DEFAULT '',
    custom_rewards JSONB DEFAULT '[]',
    login_streak INT DEFAULT 0,
    last_login_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rpg_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_rpg_progress"
    ON rpg_progress FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
