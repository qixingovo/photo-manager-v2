-- ============================================
-- 006 悄悄话 数据库迁移
-- ============================================

CREATE TABLE IF NOT EXISTS secret_notes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    content TEXT NOT NULL,
    send_mode TEXT DEFAULT 'instant',    -- 'instant' | 'scheduled' | 'proximity'
    reveal_at TIMESTAMPTZ,               -- 定时模式：什么时候可见
    reveal_lat DOUBLE PRECISION,         -- 近场模式：解锁坐标
    reveal_lng DOUBLE PRECISION,
    reveal_radius INT DEFAULT 200,       -- 近场模式：解锁半径(米)
    status TEXT DEFAULT 'hidden',        -- 'hidden' | 'revealed' | 'expired'
    revealed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE secret_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_secret_notes"
    ON secret_notes FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
