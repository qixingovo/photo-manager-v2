-- 纪念日系统数据库表
-- 在 Supabase SQL Editor 中执行

-- 1. 纪念日表
CREATE TABLE IF NOT EXISTS milestones (
    id BIGINT PRIMARY KEY,
    date DATE NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    photo_id BIGINT,
    photo_path TEXT,
    photo_name TEXT
);

-- 2. 应用设置表（纪念日开始日期等）
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 3. 启用 RLS
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- 4. 添加分类关联字段（如果表已存在，用 ALTER TABLE）
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS category_id BIGINT;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS category_name TEXT;

-- 5. RLS 策略：允许所有角色操作（应用层自定义认证）
CREATE POLICY "allow_all_milestones"
    ON milestones FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "allow_all_app_settings"
    ON app_settings FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
