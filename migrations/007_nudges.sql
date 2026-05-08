-- ============================================
-- 007 戳一戳 数据库迁移
-- ============================================

CREATE TABLE IF NOT EXISTS nudges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_nudges"
    ON nudges FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
